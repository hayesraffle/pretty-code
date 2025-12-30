import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, FolderOpen, Check, Code } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'

const PERMISSION_MODES = [
  {
    value: 'plan',
    label: 'Plan',
    description: 'Plan before executing',
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 dark:bg-purple-950 dark:hover:bg-purple-900 dark:border-purple-800',
    textColor: 'text-purple-700 dark:text-purple-300',
    dotColor: 'bg-purple-500',
  },
  {
    value: 'bypassPermissions',
    label: 'Autopilot',
    description: 'Auto-approve all tools',
    color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:border-emerald-800',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
  },
  {
    value: 'acceptEdits',
    label: 'Review some',
    description: 'Ask for writes only',
    color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 dark:border-amber-800',
    textColor: 'text-amber-700 dark:text-amber-300',
    dotColor: 'bg-amber-500',
  },
  {
    value: 'default',
    label: 'Review all',
    description: 'Ask for every tool',
    color: 'bg-red-50 hover:bg-red-100 border-red-200 dark:bg-red-950 dark:hover:bg-red-900 dark:border-red-800',
    textColor: 'text-red-700 dark:text-red-300',
    dotColor: 'bg-red-500',
  },
]

export default function SettingsPanel({ isOpen, onClose, workingDir, onChangeWorkingDir, showCodePreview, onToggleCodePreview }) {
  const { permissionMode, setPermissionMode, showToolDetails, setShowToolDetails } = useSettings()
  const [localWorkingDir, setLocalWorkingDir] = useState(workingDir || '')

  useEffect(() => {
    setLocalWorkingDir(workingDir || '')
  }, [workingDir])

  if (!isOpen) return null

  const handleWorkingDirChange = () => {
    if (localWorkingDir && localWorkingDir !== workingDir) {
      onChangeWorkingDir?.(localWorkingDir)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-72 bg-background z-50 shadow-lg animate-slide-left overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-background">
          <span className="text-sm font-medium text-text-muted">Settings</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-text/5 text-text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-5">
          {/* Permission Mode */}
          <div>
            <div className="text-xs text-text-muted mb-2">Permission Mode</div>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSION_MODES.map((mode) => {
                const isSelected = permissionMode === mode.value
                return (
                  <button
                    key={mode.value}
                    onClick={() => setPermissionMode(mode.value)}
                    className={`relative text-left px-2.5 py-2 rounded-lg border transition-all ${
                      isSelected
                        ? mode.color
                        : 'border-transparent hover:bg-text/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${mode.dotColor}`} />
                      <span className={`text-xs font-medium ${isSelected ? mode.textColor : 'text-text'}`}>
                        {mode.label}
                      </span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ml-3 ${isSelected ? mode.textColor + ' opacity-70' : 'text-text-muted'}`}>
                      {mode.description}
                    </div>
                    {isSelected && (
                      <Check size={12} className={`absolute top-2 right-2 ${mode.textColor}`} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tool Details */}
          <div>
            <div className="text-xs text-text-muted mb-2">Tool Details</div>
            <button
              onClick={() => setShowToolDetails(!showToolDetails)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-text/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                {showToolDetails ? (
                  <Eye size={14} className="text-text-muted" />
                ) : (
                  <EyeOff size={14} className="text-text-muted" />
                )}
                <span className="text-xs">
                  {showToolDetails ? 'Expanded' : 'Collapsed'}
                </span>
              </div>
              <div className={`w-8 h-4 rounded-full transition-colors relative ${
                showToolDetails ? 'bg-accent' : 'bg-border'
              }`}>
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${
                  showToolDetails ? 'left-[18px]' : 'left-0.5'
                }`} />
              </div>
            </button>
          </div>

          {/* Working Directory */}
          <div>
            <div className="text-xs text-text-muted mb-2">Working Directory</div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={localWorkingDir}
                onChange={(e) => setLocalWorkingDir(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-text/5
                           focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <button
                onClick={handleWorkingDirChange}
                disabled={!localWorkingDir || localWorkingDir === workingDir}
                className="px-2 py-1.5 rounded-lg bg-text/5 hover:bg-text/10
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Apply"
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          {/* Code Preview */}
          <div>
            <div className="text-xs text-text-muted mb-2">Code Preview</div>
            <button
              onClick={onToggleCodePreview}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-text/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Code size={14} className="text-text-muted" />
                <span className="text-xs">
                  {showCodePreview ? 'Visible' : 'Hidden'}
                </span>
              </div>
              <div className={`w-8 h-4 rounded-full transition-colors relative ${
                showCodePreview ? 'bg-accent' : 'bg-border'
              }`}>
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${
                  showCodePreview ? 'left-[18px]' : 'left-0.5'
                }`} />
              </div>
            </button>
          </div>

          {/* Shortcuts */}
          <div>
            <div className="text-xs text-text-muted mb-2">Shortcuts</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between py-0.5">
                <span className="text-text-muted">Send</span>
                <kbd className="px-1.5 py-0.5 bg-text/5 rounded text-[10px]">Enter</kbd>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-text-muted">New line</span>
                <kbd className="px-1.5 py-0.5 bg-text/5 rounded text-[10px]">Shift+Enter</kbd>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-text-muted">History</span>
                <kbd className="px-1.5 py-0.5 bg-text/5 rounded text-[10px]">↑ ↓</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
