import { useState } from 'react'
import { Check, Loader2, ChevronRight, ChevronDown, GitCommit, GitBranch } from 'lucide-react'

export default function GitActionBar({ onCommit, onPush, onDismiss, onCelebrate }) {
  const [status, setStatus] = useState('ready') // ready, committing, committed, pushing, pushed, error
  const [error, setError] = useState(null)
  const [commitData, setCommitData] = useState(null)
  const [pushData, setPushData] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleCommit = async () => {
    setStatus('committing')
    setError(null)

    try {
      const response = await fetch('http://localhost:8000/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Commit failed')
      }

      if (data.success) {
        setCommitData(data)
        setStatus('committed')
        onCelebrate?.()
        onCommit?.(data)
      } else {
        setError(data.message || 'Nothing to commit')
        setStatus('ready')
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const handlePush = async () => {
    setStatus('pushing')
    setError(null)

    try {
      const response = await fetch('http://localhost:8000/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Push failed')
      }

      if (data.success) {
        setPushData(data)
        setStatus('pushed')
        onPush?.(data)
        // Auto-dismiss after successful push
        setTimeout(() => onDismiss?.(), 3000)
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  // Render details section
  const renderDetails = () => {
    if (!isExpanded) return null

    return (
      <div className="mt-2 ml-5 pl-3 border-l border-border/50 text-xs space-y-2">
        {commitData && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-text-muted">
              <GitCommit size={12} />
              <span>Commit</span>
            </div>
            {commitData.hash && (
              <div className="font-mono text-text-muted">
                {commitData.hash.slice(0, 7)}
              </div>
            )}
            {commitData.message && (
              <div className="text-text whitespace-pre-wrap">
                {commitData.message}
              </div>
            )}
            {commitData.output && (
              <pre className="bg-surface p-2 rounded overflow-auto max-h-32 text-text-muted">
                {commitData.output}
              </pre>
            )}
          </div>
        )}
        {pushData && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-text-muted">
              <GitBranch size={12} />
              <span>Push</span>
            </div>
            {pushData.branch && (
              <div className="text-text">
                {pushData.remote || 'origin'}/{pushData.branch}
              </div>
            )}
            {pushData.output && (
              <pre className="bg-surface p-2 rounded overflow-auto max-h-32 text-text-muted">
                {pushData.output}
              </pre>
            )}
          </div>
        )}
      </div>
    )
  }

  // Already pushed - show success with details
  if (status === 'pushed') {
    return (
      <div className="mt-3 animate-fade-in">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success text-sm font-medium hover:bg-success/15 transition-colors"
        >
          <span className="text-success/50">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <Check size={16} />
          Pushed
        </button>
        {renderDetails()}
      </div>
    )
  }

  const hasDetails = commitData || pushData

  return (
    <div className="mt-3 animate-fade-in">
      <div className="inline-flex items-center gap-3">
        {/* Expand toggle - only show if we have details */}
        {hasDetails && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-text-muted/50 hover:text-text-muted transition-colors"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {status === 'committed' && (
          <Check size={16} className="text-success flex-shrink-0" />
        )}
        {status !== 'ready' && (
          <span className="text-sm text-text whitespace-nowrap">
            {status === 'committing' && 'Committing...'}
            {status === 'committed' && 'Committed'}
            {status === 'pushing' && 'Pushing...'}
            {status === 'error' && (error || 'Error')}
          </span>
        )}
        {status === 'ready' && (
          <button onClick={handleCommit} className="btn-cta text-sm py-1.5 px-4">
            Commit
          </button>
        )}
        {status === 'committing' && (
          <button disabled className="btn-cta text-sm py-1.5 px-4 opacity-50 cursor-not-allowed">
            <Loader2 size={14} className="animate-spin" />
          </button>
        )}
        {status === 'committed' && (
          <button onClick={handlePush} className="btn-cta text-sm py-1.5 px-4">
            Push
          </button>
        )}
        {status === 'pushing' && (
          <button disabled className="btn-cta text-sm py-1.5 px-4 opacity-50 cursor-not-allowed">
            <Loader2 size={14} className="animate-spin" />
          </button>
        )}
        {status === 'error' && (
          <button onClick={handleCommit} className="btn-cta text-sm py-1.5 px-4">
            Retry
          </button>
        )}
      </div>
      {renderDetails()}
    </div>
  )
}
