import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, Trash2, Sun, Moon, FolderOpen, Code, Type, Settings } from 'lucide-react'
import confetti from 'canvas-confetti'
import Chat from './components/Chat'
import InputBox from './components/InputBox'
import ExportMenu from './components/ExportMenu'
import Sidebar from './components/Sidebar'
import FileBrowser from './components/FileBrowser'
import PermissionPrompt from './components/PermissionPrompt'
import TodoList from './components/TodoList'
import QuestionPrompt from './components/QuestionPrompt'
// PlanModeBar removed - plan approval is now inline in ToolCallView
import SettingsPanel from './components/SettingsPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useDarkMode } from './hooks/useDarkMode'
import { useCommandHistory } from './hooks/useCommandHistory'
import { useConversationStorage } from './hooks/useConversationStorage'
import { useCodeDisplayMode } from './contexts/CodeDisplayContext'
import { useSettings } from './contexts/SettingsContext'
import { parseUIActions } from './utils/uiActions'

// Shows time since last WebSocket event - helps debug hangs
function LastEventIndicator({ lastEventTime }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastEventTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [lastEventTime])

  // Only show if no event in last 5 seconds
  if (elapsed < 5) return null

  const isStale = elapsed >= 30
  return (
    <span className={`text-xs ${isStale ? 'text-warning' : 'text-text-muted'}`} title="Time since last WebSocket event">
      {isStale ? '⚠️ ' : ''}last event {elapsed}s ago
    </span>
  )
}

// Subtle celebration animation on task completion
function celebrate() {
  try {
    // Fire a small burst of confetti from the bottom center
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.9 },
      colors: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef'], // Purple/indigo tones
      disableForReducedMotion: true,
    })
  } catch (e) {
    // Ignore DOM errors from canvas-confetti cleanup
    console.debug('Confetti animation error (safe to ignore):', e.message)
  }
}

function App() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false)
  const [pendingPermissions, setPendingPermissions] = useState([]) // Track tool uses needing permission
  const [todos, setTodos] = useState([]) // Track TodoWrite tasks
  const [todoListCollapsed, setTodoListCollapsed] = useState(false)
  const [todoListVisible, setTodoListVisible] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState(null) // AskUserQuestion
  const [subAgentQuestions, setSubAgentQuestions] = useState([]) // Failed sub-agent AskUserQuestion
  const [planFile, setPlanFile] = useState(null) // Plan mode file path
  const [planReady, setPlanReady] = useState(false) // Plan is ready for approval
  const [prePlanPermissionMode, setPrePlanPermissionMode] = useState(null) // Mode before entering plan mode
  const [planContent, setPlanContent] = useState(null) // Plan markdown content from ExitPlanMode
  const [planToolUseId, setPlanToolUseId] = useState(null) // ExitPlanMode tool_use_id for permission response
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [showCodePreview, setShowCodePreview] = useState(false)
  const [workingDir, setWorkingDir] = useState('')
  const [pendingDirChange, setPendingDirChange] = useState(null) // Directory to change to (shows confirmation)
  const [pendingDeleteId, setPendingDeleteId] = useState(null) // Conversation ID to delete (shows confirmation)
  const [textQuestionAnswers, setTextQuestionAnswers] = useState(null)
  const [showCommitPrompt, setShowCommitPrompt] = useState(false)
  const [pendingApprovalMessage, setPendingApprovalMessage] = useState(null) // Queue message for after reconnect
  const [initialGitState, setInitialGitState] = useState('ready') // ready, committed (for restoring state on refresh)
  const { permissionMode, setPermissionMode: setPermissionModeSettings } = useSettings()
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
  const {
    status,
    isStreaming,
    lastEventTime,
    sendMessage,
    stopGeneration,
    sendPermissionResponse,
    sendQuestionResponse,
    onEvent,
    disconnect,
    connect,
    setPermissionMode: setPermissionModeWs,
  } = useWebSocket(permissionMode, workingDir, currentId)

  // Combined handler that updates both settings and notifies backend
  const setPermissionMode = useCallback((mode) => {
    // Save current mode before switching to plan mode (so we can restore it later)
    if (mode === 'plan' && permissionMode !== 'plan') {
      setPrePlanPermissionMode(permissionMode)
    }
    setPermissionModeSettings(mode)
    setPermissionModeWs(mode)
  }, [setPermissionModeSettings, setPermissionModeWs, permissionMode])

  // Fetch initial working directory from backend
  useEffect(() => {
    fetch('http://localhost:8000/api/cwd')
      .then(res => res.json())
      .then(data => {
        if (data.cwd) setWorkingDir(data.cwd)
      })
      .catch(() => {})
  }, [])

  // Check git status on mount to restore commit prompt if there are uncommitted changes
  useEffect(() => {
    fetch('http://localhost:8000/api/git/status')
      .then(res => res.json())
      .then(data => {
        if (data.is_repo) {
          if (data.has_changes) {
            // Has uncommitted changes - show Commit button
            setShowCommitPrompt(true)
            setInitialGitState('ready')
          } else if (data.has_unpushed) {
            // Already committed but not pushed - show Push button
            setShowCommitPrompt(true)
            setInitialGitState('committed')
          }
        }
      })
      .catch(() => {})
  }, [])
  const streamingMessageRef = useRef('')
  const autoSaveRef = useRef(null)
  const pendingAskUserQuestionsRef = useRef(new Map()) // Track AskUserQuestion tool_uses by id
  const autoApprovedPermissionsRef = useRef(new Set()) // Track auto-approved permissions to prevent duplicates
  const hasSubAgentQuestionsRef = useRef(false) // Track if we just added sub-agent questions (for sync check)

  // Send pending approval message once WebSocket reconnects
  useEffect(() => {
    if (status === 'connected' && pendingApprovalMessage) {
      console.log('%c[Plan]', 'color: #22c55e; font-weight: bold', 'Sending queued approval message')
      // Add a small delay to ensure connection is fully established
      const timer = setTimeout(() => {
        sendMessage(pendingApprovalMessage)
        // Add user message to UI
        setMessages(prev => [...prev, {
          role: 'user',
          content: pendingApprovalMessage,
          timestamp: new Date()
        }])
        setPendingApprovalMessage(null)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [status, pendingApprovalMessage, sendMessage])

  // Check if any tools are still loading (no result yet)
  // This is used to show stop button and typing indicator even when events stop flowing
  const hasLoadingTools = useMemo(() => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.events) {
      return false
    }
    // Build tool results map
    const toolResults = new Map()
    for (const event of lastMessage.events) {
      if (event.type === 'user') {
        const content = event.message?.content || []
        for (const item of content) {
          if (item.type === 'tool_result') {
            toolResults.set(item.tool_use_id, true)
          }
        }
      }
    }
    // Check if any tool_use doesn't have a result
    for (const event of lastMessage.events) {
      if (event.type === 'assistant') {
        const content = event.message?.content || []
        for (const item of content) {
          if (item.type === 'tool_use' && !toolResults.has(item.id)) {
            return true // Found a tool without result
          }
        }
      }
    }
    return false
  }, [messages])

  // Combined "is working" state for UI elements like stop button
  const isWorking = isStreaming || hasLoadingTools

  // Save conversation before page unload
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messagesRef.current.length > 0) {
        // Use sendBeacon for reliable save on unload
        const id = currentIdRef.current || Date.now().toString()
        const conversation = {
          id,
          title: messagesRef.current.find(m => m.role === 'user')?.content?.slice(0, 50) || 'New conversation',
          messages: messagesRef.current,
          updatedAt: new Date().toISOString(),
        }
        const blob = new Blob([JSON.stringify(conversation)], { type: 'application/json' })
        navigator.sendBeacon('http://localhost:8000/api/conversations', blob)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, []) // Using refs instead of direct state to avoid stale closure issues

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
            header: q.header || 'Question',
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
  }, [])

  // Helper to extract the last TodoWrite todos from loaded messages
  const extractTodosFromMessages = useCallback((loadedMessages) => {
    let lastTodos = null
    for (const msg of loadedMessages) {
      if (msg.events) {
        for (const event of msg.events) {
          if (event.type === 'assistant' && event.message?.content) {
            for (const item of event.message.content) {
              if (item.type === 'tool_use' && item.name === 'TodoWrite' && item.input?.todos) {
                lastTodos = item.input.todos
              }
            }
          }
        }
      }
    }
    return lastTodos
  }, [])

  // Helper to check if there's a pending ExitPlanMode in loaded messages
  const checkPendingPlanApproval = useCallback((loadedMessages) => {
    const exitPlanModeIds = new Set()
    const resultIds = new Set()

    for (const msg of loadedMessages) {
      if (msg.events) {
        for (const event of msg.events) {
          if (event.type === 'assistant' && event.message?.content) {
            for (const item of event.message.content) {
              if (item.type === 'tool_use' && item.name === 'ExitPlanMode') {
                exitPlanModeIds.add(item.id)
              }
            }
          }
          if (event.type === 'user' && event.message?.content) {
            for (const item of event.message.content) {
              if (item.type === 'tool_result') {
                resultIds.add(item.tool_use_id)
              }
            }
          }
        }
      }
    }

    // Check if any ExitPlanMode doesn't have a result
    for (const id of exitPlanModeIds) {
      if (!resultIds.has(id)) {
        return true // There's a pending plan approval
      }
    }
    return false
  }, [])

  // Helper to process loaded messages and re-parse questions from text
  const processLoadedMessages = useCallback((loadedMessages) => {
    return loadedMessages.map(m => {
      const processed = {
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
      }
      // Re-parse questions from assistant messages if not already parsed
      if (m.role === 'assistant' && m.content && !m.parsedQuestions) {
        const parsedQuestions = parseQuestionsFromText(m.content)
        if (parsedQuestions) {
          processed.parsedQuestions = parsedQuestions
          processed.questionId = 'text-question-' + Date.now()
          processed.questionsAnswered = m.questionsAnswered || false
        }
      }
      return processed
    })
  }, [parseQuestionsFromText])

  // Load conversation from URL on mount
  // The conversation ID is the Claude session ID, so loading sets up --resume automatically
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (currentId && !initialLoadRef.current && messages.length === 0) {
      initialLoadRef.current = true
      loadConversation(currentId).then(loaded => {
        if (loaded?.messages) {
          setMessages(processLoadedMessages(loaded.messages))
          const todos = extractTodosFromMessages(loaded.messages)
          if (todos) setTodos(todos)
          if (checkPendingPlanApproval(loaded.messages)) {
            setPlanReady(true)
          }
        }
      })
    }
  }, [currentId, messages.length, loadConversation, processLoadedMessages, extractTodosFromMessages, checkPendingPlanApproval])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/c\/([^/]+)/)
      const urlId = match ? match[1] : null
      if (urlId && urlId !== currentId) {
        loadConversation(urlId).then(loaded => {
          if (loaded?.messages) {
            setMessages(processLoadedMessages(loaded.messages))
            const todos = extractTodosFromMessages(loaded.messages)
            if (todos) setTodos(todos)
            if (checkPendingPlanApproval(loaded.messages)) {
              setPlanReady(true)
            }
          }
        })
      } else if (!urlId) {
        setMessages([])
        setTodos([])
        newConversation()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentId, loadConversation, newConversation, processLoadedMessages, extractTodosFromMessages, checkPendingPlanApproval])

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

            // Handle ExitPlanMode - extract plan content and wait for approval
            if (item.name === 'ExitPlanMode') {
              // Get plan content from tool input (may be in 'plan' field or as summary)
              const content = item.input?.plan || (item.input?.launchSwarm ? 'Plan ready for execution with swarm' : null)
              setPlanContent(content)
              setPlanToolUseId(item.id) // Store for permission response
              setPlanReady(true)
              setPlanFile(null)
            }

            // Note: Permission prompts are handled via 'permission_request' events from CLI,
            // not by checking tool_use here. The CLI knows when it needs permission.
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

            // Note: Plan ready state is now detected via ExitPlanMode tool call,
            // not via text pattern matching (which was fragile)

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

        // Parse UI actions from message content (only show commit if Claude explicitly requests)
        setMessages((current) => {
          const lastMsg = current[current.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg?.events) {
            // Extract all text content from events
            let fullText = ''
            for (const evt of lastMsg.events) {
              if (evt.type === 'assistant') {
                const content = evt.message?.content || []
                for (const item of content) {
                  if (item.type === 'text') {
                    fullText += item.text + '\n'
                  }
                }
              }
            }
            // Parse UI actions
            const { actions } = parseUIActions(fullText)
            // Handle show_commit action (only if not in plan mode)
            if (!planReady && actions.some(a => a.action === 'show_commit')) {
              setShowCommitPrompt(true)
            }
          }
          return current
        })

        // Auto-save using Claude's session_id as the conversation ID
        // This ensures URL and storage match the Claude CLI session
        const conversationId = event.session_id
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
        autoSaveRef.current = setTimeout(() => {
          setMessages((current) => {
            if (current.length > 0 && conversationId) {
              saveConversation(current, null, { explicitId: conversationId })
            }
            return current
          })
        }, 1000)
      } else if (event.type === 'system' && event.subtype === 'stopped') {
        // Mark any in-flight tool calls as cancelled
        setMessages((prev) => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg.events) {
            // Build set of tool_use IDs that have results
            const toolResults = new Set()
            for (const evt of lastMsg.events) {
              if (evt.type === 'user') {
                const content = evt.message?.content || []
                for (const item of content) {
                  if (item.type === 'tool_result') {
                    toolResults.add(item.tool_use_id)
                  }
                }
              }
            }
            // Find tool_uses without results and inject cancelled results
            const cancelledResults = []
            for (const evt of lastMsg.events) {
              if (evt.type === 'assistant') {
                const content = evt.message?.content || []
                for (const item of content) {
                  if (item.type === 'tool_use' && !toolResults.has(item.id)) {
                    cancelledResults.push({
                      type: 'user',
                      message: {
                        content: [{
                          type: 'tool_result',
                          tool_use_id: item.id,
                          content: '(cancelled)'
                        }]
                      }
                    })
                  }
                }
              }
            }
            if (cancelledResults.length > 0) {
              updated[updated.length - 1] = {
                ...lastMsg,
                events: [...lastMsg.events, ...cancelledResults]
              }
            }
          }
          return updated
        })
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
  }, [onEvent, saveConversation, sendPermissionResponse, pendingQuestion, subAgentQuestions, parseQuestionsFromText, planReady])

  const handleSend = useCallback(async (message, images = []) => {
    addToHistory(message)
    setShowCommitPrompt(false) // Hide commit prompt when sending a new message

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
    const newMessage = {
      role: 'user',
      content: message,
      images: images,
      timestamp: new Date()
    }
    setMessages((prev) => {
      const updated = [...prev, newMessage]
      // Save immediately after user submits
      // Use currentId if exists (continuing conversation), otherwise wait for Claude's session_id
      if (currentId) {
        saveConversation(updated, null, { explicitId: currentId, updateCurrentId: false })
      }
      return updated
    })

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
    setShowCommitPrompt(false)
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
    // Get the original questions for context (read from current state)
    const originalQuestions = messages[messageIndex]?.parsedQuestions

    // Mark the message's questions as answered (no need to store answers here)
    setMessages(prev => {
      const updated = [...prev]
      const msg = updated[messageIndex]
      if (msg) {
        updated[messageIndex] = {
          ...msg,
          questionsAnswered: true
        }
      }
      return updated
    })

    // Format answers for Claude's context (concise text version)
    let answerText = 'Questions answered:\n'
    if (originalQuestions && originalQuestions.length > 0) {
      originalQuestions.forEach(q => {
        const header = q.header || 'Question'
        const answer = answers[header] || 'No answer'
        answerText += `${header}: ${answer}\n`
      })
    } else {
      answerText += Object.entries(answers)
        .map(([question, answer]) => `${question}: ${answer}`)
        .join('\n')
    }
    answerText += '\nPlease continue with the task based on these answers.'

    if (status === 'connected') {
      // Add user message with answers (stored for styled display)
      const userMessage = {
        role: 'user',
        content: answerText,
        questionAnswers: answers,  // Store for styled rendering
        timestamp: new Date()
      }
      setMessages(prev => {
        const updated = [...prev, userMessage]
        if (currentId) {
          saveConversation(updated, null, { explicitId: currentId, updateCurrentId: false })
        }
        return updated
      })
      sendMessage(answerText)
    }
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

  const handleApprovePlan = (overrideId) => {
    const toolId = overrideId || planToolUseId

    if (status === 'connected' && toolId) {
      // Active session - send permission response
      sendPermissionResponse(toolId, true)
    } else if (status === 'connected') {
      // Connected but no toolId (loaded conversation with active connection)
      handleSend('Please proceed with executing the plan.')
    } else {
      // Loaded conversation, not connected - queue message and trigger reconnect
      // The pendingApprovalMessage effect will send it once connected
      console.log('%c[Plan]', 'color: #8b5cf6; font-weight: bold', 'Queuing approval message, triggering reconnect')
      setPendingApprovalMessage('Please proceed with executing the plan.')
      // Force reconnect - disconnect and connect will use the current sessionId
      disconnect()
      setTimeout(() => connect(), 100)
    }

    setPlanContent(null)
    setPlanToolUseId(null)
    setPlanFile(null)
    setPlanReady(false)
    // Restore the permission mode from before entering plan mode
    setPermissionMode(prePlanPermissionMode || 'acceptEdits')
    setPrePlanPermissionMode(null)
  }

  const handleRejectPlan = (overrideId) => {
    const toolId = overrideId || planToolUseId

    if (status === 'connected' && toolId) {
      // Active session - send permission response to reject
      sendPermissionResponse(toolId, false)
    } else if (status === 'connected') {
      // Connected but no toolId - send rejection message
      handleSend('I want to reject this plan. Please suggest a different approach.')
    } else {
      // Loaded conversation, not connected - queue message and trigger reconnect
      console.log('%c[Plan]', 'color: #8b5cf6; font-weight: bold', 'Queuing rejection message, triggering reconnect')
      setPendingApprovalMessage('I want to reject this plan. Please suggest a different approach.')
      disconnect()
      setTimeout(() => connect(), 100)
    }

    setPlanContent(null)
    setPlanToolUseId(null)
    setPlanFile(null)
    setPlanReady(false)
  }

  const handleChangeWorkingDir = useCallback((newDir) => {
    // If there's an active conversation, show confirmation first
    if (messages.length > 0) {
      setPendingDirChange(newDir)
      return
    }
    // No conversation, just change directory
    performDirChange(newDir)
  }, [messages.length])

  const performDirChange = useCallback((newDir) => {
    // Save current conversation before switching
    if (messages.length > 0 && currentId) {
      saveConversation(messages, null, { explicitId: currentId, updateCurrentId: false })
    }
    // Update backend
    fetch(`http://localhost:8000/api/cwd?path=${encodeURIComponent(newDir)}`, {
      method: 'POST',
    })
      .then(res => res.json())
      .then(data => {
        if (data.cwd) {
          setWorkingDir(data.cwd)
          // Clear UI and start fresh session
          newConversation()
          setMessages([])
          setTodos([])
          setSubAgentQuestions([])
          hasSubAgentQuestionsRef.current = false
        }
      })
      .catch(console.error)
    setPendingDirChange(null)
  }, [messages, currentId, saveConversation, newConversation])

  const cancelDirChange = useCallback(() => {
    setPendingDirChange(null)
  }, [])

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
    // The conversation ID is the Claude session ID, so selecting sets up --resume automatically
    const loaded = await loadConversation(id)
    if (loaded?.messages) {
      setMessages(processLoadedMessages(loaded.messages))
      const todos = extractTodosFromMessages(loaded.messages)
      setTodos(todos || [])
      if (checkPendingPlanApproval(loaded.messages)) {
        setPlanReady(true)
      }
    }
  }

  const handleNewConversation = () => {
    // Save current conversation before switching (don't update currentId since we're leaving)
    if (messages.length > 0 && currentId) {
      saveConversation(messages, null, { explicitId: currentId, updateCurrentId: false })
    }
    // Clear state and start fresh
    newConversation()
    setMessages([])
    setTodos([])
    setSubAgentQuestions([])
    hasSubAgentQuestionsRef.current = false
  }

  const handleDeleteConversation = useCallback((id) => {
    // If deleting current conversation, show confirmation
    if (id === currentId) {
      setPendingDeleteId(id)
      return
    }
    // Not current conversation, delete immediately
    deleteConversation(id)
  }, [currentId, deleteConversation])

  const confirmDelete = useCallback(() => {
    if (pendingDeleteId) {
      deleteConversation(pendingDeleteId)
      // Clear UI to zero state
      setMessages([])
      setTodos([])
      setSubAgentQuestions([])
      hasSubAgentQuestionsRef.current = false
      setPendingDeleteId(null)
    }
  }, [pendingDeleteId, deleteConversation])

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null)
  }, [])

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
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

              {messages.length > 0 && !isWorking && (
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
                    <span className={`w-2 h-2 rounded-full bg-success ${isWorking ? 'animate-pulse' : ''}`}></span>
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
                {/* Show time since last event when working - helps debug hangs */}
                {isWorking && lastEventTime && (
                  <LastEventIndicator lastEventTime={lastEventTime} />
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

        {/* Chat area */}
        <Chat
          messages={messages}
          isStreaming={isStreaming}
          onRegenerate={handleRegenerate}
          onEditMessage={handleEditMessage}
          onQuestionSubmit={handleInlineQuestionSubmit}
          showCodePreview={showCodePreview}
          workingDir={workingDir}
          onChangeWorkingDir={() => setFileBrowserOpen(true)}
          showCommitPrompt={showCommitPrompt}
          initialGitState={initialGitState}
          onCommitDismiss={() => setShowCommitPrompt(false)}
          onCelebrate={celebrate}
          onSendMessage={handleSend}
          onApprovePlan={handleApprovePlan}
          onRejectPlan={handleRejectPlan}
          planReady={planReady}
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
          disabled={isWorking}
          value={inputValue}
          onChange={setInputValue}
          onHistoryNavigate={handleHistoryNavigate}
          permissionMode={permissionMode}
          isStreaming={isWorking}
          onChangePermissionMode={setPermissionMode}
          workingDir={workingDir}
          onChangeWorkingDir={() => setFileBrowserOpen(true)}
          todos={todos}
          isBlocked={pendingPermissions.length > 0 || pendingQuestion !== null || planReady || subAgentQuestions.some(q => !q.answered)}
          onToggleTodoList={() => {
            setTodoListVisible(true)
            setTodoListCollapsed(false)
          }}
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
        showCodePreview={showCodePreview}
        onToggleCodePreview={() => setShowCodePreview(!showCodePreview)}
      />

      {/* Directory Change Confirmation Dialog */}
      {pendingDirChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl shadow-lg max-w-md w-full mx-4 p-6">
            <p className="text-sm text-text-muted mb-4">
              Changing directories will start a new session. Your current conversation will be saved.
            </p>
            <div className="text-xs text-text-muted bg-code-bg rounded-lg px-3 py-2 mb-4 font-mono truncate">
              {pendingDirChange}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelDirChange}
                className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => performDirChange(pendingDirChange)}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                Change Directory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Conversation Confirmation Dialog */}
      {pendingDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl shadow-lg max-w-md w-full mx-4 p-6">
            <p className="text-base text-text mb-4">
              This will permanently delete the current conversation. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-error text-white rounded-lg hover:bg-error/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
