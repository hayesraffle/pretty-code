import asyncio
import json
import os
import uuid
import base64
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from claude_runner import ClaudeCodeRunner
import anthropic

# Load .env file from backend directory
load_dotenv(Path(__file__).parent / ".env")

# Create a persistent temp directory for uploaded images
UPLOAD_DIR = Path(tempfile.gettempdir()) / "pretty-code-uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Create a data directory for persistent storage (in user's home directory)
DATA_DIR = Path.home() / ".pretty-code"
CONVERSATIONS_DIR = DATA_DIR / "conversations"
DATA_DIR.mkdir(exist_ok=True)
CONVERSATIONS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="pretty-code backend")

# Track current working directory
current_working_dir = os.getcwd()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections and their runners
active_connections: dict[WebSocket, ClaudeCodeRunner] = {}


@app.get("/")
async def root():
    return {"status": "ok", "message": "pretty-code backend is running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


# File system API
class FileNode(BaseModel):
    name: str
    type: str  # "file" or "directory"
    path: str
    children: list["FileNode"] | None = None


def build_file_tree(dir_path: str, max_depth: int = 3, current_depth: int = 0) -> FileNode:
    """Recursively build a file tree structure."""
    path = Path(dir_path)

    # Skip hidden files and common non-essential directories
    skip_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', '.next', 'dist', 'build', '.cache'}
    skip_files = {'.DS_Store', 'Thumbs.db'}

    node = FileNode(
        name=path.name or dir_path,
        type="directory",
        path=str(path),
        children=[]
    )

    if current_depth >= max_depth:
        return node

    try:
        entries = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        for entry in entries:
            if entry.name.startswith('.') and entry.name not in {'.env.example'}:
                continue
            if entry.is_dir() and entry.name in skip_dirs:
                continue
            if entry.is_file() and entry.name in skip_files:
                continue

            if entry.is_dir():
                child = build_file_tree(str(entry), max_depth, current_depth + 1)
                node.children.append(child)
            else:
                node.children.append(FileNode(
                    name=entry.name,
                    type="file",
                    path=str(entry),
                    children=None
                ))
    except PermissionError:
        pass

    return node


@app.get("/api/files/tree")
async def get_file_tree(path: str | None = None, depth: int = 3):
    """Get file tree starting from the given path or current working directory."""
    global current_working_dir
    base_path = path or current_working_dir

    if not os.path.exists(base_path):
        raise HTTPException(status_code=404, detail="Path not found")
    if not os.path.isdir(base_path):
        raise HTTPException(status_code=400, detail="Path is not a directory")

    tree = build_file_tree(base_path, max_depth=depth)
    return tree


@app.get("/api/files/read")
async def read_file(path: str):
    """Read the contents of a file."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Path is not a file")

    # Check file size (limit to 1MB)
    size = os.path.getsize(path)
    if size > 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 1MB)")

    # Detect if binary
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Detect language from extension
        ext = Path(path).suffix.lower()
        lang_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.jsx': 'jsx',
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.json': 'json',
            '.html': 'html',
            '.css': 'css',
            '.md': 'markdown',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.sh': 'bash',
            '.sql': 'sql',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
        }
        language = lang_map.get(ext, 'text')

        return {
            "path": path,
            "content": content,
            "language": language,
            "size": size
        }
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Binary file cannot be displayed")


@app.get("/api/cwd")
async def get_cwd():
    """Get the current working directory."""
    global current_working_dir
    return {"cwd": current_working_dir}


@app.post("/api/cwd")
async def set_cwd(path: str):
    """Set the current working directory."""
    global current_working_dir
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Path not found")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Path is not a directory")
    current_working_dir = path
    return {"cwd": current_working_dir}


class ImageUpload(BaseModel):
    name: str
    type: str
    data: str  # base64 data URL


@app.post("/api/images/upload")
async def upload_image(image: ImageUpload):
    """Upload a base64 image and save to temp directory. Returns the file path."""
    try:
        # Parse base64 data URL
        # Format: data:image/png;base64,iVBORw0KGgo...
        if not image.data.startswith('data:'):
            raise HTTPException(status_code=400, detail="Invalid data URL format")

        header, b64_data = image.data.split(',', 1)

        # Determine extension from mime type
        mime_type = header.split(':')[1].split(';')[0]
        ext_map = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
        }
        ext = ext_map.get(mime_type, '.png')

        # Generate unique filename
        filename = f"{uuid.uuid4()}{ext}"
        filepath = UPLOAD_DIR / filename

        # Decode and save
        image_data = base64.b64decode(b64_data)
        filepath.write_bytes(image_data)

        return {"path": str(filepath), "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/images/{filename}")
async def get_image(filename: str):
    """Serve an uploaded image."""
    filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath)


class ExplainRequest(BaseModel):
    token: str
    tokenType: str
    context: str
    language: str
    conversationHistory: list[dict] | None = None  # [{role: "user"|"assistant", content: str}]
    generateFollowUps: bool = True


@app.post("/api/explain")
async def explain_token(request: ExplainRequest):
    """Generate a detailed explanation for a code token using Claude Haiku (fast, streaming)."""

    # Build the system prompt
    system_prompt = f"""You are a code tutor explaining code to a learner. Be helpful, friendly, and concise.

Code Context:
```{request.language}
{request.context}
```

Language: {request.language}"""

    # Build messages based on conversation history
    messages = []

    if request.conversationHistory and len(request.conversationHistory) > 0:
        # Follow-up question - include history (last 5 exchanges max)
        history = request.conversationHistory[-10:]  # Last 5 Q&A pairs
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        # Add formatting reminder for follow-ups
        messages.append({"role": "user", "content": messages.pop()["content"] + "\n\nUse proper markdown: `backticks` for code/variables, **bold** for emphasis, ### headers for sections, and --- for separators when needed. Be concise."})
    else:
        # Initial explanation request
        initial_prompt = f"""Explain this code element: `{request.token}` (type: {request.tokenType})

Write a helpful explanation with this structure:

**What it does:** One sentence explaining what this token does here.

**How it works:** 2-3 sentences explaining the mechanics.

**Why it matters:** One sentence on why this is useful or important.

Keep it under 80 words. Use **bold** for emphasis."""

        messages.append({"role": "user", "content": initial_prompt})

    # Add follow-up instruction if requested
    followup_instruction = ""
    if request.generateFollowUps:
        followup_instruction = "\n\nAfter your explanation, suggest exactly 3 short follow-up questions (max 8 words each) that help the learner understand how this code works in context. Focus on: how it connects to surrounding code, what would happen if changed, or deeper mechanics. Format them on a single line at the very end as: FOLLOWUPS: question1 | question2 | question3"
        # Append to last user message
        if messages and messages[-1]["role"] == "user":
            messages[-1]["content"] += followup_instruction

    async def generate():
        try:
            client = anthropic.AsyncAnthropic()
            full_response = ""

            async with client.messages.stream(
                model="claude-3-5-haiku-latest",
                max_tokens=400,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    full_response += text
                    # Stream everything - we'll parse follow-ups at the end
                    yield f"data: {json.dumps({'chunk': text})}\n\n"

            # Parse follow-ups from the full response
            followups = []
            if request.generateFollowUps and "FOLLOWUPS:" in full_response:
                parts = full_response.split("FOLLOWUPS:")
                if len(parts) > 1:
                    followup_text = parts[1].strip()
                    followups = [q.strip() for q in followup_text.split("|") if q.strip()][:3]

            # Send follow-ups as a separate event
            if followups:
                yield f"data: {json.dumps({'followups': followups})}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"
        except anthropic.APIError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# ============ Conversation Storage API ============

class Message(BaseModel):
    role: str
    content: str
    timestamp: str | None = None
    images: list | None = None
    events: list | None = None


class Conversation(BaseModel):
    id: str
    title: str
    messages: list[Message]
    updatedAt: str


class ConversationSummary(BaseModel):
    id: str
    title: str
    updatedAt: str
    messageCount: int


@app.get("/api/conversations")
async def list_conversations() -> list[ConversationSummary]:
    """List all saved conversations (metadata only)."""
    conversations = []
    for filepath in CONVERSATIONS_DIR.glob("*.json"):
        try:
            data = json.loads(filepath.read_text())
            conversations.append(ConversationSummary(
                id=data.get("id", filepath.stem),
                title=data.get("title", "Untitled"),
                updatedAt=data.get("updatedAt", ""),
                messageCount=len(data.get("messages", []))
            ))
        except Exception:
            continue

    # Sort by updatedAt descending
    conversations.sort(key=lambda c: c.updatedAt, reverse=True)
    return conversations


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """Get a specific conversation by ID."""
    filepath = CONVERSATIONS_DIR / f"{conv_id}.json"
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        data = json.loads(filepath.read_text())
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/conversations")
async def save_conversation(conversation: Conversation):
    """Save a conversation (create or update)."""
    filepath = CONVERSATIONS_DIR / f"{conversation.id}.json"

    try:
        data = conversation.model_dump()
        filepath.write_text(json.dumps(data, indent=2))
        return {"id": conversation.id, "status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Delete a conversation."""
    filepath = CONVERSATIONS_DIR / f"{conv_id}.json"
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        filepath.unlink()
        return {"id": conv_id, "status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ WebSocket Endpoint ============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Get params from query string
    working_dir = websocket.query_params.get("cwd", current_working_dir)
    permission_mode = websocket.query_params.get("permissionMode", "default")
    session_id = websocket.query_params.get("sessionId")  # For resuming conversations

    runner = ClaudeCodeRunner(
        working_dir=working_dir,
        permission_mode=permission_mode,
        session_id=session_id if session_id else None
    )
    active_connections[websocket] = runner

    # Shared state for concurrent streaming
    streaming_task = None
    stop_requested = False

    async def stream_claude_output(user_message: str, images: list = None):
        """Stream Claude output to WebSocket."""
        nonlocal stop_requested
        try:
            async for event in runner.run(user_message, images=images):
                if stop_requested:
                    break
                # Attach session_id to result events for frontend persistence
                if event.get("type") == "result" and runner.session_id:
                    event["session_id"] = runner.session_id
                await websocket.send_json(event)
        except Exception as e:
            if not stop_requested:
                await websocket.send_json({
                    "type": "system",
                    "subtype": "error",
                    "content": str(e)
                })

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            msg_type = message_data.get("type")

            if msg_type == "message":
                user_message = message_data.get("content", "")
                # Extract images if provided (base64 data URLs)
                raw_images = message_data.get("images", [])
                images = []
                for img in raw_images:
                    # Parse data URL: data:image/png;base64,iVBORw...
                    data_url = img.get("data", "")
                    if data_url.startswith("data:"):
                        header, b64_data = data_url.split(",", 1)
                        media_type = header.split(":")[1].split(";")[0]
                        images.append({
                            "data": b64_data,
                            "media_type": media_type
                        })
                stop_requested = False

                # Start streaming in background task so we can still receive stop messages
                streaming_task = asyncio.create_task(stream_claude_output(user_message, images if images else None))

                # Wait for streaming to complete, but also listen for other messages
                while not streaming_task.done():
                    try:
                        # Wait briefly for new messages
                        data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                        interrupt_data = json.loads(data)
                        interrupt_type = interrupt_data.get("type")

                        if interrupt_type == "stop":
                            stop_requested = True
                            await runner.stop()
                            streaming_task.cancel()
                            try:
                                await streaming_task
                            except asyncio.CancelledError:
                                pass
                            await websocket.send_json({
                                "type": "system",
                                "subtype": "stopped",
                                "content": "Session stopped by user"
                            })
                            break
                        elif interrupt_type == "permission_response":
                            tool_use_id = interrupt_data.get("tool_use_id")
                            allowed = interrupt_data.get("allowed", False)
                            await runner.send_permission_response(tool_use_id, allowed)
                        elif interrupt_type == "question_response":
                            tool_use_id = interrupt_data.get("tool_use_id")
                            answers = interrupt_data.get("answers", {})
                            await runner.send_question_response(tool_use_id, answers)
                        elif interrupt_type == "continue":
                            await runner.send_continue()
                        elif interrupt_type == "set_permission_mode":
                            new_mode = interrupt_data.get("mode", "default")
                            runner.permission_mode = new_mode
                            await websocket.send_json({
                                "type": "system",
                                "subtype": "config",
                                "permissionMode": new_mode
                            })
                    except asyncio.TimeoutError:
                        # No message received, continue waiting for stream
                        continue

                # Ensure streaming task is awaited
                if streaming_task and not streaming_task.done():
                    await streaming_task

            elif msg_type == "permission_response":
                tool_use_id = message_data.get("tool_use_id")
                allowed = message_data.get("allowed", False)
                await runner.send_permission_response(tool_use_id, allowed)

            elif msg_type == "question_response":
                tool_use_id = message_data.get("tool_use_id")
                answers = message_data.get("answers", {})
                await runner.send_question_response(tool_use_id, answers)

            elif msg_type == "continue":
                await runner.send_continue()

            elif msg_type == "stop":
                stop_requested = True
                await runner.stop()
                if streaming_task and not streaming_task.done():
                    streaming_task.cancel()
                    try:
                        await streaming_task
                    except asyncio.CancelledError:
                        pass
                await websocket.send_json({
                    "type": "system",
                    "subtype": "stopped",
                    "content": "Session stopped by user"
                })

            elif msg_type == "set_permission_mode":
                new_mode = message_data.get("mode", "default")
                runner.permission_mode = new_mode
                await websocket.send_json({
                    "type": "system",
                    "subtype": "config",
                    "permissionMode": new_mode
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "system",
                "subtype": "error",
                "content": str(e)
            })
        except:
            pass
    finally:
        await runner.stop()
        if websocket in active_connections:
            del active_connections[websocket]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
