// Patterns to detect collapsible code structures
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
