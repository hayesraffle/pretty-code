import { useState, useEffect } from 'react'
import { Copy, Check, ChevronDown, ChevronUp, Code, Type } from 'lucide-react'
import { useCodeDisplayMode } from '../contexts/CodeDisplayContext'
import ClassicCodeBlock from './ClassicCodeBlock'
import PrettyCodeBlock from './PrettyCodeBlock'

const COLLAPSE_THRESHOLD = 15

export default function CodeBlock({ code, language = 'javascript', defaultExpanded = false, collapsible = true, diffType = null }) {
  const [copied, setCopied] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [localMode, setLocalMode] = useState(null) // null = use global

  const { globalMode } = useCodeDisplayMode()

  const lines = code.trim().split('\n')
  const lineCount = lines.length
  const canCollapse = collapsible && lineCount > COLLAPSE_THRESHOLD

  // Determine which mode to use (local override or global)
  const activeMode = localMode ?? globalMode

  useEffect(() => {
    if (canCollapse && !defaultExpanded) {
      setIsCollapsed(true)
    }
  }, [canCollapse, defaultExpanded])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleLocalMode = () => {
    if (localMode === null) {
      // First toggle: set opposite of global
      setLocalMode(globalMode === 'pretty' ? 'classic' : 'pretty')
    } else if (localMode === globalMode) {
      // Reset to global
      setLocalMode(null)
    } else {
      // Toggle between modes
      setLocalMode(localMode === 'pretty' ? 'classic' : 'pretty')
    }
  }

  const isPretty = activeMode === 'pretty'
  const isOverridden = localMode !== null

  // Set to true to show header with language, mode toggle, collapse, copy
  const showHeader = false

  // Diff border styling
  const diffBorderClass = diffType === 'added'
    ? 'border-l-4 border-emerald-500 dark:border-emerald-400'
    : diffType === 'removed'
    ? 'border-l-4 border-error/60'
    : ''

  return (
    <div className={`relative my-3 rounded-xl overflow-hidden bg-code-bg code-mode-transition ${diffBorderClass}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[12px] leading-[16px] font-medium text-text-muted">
            {language}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleLocalMode}
              className={`btn-icon w-7 h-7 ${isOverridden ? 'text-accent' : ''}`}
              title={isPretty ? 'Switch to classic monospace' : 'Switch to pretty mode'}
            >
              {isPretty ? <Code size={14} /> : <Type size={14} />}
            </button>
            {canCollapse && (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="btn-icon w-7 h-7"
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="btn-icon w-7 h-7"
              title="Copy code"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Render appropriate code view */}
      {isPretty ? (
        <PrettyCodeBlock
          code={code}
          language={language}
          isCollapsed={isCollapsed}
        />
      ) : (
        <ClassicCodeBlock
          code={code}
          language={language}
          isCollapsed={isCollapsed}
        />
      )}

      {/* Collapsed gradient overlay */}
      {isCollapsed && canCollapse && (
        <div
          className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
          style={{
            background: `linear-gradient(transparent, var(--color-code-bg))`,
          }}
        />
      )}
    </div>
  )
}
