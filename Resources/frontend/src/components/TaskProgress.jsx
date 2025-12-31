import { Loader2, Circle } from 'lucide-react'

export default function TaskProgress({ todos, isBlocked }) {
  if (!todos || todos.length === 0) return null

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const inProgressTask = todos.find((t) => t.status === 'in_progress')

  // Don't show if all tasks are completed
  if (completedCount === todos.length) return null

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
      {isBlocked ? (
        <Circle size={10} className="text-warning" />
      ) : inProgressTask ? (
        <Loader2 size={10} className="text-accent animate-spin" />
      ) : (
        <Circle size={10} />
      )}
      <span className="tabular-nums">{completedCount}/{todos.length}</span>
      {inProgressTask && (
        <span className={`truncate max-w-[180px] ${isBlocked ? 'text-warning' : ''}`}>
          {isBlocked ? 'Waiting' : inProgressTask.activeForm || inProgressTask.content}
        </span>
      )}
    </div>
  )
}
