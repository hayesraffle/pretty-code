#!/bin/bash

# Pretty Code - One-click launcher
# Double-click this file to start Pretty Code

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script lives (Resources folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Config and projects directories
CONFIG_DIR="$HOME/.pretty-code"
PROJECTS_DIR="$HOME/pretty-code-projects"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✨ Pretty Code Launcher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Track if we hit any errors
HAS_ERROR=0

# Check for Claude Code CLI
if ! command -v claude &> /dev/null; then
    echo -e "${RED}✗ Claude Code CLI not found${NC}"
    echo "  Install it with: npm install -g @anthropic-ai/claude-code"
    echo "  Then run 'claude' once to authenticate"
    echo ""
    HAS_ERROR=1
else
    echo -e "${GREEN}✓${NC} Claude Code CLI found"
fi

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 not found${NC}"
    echo "  Install it from: https://www.python.org/downloads/"
    echo ""
    HAS_ERROR=1
else
    echo -e "${GREEN}✓${NC} Python 3 found"
fi

# Check for Node/npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    echo "  Install Node.js from: https://nodejs.org/"
    echo ""
    HAS_ERROR=1
else
    echo -e "${GREEN}✓${NC} npm found"
fi

# Check for backend venv and dependencies
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    echo -e "${YELLOW}! Backend virtual environment not found${NC}"
    echo "  Setting it up now..."
    cd "$SCRIPT_DIR/backend"
    python3 -m venv venv
    source venv/bin/activate
    pip install -q -r requirements.txt
    echo -e "${GREEN}✓${NC} Backend environment ready"
else
    # Verify dependencies are installed by checking for a key package
    cd "$SCRIPT_DIR/backend"
    source venv/bin/activate
    if ! python3 -c "import dotenv" 2>/dev/null; then
        echo -e "${YELLOW}! Backend dependencies missing, installing...${NC}"
        pip install -q -r requirements.txt
    fi
    echo -e "${GREEN}✓${NC} Backend environment ready"
fi

# Check for frontend node_modules
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo -e "${YELLOW}! Frontend dependencies not installed${NC}"
    echo "  Installing now..."
    cd "$SCRIPT_DIR/frontend"
    npm install
    echo -e "${GREEN}✓${NC} Frontend dependencies ready"
else
    echo -e "${GREEN}✓${NC} Frontend dependencies ready"
fi

# If we hit any errors, stop here
if [ $HAS_ERROR -eq 1 ]; then
    echo ""
    echo -e "${RED}Please fix the issues above and try again.${NC}"
    echo ""
    echo "Press any key to close..."
    read -n 1
    exit 1
fi

# Create config directory if needed
mkdir -p "$CONFIG_DIR"

# Create projects sandbox if this is first run
if [ ! -d "$PROJECTS_DIR" ]; then
    echo ""
    echo -e "${BLUE}First time setup: Creating your projects folder...${NC}"
    mkdir -p "$PROJECTS_DIR/welcome"

    # Create welcome README
    cat > "$PROJECTS_DIR/welcome/README.md" << 'WELCOME_EOF'
# Welcome to Pretty Code! 👋

This is your sandbox for coding with Claude.

## Try These Starter Prompts

**Create a simple website:**
> "Create a simple HTML page with a button that changes color when clicked"

**Build a small tool:**
> "Create a Python script that converts temperatures between Fahrenheit and Celsius"

**Learn something new:**
> "Explain how a for loop works in JavaScript, then show me 3 examples"

## Tips

- Use the **file browser** (folder icon) to navigate to different projects
- Your conversations are saved automatically
- Drag and drop images to share them with Claude
- Click the **stop button** if Claude is going in the wrong direction

Happy coding! 🚀
WELCOME_EOF

    echo -e "${GREEN}✓${NC} Created ~/pretty-code-projects/welcome"

    # Save initial config pointing to welcome folder
    echo "{\"workingDirectory\": \"$PROJECTS_DIR/welcome\"}" > "$CONFIG_FILE"
fi

echo ""
echo "Starting servers..."
echo ""

# Capture backend output to a log file for error detection
BACKEND_LOG="/tmp/pretty-code-backend-$$.log"

# Start backend
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
python3 main.py > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓${NC} Backend starting (PID: $BACKEND_PID)"

# Start frontend and capture output to detect actual port
cd "$SCRIPT_DIR/frontend"
VITE_LOG="/tmp/pretty-code-vite-$$.log"
npm run dev > "$VITE_LOG" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓${NC} Frontend starting (PID: $FRONTEND_PID)"

# Wait for Vite to report its URL (up to 30 seconds)
echo ""
echo "Waiting for servers to start..."
FRONTEND_PORT=""
BACKEND_OK=0
for i in {1..30}; do
    # Check if backend is still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo ""
        echo -e "${RED}✗ Backend failed to start!${NC}"
        echo ""
        echo "Error log:"
        cat "$BACKEND_LOG"
        echo ""
        echo -e "${YELLOW}Try running these commands manually to fix:${NC}"
        echo "  cd $SCRIPT_DIR/backend"
        echo "  source venv/bin/activate"
        echo "  pip install -r requirements.txt"
        echo ""
        echo "Press any key to close..."
        # Kill frontend since we're failing
        kill $FRONTEND_PID 2>/dev/null
        rm -f "$BACKEND_LOG" "$VITE_LOG"
        read -n 1
        exit 1
    fi

    # Check if backend is responding (port 8000)
    if [ $BACKEND_OK -eq 0 ]; then
        if curl -s http://localhost:8000/api/health > /dev/null 2>&1 || \
           curl -s http://localhost:8000/ > /dev/null 2>&1; then
            BACKEND_OK=1
        fi
    fi

    # Check for Vite port
    if [ -z "$FRONTEND_PORT" ] && [ -f "$VITE_LOG" ]; then
        FRONTEND_PORT=$(grep -o "Local:.*http://localhost:[0-9]*" "$VITE_LOG" | grep -o "[0-9]*$" | head -1)
    fi

    # Exit loop early if both are ready
    if [ $BACKEND_OK -eq 1 ] && [ -n "$FRONTEND_PORT" ]; then
        break
    fi

    sleep 1
done

# Final check - is backend still running?
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo ""
    echo -e "${RED}✗ Backend crashed during startup!${NC}"
    echo ""
    echo "Error log:"
    cat "$BACKEND_LOG"
    echo ""
    echo "Press any key to close..."
    kill $FRONTEND_PID 2>/dev/null
    rm -f "$BACKEND_LOG" "$VITE_LOG"
    read -n 1
    exit 1
fi

# Fall back to 5173 if we couldn't detect the port
if [ -z "$FRONTEND_PORT" ]; then
    FRONTEND_PORT="5173"
    echo -e "${YELLOW}! Could not detect Vite port, assuming 5173${NC}"
fi

# Start tailing both logs in background so user sees output
tail -f "$VITE_LOG" "$BACKEND_LOG" &
TAIL_PID=$!

# Cleanup function with guard to prevent double-execution
CLEANUP_DONE=0
cleanup() {
    if [ $CLEANUP_DONE -eq 1 ]; then
        return
    fi
    CLEANUP_DONE=1
    echo ""
    echo "Shutting down..."
    kill $TAIL_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    rm -f "$VITE_LOG" "$BACKEND_LOG"
    exit 0
}
trap cleanup SIGINT SIGTERM SIGHUP EXIT

# Open browser with the actual port
echo ""
echo -e "${GREEN}Opening browser...${NC}"
open "http://localhost:$FRONTEND_PORT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Pretty Code is running!"
echo "  "
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend:  http://localhost:8000"
echo "  "
echo "  Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Wait for both processes
wait
