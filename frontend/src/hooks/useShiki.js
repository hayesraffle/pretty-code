import { useState, useEffect } from 'react'
import { createHighlighter } from 'shiki'

// Singleton promise for the highlighter instance
let highlighterPromise = null

/**
 * Get or create the Shiki highlighter singleton.
 * This ensures we only initialize once across the entire app.
 */
export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript',
        'jsx',
        'typescript',
        'tsx',
        'python',
        'html',
        'css',
        'json',
        'bash',
        'yaml',
        'markdown',
        'text',
      ],
    })
  }
  return highlighterPromise
}

/**
 * React hook to access the Shiki highlighter.
 * Returns null while loading, then the highlighter instance.
 */
export function useShiki() {
  const [highlighter, setHighlighter] = useState(null)

  useEffect(() => {
    getHighlighter().then(setHighlighter)
  }, [])

  return highlighter
}

/**
 * Tokenize code using Shiki with explanation scopes.
 * Returns tokens with full TextMate scope information.
 */
export async function tokenizeCode(highlighter, code, language, theme = 'github-light') {
  if (!highlighter) return null

  // Handle unknown languages gracefully
  const supportedLang = highlighter.getLoadedLanguages().includes(language) ? language : 'text'

  try {
    const result = await highlighter.codeToTokens(code, {
      lang: supportedLang,
      theme,
      includeExplanation: true, // Get full TextMate scopes
    })
    return result.tokens
  } catch (err) {
    console.warn('Shiki tokenization failed:', err)
    return null
  }
}
