import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { X, Send, MessageCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { getTokenClass } from '../utils/tokenTypography'

const API_BASE = 'http://localhost:8000'

// Tooltip component rendered via portal to avoid clipping
function Tooltip({ text, position, visible }) {
  if (!visible || !text) return null

  return createPortal(
    <div
      className="pretty-code-tooltip"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%) translateY(-100%)',
      }}
    >
      {text}
      <span className="pretty-code-tooltip-hint">Click for more</span>
    </div>,
    document.body
  )
}

// Tooltip explanations for different token types and common patterns
const TOKEN_TOOLTIPS = {
  // Keywords
  'function': 'Defines a reusable block of code',
  'const': 'Declares a constant variable',
  'let': 'Declares a block-scoped variable',
  'var': 'Declares a function-scoped variable',
  'return': 'Returns a value from the function',
  'if': 'Conditional: runs code if condition is true',
  'else': 'Runs if the previous condition was false',
  'for': 'Loop: repeats code multiple times',
  'while': 'Loop: repeats while condition is true',
  'class': 'Defines a class blueprint',
  'import': 'Imports code from another module',
  'export': 'Makes code available to other modules',
  'async': 'Marks function as asynchronous',
  'await': 'Waits for a promise to resolve',
  'try': 'Attempts to run code that might fail',
  'catch': 'Handles errors from try block',
  'throw': 'Raises an error',
  'new': 'Creates a new instance',
  'this': 'References the current object',
  'extends': 'Inherits from another class',
  'super': 'Calls parent class method',
  'static': 'Belongs to class, not instances',
  'typeof': 'Returns the type of a value',
  'switch': 'Multi-way branch statement',
  'case': 'A branch in switch statement',
  'default': 'Default branch in switch',
  'break': 'Exits loop or switch',
  'continue': 'Skips to next iteration',

  // Common functions
  'reduce': 'Combines array elements into single value',
  'map': 'Transforms each element in array',
  'filter': 'Keeps elements that pass a test',
  'forEach': 'Runs function on each element',
  'find': 'Finds first matching element',
  'some': 'Checks if any element passes test',
  'every': 'Checks if all elements pass test',
  'includes': 'Checks if array contains value',
  'push': 'Adds element to end of array',
  'pop': 'Removes last element from array',
  'slice': 'Extracts portion of array',
  'splice': 'Adds/removes elements from array',
  'concat': 'Joins arrays together',
  'join': 'Joins array elements into string',
  'split': 'Splits string into array',
  'toFixed': 'Formats number with decimal places',
  'toString': 'Converts to string',
  'parseInt': 'Parses string to integer',
  'parseFloat': 'Parses string to decimal',
  'console': 'Debugging output object',
  'log': 'Outputs to console',
  'JSON': 'JavaScript Object Notation utilities',
  'stringify': 'Converts to JSON string',
  'parse': 'Parses JSON string to object',
  'Math': 'Mathematical functions',
  'Date': 'Date and time utilities',
  'Promise': 'Represents async operation',
  'Array': 'Array constructor/utilities',
  'Object': 'Object utilities',
  'setTimeout': 'Delays execution',
  'setInterval': 'Repeats at interval',
  'fetch': 'Makes HTTP request',

  // Boolean values
  'true': 'Boolean true value',
  'false': 'Boolean false value',
  'null': 'Intentional absence of value',
  'undefined': 'Value not yet assigned',
}

// Get tooltip based on token type and content
function getTooltip(tokenTypes, content) {
  const trimmed = content.trim()

  // Skip whitespace and empty content
  if (!trimmed || /^\s*$/.test(trimmed)) {
    return null
  }

  // Check for exact match first
  if (TOKEN_TOOLTIPS[trimmed]) {
    return TOKEN_TOOLTIPS[trimmed]
  }

  if (tokenTypes.includes('function') || tokenTypes.includes('function-variable')) {
    return `Function: ${trimmed}()`
  }
  if (tokenTypes.includes('class-name') || tokenTypes.includes('maybe-class-name')) {
    return `Type/Class: ${trimmed}`
  }
  if (tokenTypes.includes('parameter')) {
    return `Parameter: ${trimmed}`
  }
  if (tokenTypes.includes('property')) {
    return `Property: .${trimmed}`
  }
  if (tokenTypes.includes('string')) {
    if (trimmed.length > 20) {
      return 'String: text data'
    }
    return `String: "${trimmed.replace(/['"]/g, '')}"`
  }
  if (tokenTypes.includes('number')) {
    return `Number: ${trimmed}`
  }
  if (tokenTypes.includes('comment')) {
    return 'Comment (documentation)'
  }
  if (tokenTypes.includes('boolean')) {
    return trimmed === 'true' ? 'Boolean: true (yes/on)' : 'Boolean: false (no/off)'
  }
  if (tokenTypes.includes('keyword')) {
    return `Keyword: ${trimmed}`
  }
  if (tokenTypes.includes('builtin')) {
    return `Built-in: ${trimmed}`
  }
  if (tokenTypes.includes('constant')) {
    return `Constant: ${trimmed}`
  }
  if (tokenTypes.includes('variable')) {
    return `Variable: ${trimmed}`
  }
  if (tokenTypes.includes('operator')) {
    const opTooltips = {
      '=': 'Assignment',
      '==': 'Loose equality',
      '===': 'Strict equality',
      '!=': 'Loose inequality',
      '!==': 'Strict inequality',
      '+': 'Addition',
      '-': 'Subtraction',
      '*': 'Multiplication',
      '/': 'Division',
      '%': 'Remainder',
      '&&': 'Logical AND',
      '||': 'Logical OR',
      '!': 'Logical NOT',
      '=>': 'Arrow function',
      '...': 'Spread/rest operator',
      '?.': 'Optional chaining',
      '??': 'Nullish coalescing',
      '<': 'Less than',
      '>': 'Greater than',
      '<=': 'Less than or equal',
      '>=': 'Greater than or equal',
      '++': 'Increment',
      '--': 'Decrement',
      '+=': 'Add and assign',
      '-=': 'Subtract and assign',
      '?': 'Ternary condition',
      ':': 'Ternary else / object key',
    }
    return opTooltips[trimmed] || `Operator: ${trimmed}`
  }
  if (tokenTypes.includes('punctuation')) {
    const punctTooltips = {
      '(': 'Open parenthesis',
      ')': 'Close parenthesis',
      '{': 'Open block',
      '}': 'Close block',
      '[': 'Open array/index',
      ']': 'Close array/index',
      ';': 'Statement end',
      ',': 'Separator',
      '.': 'Property access',
      ':': 'Key-value separator',
    }
    return punctTooltips[trimmed] || null
  }

  // For any other identified token type
  if (tokenTypes.length > 0 && !tokenTypes.includes('plain')) {
    return `${tokenTypes[0]}: ${trimmed}`
  }

  // Plain text / identifiers
  if (trimmed.length > 1 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return `Identifier: ${trimmed}`
  }

  return null
}

// Count leading spaces for indentation
function getIndentLevel(line) {
  const match = line.match(/^(\s*)/)
  return match ? Math.floor(match[1].length / 2) : 0
}

// Explanation Popover Component - Mini-chat with follow-ups
function ExplanationPopover({ token, position, onClose, code, language, cachedConversation, onCacheConversation, onAddBreadcrumb }) {
  // Conversation state: [{role: 'user'|'assistant', content: string}]
  const [conversation, setConversation] = useState(cachedConversation || [])
  const [followUps, setFollowUps] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentResponse, setCurrentResponse] = useState('')
  const popoverRef = useRef(null)
  const contentRef = useRef(null)
  const inputRef = useRef(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const abortControllerRef = useRef(null)

  // Handle dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y,
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      setDragOffset({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Scroll to bottom when conversation updates
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [conversation, currentResponse])

  // Fetch explanation function
  const fetchResponse = useCallback(async (conversationHistory = []) => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()

    setIsStreaming(true)
    setCurrentResponse('')
    setFollowUps([])
    let fullResponse = ''
    let buffer = ''

    try {
      const res = await fetch(`${API_BASE}/api/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.content,
          tokenType: token.types.join(', '),
          context: code,
          language: language,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : null,
          generateFollowUps: true,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!res.ok) throw new Error('Failed to get explanation')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.chunk) {
                fullResponse += data.chunk
                setCurrentResponse(fullResponse)
              } else if (data.followups) {
                setFollowUps(data.followups)
              } else if (data.done) {
                // Clean up FOLLOWUPS from the response text
                let cleanResponse = fullResponse
                if (cleanResponse.includes('FOLLOWUPS:')) {
                  cleanResponse = cleanResponse.split('FOLLOWUPS:')[0].trim()
                }
                // Add to conversation
                const newConversation = [...conversationHistory, { role: 'assistant', content: cleanResponse }]
                setConversation(newConversation)
                onCacheConversation?.(newConversation)
                setCurrentResponse('')
                setIsStreaming(false)
              } else if (data.error) {
                const fallback = generateLocalExplanation(token, code)
                const newConversation = [...conversationHistory, { role: 'assistant', content: fallback }]
                setConversation(newConversation)
                onCacheConversation?.(newConversation)
                setIsStreaming(false)
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      const fallback = generateLocalExplanation(token, code)
      const newConversation = [...conversationHistory, { role: 'assistant', content: fallback }]
      setConversation(newConversation)
      onCacheConversation?.(newConversation)
    } finally {
      setIsStreaming(false)
    }
  }, [token, code, language, onCacheConversation])

  // Initial fetch on mount (if no cached conversation)
  useEffect(() => {
    if (!cachedConversation || cachedConversation.length === 0) {
      // Set streaming state first, then fetch after a tick to ensure render
      setIsStreaming(true)
      const timeoutId = setTimeout(() => {
        fetchResponse([])
      }, 0)
      return () => {
        clearTimeout(timeoutId)
        abortControllerRef.current?.abort()
      }
    }
    return () => {
      abortControllerRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - only run on mount

  // Handle follow-up question click
  const handleFollowUp = useCallback((question) => {
    const newConversation = [...conversation, { role: 'user', content: question }]
    setConversation(newConversation)
    setFollowUps([])
    fetchResponse(newConversation)
  }, [conversation, fetchResponse])

  // Handle custom question submit
  const handleSubmit = useCallback((e) => {
    e?.preventDefault()
    if (!inputValue.trim() || isStreaming) return
    handleFollowUp(inputValue.trim())
    setInputValue('')
  }, [inputValue, isStreaming, handleFollowUp])

  // Handle close with breadcrumb
  const handleClose = useCallback(() => {
    if (conversation.length > 0) {
      onAddBreadcrumb?.({
        token,
        conversation,
        position,
      })
    }
    onClose()
  }, [conversation, token, position, onAddBreadcrumb, onClose])

  const baseLeft = Math.min(position.x, window.innerWidth - 340)
  const baseTop = Math.min(position.y + 10, window.innerHeight - 200)
  // Calculate max height to stay within viewport (with 16px margin)
  const maxHeight = Math.max(200, window.innerHeight - baseTop - dragOffset.y - 16)

  // Clean display text (remove FOLLOWUPS marker if present)
  const cleanText = (text) => {
    if (text.includes('FOLLOWUPS:')) {
      return text.split('FOLLOWUPS:')[0].trim()
    }
    return text
  }

  return (
    <div
      ref={popoverRef}
      className="fixed z-[10000] bg-background border border-border shadow-2xl
                 rounded-xl rounded-br-none
                 w-80 min-w-64 min-h-48 flex flex-col animate-fade-in
                 resize overflow-hidden"
      style={{
        left: baseLeft + dragOffset.x,
        top: baseTop + dragOffset.y,
        maxHeight: maxHeight,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header - draggable */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-border bg-surface shrink-0
                    rounded-t-xl ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm text-accent">{token.content.trim()}</code>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 bg-surface-hover rounded">
            {token.types[0]}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {/* Conversation content */}
      <div ref={contentRef} className="p-3 overflow-y-auto flex-1 min-h-0">
        <div className="space-y-3">
          {/* Render conversation history */}
          {conversation.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'pl-4' : ''}>
              {msg.role === 'user' ? (
                <div className="text-xs text-accent font-medium mb-1">{msg.content}</div>
              ) : (
                <div className="text-sm text-text explanation-content">
                  <ReactMarkdown>{cleanText(msg.content)}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}

          {/* Current streaming response */}
          {isStreaming && (
            <div className="text-sm text-text explanation-content">
              {currentResponse ? (
                <>
                  <ReactMarkdown>{cleanText(currentResponse)}</ReactMarkdown>
                  <span className="inline-block w-1.5 h-4 bg-accent animate-pulse align-middle ml-1" />
                </>
              ) : (
                <span className="text-text-muted">Thinking...</span>
              )}
            </div>
          )}

          {/* Follow-up suggestions */}
          {!isStreaming && followUps.length > 0 && (
            <div className="pt-2 border-t border-border/50 space-y-0.5">
              {followUps.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleFollowUp(q)}
                  className="block w-full text-left text-xs text-text-muted hover:text-text
                             italic py-0.5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input field - only show after response is generated */}
      {!isStreaming && conversation.length > 0 && (
        <form onSubmit={handleSubmit} className="p-2 border-t border-border shrink-0">
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask"
              className="flex-1 text-xs px-2 py-1.5 rounded bg-surface border-none
                         focus:outline-none text-text placeholder:text-text-muted"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="p-1.5 rounded-full bg-accent text-white hover:bg-accent/90
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={12} />
            </button>
          </div>
        </form>
      )}

      {/* Resize handle indicator */}
      <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-30 hover:opacity-60">
        <svg viewBox="0 0 12 12" className="w-full h-full text-text-muted">
          <path d="M10 2 L10 10 L2 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M6 6 L10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  )
}

// Generate local explanation fallback
function generateLocalExplanation(token, code) {
  const content = token.content.trim()
  const types = token.types

  if (types.includes('keyword')) {
    const keywordExplanations = {
      'function': `**function** declares a named function in JavaScript.

In this code, it defines a block of reusable logic that can be called with arguments and returns a value.

Functions are fundamental building blocks that help organize code into logical, reusable units.`,
      'const': `**const** declares a constant variable that cannot be reassigned.

Use const for values that shouldn't change after initialization. This makes your code more predictable and easier to understand.

Note: Objects and arrays declared with const can still have their contents modified.`,
      'return': `**return** exits the function and sends a value back to the caller.

Without a return statement, functions return undefined. The returned value can be stored in a variable or used directly.`,
      'if': `**if** executes code conditionally based on a boolean expression.

When the condition is true, the code block runs. Often paired with else for alternative logic.`,
    }
    return keywordExplanations[content] || `**${content}** is a JavaScript keyword that controls program flow or declares variables/functions.`
  }

  if (types.includes('function')) {
    return `**${content}()** is a function being called here.

Functions encapsulate reusable logic. This one is being invoked with arguments to perform a specific task.

Look at the function definition to understand what it does and what parameters it expects.`
  }

  if (types.includes('string')) {
    return `This is a **string literal** - a sequence of characters enclosed in quotes.

Strings are used for text data: labels, messages, identifiers, or any textual content.`
  }

  if (types.includes('number')) {
    return `**${content}** is a numeric literal.

Numbers in JavaScript can be integers or floating-point. They're used for calculations, counts, indices, and numeric data.`
  }

  if (types.includes('comment')) {
    return `This is a **comment** - text ignored by the JavaScript engine.

Comments document code, explain intent, or temporarily disable code. Good comments explain "why" not "what".`
  }

  if (types.includes('operator')) {
    return `**${content}** is an operator that performs an operation on values.

Operators combine, compare, or transform values. Understanding operator precedence helps read complex expressions.`
  }

  return `**${content}** is a ${types.join('/')} in this code.

It plays a role in the logic of this program. Hover over related tokens to understand how they work together.`
}

// Inline breadcrumb icons for a single line
function LineBreadcrumbs({ items, onSelect, onHover, onHoverEnd }) {
  if (items.length === 0) return null

  return (
    <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5
                     opacity-40 hover:opacity-100 transition-opacity">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => onSelect(item)}
          onMouseEnter={() => onHover(item)}
          onMouseLeave={onHoverEnd}
          className="p-0.5 rounded text-text-muted hover:text-accent hover:bg-accent/10
                     transition-colors"
          title={item.token.content.trim()}
        >
          <MessageCircle size={12} />
        </button>
      ))}
    </span>
  )
}

// Selection popup component (chat icon after text selection)
function SelectionPopup({ position, onExplain }) {
  // Show below if not enough space above (less than 40px from top)
  const showBelow = position.y < 40

  return createPortal(
    <button
      onClick={onExplain}
      className="selection-popup fixed z-[10001] p-2 rounded-full text-white shadow-lg
                 hover:opacity-90 transition-opacity animate-fade-in cursor-pointer"
      style={{
        left: position.x,
        top: showBelow ? position.y + 24 : position.y,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        backgroundColor: 'var(--color-pretty-selection-button)',
      }}
    >
      <MessageCircle size={16} />
    </button>,
    document.body
  )
}

export default function PrettyCodeBlock({ code, language = 'javascript', isCollapsed }) {
  const [selectedToken, setSelectedToken] = useState(null)
  const [selectedLineIndex, setSelectedLineIndex] = useState(null)
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 })
  const [hoveredTooltip, setHoveredTooltip] = useState({ text: null, position: { x: 0, y: 0 }, visible: false })
  const [breadcrumbs, setBreadcrumbs] = useState([]) // Per code block breadcrumbs with lineIndex
  const [hoveredBreadcrumb, setHoveredBreadcrumb] = useState(null) // For highlighting source token
  const [selection, setSelection] = useState(null) // {text, rect}
  const [isSelecting, setIsSelecting] = useState(false) // Track if user is dragging to select
  const conversationCacheRef = useRef(new Map()) // Cache conversations by token key
  const codeBlockRef = useRef(null)

  const lines = code.trim().split('\n')

  // Generate cache key for a token
  const getTokenCacheKey = (token) => `${token.content.trim()}:${token.types.join(',')}`

  const handleTokenMouseEnter = (e, tooltip) => {
    if (!tooltip) return
    const rect = e.target.getBoundingClientRect()
    setHoveredTooltip({
      text: tooltip,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top - 12,
      },
      visible: true,
    })
  }

  const handleTokenMouseLeave = () => {
    setHoveredTooltip(prev => ({ ...prev, visible: false }))
  }

  const handleTokenClick = (e, token, tokenTypes, lineIndex) => {
    e.stopPropagation()
    const rect = e.target.getBoundingClientRect()
    setPopoverPosition({
      x: rect.left,
      y: rect.bottom,
    })
    setSelectedToken({
      content: token,
      types: tokenTypes,
    })
    setSelectedLineIndex(lineIndex)
    setSelection(null) // Clear selection when opening token popover
  }

  const closePopover = () => {
    setSelectedToken(null)
  }

  // Handle adding breadcrumb when popover closes
  const handleAddBreadcrumb = useCallback((breadcrumb) => {
    // Skip breadcrumbs if we couldn't determine the line
    if (selectedLineIndex === null || selectedLineIndex === undefined) return

    setBreadcrumbs(prev => {
      // Avoid duplicates on same line with same content
      const exists = prev.some(b =>
        b.token.content === breadcrumb.token.content && b.lineIndex === selectedLineIndex
      )
      if (exists) return prev
      // Keep last 10
      return [...prev.slice(-9), { ...breadcrumb, lineIndex: selectedLineIndex }]
    })
  }, [selectedLineIndex])

  // Handle breadcrumb click - reopen popover
  const handleBreadcrumbSelect = useCallback((breadcrumb) => {
    setSelectedToken(breadcrumb.token)
    setSelectedLineIndex(breadcrumb.lineIndex)
    setPopoverPosition(breadcrumb.position)
  }, [])

  // Handle breadcrumb hover - highlight source token
  const handleBreadcrumbHover = useCallback((breadcrumb) => {
    setHoveredBreadcrumb(breadcrumb)
  }, [])

  const handleBreadcrumbHoverEnd = useCallback(() => {
    setHoveredBreadcrumb(null)
  }, [])

  // Get breadcrumbs for a specific line
  const getBreadcrumbsForLine = useCallback((lineIndex) => {
    return breadcrumbs.filter(b => b.lineIndex === lineIndex)
  }, [breadcrumbs])

  // Handle text selection
  const handleMouseDown = useCallback(() => {
    setIsSelecting(true)
  }, [])

  const handleMouseUp = useCallback((e) => {
    setIsSelecting(false)
    // Small delay to ensure selection is complete
    setTimeout(() => {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
        const text = sel.toString().trim()
        if (text.length > 0) { // No max limit
          const range = sel.getRangeAt(0)

          // Use getClientRects() to get individual line rects for accurate positioning
          // getBoundingClientRect() on multi-line selections returns full container width
          const rects = range.getClientRects()
          let posX, posY

          if (rects.length > 0) {
            // For single line: center on that rect
            // For multi-line: use the first rect (top of selection)
            const firstRect = rects[0]
            posX = firstRect.left + firstRect.width / 2
            posY = firstRect.top - 8
          } else {
            // Fallback to bounding rect
            const rect = range.getBoundingClientRect()
            posX = rect.left + rect.width / 2
            posY = rect.top - 8
          }

          // Try to find the line index from the selection's container
          let lineIndex = null
          const startContainer = range.startContainer
          const lineElement = startContainer.nodeType === Node.TEXT_NODE
            ? startContainer.parentElement?.closest('.pretty-code-line')
            : startContainer.closest?.('.pretty-code-line')
          if (lineElement && codeBlockRef.current) {
            const allLines = codeBlockRef.current.querySelectorAll('.pretty-code-line')
            lineIndex = Array.from(allLines).indexOf(lineElement)
            if (lineIndex === -1) lineIndex = null
          }

          setSelection({
            text,
            lineIndex,
            rect: {
              x: posX,
              y: posY,
            },
          })
        }
      }
    }, 10)
  }, [])

  // Clear selection on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (selection && !e.target.closest('.selection-popup')) {
        setSelection(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selection])

  // Handle explain selection
  const handleExplainSelection = useCallback(() => {
    if (!selection) return
    setSelectedToken({
      content: selection.text,
      types: ['selection'],
    })
    setSelectedLineIndex(selection.lineIndex) // Use detected line index
    setPopoverPosition({
      x: selection.rect.x,
      y: selection.rect.y + 50,
    })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [selection])

  return (
    <div
      ref={codeBlockRef}
      className={`overflow-hidden transition-all duration-200 relative ${
        isCollapsed ? 'max-h-[240px]' : 'max-h-none'
      }`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <Highlight
        theme={themes.github}
        code={code.trim()}
        language={language}
      >
        {({ tokens }) => {
          return (
            <div className="pretty-code">
              {tokens.map((line, lineIndex) => {
                const originalLine = lines[lineIndex] || ''
                const indentLevel = getIndentLevel(originalLine)
                const lineBreadcrumbs = getBreadcrumbsForLine(lineIndex)

                return (
                  <div key={lineIndex} className="pretty-code-line group">
                    {/* Render indent guides */}
                    {Array.from({ length: indentLevel }).map((_, i) => (
                      <span key={i} className="pretty-code-indent" />
                    ))}

                    {/* Render tokens */}
                    {line.map((token, tokenIndex) => {
                      const tokenTypes = token.types || []
                      const cssClass = getTokenClass(tokenTypes)
                      const content = token.content
                      const tooltip = getTooltip(tokenTypes, content)

                      // Skip leading whitespace
                      if (tokenIndex === 0 && /^\s+$/.test(content)) {
                        return null
                      }

                      // Check if this token should be highlighted
                      const isHoveredBreadcrumb = hoveredBreadcrumb &&
                        hoveredBreadcrumb.lineIndex === lineIndex &&
                        hoveredBreadcrumb.token.content.trim() === content.trim()
                      const isSelected = selectedToken &&
                        selectedLineIndex === lineIndex &&
                        selectedToken.content.trim() === content.trim()
                      const isHighlighted = isHoveredBreadcrumb || isSelected

                      return (
                        <span
                          key={tokenIndex}
                          className={`${cssClass} ${isHighlighted ? 'ring-2 ring-accent ring-offset-1 rounded' : ''}`}
                          style={selection ? { cursor: 'default' } : undefined}
                          data-tooltip={tooltip}
                          onClick={(e) => tooltip && !selection && handleTokenClick(e, content, tokenTypes, lineIndex)}
                          onMouseEnter={(e) => handleTokenMouseEnter(e, tooltip)}
                          onMouseLeave={handleTokenMouseLeave}
                        >
                          {content}
                        </span>
                      )
                    })}

                    {/* Breadcrumb icons at end of line */}
                    {lineBreadcrumbs.length > 0 && (
                      <LineBreadcrumbs
                        items={lineBreadcrumbs}
                        onSelect={handleBreadcrumbSelect}
                        onHover={handleBreadcrumbHover}
                        onHoverEnd={handleBreadcrumbHoverEnd}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )
        }}
      </Highlight>

      {/* Hover Tooltip - hide when token selected, selecting, or selection active */}
      <Tooltip
        text={hoveredTooltip.text}
        position={hoveredTooltip.position}
        visible={hoveredTooltip.visible && !selectedToken && !selection && !isSelecting}
      />

      {/* Selection Popup (chat icon) */}
      {selection && (
        <SelectionPopup
          position={selection.rect}
          onExplain={handleExplainSelection}
        />
      )}

      {/* Explanation Popover */}
      {selectedToken && (
        <ExplanationPopover
          token={selectedToken}
          position={popoverPosition}
          onClose={closePopover}
          code={code}
          language={language}
          cachedConversation={conversationCacheRef.current.get(getTokenCacheKey(selectedToken))}
          onCacheConversation={(conversation) => {
            conversationCacheRef.current.set(getTokenCacheKey(selectedToken), conversation)
          }}
          onAddBreadcrumb={handleAddBreadcrumb}
        />
      )}
    </div>
  )
}
