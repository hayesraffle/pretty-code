import { useState, useRef, useEffect } from 'react'
import { Download, FileJson, FileText } from 'lucide-react'
import { exportConversation } from '../utils/exportConversation'

export default function ExportMenu({ messages }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExport = (format) => {
    exportConversation(messages, format)
    setIsOpen(false)
  }

  if (messages.length === 0) return null

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                   text-text-muted hover:text-text hover:bg-surface
                   transition-colors text-sm"
      >
        <Download size={14} />
        Export
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 py-1 rounded-lg
                        bg-background border border-border shadow-lg z-50">
          <button
            onClick={() => handleExport('markdown')}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                       hover:bg-surface transition-colors"
          >
            <FileText size={16} className="text-text-muted" />
            <div>
              <div className="font-medium">Markdown</div>
              <div className="text-xs text-text-muted">Human-readable format</div>
            </div>
          </button>
          <button
            onClick={() => handleExport('json')}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                       hover:bg-surface transition-colors"
          >
            <FileJson size={16} className="text-text-muted" />
            <div>
              <div className="font-medium">JSON</div>
              <div className="text-xs text-text-muted">For importing later</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
