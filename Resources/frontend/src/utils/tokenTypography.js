// Token-to-typography mapping for Pretty Code mode
// Supports both Prism (legacy) and Shiki (TextMate scopes)

// === CSS class names for each semantic token type ===
export const TOKEN_CLASSES = {
  keyword: 'token-keyword',
  builtin: 'token-builtin',
  className: 'token-class-name',
  function: 'token-function',
  string: 'token-string',
  templateString: 'token-template-string',
  attrValue: 'token-attr-value',
  number: 'token-number',
  boolean: 'token-boolean',
  comment: 'token-comment',
  variable: 'token-variable',
  property: 'token-property',
  parameter: 'token-parameter',
  constant: 'token-constant',
  operator: 'token-operator',
  punctuation: 'token-punctuation',
  tag: 'token-tag',
  attrName: 'token-attr-name',
  namespace: 'token-namespace',
  regex: 'token-regex',
  plain: 'token-plain',
}

// === Shiki TextMate Scope Mappings ===
// Maps TextMate scope patterns to CSS classes
// Order matters - more specific patterns should come first
const SCOPE_MAPPINGS = [
  // JSX/HTML attribute values - MUST match before generic strings
  { pattern: 'string.quoted.double.tsx', class: TOKEN_CLASSES.attrValue },
  { pattern: 'string.quoted.single.tsx', class: TOKEN_CLASSES.attrValue },
  { pattern: 'string.quoted.double.jsx', class: TOKEN_CLASSES.attrValue },
  { pattern: 'string.quoted.single.jsx', class: TOKEN_CLASSES.attrValue },
  { pattern: 'string.template.tsx', class: TOKEN_CLASSES.attrValue },
  { pattern: 'string.template.jsx', class: TOKEN_CLASSES.attrValue },
  // NOTE: Removed 'meta.jsx.children' pattern - it was matching too early and
  // overriding more specific scopes like variable, punctuation, etc.
  // Plain text in JSX will still get token-plain if no other scopes match.

  // Keywords
  { pattern: 'keyword.control', class: TOKEN_CLASSES.keyword },
  { pattern: 'keyword.operator.expression', class: TOKEN_CLASSES.keyword },
  { pattern: 'keyword', class: TOKEN_CLASSES.keyword },
  { pattern: 'storage.type', class: TOKEN_CLASSES.keyword },
  { pattern: 'storage.modifier', class: TOKEN_CLASSES.keyword },

  // Functions
  { pattern: 'entity.name.function', class: TOKEN_CLASSES.function },
  { pattern: 'support.function', class: TOKEN_CLASSES.function },
  { pattern: 'meta.function-call', class: TOKEN_CLASSES.function },

  // Classes & Types
  { pattern: 'entity.name.class', class: TOKEN_CLASSES.className },
  { pattern: 'entity.name.type', class: TOKEN_CLASSES.className },
  { pattern: 'support.class', class: TOKEN_CLASSES.className },
  { pattern: 'support.type', class: TOKEN_CLASSES.className },

  // Strings (generic - comes AFTER JSX-specific patterns)
  { pattern: 'string.template', class: TOKEN_CLASSES.templateString },
  { pattern: 'string.quoted', class: TOKEN_CLASSES.string },
  { pattern: 'string', class: TOKEN_CLASSES.string },

  // Numbers & Booleans
  { pattern: 'constant.numeric', class: TOKEN_CLASSES.number },
  { pattern: 'constant.language.boolean', class: TOKEN_CLASSES.boolean },
  { pattern: 'constant.language.null', class: TOKEN_CLASSES.boolean },
  { pattern: 'constant.language.undefined', class: TOKEN_CLASSES.boolean },
  { pattern: 'constant.language', class: TOKEN_CLASSES.constant },
  { pattern: 'constant.other', class: TOKEN_CLASSES.constant },

  // Comments
  { pattern: 'comment', class: TOKEN_CLASSES.comment },

  // Variables & Properties
  { pattern: 'variable.parameter', class: TOKEN_CLASSES.parameter },
  { pattern: 'variable.other.property', class: TOKEN_CLASSES.property },
  { pattern: 'variable.other.object', class: TOKEN_CLASSES.variable },
  { pattern: 'variable.other.readwrite', class: TOKEN_CLASSES.variable },
  { pattern: 'variable', class: TOKEN_CLASSES.variable },
  { pattern: 'support.variable', class: TOKEN_CLASSES.variable },

  // JSX/HTML Tags & Attributes
  { pattern: 'entity.name.tag', class: TOKEN_CLASSES.tag },
  { pattern: 'entity.other.attribute-name', class: TOKEN_CLASSES.attrName },
  { pattern: 'support.type.property-name', class: TOKEN_CLASSES.property },

  // Operators & Punctuation
  { pattern: 'keyword.operator', class: TOKEN_CLASSES.operator },
  { pattern: 'punctuation', class: TOKEN_CLASSES.punctuation },

  // Regex
  { pattern: 'string.regexp', class: TOKEN_CLASSES.regex },
]

/**
 * Check if scopes indicate we're inside a JSX/HTML tag context
 * @param {string[]} scopes - Array of TextMate scope strings
 * @returns {boolean}
 */
function isInTagContext(scopes) {
  for (const scope of scopes) {
    if (scope.includes('meta.tag') ||
        scope.includes('meta.jsx') ||
        scope.includes('entity.name.tag') ||
        scope.includes('entity.other.attribute-name')) {
      return true
    }
  }
  return false
}

/**
 * Check if scopes indicate this is a string token
 * @param {string[]} scopes - Array of TextMate scope strings
 * @returns {boolean}
 */
function isStringScope(scopes) {
  for (const scope of scopes) {
    if (scope.includes('string.quoted') || scope.includes('string.template')) {
      return true
    }
  }
  return false
}

/**
 * Get CSS class from Shiki token scopes.
 * @param {string[]} scopes - Array of TextMate scope strings
 * @returns {string} CSS class name
 */
export function getTokenClassFromScopes(scopes) {
  if (!scopes || scopes.length === 0) {
    return TOKEN_CLASSES.plain
  }

  // Special case: strings inside JSX/HTML tag context → attr-value styling
  // This handles JSX attribute values regardless of language suffix (.js, .jsx, .tsx)
  if (isStringScope(scopes) && isInTagContext(scopes)) {
    return TOKEN_CLASSES.attrValue
  }

  // Check each scope against our mappings
  for (const scope of scopes) {
    for (const mapping of SCOPE_MAPPINGS) {
      if (scope.includes(mapping.pattern)) {
        return mapping.class
      }
    }
  }

  return TOKEN_CLASSES.plain
}

/**
 * Extract scopes from a Shiki token's explanation.
 * @param {Object} token - Shiki token with explanation
 * @returns {string[]} Array of scope strings
 */
export function extractScopes(token) {
  if (!token.explanation || token.explanation.length === 0) {
    return []
  }

  // Collect all scopes from all explanations
  const scopes = []
  for (const exp of token.explanation) {
    if (exp.scopes) {
      for (const scopeInfo of exp.scopes) {
        if (scopeInfo.scopeName) {
          scopes.push(scopeInfo.scopeName)
        }
      }
    }
  }
  return scopes
}

/**
 * Get CSS class for a Shiki token.
 * @param {Object} token - Shiki token (with or without explanation)
 * @returns {string} CSS class name
 */
export function getShikiTokenClass(token) {
  const scopes = extractScopes(token)
  return getTokenClassFromScopes(scopes)
}

// === Legacy Prism support (kept for backwards compatibility) ===

export const TOKEN_STYLES = {
  keyword: TOKEN_CLASSES.keyword,
  builtin: TOKEN_CLASSES.builtin,
  'class-name': TOKEN_CLASSES.className,
  function: TOKEN_CLASSES.function,
  'function-variable': TOKEN_CLASSES.function,
  method: TOKEN_CLASSES.function,
  string: TOKEN_CLASSES.string,
  'template-string': TOKEN_CLASSES.templateString,
  'template-punctuation': TOKEN_CLASSES.punctuation,
  char: TOKEN_CLASSES.string,
  regex: TOKEN_CLASSES.regex,
  number: TOKEN_CLASSES.number,
  boolean: TOKEN_CLASSES.boolean,
  comment: TOKEN_CLASSES.comment,
  prolog: TOKEN_CLASSES.comment,
  doctype: TOKEN_CLASSES.comment,
  cdata: TOKEN_CLASSES.comment,
  variable: TOKEN_CLASSES.variable,
  property: TOKEN_CLASSES.property,
  parameter: TOKEN_CLASSES.parameter,
  constant: TOKEN_CLASSES.constant,
  symbol: TOKEN_CLASSES.constant,
  operator: TOKEN_CLASSES.operator,
  punctuation: TOKEN_CLASSES.punctuation,
  tag: TOKEN_CLASSES.tag,
  'attr-name': TOKEN_CLASSES.attrName,
  'attr-value': TOKEN_CLASSES.attrValue,
  namespace: TOKEN_CLASSES.namespace,
  'maybe-class-name': TOKEN_CLASSES.className,
  'known-class-name': TOKEN_CLASSES.className,
  plain: TOKEN_CLASSES.plain,
}

const PRIORITY_ORDER = [
  'function', 'class-name', 'keyword', 'builtin',
  'attr-value', 'string', 'template-string', 'comment',
  'number', 'boolean', 'constant',
  'tag', 'attr-name',
  'variable', 'property', 'parameter',
  'operator', 'punctuation',
]

/**
 * Legacy: Get CSS class for Prism token types.
 * @param {string[]} tokenTypes - Array of Prism token type strings
 * @returns {string} CSS class name
 */
export function getTokenClass(tokenTypes) {
  if (!tokenTypes || tokenTypes.length === 0) {
    return TOKEN_STYLES.plain
  }

  for (const type of PRIORITY_ORDER) {
    if (tokenTypes.includes(type)) {
      return TOKEN_STYLES[type] || TOKEN_STYLES.plain
    }
  }

  for (const type of tokenTypes) {
    if (TOKEN_STYLES[type]) {
      return TOKEN_STYLES[type]
    }
  }

  return TOKEN_STYLES.plain
}

/**
 * Check if content is a block-starting keyword
 */
export function isBlockKeyword(content) {
  return ['function', 'class', 'if', 'else', 'for', 'while', 'switch', 'try', 'catch'].includes(content)
}

/**
 * Check if content is a brace
 */
export function isBrace(content) {
  return content === '{' || content === '}'
}
