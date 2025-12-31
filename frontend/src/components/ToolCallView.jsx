import { useState, useEffect, useRef } from 'react'
import {
  FileText,
  Edit3,
  Terminal,
  Search,
  Globe,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FolderOpen,
  Sparkles,
  HelpCircle,
  CheckCircle,
  X,
} from 'lucide-react'
import CodeBlock from './CodeBlock'
import InlineCode from './InlineCode'
import MarkdownRenderer from './MarkdownRenderer'
import { useCodeDisplayMode } from '../contexts/CodeDisplayContext'

// Tool icon mapping
const TOOL_ICONS = {
  Read: FileText,
  Edit: Edit3,
  Write: FileText,
  Bash: Terminal,
  Glob: FolderOpen,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  TodoWrite: CheckSquare,
  Task: Sparkles,
  AskUserQuestion: HelpCircle,
  ExitPlanMode: CheckCircle,
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button onClick={handleCopy} className="btn-icon w-6 h-6" title="Copy">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

// Get a summary string for the collapsed state
function getToolSummary(toolName, input) {
  switch (toolName) {
    case 'Read':
      return input?.file_path?.split('/').pop() || 'file'
    case 'Edit':
      return input?.file_path?.split('/').pop() || 'file'
    case 'Write':
      return input?.file_path?.split('/').pop() || 'file'
    case 'Bash':
      const cmd = input?.command || ''
      return cmd.length > 50 ? cmd.slice(0, 50) + '…' : cmd
    case 'Glob':
      return input?.pattern || 'pattern'
    case 'Grep':
      return input?.pattern || 'search'
    case 'WebFetch':
      return input?.url?.replace(/^https?:\/\//, '').slice(0, 40) || 'url'
    case 'WebSearch':
      return input?.query || 'search'
    case 'Task':
      const agentType = input?.subagent_type || 'agent'
      const desc = input?.description || ''
      return `${agentType}: ${desc}`
    case 'TodoWrite':
      const todos = input?.todos || []
      const inProgress = todos.filter(t => t.status === 'in_progress').length
      const completed = todos.filter(t => t.status === 'completed').length
      return `${completed}/${todos.length} done${inProgress > 0 ? `, ${inProgress} active` : ''}`
    case 'AskUserQuestion':
      const qCount = input?.questions?.length || 0
      return `${qCount} question${qCount !== 1 ? 's' : ''}`
    case 'ExitPlanMode':
      return 'Plan ready for approval'
    default:
      return ''
  }
}

// Get short label for tool
function getToolLabel(toolName) {
  const labels = {
    Read: 'Read',
    Edit: 'Edit',
    Write: 'Write',
    Bash: '$',
    Glob: 'Find',
    Grep: 'Search',
    WebFetch: 'Fetch',
    WebSearch: 'Web',
    TodoWrite: 'Todo',
    Task: '',
    AskUserQuestion: 'Question',
    ExitPlanMode: 'Plan',
  }
  return labels[toolName] ?? toolName
}

// Check if file is markdown
function isMarkdownFile(filePath) {
  const ext = filePath?.split('.').pop()?.toLowerCase()
  return ext === 'md' || ext === 'mdx'
}

// Read file renderer
function ReadRenderer({ input, result }) {
  const filePath = input?.file_path || 'Unknown file'
  const content = result?.content || result?.file?.content || ''
  const language = getLanguageFromPath(filePath)
  const isMarkdown = isMarkdownFile(filePath)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <InlineCode language="text" className="text-xs text-text-muted">
          {filePath}
        </InlineCode>
        <CopyButton text={content} />
      </div>
      {content && (
        isMarkdown ? (
          <div className="border-l-2 border-accent/50 pl-3 ml-1.5 md-content">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <CodeBlock code={content} language={language} collapsible={false} />
        )
      )}
    </div>
  )
}

// Edit file renderer - uses CodeBlock for full PrettyCodeBlock features
function EditRenderer({ input }) {
  const filePath = input?.file_path || 'Unknown file'
  const oldString = input?.old_string || ''
  const newString = input?.new_string || ''
  const language = getLanguageFromPath(filePath)
  const isMarkdown = isMarkdownFile(filePath)

  // Handle empty cases
  if (!oldString && !newString) {
    return (
      <div className="space-y-2">
        <InlineCode language="text" className="text-xs text-text-muted">
          {filePath}
        </InlineCode>
        <div className="text-xs text-text-muted">(no changes)</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <InlineCode language="text" className="text-xs text-text-muted">
        {filePath}
      </InlineCode>

      <div className="space-y-4">
        {/* Removed block - dimmed with red left border */}
        {oldString && (
          <div className="flex gap-2 items-start">
            <span className="select-none bg-error/20 text-error font-bold w-6 h-6 flex items-center justify-center rounded flex-shrink-0 mt-4">
              −
            </span>
            <div className="flex-1 opacity-50">
              {isMarkdown ? (
                <div className="border-l-2 border-error/50 pl-3 ml-1.5 md-content">
                  <MarkdownRenderer content={oldString} />
                </div>
              ) : (
                <CodeBlock code={oldString} language={language} collapsible={false} diffType="removed" />
              )}
            </div>
          </div>
        )}

        {/* Added block - full styling with green left border */}
        {newString && (
          <div className="flex gap-2 items-start">
            <span className="select-none bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 font-bold w-6 h-6 flex items-center justify-center rounded flex-shrink-0 mt-4">
              +
            </span>
            <div className="flex-1">
              {isMarkdown ? (
                <div className="border-l-2 border-success/50 pl-3 ml-1.5 md-content">
                  <MarkdownRenderer content={newString} />
                </div>
              ) : (
                <CodeBlock code={newString} language={language} collapsible={false} diffType="added" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Write file renderer
function WriteRenderer({ input }) {
  const filePath = input?.file_path || 'Unknown file'
  const content = input?.content || ''
  const language = getLanguageFromPath(filePath)
  const isMarkdown = isMarkdownFile(filePath)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <InlineCode language="text" className="text-xs text-text-muted">
          {filePath}
        </InlineCode>
        <span className="text-xs text-success">New file</span>
      </div>
      {content && (
        isMarkdown ? (
          <div className="border-l-2 border-accent/50 pl-3 ml-1.5 md-content">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <div className="max-h-60 overflow-auto">
            <CodeBlock code={content} language={language} />
          </div>
        )
      )}
    </div>
  )
}

// Bash command renderer
function BashRenderer({ input, result, monoClass }) {
  const command = input?.command || ''
  const output = result?.content || ''

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <InlineCode language="bash" className="text-sm flex-1">
          $ {command}
        </InlineCode>
        <CopyButton text={command} />
      </div>
      {output && (
        <pre className={`text-xs bg-surface p-3 rounded overflow-auto max-h-60 ${monoClass}`}>
          {output}
        </pre>
      )}
    </div>
  )
}

// Glob/Grep renderer
function SearchRenderer({ toolName, input, result, monoClass }) {
  const pattern = input?.pattern || ''
  const path = input?.path || '.'
  const content = result?.content || ''

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-text-muted">{toolName === 'Glob' ? 'Pattern:' : 'Search:'}</span>
        <InlineCode language="text">{pattern}</InlineCode>
        <span className="text-text-muted">in</span>
        <InlineCode language="text">{path}</InlineCode>
      </div>
      {content && (
        <pre className={`text-xs bg-surface p-3 rounded overflow-auto max-h-40 ${monoClass}`}>
          {content}
        </pre>
      )}
    </div>
  )
}

// TodoWrite renderer
function TodoRenderer({ input }) {
  const todos = input?.todos || []

  return (
    <div className="space-y-1">
      {todos.map((todo, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-2 text-sm p-2 rounded ${
            todo.status === 'completed'
              ? 'bg-success/10 text-success'
              : todo.status === 'in_progress'
              ? 'bg-accent/10 text-accent'
              : 'bg-surface text-text-muted'
          }`}
        >
          <span className="w-5 h-5 flex items-center justify-center">
            {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '○'}
          </span>
          <span>{todo.content}</span>
        </div>
      ))}
    </div>
  )
}

// Task/Agent renderer
function TaskRenderer({ input }) {
  const description = input?.description || 'Spawning agent...'
  const subagentType = input?.subagent_type || 'general-purpose'

  return (
    <div className="flex items-center gap-2 text-sm">
      <Sparkles size={14} className="text-accent" />
      <span className="text-text-muted">Agent ({subagentType}):</span>
      <span>{description}</span>
    </div>
  )
}

// AskUserQuestion renderer
function AskUserQuestionRenderer({ input, result }) {
  const questions = input?.questions || []
  const hasError = typeof result === 'string' && result.includes('Error')

  return (
    <div className="space-y-3">
      {hasError && (
        <div className="text-xs text-warning bg-warning/10 px-2 py-1 rounded inline-flex items-center gap-1">
          <span>💭</span>
          <span>Sub-agent question (answer above to respond)</span>
        </div>
      )}
      {questions.map((q, i) => (
        <div key={i} className="space-y-1">
          {q.header && (
            <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
              {q.header}
            </span>
          )}
          <p className="text-sm font-medium">{q.question}</p>
          <div className="flex flex-wrap gap-1">
            {q.options?.map((opt, j) => (
              <span key={j} className="text-xs bg-surface px-2 py-1 rounded">
                {opt.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ExitPlanMode renderer - just shows status, plan content is already visible from Write tool
// Approve/reject buttons are shown separately at the end of the message
function ExitPlanModeRenderer({ input }) {
  return (
    <div className="text-sm text-success flex items-center gap-2">
      <CheckCircle size={14} />
      <span>Plan ready for approval</span>
    </div>
  )
}

// Generic fallback renderer
function GenericRenderer({ toolName, input, result }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-text-muted">Input:</div>
      <pre className="text-xs bg-surface p-2 rounded overflow-auto max-h-40">
        {JSON.stringify(input, null, 2)}
      </pre>
      {result && (
        <>
          <div className="text-xs text-text-muted">Result:</div>
          <pre className="text-xs bg-surface p-2 rounded overflow-auto max-h-40">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}

// Helper to detect language from file path
function getLanguageFromPath(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    sh: 'bash',
    bash: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
  }
  return langMap[ext] || 'text'
}

// Format elapsed time in a human-readable way
function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

// Main ToolCallView component
export default function ToolCallView({ toolUse, toolResult, onCancel, onApprovePlan, onRejectPlan, planReady }) {
  const toolName = toolUse?.name || 'Unknown'
  // Auto-expand ExitPlanMode to show plan content
  const [isExpanded, setIsExpanded] = useState(toolName === 'ExitPlanMode')
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(Date.now())
  const { globalMode } = useCodeDisplayMode()
  const monoClass = globalMode === 'classic' ? 'font-mono' : ''
  const input = toolUse?.input || {}
  const result = toolResult?.content || toolResult
  const isLoading = !toolResult

  // Track elapsed time for loading tools
  useEffect(() => {
    if (!isLoading) {
      setElapsed(0)
      return
    }

    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [isLoading])

  // Don't render TodoWrite - we have a dedicated panel for that
  if (toolName === 'TodoWrite') return null

  const Icon = TOOL_ICONS[toolName] || Terminal
  const label = getToolLabel(toolName)
  const summary = getToolSummary(toolName, input)

  // Render the appropriate component based on tool type
  const renderContent = () => {
    switch (toolName) {
      case 'Read':
        return <ReadRenderer input={input} result={result} />
      case 'Edit':
        return <EditRenderer input={input} />
      case 'Write':
        return <WriteRenderer input={input} />
      case 'Bash':
        return <BashRenderer input={input} result={result} monoClass={monoClass} />
      case 'Glob':
      case 'Grep':
        return <SearchRenderer toolName={toolName} input={input} result={result} monoClass={monoClass} />
      case 'TodoWrite':
        return <TodoRenderer input={input} />
      case 'Task':
        return <TaskRenderer input={input} />
      case 'AskUserQuestion':
        return <AskUserQuestionRenderer input={input} result={result} />
      case 'ExitPlanMode':
        return <ExitPlanModeRenderer input={input} />
      default:
        return <GenericRenderer toolName={toolName} input={input} result={result} />
    }
  }

  return (
    <div className="relative">
      {/* Collapsed header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 py-1.5 text-left text-sm text-text-muted
                   hover:text-text transition-colors group"
      >
        <span className="text-text-muted/50 group-hover:text-text-muted transition-colors">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {label && <span className="text-text-muted">{label}</span>}
        <span className="text-text truncate">{summary}</span>

        {/* Loading indicator with elapsed time */}
        {isLoading && (
          <div className="flex items-center gap-2 ml-auto">
            {/* Elapsed time - show after 5s */}
            {elapsed >= 5 && (
              <span className={`text-xs ${elapsed >= 120 ? 'text-warning' : elapsed >= 30 ? 'text-text-muted' : 'text-text-muted/50'}`}>
                {elapsed >= 120 ? 'Still working... ' : elapsed >= 30 ? 'Working... ' : ''}
                {formatElapsed(elapsed)}
              </span>
            )}
            {/* Shimmer bar */}
            <div className="w-16 h-1 rounded-full overflow-hidden bg-border/30">
              <div className="h-full w-1/3 bg-accent/50 rounded-full animate-shimmer" />
            </div>
          </div>
        )}

        {/* Cancelled indicator */}
        {!isLoading && result === '(cancelled)' && (
          <span className="text-xs text-text-muted ml-auto">cancelled</span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 mb-2">
          {renderContent()}
        </div>
      )}
    </div>
  )
}
