import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export default function PermissionPrompt({
  toolName,
  toolInput,
  toolUseId,
  onApprove,
  onReject,
  onAlwaysAllow,
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleApprove = () => {
    setIsProcessing(true)
    onApprove?.(toolUseId)
  }

  const handleReject = () => {
    setIsProcessing(true)
    onReject?.(toolUseId)
  }

  const handleAlwaysAllow = () => {
    setIsProcessing(true)
    onAlwaysAllow?.(toolName)
  }

  // Format tool input for display
  const formatInput = () => {
    if (!toolInput) return null

    switch (toolName) {
      case 'Read':
        return toolInput.file_path
      case 'Edit':
        return `${toolInput.file_path} (${toolInput.old_string?.length || 0} → ${toolInput.new_string?.length || 0} chars)`
      case 'Write':
        return `${toolInput.file_path} (${toolInput.content?.length || 0} chars)`
      case 'Bash':
        return toolInput.command
      case 'Glob':
        return `${toolInput.pattern} in ${toolInput.path || '.'}`
      case 'Grep':
        return `"${toolInput.pattern}" in ${toolInput.path || '.'}`
      default:
        return JSON.stringify(toolInput, null, 2)
    }
  }

  // Get action label based on tool
  const getActionLabel = () => {
    switch (toolName) {
      case 'Read':
        return 'Read file'
      case 'Edit':
        return 'Edit file'
      case 'Write':
        return 'Create file'
      case 'Bash':
        return 'Run command'
      case 'Glob':
        return 'Search files'
      case 'Grep':
        return 'Search contents'
      default:
        return `Use ${toolName}`
    }
  }

  return (
    <div className="mt-3 animate-fade-in" data-permission-prompt={toolUseId}>
      {/* Action description and input preview */}
      <div className="mb-2">
        <span className="text-sm text-text-muted">{getActionLabel()}:</span>
        <code className="ml-2 text-sm bg-surface px-2 py-0.5 rounded">
          {formatInput()}
        </code>
      </div>

      {/* Expandable details */}
      {toolInput && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 mb-2 text-xs text-text-muted hover:text-text"
        >
          {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
      )}

      {showDetails && toolInput && (
        <pre className="mb-3 text-xs bg-surface p-2 rounded overflow-auto max-h-40 text-text-muted">
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      )}

      {/* Action buttons - matching ActionButtons style */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleApprove}
          disabled={isProcessing}
          className="px-4 py-2 text-sm font-medium rounded-full
                     bg-success/10 border border-success/30 text-success
                     hover:bg-success/20 hover:border-success/50
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          Approve
        </button>

        <button
          onClick={handleReject}
          disabled={isProcessing}
          className="px-4 py-2 text-sm font-medium rounded-full
                     bg-error/10 border border-error/30 text-error
                     hover:bg-error/20 hover:border-error/50
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          Reject
        </button>

        <button
          onClick={handleAlwaysAllow}
          disabled={isProcessing}
          className="px-4 py-2 text-sm font-medium rounded-full
                     bg-surface border border-border text-text-muted
                     hover:bg-surface-hover hover:border-text/20 hover:text-text
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          Always allow {toolName}
        </button>
      </div>
    </div>
  )
}
