// Token-to-typography mapping for Pretty Code mode
// Maps Prism token types to semantic typography styles

export const TOKEN_STYLES = {
  // === STRUCTURAL (Sans-serif, Bold/Medium) ===
  keyword: 'token-keyword',
  builtin: 'token-builtin',
  'class-name': 'token-class-name',

  // === FUNCTIONAL ===
  function: 'token-function',
  'function-variable': 'token-function',
  method: 'token-function',

  // === LITERALS (Serif, Italic for strings) ===
  string: 'token-string',
  'template-string': 'token-string',
  'template-punctuation': 'token-string',
  char: 'token-string',
  regex: 'token-regex',

  // === NUMERIC ===
  number: 'token-number',
  boolean: 'token-boolean',

  // === COMMENTS ===
  comment: 'token-comment',
  prolog: 'token-comment',
  doctype: 'token-comment',
  cdata: 'token-comment',

  // === VARIABLES/PROPERTIES ===
  variable: 'token-variable',
  property: 'token-property',
  parameter: 'token-parameter',
  constant: 'token-constant',
  symbol: 'token-constant',

  // === OPERATORS/PUNCTUATION ===
  operator: 'token-operator',
  punctuation: 'token-punctuation',

  // === TAGS/ATTRIBUTES (HTML/JSX) ===
  tag: 'token-tag',
  'attr-name': 'token-attr-name',
  'attr-value': 'token-attr-value',
  namespace: 'token-namespace',

  // === TYPES ===
  'maybe-class-name': 'token-class-name',
  'known-class-name': 'token-class-name',

  // === DEFAULT ===
  plain: 'token-plain',
}

// Priority order for resolving token types
const PRIORITY_ORDER = [
  'function', 'class-name', 'keyword', 'builtin',
  'string', 'template-string', 'comment',
  'number', 'boolean', 'constant',
  'tag', 'attr-name',
  'variable', 'property', 'parameter',
  'operator', 'punctuation',
]

/**
 * Get the CSS class for a token based on its types
 * @param {string[]} tokenTypes - Array of token type strings
 * @returns {string} CSS class name
 */
export function getTokenClass(tokenTypes) {
  if (!tokenTypes || tokenTypes.length === 0) {
    return TOKEN_STYLES.plain
  }

  // Check priority order first
  for (const type of PRIORITY_ORDER) {
    if (tokenTypes.includes(type)) {
      return TOKEN_STYLES[type] || TOKEN_STYLES.plain
    }
  }

  // Fallback: check all token types
  for (const type of tokenTypes) {
    if (TOKEN_STYLES[type]) {
      return TOKEN_STYLES[type]
    }
  }

  return TOKEN_STYLES.plain
}

/**
 * Check if a token represents a block-starting keyword
 */
export function isBlockKeyword(content) {
  return ['function', 'class', 'if', 'else', 'for', 'while', 'switch', 'try', 'catch'].includes(content)
}

/**
 * Check if a token is opening/closing braces
 */
export function isBrace(content) {
  return content === '{' || content === '}'
}

/**
 * Post-process tokens to properly identify JSX/HTML attribute values.
 * Prism often tokenizes attribute values as plain 'string' tokens.
 * This function detects strings inside JSX/HTML tags and reclassifies them.
 *
 * @param {Array} lines - Array of token arrays from Prism
 * @returns {Array} - Processed token arrays with attr-value tokens
 */
export function processTokensForAttrValues(lines) {
  // Track if we're inside a JSX/HTML tag across lines
  let inTag = false

  return lines.map(line => {
    const processed = []

    // Helper to look back and find non-whitespace tokens
    const lookBack = (n) => {
      let count = 0
      for (let i = processed.length - 1; i >= 0; i--) {
        const t = processed[i]
        if (t.content && t.content.trim() === '') continue
        count++
        if (count === n) return t
      }
      return null
    }

    for (let i = 0; i < line.length; i++) {
      const token = line[i]
      const content = token.content || ''
      const types = token.types || []

      // Track tag boundaries
      // Opening: < followed by tag name (not </ which is closing)
      if (content.includes('<') && !content.includes('</')) {
        inTag = true
      }
      // Also check for tag token type
      if (types.includes('tag')) {
        inTag = true
      }
      // Closing: > or />
      if (content.includes('>')) {
        // Process this token first, then exit tag context
        processed.push(token)
        inTag = false
        continue
      }

      // Check if this is a string token
      const isStringToken = types.includes('string')

      if (isStringToken) {
        // Method 1: Check if we're inside a tag
        if (inTag) {
          processed.push({ ...token, types: ['attr-value'] })
          continue
        }

        // Method 2: Look back for = pattern (for cases where tag tracking failed)
        const prev1 = lookBack(1)
        const prev2 = lookBack(2)

        const isAfterEquals = prev1?.content?.trim() === '=' ||
                             prev1?.types?.includes('attr-equals') ||
                             (prev1?.types?.includes('punctuation') && prev1?.content?.includes('='))

        const hasAttrNameBefore = prev2?.types?.includes('attr-name') ||
                                  prev2?.types?.includes('attr') ||
                                  (prev2?.types?.includes('plain') && /^[a-zA-Z][\w-]*$/.test(prev2?.content?.trim() || ''))

        if (isAfterEquals && hasAttrNameBefore) {
          processed.push({ ...token, types: ['attr-value'] })
          continue
        }
      }

      processed.push(token)
    }

    return processed
  })
}
