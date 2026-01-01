#!/bin/bash

# Pretty Code - One-click launcher
# Double-click this file to start Pretty Code

# ============ Ensure PATH includes common install locations ============
# This fixes issues where tools are installed but not in PATH

# Homebrew paths (Apple Silicon and Intel)
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
[ -d "/usr/local/bin" ] && export PATH="/usr/local/bin:$PATH"

# Python user bin directories (where pip installs scripts)
[ -d "$HOME/Library/Python/3.9/bin" ] && export PATH="$HOME/Library/Python/3.9/bin:$PATH"
[ -d "$HOME/Library/Python/3.10/bin" ] && export PATH="$HOME/Library/Python/3.10/bin:$PATH"
[ -d "$HOME/Library/Python/3.11/bin" ] && export PATH="$HOME/Library/Python/3.11/bin:$PATH"
[ -d "$HOME/Library/Python/3.12/bin" ] && export PATH="$HOME/Library/Python/3.12/bin:$PATH"
[ -d "$HOME/Library/Python/3.13/bin" ] && export PATH="$HOME/Library/Python/3.13/bin:$PATH"
[ -d "$HOME/.local/bin" ] && export PATH="$HOME/.local/bin:$PATH"

# Node.js paths (nvm, volta, system)
[ -d "$HOME/.nvm/versions/node" ] && export PATH="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name bin -type d 2>/dev/null | head -1):$PATH"
[ -d "$HOME/.volta/bin" ] && export PATH="$HOME/.volta/bin:$PATH"
[ -d "/usr/local/lib/node_modules/.bin" ] && export PATH="/usr/local/lib/node_modules/.bin:$PATH"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Get the directory where this script lives (Resources folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Config and projects directories
CONFIG_DIR="$HOME/.pretty-code"
PROJECTS_DIR="$HOME/pretty-code-projects"
CONFIG_FILE="$CONFIG_DIR/config.json"

# Minimum Python version required
MIN_PYTHON_VERSION="3.10"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✨ Pretty Code Launcher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============ Helper Functions ============

# Compare version strings (returns 0 if $1 >= $2)
version_gte() {
    [ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

# Get Python version string
get_python_version() {
    "$1" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null
}

# Find a suitable Python >= 3.10
find_suitable_python() {
    # Check common locations in order of preference
    local candidates=(
        "/opt/homebrew/bin/python3.13"
        "/opt/homebrew/bin/python3.12"
        "/opt/homebrew/bin/python3.11"
        "/opt/homebrew/bin/python3.10"
        "/usr/local/bin/python3.13"
        "/usr/local/bin/python3.12"
        "/usr/local/bin/python3.11"
        "/usr/local/bin/python3.10"
        "/opt/homebrew/bin/python3"
        "/usr/local/bin/python3"
        "python3"
    )

    for py in "${candidates[@]}"; do
        if command -v "$py" &> /dev/null; then
            local ver=$(get_python_version "$py")
            if [ -n "$ver" ] && version_gte "$ver" "$MIN_PYTHON_VERSION"; then
                echo "$py"
                return 0
            fi
        fi
    done
    return 1
}

# ============ Check Prerequisites ============

HAS_ERROR=0

# Check for Homebrew (needed for auto-install)
HAS_BREW=0
if command -v brew &> /dev/null; then
    HAS_BREW=1
    echo -e "${DIM}Homebrew available for auto-install${NC}"
fi

# Check for Node/npm (needed for frontend and Claude CLI)
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}! Node.js/npm not found${NC}"

    if [ $HAS_BREW -eq 1 ]; then
        echo -e "  Installing Node.js via Homebrew..."
        if brew install node; then
            echo -e "${GREEN}✓${NC} Node.js installed"
        else
            echo -e "${RED}✗ Failed to install Node.js via Homebrew${NC}"
            HAS_ERROR=1
        fi
    else
        echo -e "${RED}✗ Cannot auto-install Node.js (Homebrew not found)${NC}"
        echo "  Install Node.js from: https://nodejs.org/"
        echo "  Or install Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        HAS_ERROR=1
    fi
else
    echo -e "${GREEN}✓${NC} Node.js/npm found"
fi

# Check for Claude Code CLI
if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}! Claude Code CLI not found${NC}"
    if command -v npm &> /dev/null; then
        echo -e "  Installing now..."
        if npm install -g @anthropic-ai/claude-code; then
            echo -e "${GREEN}✓${NC} Claude Code CLI installed"
        else
            echo -e "${RED}✗ Failed to install Claude Code CLI${NC}"
            HAS_ERROR=1
        fi
    else
        echo -e "${RED}✗ npm not found - cannot install Claude Code CLI${NC}"
        HAS_ERROR=1
    fi
else
    echo -e "${GREEN}✓${NC} Claude Code CLI found"
fi

# Check for suitable Python (>= 3.10)
PYTHON_CMD=$(find_suitable_python)
if [ -z "$PYTHON_CMD" ]; then
    echo -e "${YELLOW}! Python $MIN_PYTHON_VERSION+ not found${NC}"

    # Try to install via Homebrew
    if [ $HAS_BREW -eq 1 ]; then
        echo -e "  Installing Python 3.12 via Homebrew..."
        if brew install python@3.12; then
            PYTHON_CMD=$(find_suitable_python)
            if [ -n "$PYTHON_CMD" ]; then
                echo -e "${GREEN}✓${NC} Python installed: $PYTHON_CMD"
            else
                echo -e "${RED}✗ Python installation succeeded but still can't find it${NC}"
                HAS_ERROR=1
            fi
        else
            echo -e "${RED}✗ Failed to install Python via Homebrew${NC}"
            HAS_ERROR=1
        fi
    else
        echo -e "${RED}✗ Cannot auto-install Python (Homebrew not found)${NC}"
        echo "  Install Python 3.10+ from: https://www.python.org/downloads/"
        echo "  Or install Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        HAS_ERROR=1
    fi
else
    PY_VER=$(get_python_version "$PYTHON_CMD")
    echo -e "${GREEN}✓${NC} Python $PY_VER found ($PYTHON_CMD)"
fi

# ============ Check API Key ============

ENV_FILE="$SCRIPT_DIR/backend/.env"
ENV_EXAMPLE="$SCRIPT_DIR/backend/.env.example"

# Check if API key is available (either in environment or .env file)
API_KEY_FOUND=0
if [ -n "$ANTHROPIC_API_KEY" ]; then
    API_KEY_FOUND=1
elif [ -f "$ENV_FILE" ]; then
    if grep -q "^ANTHROPIC_API_KEY=.\+" "$ENV_FILE" && ! grep -q "^ANTHROPIC_API_KEY=your-api-key-here" "$ENV_FILE"; then
        API_KEY_FOUND=1
    fi
fi

if [ $API_KEY_FOUND -eq 0 ]; then
    echo ""
    echo -e "${YELLOW}! Anthropic API key not configured${NC}"
    echo ""
    echo "  Pretty Code needs an API key to work."
    echo "  Get one at: https://console.anthropic.com/settings/keys"
    echo ""

    # Prompt for API key
    read -p "  Paste your API key (or press Enter to skip): " USER_API_KEY

    if [ -n "$USER_API_KEY" ]; then
        # Create .env file with the key
        echo "ANTHROPIC_API_KEY=$USER_API_KEY" > "$ENV_FILE"
        echo -e "${GREEN}✓${NC} API key saved to .env"
    else
        echo -e "${YELLOW}  Skipped. You can add it later to:${NC}"
        echo "  $ENV_FILE"
        # Create empty .env from example if it doesn't exist
        if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_EXAMPLE" ]; then
            cp "$ENV_EXAMPLE" "$ENV_FILE"
        fi
    fi
else
    echo -e "${GREEN}✓${NC} Anthropic API key configured"
fi

# ============ Check Claude Code CLI Auth ============

if command -v claude &> /dev/null; then
    # Check if Claude has been initialized (config directory exists)
    if [ ! -d "$HOME/.claude" ]; then
        echo -e "${YELLOW}! Claude Code CLI needs to be set up${NC}"
        echo ""
        echo "  Running Claude Code CLI for first-time setup..."
        echo "  Please complete authentication in your browser."
        echo ""
        # Run claude to trigger auth flow
        claude --help || true
        echo ""
        echo "  Press Enter after you've authenticated..."
        read -r
    else
        echo -e "${GREEN}✓${NC} Claude Code CLI configured"
    fi
fi

# Stop here if we have fatal errors
if [ $HAS_ERROR -eq 1 ]; then
    echo ""
    echo -e "${RED}Please fix the issues above and try again.${NC}"
    echo ""
    echo "Press any key to close..."
    read -n 1
    exit 1
fi

# ============ Setup Backend ============

cd "$SCRIPT_DIR/backend"

# Function to setup/repair the venv
setup_backend_venv() {
    echo -e "${YELLOW}! Setting up backend environment...${NC}"

    # Remove old venv if it exists
    if [ -d "venv" ]; then
        echo -e "  Removing old virtual environment..."
        rm -rf venv
    fi

    # Create new venv with the correct Python
    echo -e "  Creating virtual environment with $PYTHON_CMD..."
    if ! "$PYTHON_CMD" -m venv venv; then
        echo -e "${RED}✗ Failed to create virtual environment${NC}"
        return 1
    fi

    # Activate and install dependencies
    source venv/bin/activate

    echo -e "  Upgrading pip..."
    pip install --quiet --upgrade pip

    echo -e "  Installing dependencies..."
    if ! pip install --quiet --index-url https://pypi.org/simple/ -r requirements.txt; then
        echo -e "${RED}✗ Failed to install dependencies${NC}"
        return 1
    fi

    return 0
}

# Check if venv exists and is working
VENV_OK=0
if [ -d "venv" ]; then
    source venv/bin/activate 2>/dev/null

    # Check if we can import the key package (claude_agent_sdk requires Python 3.10+)
    if python3 -c "import claude_agent_sdk" 2>/dev/null; then
        VENV_OK=1
        echo -e "${GREEN}✓${NC} Backend environment ready"
    else
        echo -e "${YELLOW}! Backend environment needs repair${NC}"
    fi
fi

# Setup or repair venv if needed
if [ $VENV_OK -eq 0 ]; then
    if ! setup_backend_venv; then
        echo ""
        echo -e "${RED}Failed to setup backend environment.${NC}"
        echo ""
        echo "Try running manually:"
        echo "  cd $SCRIPT_DIR/backend"
        echo "  $PYTHON_CMD -m venv venv"
        echo "  source venv/bin/activate"
        echo "  pip install -r requirements.txt"
        echo ""
        echo "Press any key to close..."
        read -n 1
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Backend environment ready"
fi

# ============ Setup Frontend ============

cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}! Installing frontend dependencies...${NC}"
    if npm install; then
        echo -e "${GREEN}✓${NC} Frontend dependencies ready"
    else
        echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
        echo ""
        echo "Press any key to close..."
        read -n 1
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} Frontend dependencies ready"
fi

# ============ First-time Setup ============

mkdir -p "$CONFIG_DIR"

if [ ! -d "$PROJECTS_DIR" ]; then
    echo ""
    echo -e "${BLUE}First time setup: Creating your projects folder...${NC}"
    mkdir -p "$PROJECTS_DIR/welcome"

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
    echo "{\"workingDirectory\": \"$PROJECTS_DIR/welcome\"}" > "$CONFIG_FILE"
fi

# ============ Start Servers ============

echo ""
echo "Starting servers..."
echo ""

BACKEND_LOG="/tmp/pretty-code-backend-$$.log"
VITE_LOG="/tmp/pretty-code-vite-$$.log"

# Start backend
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
python3 main.py > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓${NC} Backend starting (PID: $BACKEND_PID)"

# Start frontend
cd "$SCRIPT_DIR/frontend"
npm run dev > "$VITE_LOG" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓${NC} Frontend starting (PID: $FRONTEND_PID)"

# Wait for servers to start
echo ""
echo "Waiting for servers to start..."
FRONTEND_PORT=""
BACKEND_OK=0

for i in {1..30}; do
    # Check if backend crashed
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo ""
        echo -e "${RED}✗ Backend failed to start!${NC}"
        echo ""
        echo "Error log:"
        cat "$BACKEND_LOG"
        echo ""

        # Check if it's a Python version issue
        if grep -q "claude_agent_sdk" "$BACKEND_LOG" || grep -q "ModuleNotFoundError" "$BACKEND_LOG"; then
            echo -e "${YELLOW}This looks like a dependency issue. Attempting repair...${NC}"
            kill $FRONTEND_PID 2>/dev/null
            rm -f "$BACKEND_LOG" "$VITE_LOG"

            cd "$SCRIPT_DIR/backend"
            if setup_backend_venv; then
                echo -e "${GREEN}Repair successful! Please run this script again.${NC}"
            fi
        fi

        echo ""
        echo "Press any key to close..."
        read -n 1
        exit 1
    fi

    # Check if backend is responding
    if [ $BACKEND_OK -eq 0 ]; then
        if curl -s http://localhost:8000/ > /dev/null 2>&1; then
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

# Final backend check
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo ""
    echo -e "${RED}✗ Backend crashed during startup!${NC}"
    echo ""
    cat "$BACKEND_LOG"
    echo ""
    echo "Press any key to close..."
    kill $FRONTEND_PID 2>/dev/null
    rm -f "$BACKEND_LOG" "$VITE_LOG"
    read -n 1
    exit 1
fi

# Fall back to default port
if [ -z "$FRONTEND_PORT" ]; then
    FRONTEND_PORT="5173"
    echo -e "${YELLOW}! Could not detect Vite port, assuming 5173${NC}"
fi

# Tail logs in background
tail -f "$VITE_LOG" "$BACKEND_LOG" &
TAIL_PID=$!

# Cleanup handler
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

# Open browser
echo ""
echo -e "${GREEN}Opening browser...${NC}"
open "http://localhost:$FRONTEND_PORT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Pretty Code is running!"
echo "  "
echo -e "  Frontend: ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  Backend:  ${CYAN}http://localhost:8000${NC}"
echo "  "
echo "  Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wait
