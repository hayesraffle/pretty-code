export function exportAsMarkdown(messages) {
  let markdown = '# Claude Code Conversation\n\n'
  markdown += `_Exported on ${new Date().toLocaleString()}_\n\n---\n\n`

  messages.forEach((msg) => {
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''
    if (msg.role === 'user') {
      markdown += `## You ${time ? `(${time})` : ''}\n\n${msg.content}\n\n`
    } else {
      markdown += `## Claude ${time ? `(${time})` : ''}\n\n${msg.content}\n\n`
    }
    markdown += '---\n\n'
  })

  return markdown
}

export function exportAsJSON(messages) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
      })),
    },
    null,
    2
  )
}

export function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportConversation(messages, format = 'markdown') {
  const timestamp = new Date().toISOString().split('T')[0]

  if (format === 'json') {
    const content = exportAsJSON(messages)
    downloadFile(content, `conversation-${timestamp}.json`, 'application/json')
  } else {
    const content = exportAsMarkdown(messages)
    downloadFile(content, `conversation-${timestamp}.md`, 'text/markdown')
  }
}
