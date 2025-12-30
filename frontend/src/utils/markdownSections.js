/**
 * Parse markdown into sections based on headings (h2, h3, h4)
 * Each section includes the heading level, text, and content until the next heading
 *
 * @param {string} markdown - The markdown content to parse
 * @returns {Array<{ level: number, heading: string | null, content: string, id: string }>}
 */
export function parseMarkdownSections(markdown) {
  if (!markdown) return [{ level: 0, heading: null, content: '', id: 'section-0' }]

  const lines = markdown.split('\n')
  const sections = []
  let currentSection = null
  let contentLines = []
  let sectionId = 0

  for (const line of lines) {
    // Match h2, h3, h4 headings (## to ####)
    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/)

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim()
        sections.push(currentSection)
      } else if (contentLines.length > 0 && contentLines.some(l => l.trim())) {
        // Content before first heading
        sections.push({
          level: 0,
          heading: null,
          content: contentLines.join('\n').trim(),
          id: `section-${sectionId++}`
        })
      }

      // Start new section
      const level = headingMatch[1].length
      currentSection = {
        level,
        heading: headingMatch[2].trim(),
        content: '',
        id: `section-${sectionId++}`
      }
      contentLines = []
    } else {
      contentLines.push(line)
    }
  }

  // Save final section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim()
    sections.push(currentSection)
  } else if (contentLines.length > 0 && contentLines.some(l => l.trim())) {
    sections.push({
      level: 0,
      heading: null,
      content: contentLines.join('\n').trim(),
      id: `section-${sectionId++}`
    })
  }

  return sections
}

/**
 * Check if a section should be collapsed based on parent section collapse state
 * h2 collapses content until next h2/h1
 * h3 collapses content until next h3/h2/h1
 * h4 collapses content until next h4/h3/h2/h1
 *
 * @param {number} currentLevel - The level of the current section (2, 3, or 4)
 * @param {number} nextLevel - The level of the next section (0 if none)
 * @returns {boolean} - Whether the next section is a child of the current section
 */
export function isChildSection(currentLevel, nextLevel) {
  if (nextLevel === 0) return false // No next section
  return nextLevel > currentLevel
}
