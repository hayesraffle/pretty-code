"""
Claude Agent SDK wrapper for pretty-code.

Uses the official claude-agent-sdk package instead of CLI subprocess
to enable proper permission handling via can_use_tool callback.
"""

import asyncio
import uuid
from typing import AsyncGenerator, Optional, Callable, Any
from dataclasses import dataclass

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    UserMessage,
    SystemMessage,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
    PermissionResultAllow,
    PermissionResultDeny,
)


# Tools that are safe to auto-approve (read-only operations)
SAFE_TOOLS = {
    "Read", "Glob", "Grep", "WebFetch", "WebSearch",
    "ListMcpResources", "ReadMcpResource", "BashOutput",
    "TodoRead",
}


@dataclass
class PermissionRequest:
    """Represents a pending permission request."""
    tool_use_id: str
    tool_name: str
    tool_input: dict


@dataclass
class PendingPermissionEvent:
    """Event to be yielded for permission requests."""
    tool_use_id: str
    tool_name: str
    tool_input: dict


class ClaudeSDKRunner:
    """
    Manages Claude interactions via the official Agent SDK.

    Provides:
    - Async streaming of messages
    - Permission handling via can_use_tool callback
    - Session continuity via ClaudeSDKClient
    - Stop/interrupt support
    """

    def __init__(
        self,
        working_dir: str = ".",
        permission_mode: str = "default",
        session_id: Optional[str] = None,
    ):
        self.working_dir = working_dir
        self.permission_mode = permission_mode
        self.session_id = session_id

        self._client: Optional[ClaudeSDKClient] = None
        self._pending_permission: Optional[asyncio.Future] = None
        self._stop_requested = False
        self._current_tool_use_id: Optional[str] = None
        # Queue for permission request events to be yielded
        self._permission_event_queue: asyncio.Queue = asyncio.Queue()
        # Track tool_use IDs that haven't gotten results yet (for permission matching)
        self._pending_tool_use_ids: dict[str, str] = {}  # tool_name -> tool_use_id

    def _should_auto_approve(self, tool_name: str) -> bool:
        """Determine if a tool should be auto-approved based on permission mode."""
        if self.permission_mode == "bypassPermissions":
            return True

        if self.permission_mode == "plan":
            # In plan mode, only allow read-only tools
            return tool_name in SAFE_TOOLS

        if self.permission_mode == "acceptEdits":
            # Accept edits mode auto-approves file edits but not Bash
            return tool_name in SAFE_TOOLS or tool_name in {"Edit", "Write", "NotebookEdit"}

        # Default mode: only auto-approve safe tools
        return tool_name in SAFE_TOOLS

    async def _can_use_tool(
        self,
        tool_name: str,
        tool_input: dict,
        context
    ) -> PermissionResultAllow | PermissionResultDeny:
        """
        SDK callback invoked before each tool execution.

        Returns PermissionResultAllow or PermissionResultDeny.
        """
        # Debug: log what context looks like
        print(f"[SDKRunner] can_use_tool called: {tool_name}, context type: {type(context)}")

        if self._stop_requested:
            return PermissionResultDeny(message="Operation stopped by user", interrupt=True)

        if self._should_auto_approve(tool_name):
            print(f"[SDKRunner] Auto-approving {tool_name}")
            return PermissionResultAllow(updated_input=tool_input)

        # Look up the real tool_use_id from the tracked tool_use blocks
        # The SDK streams the ToolUseBlock before calling can_use_tool
        input_key = str(tool_input.get('file_path', '') or tool_input.get('command', '') or '')
        key = f"{tool_name}:{input_key}"
        tool_use_id = self._pending_tool_use_ids.get(key)

        if not tool_use_id:
            # Fallback: generate a random ID (shouldn't happen normally)
            tool_use_id = f"toolu_{uuid.uuid4().hex[:24]}"
            print(f"[SDKRunner] WARNING: No tracked tool_use_id for {key}, using generated: {tool_use_id}")
        else:
            print(f"[SDKRunner] Found tracked tool_use_id for {key}: {tool_use_id}")

        self._current_tool_use_id = tool_use_id
        print(f"[SDKRunner] Requesting permission for {tool_name} (id={self._current_tool_use_id})")

        # Create a future to wait for the response
        loop = asyncio.get_running_loop()
        self._pending_permission = loop.create_future()

        # Put permission request on queue to be yielded by run()
        await self._permission_event_queue.put(PendingPermissionEvent(
            tool_use_id=self._current_tool_use_id,
            tool_name=tool_name,
            tool_input=tool_input
        ))

        # Wait for user response
        try:
            print(f"[SDKRunner] Waiting for permission response...")
            allowed = await self._pending_permission
            print(f"[SDKRunner] Permission response received: {allowed}")
        except asyncio.CancelledError:
            print(f"[SDKRunner] Permission request cancelled")
            return PermissionResultDeny(message="Cancelled")
        except Exception as e:
            print(f"[SDKRunner] Error waiting for permission: {e}")
            return PermissionResultDeny(message=f"Error: {e}")
        finally:
            self._pending_permission = None
            self._current_tool_use_id = None

        if allowed:
            print(f"[SDKRunner] User approved {tool_name}, returning allow behavior")
            return PermissionResultAllow(updated_input=tool_input)
        else:
            print(f"[SDKRunner] User denied {tool_name}")
            return PermissionResultDeny(message="User denied permission")

    async def run(self, message: str, images: list = None) -> AsyncGenerator[dict, None]:
        """
        Send a message to Claude and yield JSON events matching the frontend format.

        Events yielded:
        - {"type": "system", "subtype": "init", ...}
        - {"type": "assistant", "message": {...}}
        - {"type": "user", "message": {...}}  (for tool results)
        - {"type": "result", ...}
        - {"type": "permission_request", ...}
        """
        print(f"[SDKRunner] run() called with message: {message[:50]}...")
        self._stop_requested = False

        # System prompt for structured questions
        questions_prompt = """When you want to ask the user questions or need clarification, format them as a JSON block so the UI can render them interactively. Use this exact format:

```json:questions
{
  "questions": [
    {
      "header": "Short label (max 12 chars)",
      "question": "Your full question text?",
      "options": [
        {"label": "Option 1", "description": "Brief description"},
        {"label": "Option 2", "description": "Brief description"}
      ],
      "multiSelect": false
    }
  ]
}
```

Only use this format when you genuinely need user input to proceed. For simple yes/no clarifications, regular text is fine."""

        options = ClaudeAgentOptions(
            cwd=self.working_dir,
            can_use_tool=self._can_use_tool,
            permission_mode=self.permission_mode,
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": questions_prompt
            },
            setting_sources=["user", "project", "local"],  # Load all settings including CLAUDE.md
        )

        # Resume existing session if available
        if self.session_id:
            options.resume = self.session_id

        # Clear the permission queue
        while not self._permission_event_queue.empty():
            try:
                self._permission_event_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Yield init event first
        yield {
            "type": "system",
            "subtype": "init",
            "session_id": self.session_id,
            "permissionMode": self.permission_mode,
        }

        # Queue for SDK messages
        message_queue: asyncio.Queue = asyncio.Queue()
        sdk_done = asyncio.Event()

        async def run_sdk():
            """Run SDK client in background, putting messages on queue."""
            print("[SDKRunner] run_sdk() starting...")
            try:
                async with ClaudeSDKClient(options=options) as client:
                    self._client = client
                    print("[SDKRunner] SDK client created, sending query...")

                    # Build prompt with images if present
                    if images:
                        async def message_stream():
                            yield {"type": "text", "text": message}
                            for img in images:
                                yield {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": img.get("media_type", "image/png"),
                                        "data": img.get("data", "")
                                    }
                                }
                        await client.query(message_stream())
                    else:
                        await client.query(message)

                    print("[SDKRunner] Query sent, receiving response...")
                    # Stream messages to queue
                    msg_count = 0
                    async for msg in client.receive_response():
                        msg_count += 1
                        print(f"[SDKRunner] Received message #{msg_count}: {type(msg).__name__}")
                        if self._stop_requested:
                            print("[SDKRunner] Stop requested during message stream")
                            await client.interrupt()
                            await message_queue.put({
                                "type": "system",
                                "subtype": "stopped",
                                "content": "Stopped by user"
                            })
                            break

                        # Transform and queue SDK messages
                        for event in self._transform_message(msg):
                            print(f"[SDKRunner] Queueing event: {event.get('type')}")
                            await message_queue.put(event)
                            # Capture session_id from result
                            if event.get("type") == "result" and event.get("session_id"):
                                self.session_id = event.get("session_id")

                    print(f"[SDKRunner] Message stream complete, total: {msg_count}")
                    self._client = None
            except Exception as e:
                import traceback
                print(f"[SDKRunner] SDK Error: {e}")
                print(traceback.format_exc())
                await message_queue.put({
                    "type": "system",
                    "subtype": "error",
                    "content": f"SDK Error: {str(e)}"
                })
            finally:
                print("[SDKRunner] run_sdk() finished, setting sdk_done")
                sdk_done.set()

        # Start SDK in background task
        sdk_task = asyncio.create_task(run_sdk())

        try:
            print("[SDKRunner] Starting main event loop...")
            loop_count = 0
            # Yield events from both queues until SDK is done
            while not sdk_done.is_set() or not message_queue.empty() or not self._permission_event_queue.empty():
                loop_count += 1
                if loop_count % 100 == 0:
                    print(f"[SDKRunner] Event loop iteration {loop_count}, sdk_done={sdk_done.is_set()}")

                # Check permission queue first (non-blocking)
                try:
                    perm_event = self._permission_event_queue.get_nowait()
                    print(f"[SDKRunner] Yielding permission_request for {perm_event.tool_name}")
                    yield {
                        "type": "permission_request",
                        "tool_use_id": perm_event.tool_use_id,
                        "tool": perm_event.tool_name,
                        "input": perm_event.tool_input
                    }
                    print(f"[SDKRunner] Yielded permission_request for {perm_event.tool_name}")
                except asyncio.QueueEmpty:
                    pass

                # Check message queue (with short timeout)
                try:
                    msg_event = await asyncio.wait_for(message_queue.get(), timeout=0.05)
                    print(f"[SDKRunner] Yielding message event: {msg_event.get('type')}")
                    yield msg_event
                except asyncio.TimeoutError:
                    pass

            print(f"[SDKRunner] Event loop finished after {loop_count} iterations")

        except Exception as e:
            import traceback
            print(f"[SDKRunner] Event loop error: {e}")
            print(traceback.format_exc())
            yield {
                "type": "system",
                "subtype": "error",
                "content": f"Error: {str(e)}"
            }
        finally:
            print("[SDKRunner] run() finally block")
            if not sdk_task.done():
                sdk_task.cancel()
                try:
                    await sdk_task
                except asyncio.CancelledError:
                    pass

    def _transform_message(self, msg) -> list[dict]:
        """Transform SDK message types to frontend event format."""
        events = []

        if isinstance(msg, AssistantMessage):
            # Transform content blocks
            content = []
            for block in msg.content:
                if isinstance(block, TextBlock):
                    content.append({
                        "type": "text",
                        "text": block.text
                    })
                elif isinstance(block, ThinkingBlock):
                    content.append({
                        "type": "thinking",
                        "thinking": block.thinking
                    })
                elif isinstance(block, ToolUseBlock):
                    content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input
                    })
                    # Track this tool_use for permission matching
                    # Use composite key of name+input to handle multiple same-type tools
                    input_key = str(block.input.get('file_path', '') or block.input.get('command', '') or '')
                    key = f"{block.name}:{input_key}"
                    self._pending_tool_use_ids[key] = block.id
                    print(f"[SDKRunner] Tracking tool_use: {key} -> {block.id}")

            events.append({
                "type": "assistant",
                "message": {
                    "role": "assistant",
                    "content": content,
                    "model": getattr(msg, "model", None)
                }
            })

        elif isinstance(msg, UserMessage):
            # Usually tool results
            content = msg.content if isinstance(msg.content, list) else [{"type": "text", "text": str(msg.content)}]

            transformed_content = []
            for block in content:
                if isinstance(block, ToolResultBlock):
                    transformed_content.append({
                        "type": "tool_result",
                        "tool_use_id": block.tool_use_id,
                        "content": block.content,
                        "is_error": block.is_error
                    })
                    # Clean up tracked tool_use_id since we got the result
                    # Find and remove by value
                    keys_to_remove = [k for k, v in self._pending_tool_use_ids.items() if v == block.tool_use_id]
                    for k in keys_to_remove:
                        del self._pending_tool_use_ids[k]
                        print(f"[SDKRunner] Cleaned up tool_use tracking: {k}")
                elif isinstance(block, dict):
                    transformed_content.append(block)
                else:
                    transformed_content.append({"type": "text", "text": str(block)})

            events.append({
                "type": "user",
                "message": {
                    "role": "user",
                    "content": transformed_content
                }
            })

        elif isinstance(msg, SystemMessage):
            events.append({
                "type": "system",
                "subtype": msg.subtype,
                "data": msg.data
            })

        elif isinstance(msg, ResultMessage):
            events.append({
                "type": "result",
                "subtype": msg.subtype,
                "session_id": msg.session_id,
                "duration_ms": msg.duration_ms,
                "is_error": msg.is_error,
                "num_turns": msg.num_turns,
                "total_cost_usd": msg.total_cost_usd,
                "usage": msg.usage,
                "result": msg.result
            })

        return events

    async def send_permission_response(self, tool_use_id: str, allowed: bool):
        """Resolve a pending permission request."""
        print(f"[SDKRunner] send_permission_response: tool_use_id={tool_use_id}, allowed={allowed}")
        if self._pending_permission and not self._pending_permission.done():
            self._pending_permission.set_result(allowed)
            print(f"[SDKRunner] Future resolved with: {allowed}")
        else:
            print(f"[SDKRunner] WARNING: No pending permission or already done")

    async def send_question_response(self, tool_use_id: str, answers: dict):
        """Send answers to a question prompt (for AskUserQuestion tool)."""
        # The SDK handles this differently - questions come through as tool uses
        # and responses are handled by the SDK's internal mechanism
        pass

    async def send_continue(self):
        """Signal to continue processing (e.g., after plan approval)."""
        if self._client:
            await self._client.query("")  # Empty prompt to continue

    async def stop(self):
        """Stop the current operation."""
        print("[SDKRunner] Stop requested")
        self._stop_requested = True
        if self._pending_permission and not self._pending_permission.done():
            self._pending_permission.cancel()
        if self._client:
            await self._client.interrupt()

    def is_running(self) -> bool:
        """Check if there's an active session."""
        return self._client is not None
