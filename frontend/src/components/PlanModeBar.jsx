import { CheckCircle, X } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'

export default function PlanModeBar({ planFile, planReady, planContent, onApprovePlan, onRejectPlan }) {
  // Only show bar when plan is ready for approval
  if (!planReady) return null

  return (
    <div className="border-b bg-success/10 border-success/30">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2">
        <CheckCircle size={16} className="text-success" />
        <span className="text-sm font-medium text-text">
          Plan ready for approval
          {planFile && (
            <code className="ml-2 text-text-muted text-xs">{planFile}</code>
          )}
        </span>
        <div className="flex-1" />
        <button
          onClick={onRejectPlan}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                     bg-background border border-border text-text-muted hover:text-text
                     hover:border-text/20 transition-colors"
        >
          <X size={14} />
          Reject
        </button>
        <button
          onClick={onApprovePlan}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg
                     bg-success text-white hover:bg-success/90 transition-colors
                     shadow-sm hover:shadow-md"
        >
          <CheckCircle size={14} />
          Approve & Execute
        </button>
      </div>

      {/* Plan content (collapsible markdown) */}
      {planContent && (
        <div className="px-4 pb-3 max-h-64 overflow-y-auto border-t border-success/20 mt-2 pt-2">
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={planContent} />
          </div>
        </div>
      )}
    </div>
  )
}
