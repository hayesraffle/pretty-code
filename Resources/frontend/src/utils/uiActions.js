// Parse UI action blocks from Claude's output
// Format: ```ui-action
//         {"action": "show_commit", ...}
//         ```

const UI_ACTION_REGEX = /```ui-action\s*\n([\s\S]*?)```/g

/**
 * Parse UI action blocks from text content
 * Returns array of action objects and the text with actions stripped
 */
export function parseUIActions(text) {
  if (!text) return { actions: [], cleanText: text }

  const actions = []
  let cleanText = text

  // Find all ui-action blocks
  const matches = [...text.matchAll(UI_ACTION_REGEX)]

  for (const match of matches) {
    try {
      const jsonContent = match[1].trim()
      const action = JSON.parse(jsonContent)
      if (action && action.action) {
        actions.push(action)
      }
    } catch (e) {
      console.warn('Failed to parse UI action:', match[1], e)
    }
  }

  // Strip all ui-action blocks from text
  cleanText = text.replace(UI_ACTION_REGEX, '').trim()

  return { actions, cleanText }
}

/**
 * Strip UI action blocks from text (for display)
 */
export function stripUIActions(text) {
  if (!text) return text
  return text.replace(UI_ACTION_REGEX, '').trim()
}

/**
 * Check if text contains a specific UI action
 */
export function hasUIAction(text, actionName) {
  const { actions } = parseUIActions(text)
  return actions.some(a => a.action === actionName)
}

/**
 * Extract buttons from UI actions
 * Returns array of button objects: { label, value }
 */
export function extractButtons(actions) {
  const buttons = []
  for (const action of actions) {
    if (action.action === 'show_buttons' && Array.isArray(action.buttons)) {
      buttons.push(...action.buttons)
    }
  }
  return buttons
}
