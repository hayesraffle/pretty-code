import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { X } from 'lucide-react'
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

// Explanation Popover Component
function ExplanationPopover({ token, position, onClose, code, language, cachedExplanation, onCacheExplanation }) {
  const [explanation, setExplanation] = useState(cachedExplanation || '')
  const [isStreaming, setIsStreaming] = useState(!cachedExplanation)
  const popoverRef = useRef(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })

  // Handle dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return // Don't drag when clicking buttons
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

  // Fetch explanation only if not cached
  useEffect(() => {
    if (cachedExplanation) return // Already have cached explanation

    const abortController = new AbortController()
    let cancelled = false
    let buffer = '' // Buffer for incomplete SSE lines

    const fetchExplanation = async () => {
      setIsStreaming(true)
      setExplanation('')
      let fullExplanation = ''

      try {
        const res = await fetch(`${API_BASE}/api/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: token.content,
            tokenType: token.types.join(', '),
            context: code,
            language: language,
          }),
          signal: abortController.signal,
        })

        if (!res.ok) throw new Error('Failed to get explanation')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          if (cancelled) break
          const { done, value } = await reader.read()
          if (done) break

          // Append new data to buffer
          buffer += decoder.decode(value, { stream: true })

          // Process complete lines from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.chunk && !cancelled) {
                  fullExplanation += data.chunk
                  setExplanation(fullExplanation)
                } else if (data.done) {
                  setIsStreaming(false)
                  onCacheExplanation?.(fullExplanation)
                } else if (data.error) {
                  const fallback = generateLocalExplanation(token, code)
                  setExplanation(fallback)
                  onCacheExplanation?.(fallback)
                  setIsStreaming(false)
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        // Fallback to a local explanation if API fails
        if (!cancelled) {
          const fallback = generateLocalExplanation(token, code)
          setExplanation(fallback)
          onCacheExplanation?.(fallback)
        }
      } finally {
        if (!cancelled) {
          setIsStreaming(false)
        }
      }
    }

    fetchExplanation()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [token, code, language, cachedExplanation, onCacheExplanation])

  const baseLeft = Math.min(position.x, window.innerWidth - 340)
  const baseTop = Math.min(position.y + 10, window.innerHeight - 400)

  return (
    <div
      ref={popoverRef}
      className="fixed z-[10000] bg-background border border-border rounded-xl shadow-2xl
                 w-80 max-h-96 overflow-hidden animate-fade-in"
      style={{
        left: baseLeft + dragOffset.x,
        top: baseTop + dragOffset.y,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header - draggable */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-border bg-surface
                    ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm text-accent">{token.content.trim()}</code>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 bg-surface-hover rounded">
            {token.types[0]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 overflow-y-auto max-h-72">
        <div className="text-sm text-text explanation-content">
          <ReactMarkdown>{explanation || ''}</ReactMarkdown>
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-accent animate-pulse align-middle" />}
        </div>
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

export default function PrettyCodeBlock({ code, language = 'javascript', isCollapsed }) {
  const [selectedToken, setSelectedToken] = useState(null)
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 })
  const [hoveredTooltip, setHoveredTooltip] = useState({ text: null, position: { x: 0, y: 0 }, visible: false })
  const explanationCacheRef = useRef(new Map()) // Cache explanations by token key

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

  const handleTokenClick = (e, token, tokenTypes) => {
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
  }

  const closePopover = () => {
    setSelectedToken(null)
  }

  return (
    <div
      className={`overflow-hidden transition-all duration-200 relative ${
        isCollapsed ? 'max-h-[240px]' : 'max-h-none'
      }`}
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

                return (
                  <div key={lineIndex} className="pretty-code-line">
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

                      return (
                        <span
                          key={tokenIndex}
                          className={cssClass}
                          data-tooltip={tooltip}
                          onClick={(e) => tooltip && handleTokenClick(e, content, tokenTypes)}
                          onMouseEnter={(e) => handleTokenMouseEnter(e, tooltip)}
                          onMouseLeave={handleTokenMouseLeave}
                        >
                          {content}
                        </span>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        }}
      </Highlight>

      {/* Hover Tooltip */}
      <Tooltip
        text={hoveredTooltip.text}
        position={hoveredTooltip.position}
        visible={hoveredTooltip.visible && !selectedToken}
      />

      {/* Explanation Popover */}
      {selectedToken && (
        <ExplanationPopover
          token={selectedToken}
          position={popoverPosition}
          onClose={closePopover}
          code={code}
          language={language}
          cachedExplanation={explanationCacheRef.current.get(getTokenCacheKey(selectedToken))}
          onCacheExplanation={(explanation) => {
            explanationCacheRef.current.set(getTokenCacheKey(selectedToken), explanation)
          }}
        />
      )}
    </div>
  )
}
