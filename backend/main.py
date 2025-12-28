import asyncio
import json
import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from claude_runner import ClaudeCodeRunner

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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Get working directory from query params or use current
    working_dir = websocket.query_params.get("cwd", os.getcwd())
    runner = ClaudeCodeRunner(working_dir=working_dir)
    active_connections[websocket] = runner

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)

            if message_data.get("type") == "message":
                user_message = message_data.get("content", "")

                # Send start indicator
                await websocket.send_json({
                    "type": "start",
                    "content": ""
                })

                # Stream Claude's response
                full_response = ""
                async for chunk in runner.run(user_message):
                    full_response += chunk
                    await websocket.send_json({
                        "type": "chunk",
                        "content": chunk
                    })

                # Send completion indicator
                await websocket.send_json({
                    "type": "complete",
                    "content": full_response
                })

            elif message_data.get("type") == "stop":
                await runner.stop()
                await websocket.send_json({
                    "type": "stopped",
                    "content": ""
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
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
    uvicorn.run(app, host="0.0.0.0", port=8000)
