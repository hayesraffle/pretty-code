import { useState, createContext, useMemo } from 'react'
import { Copy, Check, RefreshCw, Pencil, ChevronRight, ChevronDown } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import ToolCallView from './ToolCallView'
import TypingIndicator from './TypingIndicator'
import QuestionPrompt from './QuestionPrompt'

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

// Grouped tool calls (collapsed by default)
function ToolCallsGroup({ tools, explorationContent }) {
  const [isExpanded, setIsExpanded] = useState(false)

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
    <div className="text-xs text-text-muted">
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
              toolUse={{ name: tool.name, input: tool.input }}
              toolResult={tool.result}
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
          rawBlocks.push({ type: 'text', content: item.text })
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

function formatTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Helper to classify text as exploration vs summary in plan mode
function classifyPlanText(text) {
  if (!text) return { type: 'exploration', content: text }

  // Summary indicators - markdown headings or certain phrases
  const summaryPatterns = [
    /^#+\s+/m,                          // Markdown headings
    /^##\s+/m,
    /Here's the summary/i,
    /Here is the summary/i,
    /\*\*Bug Found\*\*/,
    /\*\*Fix\*\*/,
    /\*\*Plan\*\*/,
    /\*\*Solution\*\*/,
    /\*\*Implementation\*\*/,
  ]

  // Exploration indicators
  const explorationPatterns = [
    /^I'll /,
    /^Let me /,
    /^I've found/,
    /^I've identified/,
    /^I've written/,
    /^I see that/,
    /^I have a/,
    /^I can see/,
    /^The agent found/,
    /^The bug is now/,
    /^Now I'll /,
    /^Now let me/,
    /^First, /,
    /^Excellent!/,
    /^Great!/,
    /^Perfect!/,
    /explore the codebase/i,
    /investigate/i,
    /clarifying questions/i,
    /comprehensive plan/i,
    /validate the approach/i,
  ]

  // Check if text contains summary content
  const hasSummary = summaryPatterns.some(p => p.test(text))
  const isExploration = explorationPatterns.some(p => p.test(text)) && !hasSummary

  if (hasSummary) {
    // Extract just the summary part (from first heading onwards)
    const headingMatch = text.match(/^(#+\s+.+)/m)
    if (headingMatch) {
      const headingIndex = text.indexOf(headingMatch[0])
      const exploration = text.slice(0, headingIndex).trim()
      const summary = text.slice(headingIndex).trim()
      return { type: 'mixed', exploration, summary }
    }
    return { type: 'summary', content: text }
  }

  if (isExploration) {
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
  onQuestionSubmit,
  onRegenerate,
  onEdit,
}) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(content)
  const [allCollapsed, setAllCollapsed] = useState(false)
  const isPlanMode = permissionMode === 'plan'

  // Parse events into ordered blocks (text, thinking, tools)
  const blocks = useMemo(() => parseMessageBlocks(events), [events])

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
                  <p className="whitespace-pre-wrap text-[15px] leading-[22px]">{content}</p>
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

              {/* Timestamp */}
              {timestamp && (
                <div className="mt-1 text-xs text-text-muted text-right">
                  {formatTime(timestamp)}
                </div>
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

        if (classified.type === 'mixed' && nextBlock?.type === 'tools') {
          // Add summary text first
          if (classified.summary) {
            result.push({ type: 'text', content: classified.summary })
          }
          // Combine exploration with tools
          result.push({
            type: 'tools-with-exploration',
            tools: nextBlock.tools,
            exploration: classified.exploration
          })
          i++ // Skip the tools block
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
            if (isPlanMode && block.classified) {
              const classified = block.classified
              if (classified.type === 'exploration') {
                return <ExplorationBlock key={i} content={classified.content} />
              } else if (classified.type === 'mixed') {
                return (
                  <div key={i}>
                    {classified.exploration && (
                      <ExplorationBlock content={classified.exploration} />
                    )}
                    <div className="prose max-w-none">
                      <MarkdownRenderer content={classified.summary} />
                    </div>
                  </div>
                )
              }
            }
            return (
              <div key={i} className="prose max-w-none">
                <MarkdownRenderer content={block.content} />
              </div>
            )
          } else if (block.type === 'thinking') {
            return <ThinkingBlock key={i} content={block.content} />
          } else if (block.type === 'tools') {
            return <ToolCallsGroup key={i} tools={block.tools} />
          } else if (block.type === 'tools-with-exploration') {
            return <ToolCallsGroup key={i} tools={block.tools} explorationContent={block.exploration} />
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

      {/* Answered indicator */}
      {parsedQuestions && questionsAnswered && (
        <div className="mt-3 text-xs text-text-muted flex items-center gap-1.5">
          <Check size={14} className="text-success" />
          <span>Questions answered</span>
        </div>
      )}

      {/* Action buttons - shown on hover */}
      {blocks.length > 0 && !isStreaming && (
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

      {/* Streaming indicator at bottom */}
      {isStreaming && <TypingIndicator />}
    </div>
  )
}
