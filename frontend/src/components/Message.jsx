import { useState, createContext, useMemo } from 'react'
import { Copy, Check, RefreshCw, Pencil, ChevronRight, ChevronDown } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import ToolCallView from './ToolCallView'
import TypingIndicator from './TypingIndicator'

// Compact summary of tool calls
function ToolCallsSummary({ toolCalls }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!toolCalls || toolCalls.length === 0) return null

  // Count by type
  const counts = {}
  toolCalls.forEach(t => {
    const name = t.name || 'Unknown'
    counts[name] = (counts[name] || 0) + 1
  })

  const summary = Object.entries(counts)
    .map(([name, count]) => count > 1 ? `${count} ${name}` : name)
    .join(', ')

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
          {toolCalls.map((tool) => (
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

// Context for controlling collapse state of nested blocks
export const CollapseContext = createContext({ allCollapsed: false })

// Extract tool calls and their results from events
function extractToolCalls(events) {
  if (!events || events.length === 0) return []

  const toolCalls = []
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

  // Second pass: collect tool uses with their results
  for (const event of events) {
    if (event.type === 'assistant') {
      const content = event.message?.content || []
      for (const item of content) {
        if (item.type === 'tool_use') {
          toolCalls.push({
            id: item.id,
            name: item.name,
            input: item.input,
            result: toolResults.get(item.id),
          })
        }
      }
    }
  }

  return toolCalls
}

function formatTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Message({
  role,
  content,
  events,
  images,
  timestamp,
  isLast,
  isStreaming,
  onRegenerate,
  onEdit,
}) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(content)
  const [allCollapsed, setAllCollapsed] = useState(false)

  // Extract tool calls from events
  const toolCalls = useMemo(() => extractToolCalls(events), [events])

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

  // AI message - includes tool calls and text content
  return (
    <div className="animate-slide-up space-y-2">
      {/* Tool calls - compact summary */}
      {toolCalls.length > 0 && (
        <ToolCallsSummary toolCalls={toolCalls} />
      )}

      {/* Text content */}
      {content && (
        <CollapseContext.Provider value={{ allCollapsed }}>
          <div className="prose max-w-none">
            <MarkdownRenderer content={content} />
          </div>
        </CollapseContext.Provider>
      )}

      {/* Action buttons - shown on hover */}
      {content && !isStreaming && (
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
