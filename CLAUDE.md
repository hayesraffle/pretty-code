# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**pretty-code** is a web-based GUI wrapper for Claude Code CLI. It creates a beautiful, modern browser interface to make AI-assisted coding accessible and less intimidating - designed for both developers and users learning to code.

Core principle: Code should feel like reading a well-designed article, not staring at a scary terminal.

## Architecture

```
Browser (React + TailwindCSS)
    │
    │ WebSocket (real-time streaming + bidirectional)
    ▼
Local Server (FastAPI/Python)
    │
    │ subprocess (--input-format stream-json --output-format stream-json)
    ▼
Claude Code CLI
```

Key architectural decisions:
- **Bidirectional WebSocket**: Allows real-time streaming AND interrupts (stop, permission responses)
- **Images sent as base64**: Images are sent directly in Claude's native API format, not as file paths
- **Concurrent streaming**: Backend uses asyncio tasks to handle streaming while listening for interrupts
- **Persistent conversations**: Saved to `~/.pretty-code/conversations/` as JSON files

## Tech Stack

**Frontend:** React, TailwindCSS v4, Vite, react-markdown, prism-react-renderer, Lucide React
**Fonts:** Inter (prose), JetBrains Mono (code)
**Backend:** FastAPI with WebSocket support (Python)

## Build & Run Commands

```bash
# Frontend (port 5173)
cd frontend && npm install && npm run dev

# Backend (port 8000) - separate terminal
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Project Structure

```
frontend/src/
  App.jsx                 # Main app with WebSocket event handling
  components/
    Chat.jsx              # Message list + empty state with quick actions
    Message.jsx           # User/AI message bubbles with tool call display
    InputBox.jsx          # Input with mode selector, working dir, drag-drop
    CodeBlock.jsx         # Code display mode switcher (pretty/classic)
    PrettyCodeBlock.jsx   # Semantic typography for code
    ClassicCodeBlock.jsx  # Traditional syntax highlighting
    ToolCallView.jsx      # Renders tool calls (Read, Edit, Bash, etc.)
    PermissionPrompt.jsx  # Permission request UI
    QuestionPrompt.jsx    # AskUserQuestion UI
    TodoList.jsx          # Floating todo list from TodoWrite
    Sidebar.jsx           # Conversation history
    FileBrowser.jsx       # File tree browser modal
    SettingsPanel.jsx     # Settings modal
    PlanModeBar.jsx       # Plan approval banner
    ExportMenu.jsx        # Export conversations (Markdown, JSON)
    MarkdownRenderer.jsx  # Custom markdown styling
    TypingIndicator.jsx   # Streaming indicator
  hooks/
    useWebSocket.js       # WebSocket connection + message handling
    useConversationStorage.js  # Save/load conversations via backend API
    useCommandHistory.js  # Input history (arrow up/down)
    useDarkMode.js        # Dark mode toggle
  contexts/
    SettingsContext.jsx   # Global settings (permission mode, etc.)
    CodeDisplayContext.jsx # Pretty vs classic code display mode

backend/
  main.py                 # FastAPI server, WebSocket endpoint, file/conversation APIs
  claude_runner.py        # Claude Code CLI subprocess wrapper with streaming
```

## Features

- **Real-time streaming** from Claude Code CLI via WebSocket
- **Image support** - drag & drop images, sent as base64 directly to Claude
- **Permission modes** - YOLO (bypass), Plan, Accept Edits, Always Ask
- **Tool call rendering** - Pretty display of Read, Edit, Bash, Glob, Grep, etc.
- **Permission prompts** - Approve/reject tool calls with "Always allow" option
- **Question prompts** - Interactive AskUserQuestion UI
- **Sub-agent question handling** - Surfaces failed sub-agent questions as interactive prompts
- **Todo list** - Floating panel shows TodoWrite tasks
- **Plan mode** - Approval workflow with auto-switch to YOLO on approve
- **Conversation persistence** - Saved to disk, survives server restarts
- **Conversation sidebar** - Browse and switch between past conversations
- **File browser** - Browse and select files, change working directory
- **Export** - Download conversations as Markdown or JSON
- **Dark mode** - Persisted to localStorage
- **Code display modes** - Pretty (semantic typography) or Classic (syntax highlighting)
- **Stop generation** - Interrupt streaming at any time
- **Input history** - Arrow up/down to navigate previous messages

## Design Guidelines

- **Colors:** Soft, not high-contrast. Uses CSS custom properties for theming.
- **Typography:** 16px body (Inter), 14px code (JetBrains Mono)
- **Dark mode:** Uses `.dark` class on `<html>` element
- **Input style:** Google AI mode inspired - rounded pill with floating mode indicator
