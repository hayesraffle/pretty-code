import { CheckCircle } from 'lucide-react'

export default function PlanModeBar({ planFile, planReady, onApprovePlan }) {
  // Only show bar when plan is ready for approval
  if (!planReady) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-success/10 border-success/30">
      <CheckCircle size={16} className="text-success" />
      <span className="text-sm text-text">
        Plan ready for approval
        {planFile && (
          <code className="ml-2 text-text-muted text-xs">{planFile}</code>
        )}
      </span>
      <div className="flex-1" />
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
  )
}
