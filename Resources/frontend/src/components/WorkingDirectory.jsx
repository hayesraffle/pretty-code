import { Folder } from 'lucide-react'

export default function WorkingDirectory({ path }) {
  // Extract just the last 2-3 parts of the path for display
  const displayPath = path
    ? path.split('/').slice(-2).join('/')
    : 'Current directory'

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <Folder size={12} />
      <span className="max-w-[150px] truncate" title={path}>
        {displayPath}
      </span>
    </div>
  )
}
