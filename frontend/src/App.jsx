import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Trash2, Sun, Moon, FolderOpen, Code, Type, Settings } from 'lucide-react'
import Chat from './components/Chat'
import InputBox from './components/InputBox'
import ExportMenu from './components/ExportMenu'
import Sidebar from './components/Sidebar'
import FileBrowser from './components/FileBrowser'
import PermissionPrompt from './components/PermissionPrompt'
import TodoList from './components/TodoList'
import QuestionPrompt from './components/QuestionPrompt'
import PlanModeBar from './components/PlanModeBar'
import SettingsPanel from './components/SettingsPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useDarkMode } from './hooks/useDarkMode'
import { useCommandHistory } from './hooks/useCommandHistory'
import { useConversationStorage } from './hooks/useConversationStorage'
import { useCodeDisplayMode } from './contexts/CodeDisplayContext'
import { useSettings } from './contexts/SettingsContext'

// Tools that are considered safe (read-only or low-risk)
const SAFE_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'TodoWrite', 'AskUserQuestion']

function checkNeedsPermission(toolName, permissionMode) {
  if (permissionMode === 'bypassPermissions') return false
  // Note: plan mode permission requests come via CLI events, not tool_use
  if (permissionMode === 'plan') return false
  if (permissionMode === 'acceptEdits') {
    // Only write/edit tools need permission
    return !SAFE_TOOLS.includes(toolName)
  }
  // 'default' mode - all tools need permission
  return true
}

function App() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false)
  const [pendingPermissions, setPendingPermissions] = useState([]) // Track tool uses needing permission
  const [todos, setTodos] = useState([]) // Track TodoWrite tasks
  const [todoListCollapsed, setTodoListCollapsed] = useState(false)
  const [todoListVisible, setTodoListVisible] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState(null) // AskUserQuestion
  const [subAgentQuestions, setSubAgentQuestions] = useState([]) // Failed sub-agent AskUserQuestion
  const [planFile, setPlanFile] = useState(null) // Plan mode file path
  const [planReady, setPlanReady] = useState(false) // Plan is ready for approval
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [workingDir, setWorkingDir] = useState('')
  const { permissionMode, setPermissionMode: setPermissionModeSettings } = useSettings()
  const {
    status,
    isStreaming,
    sendMessage,
    stopGeneration,
    sendPermissionResponse,
    sendQuestionResponse,
    onEvent,
    disconnect,
    connect,
    setPermissionMode: setPermissionModeWs,
  } = useWebSocket(permissionMode, workingDir)

  // Combined handler that updates both settings and notifies backend
  const setPermissionMode = useCallback((mode) => {
    setPermissionModeSettings(mode)
    setPermissionModeWs(mode)
  }, [setPermissionModeSettings, setPermissionModeWs])

  // Fetch initial working directory from backend
  useEffect(() => {
    fetch('http://localhost:8000/api/cwd')
      .then(res => res.json())
      .then(data => {
        if (data.cwd) setWorkingDir(data.cwd)
      })
      .catch(() => {})
  }, [])
  const { isDark, toggle: toggleDarkMode } = useDarkMode()
  const { globalMode, toggleGlobalMode } = useCodeDisplayMode()
  const { addToHistory, navigateHistory } = useCommandHistory()
  const {
    conversations,
    currentId,
    saveConversation,
    loadConversation,
    newConversation,
    deleteConversation,
  } = useConversationStorage()
  const streamingMessageRef = useRef('')
  const autoSaveRef = useRef(null)
  const pendingAskUserQuestionsRef = useRef(new Map()) // Track AskUserQuestion tool_uses by id
  const autoApprovedPermissionsRef = useRef(new Set()) // Track auto-approved permissions to prevent duplicates

  // Handle incoming WebSocket events (new JSON streaming format)
  useEffect(() => {
    onEvent((event) => {
      if (event.type === 'system' && event.subtype === 'init') {
        // Session started - create empty assistant message
        streamingMessageRef.current = ''
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: '',
          events: [], // Store raw events for tool call rendering
          timestamp: new Date()
        }])
      } else if (event.type === 'assistant') {
        // Assistant message with content (text or tool_use)
        const message = event.message || {}
        const content = message.content || []

        // Check for tool_use that needs permission or updates todos
        for (const item of content) {
          if (item.type === 'tool_use') {
            // Handle TodoWrite tool
            if (item.name === 'TodoWrite' && item.input?.todos) {
              setTodos(item.input.todos)
              setTodoListVisible(true)
            }

            // Handle AskUserQuestion tool
            if (item.name === 'AskUserQuestion' && item.input?.questions) {
              // Store in ref to detect failed sub-agent attempts later
              pendingAskUserQuestionsRef.current.set(item.id, item.input.questions)
              // Set as pending question for main agent (may get cleared if sub-agent fails)
              setPendingQuestion({
                id: item.id,
                questions: item.input.questions,
              })
            }

            // Handle EnterPlanMode - set plan file path
            if (item.name === 'EnterPlanMode') {
              setPlanFile(item.input?.planFile || 'plan.md')
            }

            // Handle ExitPlanMode
            if (item.name === 'ExitPlanMode') {
              setPlanFile(null)
            }

            const needsPermission = checkNeedsPermission(item.name, permissionMode)
            if (needsPermission) {
              setPendingPermissions((prev) => [
                ...prev,
                {
                  id: item.id,
                  name: item.name,
                  input: item.input,
                },
              ])
            }
          }
        }

        // Store the event for tool call rendering
        setMessages((prev) => {
          const updated = [...prev]
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
            const lastMsg = updated[updated.length - 1]
            const newEvents = [...(lastMsg.events || []), event]

            // Extract text content for display
            let textContent = ''
            for (const evt of newEvents) {
              const evtContent = evt.message?.content || []
              for (const item of evtContent) {
                if (item.type === 'text') {
                  textContent += item.text
                }
              }
            }

            // Detect plan ready state (Claude says plan is ready for approval)
            if (permissionMode === 'plan') {
              const planReadyPatterns = [
                /ready to implement when you approve/i,
                /ready for your approval/i,
                /approve the plan/i,
                /waiting for.*approval/i,
              ]
              if (planReadyPatterns.some(p => p.test(textContent))) {
                setPlanReady(true)
              }
            }

            updated[updated.length - 1] = {
              ...lastMsg,
              content: textContent,
              events: newEvents,
            }
          }
          return updated
        })
      } else if (event.type === 'user') {
        // Tool result - store for rendering and clear pending permission
        const content = event.message?.content || []
        for (const item of content) {
          if (item.type === 'tool_result') {
            setPendingPermissions((prev) =>
              prev.filter((p) => p.id !== item.tool_use_id)
            )

            // Check if this is a failed AskUserQuestion from a sub-agent
            const resultContent = typeof item.content === 'string' ? item.content : ''
            const isAskUserError = resultContent.includes('No such tool available: AskUserQuestion')
            if (isAskUserError && pendingAskUserQuestionsRef.current.has(item.tool_use_id)) {
              const questions = pendingAskUserQuestionsRef.current.get(item.tool_use_id)
              // Clear the main pendingQuestion since it failed
              setPendingQuestion(null)
              // Add to sub-agent questions for interactive display
              setSubAgentQuestions(prev => [...prev, {
                id: item.tool_use_id,
                questions,
                answered: false,
                answers: {}
              }])
              pendingAskUserQuestionsRef.current.delete(item.tool_use_id)
            }
          }
        }

        setMessages((prev) => {
          const updated = [...prev]
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
            const lastMsg = updated[updated.length - 1]
            updated[updated.length - 1] = {
              ...lastMsg,
              events: [...(lastMsg.events || []), event],
            }
          }
          return updated
        })
      } else if (event.type === 'result') {
        // Session complete - auto-save
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
        autoSaveRef.current = setTimeout(() => {
          setMessages((current) => {
            if (current.length > 0) saveConversation(current)
            return current
          })
        }, 1000)
      } else if (event.type === 'system' && event.subtype === 'error') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `**Error:** ${event.content}`, timestamp: new Date() },
        ])
      } else if (event.type === 'permission_request') {
        // Prevent duplicate handling (React strict mode can trigger twice)
        if (autoApprovedPermissionsRef.current.has(event.tool_use_id)) {
          return
        }

        // CLI is requesting permission (happens in plan mode and default mode)
        // Auto-approve reads of user-uploaded images (temp directory)
        const filePath = event.input?.file_path || event.input?.path || ''
        const isUserUploadedImage = event.tool === 'Read' && filePath.includes('pretty-code-uploads')

        if (isUserUploadedImage) {
          // User already provided this image - auto-approve
          autoApprovedPermissionsRef.current.add(event.tool_use_id)
          sendPermissionResponse(event.tool_use_id, true)
        } else {
          setPendingPermissions((prev) => {
            // Also check for duplicates in pending list
            if (prev.some(p => p.id === event.tool_use_id)) return prev
            return [
              ...prev,
              {
                id: event.tool_use_id,
                name: event.tool,
                input: event.input,
              },
            ]
          })
        }
      }
    })
  }, [onEvent, saveConversation, sendPermissionResponse])

  const handleSend = useCallback(async (message, images = []) => {
    addToHistory(message)

    // Prepend context from answered sub-agent questions
    let contextPrefix = ''
    const answeredQuestions = subAgentQuestions.filter(q => q.answered)
    if (answeredQuestions.length > 0) {
      contextPrefix = answeredQuestions.map(q => {
        const answerParts = Object.entries(q.answers)
          .map(([question, answer]) => `Q: "${question}" A: "${answer}"`)
          .join('; ')
        return `[Answering sub-agent question: ${answerParts}]`
      }).join('\n') + '\n\n'
      // Clear answered questions
      setSubAgentQuestions(prev => prev.filter(q => !q.answered))
    }

    // Upload images first if any
    let imagePaths = []
    let imageData = []
    if (images.length > 0) {
      for (const img of images) {
        try {
          const res = await fetch('http://localhost:8000/api/images/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: img.name,
              type: img.type,
              data: img.data,
            }),
          })
          const data = await res.json()
          imagePaths.push(data.path)
          imageData.push({ ...img, path: data.path, filename: data.filename })
        } catch (e) {
          console.error('Failed to upload image:', e)
        }
      }
    }

    // Build message with image paths for Claude
    let fullMessage = contextPrefix + message
    if (imagePaths.length > 0) {
      const pathsText = imagePaths.join(' ')
      fullMessage = fullMessage ? `${fullMessage}\n\n[Images: ${pathsText}]` : `[Images: ${pathsText}]`
    }

    // Add to UI with image data for display
    setMessages((prev) => [...prev, {
      role: 'user',
      content: message,
      images: imageData,
      timestamp: new Date()
    }])

    if (status === 'connected') {
      sendMessage(fullMessage)
    } else {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Not connected to backend.**

Start the backend server to connect to Claude Code:

\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
\`\`\`

Then refresh this page.`,
            timestamp: new Date(),
          },
        ])
      }, 500)
    }
  }, [status, sendMessage, addToHistory, subAgentQuestions])

  const handleClear = () => {
    setMessages([])
    setPendingPermissions([])
  }

  const handleStop = () => {
    stopGeneration()
    setPendingPermissions([])
  }

  const handlePermissionApprove = (toolUseId) => {
    sendPermissionResponse(toolUseId, true)
    setPendingPermissions((prev) => prev.filter((p) => p.id !== toolUseId))
  }

  const handlePermissionReject = (toolUseId) => {
    sendPermissionResponse(toolUseId, false)
    setPendingPermissions((prev) => prev.filter((p) => p.id !== toolUseId))
  }

  const handleAlwaysAllow = (toolName) => {
    // For now, just approve the current one
    // Could store in localStorage to remember for future
    pendingPermissions
      .filter((p) => p.name === toolName)
      .forEach((p) => sendPermissionResponse(p.id, true))
    setPendingPermissions((prev) => prev.filter((p) => p.name !== toolName))
  }

  const handleQuestionSubmit = (answers) => {
    sendQuestionResponse(answers)
    setPendingQuestion(null)
  }

  const handleQuestionCancel = () => {
    // Send empty response to cancel
    sendQuestionResponse({})
    setPendingQuestion(null)
  }

  const handleSubAgentAnswer = (questionId, answers) => {
    setSubAgentQuestions(prev => prev.map(q =>
      q.id === questionId ? { ...q, answered: true, answers } : q
    ))
  }

  const handleSubAgentQuestionDismiss = (questionId) => {
    setSubAgentQuestions(prev => prev.filter(q => q.id !== questionId))
  }

  const handleApprovePlan = () => {
    // Signal approval of the plan
    sendMessage('approved')
    setPlanFile(null)
    setPlanReady(false)
    // Auto-switch to YOLO mode for execution
    setPermissionMode('bypassPermissions')
  }

  const handleQuickAction = (prompt) => {
    setInputValue(prompt + ' ')
  }

  const handleChangeWorkingDir = useCallback((newDir) => {
    // Update backend
    fetch(`http://localhost:8000/api/cwd?path=${encodeURIComponent(newDir)}`, {
      method: 'POST',
    })
      .then(res => res.json())
      .then(data => {
        if (data.cwd) {
          setWorkingDir(data.cwd)
          // Reconnect WebSocket with new working directory
          disconnect()
          setTimeout(() => connect(), 100)
        }
      })
      .catch(console.error)
  }, [disconnect, connect])

  const handleHistoryNavigate = useCallback((direction) => {
    setInputValue((current) => {
      const historicalValue = navigateHistory(direction, current)
      return historicalValue !== null ? historicalValue : current
    })
  }, [navigateHistory])

  const handleRegenerate = () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage && status === 'connected') {
      setMessages((prev) => {
        const lastAssistantIdx = prev.map(m => m.role).lastIndexOf('assistant')
        if (lastAssistantIdx >= 0) {
          return prev.slice(0, lastAssistantIdx)
        }
        return prev
      })
      sendMessage(lastUserMessage.content)
    }
  }

  const handleEditMessage = (index, newContent) => {
    setMessages((prev) => {
      const updated = prev.slice(0, index + 1)
      updated[index] = { ...updated[index], content: newContent, timestamp: new Date() }
      return updated
    })

    if (status === 'connected') {
      addToHistory(newContent)
      sendMessage(newContent)
    }
  }

  const handleSelectConversation = async (id) => {
    const loaded = await loadConversation(id)
    if (loaded) {
      setMessages(loaded.map(m => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
      })))
    }
  }

  const handleNewConversation = () => {
    // Save current if has messages
    if (messages.length > 0) {
      saveConversation(messages)
    }
    setMessages([])
    newConversation()
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={deleteConversation}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <header className="flex-shrink-0 h-14 px-4 border-b border-border bg-background flex items-center justify-between">
          <div className="flex-1 flex justify-center">
            <div className="max-w-3xl w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Pretty Code" className="w-8 h-8 rounded-lg" />
              <h1 className="text-[18px] font-medium text-text">pretty-code</h1>
            </div>

            <div className="flex items-center gap-4">
              <ExportMenu messages={messages} />

              {messages.length > 0 && !isStreaming && (
                <button
                  onClick={handleClear}
                  className="btn-icon"
                  title="Clear conversation"
                >
                  <Trash2 size={18} />
                </button>
              )}

              <button
                onClick={() => setFileBrowserOpen(true)}
                className="btn-icon"
                title="Browse files"
              >
                <FolderOpen size={18} />
              </button>

              <button
                onClick={toggleGlobalMode}
                className="btn-icon"
                title={globalMode === 'pretty' ? 'Switch to monospace code' : 'Switch to pretty code'}
              >
                {globalMode === 'pretty' ? <Code size={18} /> : <Type size={18} />}
              </button>

              <button
                onClick={toggleDarkMode}
                className="btn-icon"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <div className="flex items-center gap-2 text-[13px]">
                {status === 'connected' ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <span className="w-2 h-2 rounded-full bg-success"></span>
                    Connected
                  </span>
                ) : status === 'connecting' ? (
                  <span className="flex items-center gap-1.5 text-warning">
                    <Loader2 size={14} className="animate-spin" />
                    Connecting
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <span className="w-2 h-2 rounded-full bg-text-muted"></span>
                    Offline
                  </span>
                )}
              </div>
            </div>
            </div>
          </div>

          {/* Pinned Settings Gear */}
          <button
            onClick={() => setSettingsPanelOpen(true)}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-text/5 text-text-muted hover:text-text transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </header>

        {/* Plan Mode Bar - show when plan is ready for approval */}
        <PlanModeBar
          planFile={planFile}
          planReady={planReady}
          permissionMode={permissionMode}
          onApprovePlan={handleApprovePlan}
        />

        {/* Chat area */}
        <Chat
          messages={messages}
          isStreaming={isStreaming}
          onQuickAction={handleQuickAction}
          onRegenerate={handleRegenerate}
          onEditMessage={handleEditMessage}
          permissionMode={permissionMode}
        />

        {/* Permission Prompts */}
        {pendingPermissions.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-background/95 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto space-y-2">
              {pendingPermissions.map((perm) => (
                <PermissionPrompt
                  key={perm.id}
                  toolName={perm.name}
                  toolInput={perm.input}
                  toolUseId={perm.id}
                  onApprove={handlePermissionApprove}
                  onReject={handlePermissionReject}
                  onAlwaysAllow={handleAlwaysAllow}
                />
              ))}
            </div>
          </div>
        )}

        {/* Question Prompt */}
        {pendingQuestion && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-background/95 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto">
              <QuestionPrompt
                questions={pendingQuestion.questions}
                onSubmit={handleQuestionSubmit}
                onCancel={handleQuestionCancel}
              />
            </div>
          </div>
        )}

        {/* Sub-agent Questions */}
        {subAgentQuestions.filter(q => !q.answered).length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-warning/5 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto space-y-3">
              {subAgentQuestions.filter(q => !q.answered).map(sq => (
                <div key={sq.id}>
                  <div className="text-xs text-warning mb-2 flex items-center gap-1">
                    <span>💭</span>
                    <span>A sub-agent has a question for you:</span>
                  </div>
                  <QuestionPrompt
                    questions={sq.questions}
                    onSubmit={(answers) => handleSubAgentAnswer(sq.id, answers)}
                    onCancel={() => handleSubAgentQuestionDismiss(sq.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <InputBox
          onSend={handleSend}
          onStop={handleStop}
          disabled={isStreaming}
          value={inputValue}
          onChange={setInputValue}
          onHistoryNavigate={handleHistoryNavigate}
          permissionMode={permissionMode}
          isStreaming={isStreaming}
          onChangePermissionMode={setPermissionMode}
          workingDir={workingDir}
          onChangeWorkingDir={() => setFileBrowserOpen(true)}
        />
      </div>

      {/* File Browser Modal */}
      <FileBrowser
        isOpen={fileBrowserOpen}
        onClose={() => setFileBrowserOpen(false)}
        onFileSelect={(path) => {
          // Insert file path into input
          setInputValue((prev) => prev + (prev ? ' ' : '') + path)
        }}
        workingDir={workingDir}
        onSetWorkingDir={handleChangeWorkingDir}
      />

      {/* Floating Todo List */}
      {todoListVisible && (
        <TodoList
          todos={todos}
          isCollapsed={todoListCollapsed}
          onToggle={() => setTodoListCollapsed(!todoListCollapsed)}
          onClose={() => setTodoListVisible(false)}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        workingDir={workingDir}
        onChangeWorkingDir={handleChangeWorkingDir}
      />
    </div>
  )
}

export default App
