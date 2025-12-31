import { useState, useEffect, useContext } from 'react'
import {
  FileEdit,
  Terminal,
  Eye,
  Search,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { CollapseContext } from './Message'

const BLOCK_TYPES = {
  file_edit: {
    icon: FileEdit,
    label: 'File Edit',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  bash: {
    icon: Terminal,
    label: 'Command',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  read: {
    icon: Eye,
    label: 'Read File',
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
  },
  search: {
    icon: Search,
    label: 'Search',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
  },
  directory: {
    icon: FolderOpen,
    label: 'Directory',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  success: {
    icon: CheckCircle,
    label: 'Success',
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
}

export default function SemanticBlock({ type, title, children, defaultCollapsed = false }) {
  const { allCollapsed } = useContext(CollapseContext) || {}
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const config = BLOCK_TYPES[type] || BLOCK_TYPES.file_edit
  const Icon = config.icon

  // Sync with parent collapse state
  useEffect(() => {
    if (allCollapsed !== undefined) {
      setIsCollapsed(allCollapsed)
    }
  }, [allCollapsed])

  return (
    <div className={`my-3 rounded-lg border ${config.border} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`w-full flex items-center gap-2 px-3 py-2 ${config.bg}
                   hover:opacity-80 transition-opacity text-left`}
      >
        {isCollapsed ? (
          <ChevronRight size={14} className="text-text-muted" />
        ) : (
          <ChevronDown size={14} className="text-text-muted" />
        )}
        <Icon size={14} className={config.color} />
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        {title && (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-xs text-text-muted truncate">{title}</span>
          </>
        )}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-3 py-2 text-sm bg-background">
          {children}
        </div>
      )}
    </div>
  )
}

// Helper to detect semantic blocks in content
export function detectSemanticType(text) {
  const lower = text.toLowerCase()

  if (lower.includes('edit') && (lower.includes('file') || lower.includes('.jsx') || lower.includes('.js') || lower.includes('.py'))) {
    return 'file_edit'
  }
  if (lower.includes('running') || lower.includes('command') || lower.includes('bash') || lower.includes('npm ') || lower.includes('git ')) {
    return 'bash'
  }
  if (lower.includes('reading') || lower.includes('read file')) {
    return 'read'
  }
  if (lower.includes('searching') || lower.includes('grep') || lower.includes('glob')) {
    return 'search'
  }
  if (lower.includes('created') || lower.includes('success') || lower.includes('complete')) {
    return 'success'
  }
  if (lower.includes('error') || lower.includes('failed') || lower.includes('not found')) {
    return 'error'
  }

  return null
}
