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
      className="flex items-center gap-1.5 text-[10px] text-warning
                 hover:text-warning/80 cursor-pointer animate-pulse"
    >
      <Shield size={10} />
      <span>{pendingPermissions.length} pending</span>
    </button>
  )
}
