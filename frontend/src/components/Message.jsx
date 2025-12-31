import { useState, useEffect, useRef, createContext, useMemo } from 'react'
import { Copy, Check, RefreshCw, Pencil, ChevronRight, ChevronDown, CheckCircle, X } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import ToolCallView from './ToolCallView'
import TypingIndicator from './TypingIndicator'
import QuestionPrompt from './QuestionPrompt'
import GitActionBar from './GitActionBar'
import ActionButtons from './ActionButtons'
import { stripUIActions, parseUIActions, extractButtons } from '../utils/uiActions'

// Context for controlling collapse state of nested blocks
export const CollapseContext = createContext({ allCollapsed: false })

// Collapsible thinking block (hidden by default)
function ThinkingBlock({ content }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="text-xs text-text-muted my-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 hover:text-text transition-colors py-0.5"
      >
        <span className="opacity-50">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="opacity-70 italic">Thinking...</span>
      </button>
      {isExpanded && (
        <div className="ml-4 mt-1 text-text-muted italic opacity-70 whitespace-pre-wrap text-[13px] leading-relaxed border-l-2 border-text-muted/20 pl-3">
          {content}
        </div>
      )}
    </div>
  )
}

// Fun active verbs for tool names
const TOOL_VERBS = {
  Read: 'Reading',
  Edit: 'Editing',
  Write: 'Writing',
  Bash: 'Running',
  Glob: 'Finding',
  Grep: 'Searching',
  WebFetch: 'Fetching',
  WebSearch: 'Searching',
  TodoWrite: 'Planning',
  Task: 'Tasking',
  AskUserQuestion: 'Asking',
}

// Grouped tool calls (collapsed by default, but single tools render directly)
function ToolCallsGroup({
  tools,
  explorationContent,
  pendingPermissions = [],
  onPermissionApprove,
  onPermissionReject,
  onPermissionAlwaysAllow,
}) {
  // Helper to find pending permission for a tool
  // Match by tool_use ID - backend now provides correct IDs
  const findPendingPermission = (tool) => {
    // If tool already has a result, it doesn't need permission anymore
    if (tool.result) return null
    return pendingPermissions.find((p) => p.id === tool.id)
  }

  // Check if any tool in this group has a pending permission
  const hasPendingPermission = tools.some((tool) => findPendingPermission(tool) !== null)

  const [isExpanded, setIsExpanded] = useState(false)
  const groupRef = useRef(null)

  // Auto-expand when a permission arrives, and scroll into view
  useEffect(() => {
    if (hasPendingPermission) {
      setIsExpanded(true)
      // Scroll to show the permission buttons at the bottom of the group
      // Use 'end' to ensure the buttons are visible above the input box
      setTimeout(() => {
        groupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 100)
    }
  }, [hasPendingPermission])

  // Single tool without exploration content → render directly without group wrapper
  if (tools.length === 1 && !explorationContent) {
    const tool = tools[0]
    return (
      <ToolCallView
        toolUse={{ id: tool.id, name: tool.name, input: tool.input }}
        toolResult={tool.result}
        pendingPermission={findPendingPermission(tool)}
        onPermissionApprove={onPermissionApprove}
        onPermissionReject={onPermissionReject}
        onPermissionAlwaysAllow={onPermissionAlwaysAllow}
      />
    )
  }

  // Count by type for summary
  const counts = {}
  tools.forEach(t => {
    const name = t.name || 'Unknown'
    counts[name] = (counts[name] || 0) + 1
  })

  const toolSummary = Object.entries(counts)
    .map(([name, count]) => {
      const verb = TOOL_VERBS[name] || name
      return count > 1 ? `${verb} (${count})` : verb
    })
    .join(', ')

  // Combine exploration prefix with tool summary
  const summary = explorationContent
    ? `Exploring... ${toolSummary}`
    : toolSummary + '...'

  return (
    <div ref={groupRef} className="text-xs text-text-muted">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 hover:text-text transition-colors py-1"
      >
        <span className="opacity-50">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="opacity-70">{summary}</span>
      </button>
      {isExpanded && (
        <div className="ml-3 mt-1 space-y-0.5">
          {explorationContent && (
            <div className="text-text-muted opacity-70 whitespace-pre-wrap text-[13px] leading-relaxed border-l-2 border-text-muted/20 pl-3 mb-2">
              <MarkdownRenderer content={explorationContent} />
            </div>
          )}
          {tools.map((tool) => (
            <ToolCallView
              key={tool.id}
              toolUse={{ id: tool.id, name: tool.name, input: tool.input }}
              toolResult={tool.result}
              pendingPermission={findPendingPermission(tool)}
              onPermissionApprove={onPermissionApprove}
              onPermissionReject={onPermissionReject}
              onPermissionAlwaysAllow={onPermissionAlwaysAllow}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Parse events into ordered blocks (text, thinking, grouped tool calls)
function parseMessageBlocks(events) {
  if (!events || events.length === 0) return []

  const rawBlocks = []
  const toolResults = new Map()

  // First pass: collect tool results
  for (const event of events) {
    if (event.type === 'user') {
      const content = event.message?.content || []
      for (const item of content) {
        if (item.type === 'tool_result') {
          toolResults.set(item.tool_use_id, item.content)
        }
      }
      // Also check tool_use_result
      if (event.tool_use_result) {
        const toolUseId = event.message?.content?.[0]?.tool_use_id
        if (toolUseId) {
          toolResults.set(toolUseId, event.tool_use_result)
        }
      }
    }
  }

  // Second pass: build ordered blocks
  for (const event of events) {
    if (event.type === 'assistant') {
      const content = event.message?.content || []
      for (const item of content) {
        if (item.type === 'text') {
          // Strip UI action blocks from displayed text
          const cleanText = stripUIActions(item.text)
          if (cleanText) {
            rawBlocks.push({ type: 'text', content: cleanText })
          }
        } else if (item.type === 'thinking') {
          rawBlocks.push({ type: 'thinking', content: item.thinking })
        } else if (item.type === 'tool_use') {
          rawBlocks.push({
            type: 'tool',
            id: item.id,
            name: item.name,
            input: item.input,
            result: toolResults.get(item.id),
          })
        }
      }
    }
  }

  // Third pass: group consecutive tool calls
  const blocks = []
  for (const block of rawBlocks) {
    if (block.type === 'tool') {
      const lastBlock = blocks[blocks.length - 1]
      if (lastBlock && lastBlock.type === 'tools') {
        // Add to existing tool group
        lastBlock.tools.push(block)
      } else {
        // Start new tool group
        blocks.push({ type: 'tools', tools: [block] })
      }
    } else {
      blocks.push(block)
    }
  }

  return blocks
}

// Helper to strip json:questions blocks from content
function stripQuestionsBlock(text) {
  if (!text) return text
  return text.replace(/```json:questions\s*\n[\s\S]*?\n```/g, '').trim()
}

// Helper to classify text as exploration vs summary in plan mode
// Only hides truly verbose exploration text, keeps useful context visible
function classifyPlanText(text) {
  if (!text) return { type: 'summary', content: text }

  // Short text is always shown (< 300 chars = ~2-3 sentences)
  if (text.length < 300) {
    return { type: 'summary', content: text }
  }

  // Text with markdown headings is always shown
  if (/^#+\s+/m.test(text)) {
    return { type: 'summary', content: text }
  }

  // User-directed language should be shown
  const userDirectedPatterns = [
    /\?/,                    // Questions
    /permission/i,           // Permission requests
    /could you/i,            // Requests
    /please/i,               // Polite requests
    /let me ask/i,           // About to ask questions
    /clarifying questions/i, // Questions
    /\*\*Questions/i,        // Question section
  ]
  if (userDirectedPatterns.some(p => p.test(text))) {
    return { type: 'summary', content: text }
  }

  // Only hide long, verbose exploration text (tool execution logs)
  const verboseExplorationPatterns = [
    /searching for/i,
    /found \d+ files/i,
    /reading file/i,
    /examining/i,
    /looking at/i,
    /checking/i,
  ]

  const isVerboseExploration = verboseExplorationPatterns.some(p => p.test(text))

  if (isVerboseExploration && text.length > 500) {
    return { type: 'exploration', content: text }
  }

  return { type: 'summary', content: text }
}

// Collapsible exploration text for plan mode
function ExplorationBlock({ content }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!content) return null

  return (
    <div className="text-xs text-text-muted">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 hover:text-text transition-colors py-0.5"
      >
        <span className="opacity-50">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="opacity-70 italic">Exploring codebase...</span>
      </button>
      {isExpanded && (
        <div className="ml-4 mt-1 text-text-muted opacity-70 whitespace-pre-wrap text-[13px] leading-relaxed border-l-2 border-text-muted/20 pl-3">
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  )
}

export default function Message({
  role,
  content,
  events,
  images,
  timestamp,
  isLast,
  isStreaming,
  permissionMode,
  parsedQuestions,
  questionsAnswered,
  questionAnswers,
  onQuestionSubmit,
  onRegenerate,
  onEdit,
  showGitActionBar,
  initialGitState,
  onCommitDismiss,
  onCelebrate,
  onAskClaude,
  onSendMessage,
  onApprovePlan,
  onRejectPlan,
  planReady,
  hasPendingPermissions = false,
  // Permission handling
  pendingPermissions = [],
  onPermissionApprove,
  onPermissionReject,
  onPermissionAlwaysAllow,
}) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)
  const [planDismissed, setPlanDismissed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(content)
  const [allCollapsed, setAllCollapsed] = useState(false)
  const isPlanMode = permissionMode === 'plan'

  // Parse events into ordered blocks (text, thinking, tools)
  const blocks = useMemo(() => parseMessageBlocks(events), [events])

  // Extract UI action buttons from message text
  const actionButtons = useMemo(() => {
    if (!events) return []
    let fullText = ''
    for (const evt of events) {
      if (evt.type === 'assistant') {
        const content = evt.message?.content || []
        for (const item of content) {
          if (item.type === 'text') {
            fullText += item.text + '\n'
          }
        }
      }
    }
    const { actions } = parseUIActions(fullText)
    return extractButtons(actions)
  }, [events])

  // Check if this message has an ExitPlanMode tool (regardless of result status)
  const hasExitPlanMode = useMemo(() => {
    if (!events) return false
    for (const event of events) {
      if (event.type === 'assistant') {
        const content = event.message?.content || []
        for (const item of content) {
          if (item.type === 'tool_use' && item.name === 'ExitPlanMode') {
            return true
          }
        }
      }
    }
    return false
  }, [events])

  // Check if any tools are still loading (no result yet)
  const hasLoadingTools = useMemo(() => {
    return blocks.some(block => block.type === 'tool' && !block.result)
  }, [blocks])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEdit = () => {
    setEditValue(content)
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== content) {
      onEdit?.(editValue.trim())
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValue(content)
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  // User message - light gray bubble, right aligned
  if (isUser) {
    // Special rendering for question answers - single card with dividers
    if (questionAnswers && Object.keys(questionAnswers).length > 0) {
      return (
        <div className="flex justify-end animate-slide-up">
          <div className="max-w-[85%]">
            <div className="rounded-lg bg-accent/15 text-accent overflow-hidden">
              {Object.entries(questionAnswers).map(([question, answer], i, arr) => (
                <div
                  key={question}
                  className={`px-3 py-2 grid grid-cols-[7rem_1fr] gap-x-3 items-baseline
                             ${i < arr.length - 1 ? 'border-b border-accent/10' : ''}`}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider opacity-70">
                    {question}
                  </span>
                  <span className="text-sm">{answer || 'No answer'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[85%]">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full min-w-[280px] p-3 rounded-[20px] bg-user-bubble text-user-text
                           resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                rows={Math.min(editValue.split('\n').length + 1, 5)}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="btn-secondary text-sm py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="btn-cta text-sm py-1.5 px-3"
                >
                  Save & Resend
                </button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              <div className="px-4 py-3 rounded-[20px] bg-user-bubble text-user-text">
                {/* Attached images */}
                {images && images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative">
                        <img
                          src={img.data}
                          alt={img.name}
                          className="max-h-48 max-w-full rounded-lg object-contain"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {content && (
                  <div className="text-[15px] leading-[22px] prose prose-sm max-w-none prose-p:my-0">
                    <MarkdownRenderer content={content} />
                  </div>
                )}
              </div>

              {/* Edit button */}
              {onEdit && (
                <button
                  onClick={handleEdit}
                  className="absolute -left-10 top-1/2 -translate-y-1/2 btn-icon w-8 h-8
                             opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit message"
                >
                  <Pencil size={14} />
                </button>
              )}

            </div>
          )}
        </div>
      </div>
    )
  }

  // AI message - render blocks in chronological order
  // Pre-process blocks to combine exploration text with adjacent tools
  const processedBlocks = useMemo(() => {
    const result = []
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const nextBlock = blocks[i + 1]

      if (block.type === 'text' && isPlanMode) {
        const classified = classifyPlanText(block.content)

        // Check if exploration followed by tools - combine them
        if (classified.type === 'exploration' && nextBlock?.type === 'tools') {
          result.push({
            type: 'tools-with-exploration',
            tools: nextBlock.tools,
            exploration: classified.content
          })
          i++ // Skip the tools block since we combined it
          continue
        }

        result.push({ ...block, classified })
      } else {
        result.push(block)
      }
    }
    return result
  }, [blocks, isPlanMode])

  return (
    <div className="animate-slide-up space-y-2">
      <CollapseContext.Provider value={{ allCollapsed }}>
        {processedBlocks.map((block, i) => {
          if (block.type === 'text') {
            // In plan mode, use classified result if available
            if (isPlanMode && block.classified?.type === 'exploration') {
              return <ExplorationBlock key={i} content={block.classified.content} />
            }
            // Strip json:questions block if we have parsed questions
            const displayContent = parsedQuestions
              ? stripQuestionsBlock(block.content)
              : block.content
            if (!displayContent) return null
            return (
              <div key={i} className="prose max-w-none">
                <MarkdownRenderer content={displayContent} />
              </div>
            )
          } else if (block.type === 'thinking') {
            return <ThinkingBlock key={i} content={block.content} />
          } else if (block.type === 'tools') {
            return (
              <ToolCallsGroup
                key={i}
                tools={block.tools}
                pendingPermissions={pendingPermissions}
                onPermissionApprove={onPermissionApprove}
                onPermissionReject={onPermissionReject}
                onPermissionAlwaysAllow={onPermissionAlwaysAllow}
              />
            )
          } else if (block.type === 'tools-with-exploration') {
            return (
              <ToolCallsGroup
                key={i}
                tools={block.tools}
                explorationContent={block.exploration}
                pendingPermissions={pendingPermissions}
                onPermissionApprove={onPermissionApprove}
                onPermissionReject={onPermissionReject}
                onPermissionAlwaysAllow={onPermissionAlwaysAllow}
              />
            )
          }
          return null
        })}
      </CollapseContext.Provider>

      {/* Inline question prompt */}
      {parsedQuestions && !questionsAnswered && onQuestionSubmit && (
        <div className="mt-4">
          <QuestionPrompt
            questions={parsedQuestions}
            onSubmit={onQuestionSubmit}
          />
        </div>
      )}

      {/* Answered indicator - answers are now shown in user's message */}
      {parsedQuestions && questionsAnswered && (
        <div className="mt-3 text-xs text-text-muted flex items-center gap-1.5">
          <Check size={14} className="text-success" />
          <span>Questions answered</span>
        </div>
      )}

      {/* Plan approval buttons - shown when message has ExitPlanMode and is last message */}
      {isLast && hasExitPlanMode && !planDismissed && onApprovePlan && onRejectPlan && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => {
              onRejectPlan()
              setPlanDismissed(true)
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full
                       bg-background border border-border text-text-muted hover:text-text
                       hover:border-text/20 transition-colors"
          >
            <X size={16} />
            Reject
          </button>
          <button
            onClick={() => onApprovePlan()}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-full
                       bg-success/10 text-success hover:bg-success/15 transition-colors"
          >
            <CheckCircle size={16} />
            Approve & Execute
          </button>
        </div>
      )}

      {/* Action buttons from ui-action blocks - shown on last message only */}
      {isLast && actionButtons.length > 0 && (
        <ActionButtons
          buttons={actionButtons}
          onSend={onSendMessage}
          disabled={isStreaming || hasPendingPermissions}
        />
      )}

      {/* Git action bar - shown after task completion, but NOT during plan mode */}
      {showGitActionBar && !hasExitPlanMode && (
        <GitActionBar
          initialState={initialGitState}
          onDismiss={onCommitDismiss}
          onCelebrate={onCelebrate}
          onAskClaude={onAskClaude}
        />
      )}

      {/* Action buttons - shown on hover when not loading */}
      {blocks.length > 0 && !isStreaming && !hasLoadingTools && (
        <div className="flex items-center gap-1 mt-3 opacity-0 hover:opacity-100
                        focus-within:opacity-100 transition-opacity">
          {isLast && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="btn-icon w-8 h-8"
              title="Regenerate response"
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="btn-icon w-8 h-8"
            title="Copy response"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      )}

      {/* Streaming indicator at bottom - show if streaming OR any tools still loading */}
      {(isStreaming || hasLoadingTools) && <TypingIndicator />}
    </div>
  )
}
