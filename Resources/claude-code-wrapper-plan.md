# Claude Code Beautiful Wrapper - Project Plan

## Vision
Build a beautiful web interface for Claude Code that makes AI coding accessible and delightful for everyone - from experienced developers to curious kids learning to code.

**Core Principle:** Code should feel like reading a well-designed article, not staring at a scary terminal.

## Target Users
- **Primary:** You and your daughter (Paloma/Anika)
- **Secondary:** Anyone who wants Claude Code's power with modern UX

## User Needs
1. ✅ Beautiful typography (variable-width fonts for prose, readable monospace for code)
2. ✅ Rich markdown rendering (headers, lists, colors, formatting)
3. ✅ Point-and-click interactions (no keyboard-only navigation)
4. ✅ Modern, clean aesthetic (think Notion/Linear/ChatGPT)
5. ✅ Make code less intimidating and easier to understand
6. ✅ Works in a browser (easy to share, no installation)

---

## Technical Architecture

### System Design
```
┌──────────────────────────────────────┐
│         Web Browser (Frontend)       │
│  - React + TailwindCSS               │
│  - Beautiful markdown rendering      │
│  - Custom code syntax highlighting   │
│  - Click interactions                │
└──────────────┬───────────────────────┘
               │ WebSocket (real-time)
┌──────────────┴───────────────────────┐
│     Local Server (Backend)           │
│  - FastAPI (Python) or Express (Node)│
│  - Manages Claude Code process       │
│  - Streams output to frontend        │
└──────────────┬───────────────────────┘
               │ subprocess
┌──────────────┴───────────────────────┐
│         Claude Code CLI              │
│  - Runs normally                     │
│  - Outputs markdown/code             │
└──────────────────────────────────────┘
```

### Tech Stack

**Frontend:**
- **Framework:** React (familiar, fast, great ecosystem)
- **Styling:** TailwindCSS (utility-first, beautiful out of the box)
- **Fonts:** 
  - Prose: Inter, SF Pro, or Geist
  - Code: JetBrains Mono or Fira Code (with ligatures)
- **Markdown:** react-markdown with custom renderers
- **Syntax Highlighting:** Prism.js or highlight.js (customizable)
- **Icons:** Lucide React (clean, modern icons)

**Backend:**
- **Option A (Python):** FastAPI + WebSockets
- **Option B (Node):** Express + Socket.io
- **Recommendation:** Python (easier to integrate with Claude Code CLI)

**Development:**
- **Package Manager:** npm/yarn
- **Dev Server:** Vite (super fast hot reload)
- **Deployment:** Can start with localhost, later deploy to Vercel/Railway

---

## Weekend 1: MVP Build Plan

### Day 1 (Saturday): Beautiful Static Prototype

**Goal:** Build the UI with fake data to nail the aesthetic

**Tasks:**
1. **Setup (30 min)**
   - [ ] Initialize Vite + React project
   - [ ] Setup TailwindCSS
   - [ ] Install dependencies (react-markdown, prism, lucide-react)
   - [ ] Configure fonts (Inter + JetBrains Mono)

2. **Build Core UI (2-3 hours)**
   - [ ] Chat-like layout (messages flowing down)
   - [ ] User input box at bottom
   - [ ] Message bubbles (user vs AI)
   - [ ] Markdown renderer with custom styles

3. **Custom Code Rendering (2-3 hours)**
   - [ ] Syntax highlighting that's pleasant
   - [ ] Collapsible code blocks
   - [ ] Copy button on code blocks
   - [ ] Line numbers (optional)
   - [ ] Language badges

4. **Polish (1-2 hours)**
   - [ ] Color scheme (light mode first)
   - [ ] Smooth animations
   - [ ] Responsive layout
   - [ ] Make it feel alive

**End of Day 1:** A beautiful static prototype showing what Claude Code output COULD look like

---

### Day 2 (Sunday): Connect to Real Claude Code

**Goal:** Make it actually work with Claude Code

**Tasks:**
1. **Backend Setup (1 hour)**
   - [ ] Create FastAPI server
   - [ ] WebSocket endpoint
   - [ ] Basic subprocess handling

2. **Claude Code Integration (2-3 hours)**
   - [ ] Spawn Claude Code process
   - [ ] Stream output line by line
   - [ ] Parse markdown/code blocks
   - [ ] Handle errors gracefully

3. **Frontend Connection (1-2 hours)**
   - [ ] WebSocket client
   - [ ] Send user messages
   - [ ] Receive and display streaming responses
   - [ ] Handle connection status

4. **Testing & Debug (1-2 hours)**
   - [ ] Test with real Claude Code commands
   - [ ] Fix any streaming issues
   - [ ] Handle edge cases

**End of Day 2:** Working prototype that you can actually use!

---

## File Structure

```
claude-code-wrapper/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.jsx              # Main chat interface
│   │   │   ├── Message.jsx           # Individual message bubble
│   │   │   ├── CodeBlock.jsx         # Custom code renderer
│   │   │   ├── MarkdownRenderer.jsx  # Markdown with custom styles
│   │   │   └── InputBox.jsx          # User input area
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── main.py                        # FastAPI server
│   ├── claude_code_runner.py          # Claude Code wrapper
│   ├── requirements.txt
│   └── .env
│
├── README.md
└── .gitignore
```

---

## Key Features to Build

### Phase 1 (Weekend 1) - MVP
- [x] Beautiful markdown rendering
- [x] Custom code syntax highlighting
- [x] Real-time streaming from Claude Code
- [x] User input and response
- [x] Basic error handling

### Phase 2 (Future) - Enhanced UX
- [ ] Code explanations (click to see "what does this do?")
- [ ] Semantic highlighting (data vs actions vs output)
- [ ] Progressive disclosure (collapse boring parts)
- [ ] File browser/viewer
- [ ] Inline documentation
- [ ] Command history
- [ ] Save conversations

### Phase 3 (Future) - Advanced
- [ ] Dark mode
- [ ] Custom themes
- [ ] Keyboard shortcuts
- [ ] Export conversations
- [ ] Share via URL
- [ ] Multi-session support

---

## Design Principles

### Typography Hierarchy
```
# H1 - 32px, bold, Inter
## H2 - 24px, semibold, Inter
### H3 - 20px, semibold, Inter
Body - 16px, regular, Inter
Code - 14px, JetBrains Mono
```

### Color Strategy (Light Mode)
```
Background: #ffffff
Text: #1a1a1a
Code Background: #f5f5f5
Code Text: #2e3440
Accent: #3b82f6 (blue-500)
Success: #10b981 (green-500)
Error: #ef4444 (red-500)
```

### Code Highlighting Goals
- **NOT scary** - soft colors, not high contrast
- **Meaningful** - colors should indicate meaning, not just syntax
- **Examples:**
  - Variables: soft blue
  - Functions: purple
  - Strings: green
  - Comments: gray italic
  - Keywords: bold

---

## Success Metrics

**After Weekend 1:**
- [ ] You can run it and it looks beautiful
- [ ] Your daughter says "wow this is cool"
- [ ] You actually want to use it instead of terminal
- [ ] Code feels less intimidating

**After Phase 2:**
- [ ] Your daughter can understand what code does
- [ ] You use it daily for Claude Code tasks
- [ ] Friends ask "what is that?"

---

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Start dev server
npm run build        # Build for production
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python main.py       # Start server
```

### Full Stack
```bash
# Terminal 1
cd backend && python main.py

# Terminal 2
cd frontend && npm run dev

# Open browser to localhost:5173
```

---

## Next Steps

1. **Right now:** Create the project structure
2. **Next 10 minutes:** Setup frontend boilerplate
3. **First hour:** Build a single beautiful message component
4. **Keep iterating:** Add features one by one

Let's start building! 🚀

---

## Notes & Ideas

- Consider using Claude's API directly instead of wrapping CLI (more control)
- Could add "explain this code" button that uses Claude to annotate
- File system browser could show pretty icons for file types
- "Replay" mode to show conversation history in slow motion
- Export to Notion/Markdown/PDF
- Collaborative mode (share session with your daughter)

## Questions to Answer While Building

- How do we handle long-running commands?
- Should we show command execution status?
- How do we handle file uploads/attachments?
- Do we need authentication (not for localhost)?
- How do we persist conversation history?
