import { Shield } from 'lucide-react'

export default function PermissionProgress({
  pendingPermissions,
  onScrollToPermission,
}) {
  if (!pendingPermissions || pendingPermissions.length === 0) return null

  const handleClick = () => {
    // Scroll to first pending permission's tool call
    const firstPermission = pendingPermissions[0]
    onScrollToPermission?.(firstPermission.id)
  }

  return (
    <button
      onClick={handleClick}
      className="relative flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium
                 text-warning hover:text-warning/90 cursor-pointer overflow-hidden"
    >
      {/* Animated background */}
      <span className="absolute inset-0 rounded-full bg-warning/20 animate-[bg-pulse_2s_ease-in-out_infinite]" />
      <Shield size={10} className="relative z-10" />
      <span className="relative z-10">{pendingPermissions.length} pending</span>
      <style>{`
        @keyframes bg-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </button>
  )
}
