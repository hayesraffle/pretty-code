import { FileText, CheckCircle } from 'lucide-react'

export default function PlanModeBar({ planFile, onExitPlanMode }) {
  if (!planFile) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-warning/10 border-b border-warning/30">
      <FileText size={16} className="text-warning" />
      <span className="text-sm text-text">
        Plan mode active: <code className="text-warning">{planFile}</code>
      </span>
      <div className="flex-1" />
      <button
        onClick={onExitPlanMode}
        className="flex items-center gap-1.5 px-3 py-1 text-sm rounded-lg
                   bg-success text-white hover:bg-success/90 transition-colors"
      >
        <CheckCircle size={14} />
        Approve Plan
      </button>
    </div>
  )
}
