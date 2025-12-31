import { useState, useEffect } from 'react'
import { useShiki, tokenizeCode } from '../hooks/useShiki'

export default function ClassicCodeBlock({ code, language = 'javascript', isCollapsed, isAsciiArt = false }) {
  const [isDark, setIsDark] = useState(false)
  const highlighter = useShiki()
  const [tokens, setTokens] = useState(null)

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
    checkDark()

    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  // Tokenize code with Shiki
  useEffect(() => {
    if (!highlighter || !code) {
      setTokens(null)
      return
    }
    const theme = isDark ? 'github-dark' : 'github-light'
    tokenizeCode(highlighter, code.trim(), language, theme).then(setTokens)
  }, [highlighter, code, language, isDark])

  const lines = code.trim().split('\n')

  // Loading state
  if (!tokens) {
    return (
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isCollapsed ? 'max-h-[240px]' : 'max-h-none'
        }`}
      >
        <pre className={`p-4 overflow-x-auto text-[13px] m-0 font-mono opacity-50 ${isAsciiArt ? 'leading-tight' : 'leading-[20px]'}`}>
          {lines.map((line, i) => (
            <div key={i} className="table-row">
              <span className="table-cell pr-4 text-text-muted select-none text-right w-8 opacity-50 text-[12px]">
                {i + 1}
              </span>
              <span className="table-cell">{line}</span>
            </div>
          ))}
        </pre>
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ${
        isCollapsed ? 'max-h-[240px]' : 'max-h-none'
      }`}
    >
      <pre className={`p-4 overflow-x-auto text-[13px] m-0 font-mono ${isAsciiArt ? 'leading-tight' : 'leading-[20px]'}`}>
        {tokens.map((line, i) => (
          <div key={i} className="table-row">
            <span className="table-cell pr-4 text-text-muted select-none text-right w-8 opacity-50 text-[12px]">
              {i + 1}
            </span>
            <span className="table-cell">
              {line.map((token, key) => (
                <span key={key} style={{ color: token.color }}>
                  {token.content}
                </span>
              ))}
            </span>
          </div>
        ))}
      </pre>
    </div>
  )
}
