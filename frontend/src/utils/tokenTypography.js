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
  'template-string': 'token-template-string',
  'template-punctuation': 'token-punctuation',
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
  'attr-value',  // Must come before 'string' to take precedence
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
 * In JSX, Prism uses 'tag' type for attribute names and '=', and 'string' for values.
 * This function detects strings/template-strings that follow = and reclassifies them.
 *
 * @param {Array} lines - Array of token arrays from Prism
 * @returns {Array} - Processed token arrays with attr-value tokens
 */
export function processTokensForAttrValues(lines) {
  return lines.map(line => {
    const processed = []

    for (let i = 0; i < line.length; i++) {
      const token = line[i]
      const types = token.types || []

      // Check if this is a string or template-string token
      const isStringToken = types.includes('string') || types.includes('template-string')

      if (isStringToken) {
        // Look back through recent tokens to find =
        // In JSX, = might be a 'tag' token, 'operator', 'punctuation', or 'attr-equals'
        let foundEquals = false
        for (let j = processed.length - 1; j >= Math.max(0, processed.length - 5); j--) {
          const prev = processed[j]
          const prevContent = (prev?.content || '').trim()

          // Skip empty/whitespace
          if (prevContent === '') continue

          // Check if this token is or contains =
          if (prevContent === '=' || prevContent === '{' || prevContent.endsWith('=')) {
            foundEquals = true
            break
          }

          // If we hit a token that's clearly not part of an attribute (like > or <), stop
          if (prevContent === '>' || prevContent === '<' || prevContent === ';') {
            break
          }
        }

        if (foundEquals) {
          processed.push({ ...token, types: ['attr-value'] })
          continue
        }
      }

      processed.push(token)
    }

    return processed
  })
}
