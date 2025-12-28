import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { X, Loader2, Sparkles } from 'lucide-react'
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
function ExplanationPopover({ token, position, onClose, code, language }) {
  const [explanation, setExplanation] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    const fetchExplanation = async () => {
      setIsLoading(true)
      setError(null)

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
        })

        if (!res.ok) throw new Error('Failed to get explanation')

        const data = await res.json()
        setExplanation(data.explanation)
      } catch (err) {
        // Fallback to a local explanation if API fails
        setExplanation(generateLocalExplanation(token, code))
      } finally {
        setIsLoading(false)
      }
    }

    fetchExplanation()
  }, [token, code, language])

  return (
    <div
      ref={popoverRef}
      className="fixed z-[10000] bg-background border border-border rounded-xl shadow-2xl
                 w-80 max-h-96 overflow-hidden animate-fade-in"
      style={{
        left: Math.min(position.x, window.innerWidth - 340),
        top: Math.min(position.y + 10, window.innerHeight - 400),
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <span className="font-medium text-sm text-text">{token.content.trim()}</span>
          <span className="text-xs text-text-muted px-1.5 py-0.5 bg-surface-hover rounded">
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
      <div className="p-4 overflow-y-auto max-h-72">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Generating explanation...</span>
          </div>
        ) : error ? (
          <p className="text-sm text-error">{error}</p>
        ) : (
          <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
            {explanation}
          </div>
        )}
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

  const lines = code.trim().split('\n')

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
      onClick={closePopover}
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
        />
      )}
    </div>
  )
}
