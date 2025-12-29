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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
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
  const [textQuestionAnswers, setTextQuestionAnswers] = useState(null)
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
  const hasSubAgentQuestionsRef = useRef(false) // Track if we just added sub-agent questions (for sync check)

  // Helper to parse structured questions from JSON blocks in text
  // Looks for ```json:questions blocks that Claude outputs per our system prompt
  const parseQuestionsFromText = useCallback((text) => {
    if (!text) return null

    // Look for ```json:questions blocks
    const jsonQuestionsRegex = /```json:questions\s*\n([\s\S]*?)\n```/g
    const jsonMatch = jsonQuestionsRegex.exec(text)

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          // Validate each question has required fields
          const validQuestions = parsed.questions.filter(q =>
            q.question && q.options && Array.isArray(q.options) && q.options.length >= 2
          ).map(q => ({
            header: (q.header || 'Question').slice(0, 12),
            question: q.question,
            options: q.options.slice(0, 4).map(o => ({
              label: o.label || 'Option',
              description: o.description || ''
            })),
            multiSelect: q.multiSelect || false
          }))

          if (validQuestions.length > 0) {
            return validQuestions
          }
        }
      } catch (e) {
        console.warn('Failed to parse json:questions block:', e)
      }
    }

    return null

    // OLD CODE BELOW - disabled markdown parsing
    // Look for indicators that questions are being asked
    const questionIndicators = [
      /\*\*Questions?:?\*\*/i,
      /^Questions?:?\s*$/mi,
      /I have (?:a few |some )?questions?:?/i,
      /Let me ask (?:a few |some )?(?:clarifying )?questions?/i,
      /Before .+?, I have (?:a few |some )?questions?/i,
      /clarify (?:a few |some )?(?:things|points|questions)/i
    ]

    const hasQuestionIndicator = questionIndicators.some(regex => regex.test(text))
    if (!hasQuestionIndicator) return null

    const questions = []

    // Try format 1: Numbered questions with bold text - 1. **Question text?** or 1. **Header**: text
    const boldHeaderRegex = /^\d+\.\s+\*\*([^*]+)\*\*:?\s*(.+?)(?=^\d+\.\s+\*\*|$)/gms
    let match
    while ((match = boldHeaderRegex.exec(text)) !== null) {
      const boldPart = match[1].trim()
      const body = match[2].trim()

      // Parse options from bullet points like - **A)** description or - **Option A:** description
      const optionRegex = /[-•]\s+\*\*([^*]+)\*\*:?\)?\s*(.+)/g
      const options = []
      let optMatch
      while ((optMatch = optionRegex.exec(body)) !== null) {
        options.push({
          label: optMatch[1].trim().replace(/\)$/, ''),
          description: optMatch[2].trim()
        })
      }

      // Determine if the bold part is the question or a header
      const isQuestion = boldPart.includes('?')
      const questionText = isQuestion ? boldPart : (body.split(/\n\s*[-•]/)[0].trim() || boldPart)
      const header = isQuestion
        ? (boldPart.match(/^(\w+(?:'s)?(?:\s+\w+)?)/)?.[1] || 'Question')
        : boldPart

      questions.push({
        header: header.slice(0, 12),
        question: questionText,
        options: options.length >= 2 ? options.slice(0, 4) : [
          { label: 'Yes', description: '' },
          { label: 'No', description: '' }
        ],
        multiSelect: false
      })
    }

    // Try format 2: Numbered questions without bold - 1. Question text?
    if (questions.length === 0) {
      const numberedRegex = /^\d+\.\s+(.+?\?)/gm
      while ((match = numberedRegex.exec(text)) !== null) {
        const questionText = match[1].trim()
        // Extract a short header from the question
        const headerMatch = questionText.match(/^(\w+(?:\s+\w+)?)/)?.[1] || 'Question'
        questions.push({
          header: headerMatch.slice(0, 12),
          question: questionText,
          options: [
            { label: 'Yes', description: '' },
            { label: 'No', description: '' }
          ],
          multiSelect: false
        })
      }
    }

    // Try format 3: Bold section headers as questions - **About X:**
    if (questions.length === 0) {
      const sectionRegex = /\*\*(?:About\s+)?([^*:]+):?\*\*:?\s*([^*\n]+(?:\n(?!\*\*)[^\n]+)*)/g
      while ((match = sectionRegex.exec(text)) !== null) {
        const header = match[1].trim()
        const body = match[2].trim()
        // Only include if it looks like a question (has ? or asks something)
        if (body.includes('?') || /should|would|do you|which|what|how/i.test(body)) {
          questions.push({
            header: header.slice(0, 12),
            question: body.split('\n')[0].trim(),
            options: [
              { label: 'Yes', description: '' },
              { label: 'No', description: '' }
            ],
            multiSelect: false
          })
        }
      }
    }

    return questions.length > 0 ? questions : null
  }, [])

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
            // Questions can be in input.questions or input directly
            const questions = item.input?.questions || (Array.isArray(item.input) ? item.input : null)
            if (item.name === 'AskUserQuestion' && questions && questions.length > 0) {
              // Store in ref to detect failed sub-agent attempts later
              pendingAskUserQuestionsRef.current.set(item.id, questions)
              // Set as pending question for main agent (may get cleared if sub-agent fails)
              setPendingQuestion({
                id: item.id,
                questions: questions,
              })
            } else if (item.name === 'AskUserQuestion') {
              // Store even if questions are empty, so we can track sub-agent failures
              console.log('AskUserQuestion with input:', item.input)
              pendingAskUserQuestionsRef.current.set(item.id, [])
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

            const resultContent = typeof item.content === 'string' ? item.content : ''

            // Check if this is a failed AskUserQuestion from a sub-agent
            const isAskUserError = resultContent.includes('No such tool available: AskUserQuestion')
            if (isAskUserError && pendingAskUserQuestionsRef.current.has(item.tool_use_id)) {
              const questions = pendingAskUserQuestionsRef.current.get(item.tool_use_id)

              // Only create sub-agent prompt if we have actual questions
              // If empty, let the markdown parsing on 'result' event handle it
              if (questions && questions.length > 0) {
                setPendingQuestion(null)
                hasSubAgentQuestionsRef.current = true // Mark for sync check in result handler
                setSubAgentQuestions(prev => [...prev, {
                  id: item.tool_use_id,
                  questions,
                  answered: false,
                  answers: {}
                }])
              }

              pendingAskUserQuestionsRef.current.delete(item.tool_use_id)
            }

            // Check if this is a Task (sub-agent) result that contains questions
            // Parse the result content for questions and surface them
            if (resultContent && resultContent.length > 100) {
              const taskQuestions = parseQuestionsFromText(resultContent)
              if (taskQuestions && taskQuestions.length > 0) {
                console.log('Found questions in Task result:', taskQuestions)
                hasSubAgentQuestionsRef.current = true
                setSubAgentQuestions(prev => {
                  // Avoid duplicates by checking if we already have questions for this tool_use_id
                  if (prev.some(q => q.id === item.tool_use_id)) return prev
                  return [...prev, {
                    id: item.tool_use_id,
                    questions: taskQuestions,
                    answered: false,
                    answers: {}
                  }]
                })
              }
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
        // Session complete - check for questions in text if no pending question
        // Also skip if we have unanswered sub-agent questions (to prevent dual display)
        // Use both state and ref to catch sync timing issues
        const hasUnansweredSubAgentQuestions = subAgentQuestions.some(q => !q.answered) || hasSubAgentQuestionsRef.current
        if (!pendingQuestion && !hasUnansweredSubAgentQuestions) {
          setMessages((current) => {
            const lastMsg = current[current.length - 1]
            if (lastMsg?.role === 'assistant' && lastMsg?.content) {
              const parsedQuestions = parseQuestionsFromText(lastMsg.content)
              if (parsedQuestions) {
                // Store questions in the message itself for inline rendering and persistence
                const updated = [...current]
                updated[updated.length - 1] = {
                  ...lastMsg,
                  parsedQuestions,
                  questionId: 'text-question-' + Date.now(),
                  questionsAnswered: false
                }
                return updated
              }
            }
            return current
          })
        }

        // Auto-save
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
  }, [onEvent, saveConversation, sendPermissionResponse, pendingQuestion, subAgentQuestions, parseQuestionsFromText])

  const handleSend = useCallback(async (message, images = []) => {
    addToHistory(message)

    // Prepend context from answered questions
    let contextPrefix = ''

    // Include text-based question answers
    if (textQuestionAnswers) {
      const answerParts = Object.entries(textQuestionAnswers)
        .map(([question, answer]) => `Q: "${question}" A: "${answer}"`)
        .join('\n')
      contextPrefix += `My answers to your questions:\n${answerParts}\n\n`
      setTextQuestionAnswers(null)
    }

    // Include sub-agent question answers
    const answeredQuestions = subAgentQuestions.filter(q => q.answered)
    if (answeredQuestions.length > 0) {
      contextPrefix += answeredQuestions.map(q => {
        const answerParts = Object.entries(q.answers)
          .map(([question, answer]) => `Q: "${question}" A: "${answer}"`)
          .join('; ')
        return `[Answering sub-agent question: ${answerParts}]`
      }).join('\n') + '\n\n'
      // Clear answered questions
      setSubAgentQuestions(prev => prev.filter(q => !q.answered))
    }

    const fullMessage = contextPrefix + message

    // Add to UI with image data for display
    setMessages((prev) => [...prev, {
      role: 'user',
      content: message,
      images: images,
      timestamp: new Date()
    }])

    if (status === 'connected') {
      // Send images directly as base64 (not as file paths)
      sendMessage(fullMessage, images)
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
  }, [status, sendMessage, addToHistory, subAgentQuestions, textQuestionAnswers])

  const handleClear = () => {
    setMessages([])
    setPendingPermissions([])
    setSubAgentQuestions([])
    hasSubAgentQuestionsRef.current = false
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
    if (pendingQuestion?.fromText) {
      // For questions parsed from text, store answers to include in next message
      setTextQuestionAnswers(answers)
      setPendingQuestion(null)
    } else {
      // For real AskUserQuestion tool calls, send via WebSocket with tool_use_id
      sendQuestionResponse(pendingQuestion.id, answers)
      setPendingQuestion(null)
    }
  }

  // Handler for inline question prompts (questions stored in messages)
  const handleInlineQuestionSubmit = (messageIndex, answers) => {
    // Mark the message's questions as answered and store answers
    setMessages(prev => {
      const updated = [...prev]
      const msg = updated[messageIndex]
      if (msg) {
        updated[messageIndex] = {
          ...msg,
          questionsAnswered: true,
          questionAnswers: answers
        }
      }
      return updated
    })
    // Store answers to include in next user message
    setTextQuestionAnswers(answers)
  }

  const handleQuestionCancel = () => {
    if (pendingQuestion?.fromText) {
      // Just dismiss text-based questions
      setPendingQuestion(null)
    } else {
      // Send empty response to cancel real tool calls
      sendQuestionResponse(pendingQuestion.id, {})
      setPendingQuestion(null)
    }
  }

  const handleSubAgentAnswer = (questionId, answers) => {
    setSubAgentQuestions(prev => {
      const updated = prev.map(q =>
        q.id === questionId ? { ...q, answered: true, answers } : q
      )
      // Clear ref if no more unanswered questions
      if (!updated.some(q => !q.answered)) {
        hasSubAgentQuestionsRef.current = false
      }
      return updated
    })
  }

  const handleSubAgentQuestionDismiss = (questionId) => {
    setSubAgentQuestions(prev => {
      const updated = prev.filter(q => q.id !== questionId)
      // Clear ref if no more unanswered questions
      if (!updated.some(q => !q.answered)) {
        hasSubAgentQuestionsRef.current = false
      }
      return updated
    })
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
    setSubAgentQuestions([])
    hasSubAgentQuestionsRef.current = false
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
          onApprovePlan={handleApprovePlan}
        />

        {/* Chat area */}
        <Chat
          messages={messages}
          isStreaming={isStreaming}
          onQuickAction={handleQuickAction}
          onRegenerate={handleRegenerate}
          onEditMessage={handleEditMessage}
          onQuestionSubmit={handleInlineQuestionSubmit}
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

        {/* Question Prompt - only for real AskUserQuestion tool calls (not text-parsed) */}
        {pendingQuestion && !pendingQuestion.fromText && (
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
