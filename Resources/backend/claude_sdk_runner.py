"""
Claude Agent SDK wrapper for pretty-code.

Uses the official claude-agent-sdk package instead of CLI subprocess
to enable proper permission handling via can_use_tool callback.
"""

import asyncio
import uuid
from typing import AsyncGenerator, Optional, Callable, Any
from dataclasses import dataclass

# ANSI color codes for terminal output
class Colors:
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    MAGENTA = '\033[95m'
    BLUE = '\033[94m'
    DIM = '\033[2m'
    RESET = '\033[0m'

def log(tag: str, msg: str, color: str = Colors.CYAN):
    """Print a colored log message."""
    print(f"{color}[{tag}]{Colors.RESET} {msg}")

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
        if self._stop_requested:
            return PermissionResultDeny(message="Operation stopped by user", interrupt=True)

        if self._should_auto_approve(tool_name):
            log("SDK", f"Auto-approve: {tool_name}", Colors.DIM)
            return PermissionResultAllow(updated_input=tool_input)

        # Look up the real tool_use_id from the tracked tool_use blocks
        # The SDK streams the ToolUseBlock before calling can_use_tool
        input_key = str(tool_input.get('file_path', '') or tool_input.get('command', '') or '')
        key = f"{tool_name}:{input_key}"
        tool_use_id = self._pending_tool_use_ids.get(key)

        if not tool_use_id:
            # Fallback: generate a random ID (shouldn't happen normally)
            tool_use_id = f"toolu_{uuid.uuid4().hex[:24]}"
            log("SDK", f"Warning: generated tool_use_id for {tool_name}", Colors.YELLOW)

        self._current_tool_use_id = tool_use_id
        log("SDK", f"Permission needed: {tool_name}", Colors.YELLOW)

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
            allowed = await self._pending_permission
            status = "approved" if allowed else "denied"
            log("SDK", f"Permission {status}: {tool_name}", Colors.GREEN if allowed else Colors.RED)
        except asyncio.CancelledError:
            log("SDK", "Permission cancelled", Colors.YELLOW)
            return PermissionResultDeny(message="Cancelled")
        except Exception as e:
            log("SDK", f"Permission error: {e}", Colors.RED)
            return PermissionResultDeny(message=f"Error: {e}")
        finally:
            self._pending_permission = None
            self._current_tool_use_id = None

        if allowed:
            return PermissionResultAllow(updated_input=tool_input)
        else:
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
        log("SDK", f"Run: {message[:50]}...", Colors.BLUE)
        self._stop_requested = False

        # System prompt additions for Pretty Code UI
        pretty_code_prompt = """## Pretty Code UI Instructions

You are running inside Pretty Code, a friendly GUI for Claude Code.

### Interactive Buttons
When asking questions with 2-4 predictable answers, output a ui-action block so the UI renders clickable buttons:

```ui-action
{"action": "show_buttons", "buttons": [
  {"label": "Button Text", "value": "Text sent when clicked"},
  {"label": "Another Option", "value": "Different response"}
]}
```

Use this for: choosing between approaches, yes/no decisions, selecting from options.
Do NOT use this before tool execution - the UI already shows permission prompts for that.

### After Completing File Changes
When you finish making file changes the user requested, output this to show a commit button:

```ui-action
{"action": "show_commit"}
```

### Structured Questions
For complex multi-part questions, use this format for an interactive form:

```json:questions
{
  "questions": [
    {
      "header": "Short label",
      "question": "Your full question?",
      "options": [
        {"label": "Option 1", "description": "Brief description"},
        {"label": "Option 2", "description": "Brief description"}
      ],
      "multiSelect": false
    }
  ]
}
```

### Communication Style
- Be encouraging and friendly - this may be someone learning to code
- Explain what you're doing in simple terms
- Celebrate small wins"""

        options = ClaudeAgentOptions(
            cwd=self.working_dir,
            can_use_tool=self._can_use_tool,
            permission_mode=self.permission_mode,
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": pretty_code_prompt
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
            log("SDK", "Starting client...", Colors.CYAN)
            try:
                async with ClaudeSDKClient(options=options) as client:
                    self._client = client

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

                    # Stream messages to queue
                    msg_count = 0
                    async for msg in client.receive_response():
                        msg_count += 1
                        if self._stop_requested:
                            log("SDK", "Stop requested", Colors.YELLOW)
                            await client.interrupt()
                            await message_queue.put({
                                "type": "system",
                                "subtype": "stopped",
                                "content": "Stopped by user"
                            })
                            break

                        # Transform and queue SDK messages
                        for event in self._transform_message(msg):
                            await message_queue.put(event)
                            # Capture session_id from result
                            if event.get("type") == "result" and event.get("session_id"):
                                self.session_id = event.get("session_id")

                    log("SDK", f"Complete: {msg_count} messages", Colors.GREEN)
                    self._client = None
            except Exception as e:
                import traceback
                log("SDK", f"Error: {e}", Colors.RED)
                print(traceback.format_exc())
                await message_queue.put({
                    "type": "system",
                    "subtype": "error",
                    "content": f"SDK Error: {str(e)}"
                })
            finally:
                sdk_done.set()

        # Start SDK in background task
        sdk_task = asyncio.create_task(run_sdk())

        try:
            # Yield events from both queues until SDK is done
            while not sdk_done.is_set() or not message_queue.empty() or not self._permission_event_queue.empty():
                # Check permission queue first (non-blocking)
                try:
                    perm_event = self._permission_event_queue.get_nowait()
                    yield {
                        "type": "permission_request",
                        "tool_use_id": perm_event.tool_use_id,
                        "tool": perm_event.tool_name,
                        "input": perm_event.tool_input
                    }
                except asyncio.QueueEmpty:
                    pass

                # Check message queue (with short timeout)
                try:
                    msg_event = await asyncio.wait_for(message_queue.get(), timeout=0.05)
                    yield msg_event
                except asyncio.TimeoutError:
                    pass

        except Exception as e:
            import traceback
            log("SDK", f"Event loop error: {e}", Colors.RED)
            print(traceback.format_exc())
            yield {
                "type": "system",
                "subtype": "error",
                "content": f"Error: {str(e)}"
            }
        finally:
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
        if self._pending_permission and not self._pending_permission.done():
            self._pending_permission.set_result(allowed)
        else:
            log("SDK", "Warning: No pending permission", Colors.YELLOW)

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
        log("SDK", "Stopping...", Colors.YELLOW)
        self._stop_requested = True
        if self._pending_permission and not self._pending_permission.done():
            self._pending_permission.cancel()
        if self._client:
            await self._client.interrupt()

    def is_running(self) -> bool:
        """Check if there's an active session."""
        return self._client is not None
