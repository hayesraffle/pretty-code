// Patterns to detect collapsible code structures (functions, classes)
const DEFINITION_PATTERNS = [
  // Named functions: function foo(
  { regex: /^\s*(export\s+)?(async\s+)?function\s+(\w+)\s*\(/, name: (m) => m[3], type: 'function' },
  // Class declarations: class Foo / export class Foo
  { regex: /^\s*(export\s+)?(default\s+)?class\s+(\w+)/, name: (m) => m[3], type: 'class' },
  // Arrow function assignment: const foo = async (
  { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/, name: (m) => m[3], type: 'function' },
  // Arrow function with single param: const foo = x =>
  { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?[a-zA-Z_$][\w$]*\s*=>/, name: (m) => m[3], type: 'function' },
  // Arrow function: const foo = () =>
  { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/, name: (m) => m[3], type: 'function' },
  // Method shorthand in object/class: foo( or async foo(
  { regex: /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*\{/, name: (m) => m[2], type: 'method' },
  // Python function: def foo(
  { regex: /^\s*(async\s+)?def\s+(\w+)\s*\(/, name: (m) => m[2], type: 'function' },
  // Python class: class Foo:
  { regex: /^\s*class\s+(\w+)\s*[:\(]/, name: (m) => m[1], type: 'class' },
]

// Patterns to detect control flow blocks (for block visualization)
const CONTROL_FLOW_PATTERNS = [
  // Loops
  { regex: /^\s*for\s*\(/, type: 'loop' },
  { regex: /^\s*for\s+\w+\s+(of|in)\s+/, type: 'loop' },
  { regex: /^\s*while\s*\(/, type: 'loop' },
  { regex: /^\s*do\s*\{?/, type: 'loop' },
  // Python loops
  { regex: /^\s*for\s+\w+\s+in\s+/, type: 'loop' },
  { regex: /^\s*while\s+/, type: 'loop' },

  // Conditionals
  { regex: /^\s*if\s*\(/, type: 'conditional' },
  { regex: /^\s*else\s+if\s*\(/, type: 'conditional' },
  { regex: /^\s*else\s*\{?$/, type: 'conditional' },
  // Python conditionals
  { regex: /^\s*if\s+/, type: 'conditional' },
  { regex: /^\s*elif\s+/, type: 'conditional' },
  { regex: /^\s*else\s*:/, type: 'conditional' },

  // Error handling
  { regex: /^\s*try\s*\{?/, type: 'try-catch' },
  { regex: /^\s*catch\s*\(?/, type: 'try-catch' },
  { regex: /^\s*finally\s*\{?/, type: 'try-catch' },
  // Python error handling
  { regex: /^\s*try\s*:/, type: 'try-catch' },
  { regex: /^\s*except(\s+|\s*:)/, type: 'try-catch' },
  { regex: /^\s*finally\s*:/, type: 'try-catch' },

  // Switch
  { regex: /^\s*switch\s*\(/, type: 'switch' },
]

/**
 * Detect if a line starts a collapsible structure
 * @param {string} line - The source code line
 * @returns {{ name: string, type: string } | null}
 */
export function detectDefinition(line) {
  for (const pattern of DEFINITION_PATTERNS) {
    const match = line.match(pattern.regex)
    if (match) {
      return { name: pattern.name(match), type: pattern.type }
    }
  }
  return null
}

/**
 * Get indentation level (number of leading spaces / 2)
 * @param {string} line
 * @returns {number}
 */
export function getIndentLevel(line) {
  const match = line.match(/^(\s*)/)
  if (!match) return 0
  // Count tabs as 2 spaces
  const spaces = match[1].replace(/\t/g, '  ')
  return Math.floor(spaces.length / 2)
}

/**
 * Find collapsible ranges in code
 * @param {string[]} lines - Array of code lines
 * @returns {Array<{ start: number, end: number, name: string, type: string, indent: number }>}
 */
export function findCollapsibleRanges(lines) {
  const ranges = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const definition = detectDefinition(line)

    if (definition) {
      const startIndent = getIndentLevel(line)
      let endLine = i
      let braceCount = 0
      let foundOpenBrace = false

      // Check if this line has an opening brace
      if (line.includes('{')) {
        foundOpenBrace = true
        braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      }

      // Find end by tracking braces or indentation
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        const trimmed = nextLine.trim()

        // Skip empty lines
        if (trimmed === '') {
          continue
        }

        // If we're tracking braces
        if (foundOpenBrace) {
          braceCount += (nextLine.match(/\{/g) || []).length
          braceCount -= (nextLine.match(/\}/g) || []).length
          endLine = j

          // Found matching closing brace
          if (braceCount <= 0) {
            break
          }
        } else {
          // Check if this line has an opening brace (for functions on next line)
          if (nextLine.includes('{') && !foundOpenBrace) {
            foundOpenBrace = true
            braceCount = (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length
            endLine = j
            if (braceCount <= 0) break
            continue
          }

          // For Python-style (no braces), use indentation
          const nextIndent = getIndentLevel(nextLine)
          if (nextIndent <= startIndent && !trimmed.startsWith('}') && !trimmed.startsWith(')')) {
            break
          }
          endLine = j
        }
      }

      // Only add if we found a body (more than just the definition line)
      if (endLine > i) {
        ranges.push({
          start: i,
          end: endLine,
          name: definition.name,
          type: definition.type,
          indent: startIndent,
        })
      }
    }
  }

  return ranges
}

/**
 * Find the end line of a block starting at startIndex using brace-matching or indentation
 * @param {string[]} lines - Array of code lines
 * @param {number} startIndex - Line index where block starts
 * @returns {{ end: number } | null}
 */
function findBlockEnd(lines, startIndex) {
  const line = lines[startIndex]
  const startIndent = getIndentLevel(line)
  let endLine = startIndex
  let braceCount = 0
  let foundOpenBrace = false

  // Check if this line has an opening brace
  if (line.includes('{')) {
    foundOpenBrace = true
    braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
    // Single-line block (braces balanced on same line)
    if (braceCount <= 0) return { end: startIndex }
  }

  // Find end by tracking braces or indentation
  for (let j = startIndex + 1; j < lines.length; j++) {
    const nextLine = lines[j]
    const trimmed = nextLine.trim()

    // Skip empty lines
    if (trimmed === '') continue

    if (foundOpenBrace) {
      braceCount += (nextLine.match(/\{/g) || []).length
      braceCount -= (nextLine.match(/\}/g) || []).length
      endLine = j

      // Found matching closing brace
      if (braceCount <= 0) break
    } else {
      // Check if next line has opening brace
      if (nextLine.includes('{')) {
        foundOpenBrace = true
        braceCount = (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length
        endLine = j
        if (braceCount <= 0) break
        continue
      }

      // For Python-style (no braces), use indentation
      const nextIndent = getIndentLevel(nextLine)
      if (nextIndent <= startIndent && !trimmed.startsWith('}') && !trimmed.startsWith(')')) {
        break
      }
      endLine = j
    }
  }

  return endLine > startIndex ? { end: endLine } : null
}

/**
 * Find all code blocks (functions, classes, loops, conditionals, etc.)
 * @param {string[]} lines - Array of code lines
 * @returns {Array<{ start: number, end: number, type: string, name?: string }>}
 */
export function findAllBlocks(lines) {
  const blocks = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check for control flow blocks FIRST (before definitions)
    // This prevents 'for', 'if', 'while' from being misidentified as methods
    let foundControlFlow = false
    for (const pattern of CONTROL_FLOW_PATTERNS) {
      if (pattern.regex.test(line)) {
        const range = findBlockEnd(lines, i)
        if (range) {
          blocks.push({
            start: i,
            end: range.end,
            type: pattern.type,
          })
        }
        foundControlFlow = true
        break
      }
    }
    if (foundControlFlow) continue

    // Check for function/class definitions
    const definition = detectDefinition(line)
    if (definition) {
      const range = findBlockEnd(lines, i)
      if (range) {
        blocks.push({
          start: i,
          end: range.end,
          type: definition.type,
          name: definition.name,
        })
      }
    }
  }

  return blocks
}

/**
 * Get all blocks containing a specific line, sorted by size (innermost first)
 * @param {Array<{ start: number, end: number, type: string }>} blocks
 * @param {number} lineIndex
 * @returns {Array<{ start: number, end: number, type: string }>}
 */
export function getBlocksContainingLine(blocks, lineIndex) {
  return blocks
    .filter(block => lineIndex >= block.start && lineIndex <= block.end)
    .sort((a, b) => {
      // Sort by size (smallest range first = innermost block)
      const sizeA = a.end - a.start
      const sizeB = b.end - b.start
      return sizeA - sizeB
    })
}
