import asyncio
import json
import subprocess
from typing import AsyncGenerator, Optional, Callable


class ClaudeCodeRunner:
    """Manages a Claude Code CLI subprocess with bidirectional JSON streaming."""

    def __init__(self, working_dir: str = ".", permission_mode: str = "default", session_id: str = None):
        self.working_dir = working_dir
        self.permission_mode = permission_mode
        self.session_id: Optional[str] = session_id  # Claude CLI session ID for context persistence
        self.process: Optional[asyncio.subprocess.Process] = None
        self._stdin_lock = asyncio.Lock()
        self._read_lock = asyncio.Lock()

    async def _ensure_process(self) -> bool:
        """Ensure the Claude process is running. Returns True if process is ready."""
        if self.process is not None and self.process.returncode is None:
            return True

        # System prompt to get structured questions from Claude
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

        cmd = [
            "claude",
            "--print",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--permission-mode", self.permission_mode,
            "--append-system-prompt", questions_prompt,
        ]

        # Resume existing session if we have a session_id (preserves full conversation context)
        if self.session_id:
            cmd.extend(["--resume", self.session_id])

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=self.working_dir,
            )
            return True
        except FileNotFoundError:
            return False
        except Exception:
            return False

    async def run(self, message: str, images: list = None) -> AsyncGenerator[dict, None]:
        """
        Send a message to Claude Code and yield JSON events.
        Keeps the process alive for subsequent messages.

        Args:
            message: The text message to send
            images: Optional list of image dicts with {data: base64, media_type: str}
        """
        try:
            if not await self._ensure_process():
                yield {
                    "type": "system",
                    "subtype": "error",
                    "content": "Claude Code CLI not found. Make sure 'claude' is installed and in your PATH."
                }
                return

            # Build content array (text + optional images)
            content = []
            if message:
                content.append({"type": "text", "text": message})

            # Add images as base64 content blocks
            if images:
                for img in images:
                    content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img.get("media_type", "image/png"),
                            "data": img.get("data", "")
                        }
                    })

            # Send the user message as JSON
            user_message = {
                "type": "user",
                "message": {
                    "role": "user",
                    "content": content if len(content) > 1 or images else message
                }
            }
            await self._write_json(user_message)

            # Stream output line by line until we get a result
            async with self._read_lock:
                while True:
                    if self.process is None or self.process.stdout is None:
                        break

                    # Check if process has terminated
                    if self.process.returncode is not None:
                        # Read any remaining stderr
                        if self.process.stderr:
                            stderr_data = await self.process.stderr.read()
                            if stderr_data:
                                yield {
                                    "type": "system",
                                    "subtype": "error",
                                    "content": f"Process error: {stderr_data.decode('utf-8', errors='replace')}"
                                }
                        yield {
                            "type": "system",
                            "subtype": "error",
                            "content": "Claude process terminated unexpectedly"
                        }
                        break

                    try:
                        # Use wait_for to prevent indefinite blocking
                        line = await asyncio.wait_for(
                            self.process.stdout.readline(),
                            timeout=300.0  # 5 minute timeout
                        )
                    except asyncio.TimeoutError:
                        yield {
                            "type": "system",
                            "subtype": "error",
                            "content": "Timeout waiting for Claude response"
                        }
                        break

                    if not line:
                        # Process closed stdout
                        break

                    try:
                        text = line.decode("utf-8", errors="replace").strip()
                        if text:
                            event = json.loads(text)
                            yield event

                            # Result marks the end of this turn (but keep process alive)
                            if event.get("type") == "result":
                                # Capture session_id for future resumption
                                if event.get("session_id"):
                                    self.session_id = event.get("session_id")
                                break
                    except json.JSONDecodeError as e:
                        yield {
                            "type": "system",
                            "subtype": "raw",
                            "content": text,
                            "error": str(e)
                        }

        except Exception as e:
            yield {
                "type": "system",
                "subtype": "error",
                "content": f"Error running Claude Code: {str(e)}"
            }

    async def _write_json(self, data: dict):
        """Write a JSON message to the CLI's stdin."""
        if self.process and self.process.stdin:
            async with self._stdin_lock:
                json_str = json.dumps(data) + "\n"
                self.process.stdin.write(json_str.encode("utf-8"))
                await self.process.stdin.drain()

    async def send_permission_response(self, tool_use_id: str, allowed: bool):
        """Send a permission response back to the CLI."""
        response = {
            "type": "permission_response",
            "tool_use_id": tool_use_id,
            "allowed": allowed
        }
        await self._write_json(response)

    async def send_question_response(self, tool_use_id: str, answers: dict):
        """Send question/survey answers back to the CLI."""
        response = {
            "type": "question_response",
            "tool_use_id": tool_use_id,
            "answers": answers
        }
        await self._write_json(response)

    async def send_continue(self):
        """Send a continue signal to resume processing."""
        await self._write_json({"type": "continue"})

    async def stop(self):
        """Stop the running process if any."""
        if self.process:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
            self.process = None

    def is_running(self) -> bool:
        """Check if the process is currently running."""
        return self.process is not None and self.process.returncode is None
