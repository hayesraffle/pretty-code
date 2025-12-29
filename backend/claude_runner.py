import asyncio
import json
import subprocess
from typing import AsyncGenerator, Optional, Callable


class ClaudeCodeRunner:
    """Manages a Claude Code CLI subprocess with bidirectional JSON streaming."""

    def __init__(self, working_dir: str = ".", permission_mode: str = "default"):
        self.working_dir = working_dir
        self.permission_mode = permission_mode
        self.process: Optional[asyncio.subprocess.Process] = None
        self._stdin_lock = asyncio.Lock()
        self._read_lock = asyncio.Lock()

    async def _ensure_process(self) -> bool:
        """Ensure the Claude process is running. Returns True if process is ready."""
        if self.process is not None and self.process.returncode is None:
            return True

        cmd = [
            "claude",
            "--print",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--verbose",
            "--permission-mode", self.permission_mode,
        ]

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

    async def run(self, message: str) -> AsyncGenerator[dict, None]:
        """
        Send a message to Claude Code and yield JSON events.
        Keeps the process alive for subsequent messages.
        """
        try:
            if not await self._ensure_process():
                yield {
                    "type": "system",
                    "subtype": "error",
                    "content": "Claude Code CLI not found. Make sure 'claude' is installed and in your PATH."
                }
                return

            # Send the user message as JSON
            user_message = {
                "type": "user",
                "message": {
                    "role": "user",
                    "content": message
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
                        yield {
                            "type": "system",
                            "subtype": "error",
                            "content": "Claude process terminated unexpectedly"
                        }
                        break

                    line = await self.process.stdout.readline()
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

    async def send_question_response(self, answers: dict):
        """Send question/survey answers back to the CLI."""
        response = {
            "type": "question_response",
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
