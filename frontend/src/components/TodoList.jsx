import { useState } from 'react'
import { CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp, ListTodo, X } from 'lucide-react'

const STATUS_ICONS = {
  pending: Circle,
  in_progress: Loader2,
  completed: CheckCircle2,
}

const STATUS_COLORS = {
  pending: 'text-text-muted',
  in_progress: 'text-accent',
  completed: 'text-success',
}

export default function TodoList({ todos, isCollapsed, onToggle, onClose }) {
  if (!todos || todos.length === 0) return null

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length
  const progress = Math.round((completedCount / todos.length) * 100)

  return (
    <div className="fixed top-20 right-4 w-72 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-accent/5 border-b border-border cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <ListTodo size={16} className="text-accent" />
          <span className="font-medium text-sm">Tasks</span>
          <span className="text-xs text-text-muted">
            {completedCount}/{todos.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isCollapsed ? (
            <ChevronDown size={16} className="text-text-muted" />
          ) : (
            <ChevronUp size={16} className="text-text-muted" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose?.()
            }}
            className="p-0.5 hover:bg-text/10 rounded"
          >
            <X size={14} className="text-text-muted" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Todo items */}
      {!isCollapsed && (
        <div className="max-h-64 overflow-y-auto">
          {todos.map((todo, index) => {
            const Icon = STATUS_ICONS[todo.status] || Circle
            const colorClass = STATUS_COLORS[todo.status] || 'text-text-muted'
            const isActive = todo.status === 'in_progress'

            return (
              <div
                key={index}
                className={`flex items-start gap-2 px-3 py-2 border-b border-border/50 last:border-0 ${
                  isActive ? 'bg-accent/5' : ''
                }`}
              >
                <Icon
                  size={16}
                  className={`${colorClass} flex-shrink-0 mt-0.5 ${
                    isActive ? 'animate-spin' : ''
                  }`}
                />
                <span
                  className={`text-sm ${
                    todo.status === 'completed'
                      ? 'text-text-muted line-through'
                      : 'text-text'
                  }`}
                >
                  {isActive ? todo.activeForm : todo.content}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Status summary when collapsed */}
      {isCollapsed && inProgressCount > 0 && (
        <div className="px-3 py-2 text-xs text-text-muted">
          <Loader2 size={12} className="inline mr-1 animate-spin" />
          {todos.find((t) => t.status === 'in_progress')?.activeForm || 'Working...'}
        </div>
      )}
    </div>
  )
}
