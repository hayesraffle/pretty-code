import { useState, useEffect } from 'react'
import { useShiki, tokenizeCode } from '../hooks/useShiki'
import { getShikiTokenClass } from '../utils/tokenTypography'
import { useCodeDisplayMode } from '../contexts/CodeDisplayContext'

// Detect hex color patterns (#rgb, #rrggbb, #rrggbbaa)
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

// Normalize short hex (#rgb) to full hex (#rrggbb)
function normalizeHex(hex) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return hex
}

// Color code component with swatch and picker
function ColorCode({ color, children, className }) {
  const normalizedColor = normalizeHex(color)

  return (
    <code
      className={`px-1.5 py-0.5 rounded text-sm inline-flex items-center gap-1.5 ${className}`}
      style={{ backgroundColor: `${normalizedColor}20` }} // ~12% opacity tint
    >
      {/* Color swatch with picker overlay */}
      <span className="relative inline-block w-3 h-3 flex-shrink-0">
        <span
          className="absolute inset-0 rounded-sm border border-black/20 dark:border-white/20 shadow-sm"
          style={{ backgroundColor: normalizedColor }}
        />
        {/* Native color input positioned over swatch */}
        <input
          type="color"
          defaultValue={normalizedColor.slice(0, 7)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Click to open color picker"
          onChange={() => {}}
        />
      </span>
      <span>{children}</span>
    </code>
  )
}

export default function InlineCode({ children, language = 'javascript', className = '' }) {
  const { globalMode } = useCodeDisplayMode()
  const highlighter = useShiki()
  const [tokens, setTokens] = useState(null)
  const code = String(children).replace(/\n$/, '')

  // Tokenize code with Shiki (for pretty mode)
  useEffect(() => {
    if (!highlighter || !code || globalMode === 'classic') {
      setTokens(null)
      return
    }
    tokenizeCode(highlighter, code, language).then(setTokens)
  }, [highlighter, code, language, globalMode])

  // Check if this is a hex color
  const isHexColor = HEX_COLOR_PATTERN.test(code.trim())

  if (isHexColor) {
    return (
      <ColorCode color={code.trim()} className={globalMode === 'classic' ? 'font-mono' : ''}>
        {children}
      </ColorCode>
    )
  }

  // Classic mode: plain monospace
  if (globalMode === 'classic') {
    return (
      <code className={`px-1.5 py-0.5 rounded bg-code-bg text-sm font-mono ${className}`}>
        {children}
      </code>
    )
  }

  // Pretty mode: Shiki tokenization with semantic styling
  // Show plain text while loading
  if (!tokens) {
    return (
      <code className={`px-1.5 py-0.5 rounded bg-code-bg text-sm ${className}`}>
        {children}
      </code>
    )
  }

  return (
    <code className={`px-1.5 py-0.5 rounded bg-code-bg text-sm ${className}`}>
      {tokens[0]?.map((token, i) => (
        <span key={i} className={getShikiTokenClass(token)}>
          {token.content}
        </span>
      ))}
    </code>
  )
}
