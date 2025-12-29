import { useState, useEffect, useRef, memo } from 'react'
import { Send, Image, FileText } from 'lucide-react'

function InputBox({ onSend, disabled, value = '', onChange, onHistoryNavigate, onFilesDropped }) {
  const textareaRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [attachedImages, setAttachedImages] = useState([])

  // Focus textarea when value changes from quick action
  useEffect(() => {
    if (value && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = value.length
      textareaRef.current.selectionEnd = value.length
    }
  }, [value])

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items || [])
    const files = Array.from(e.dataTransfer.files || [])
    const text = e.dataTransfer.getData('text/plain')

    // Handle dropped text
    if (text) {
      onChange?.(value + (value ? ' ' : '') + text)
      return
    }

    // Handle dropped files
    const paths = []
    const images = []

    for (const file of files) {
      // Check if it's an image
      if (file.type.startsWith('image/')) {
        // Convert to base64 for preview and sending
        const reader = new FileReader()
        reader.onload = (event) => {
          images.push({
            name: file.name,
            type: file.type,
            data: event.target.result,
          })
          setAttachedImages(prev => [...prev, {
            name: file.name,
            type: file.type,
            data: event.target.result,
          }])
        }
        reader.readAsDataURL(file)
      } else if (file.path) {
        // Electron/file system path
        paths.push(file.path)
      } else {
        // Regular file - read as text if possible
        if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|js|jsx|ts|tsx|py|json|css|html)$/i)) {
          const text = await file.text()
          onChange?.(value + (value ? '\n\n' : '') + `\`\`\`\n${text}\n\`\`\``)
        } else {
          paths.push(file.name)
        }
      }
    }

    // Add file paths to input
    if (paths.length > 0) {
      const pathStr = paths.join(' ')
      onChange?.(value + (value ? ' ' : '') + pathStr)
      onFilesDropped?.(paths)
    }
  }

  const removeImage = (index) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if ((value.trim() || attachedImages.length > 0) && !disabled) {
      // Include images in the message if any
      if (attachedImages.length > 0) {
        onSend(value.trim(), attachedImages)
        setAttachedImages([])
      } else {
        onSend(value.trim())
      }
      onChange?.('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    } else if (e.key === 'ArrowUp' && onHistoryNavigate) {
      const textarea = textareaRef.current
      if (textarea && (textarea.selectionStart === 0 || !value.includes('\n'))) {
        e.preventDefault()
        onHistoryNavigate('up')
      }
    } else if (e.key === 'ArrowDown' && onHistoryNavigate) {
      const textarea = textareaRef.current
      if (textarea && (textarea.selectionEnd === value.length || !value.includes('\n'))) {
        e.preventDefault()
        onHistoryNavigate('down')
      }
    }
  }

  const handleChange = (e) => {
    onChange?.(e.target.value)
  }

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-shrink-0 p-4 bg-background"
    >
      <div className="max-w-3xl mx-auto">
        {/* Attached images preview */}
        {attachedImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachedImages.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.data}
                  alt={img.name}
                  className="h-16 w-16 object-cover rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white
                           flex items-center justify-center text-xs opacity-0 group-hover:opacity-100
                           transition-opacity"
                >
                  ×
                </button>
                <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center
                               bg-black/50 text-white truncate px-1 rounded-b-lg">
                  {img.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Input container - Google AI Mode style */}
        <div className={`relative flex items-end gap-2 p-1.5 rounded-[28px] bg-surface border
                        transition-all duration-200 hover:border-text-muted focus-within:border-accent
                        ${isDragging ? 'border-accent border-dashed bg-accent/5' : 'border-border'}`}>
          {/* Drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[28px]
                          bg-accent/10 pointer-events-none z-10">
              <span className="text-accent text-sm font-medium">Drop files, images, or text</span>
            </div>
          )}
          <div className="flex-1 pl-4">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              disabled={disabled}
              rows={1}
              className="w-full py-2.5 bg-transparent text-[16px] leading-[24px]
                         focus:outline-none resize-none text-text
                         placeholder:text-text-placeholder
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '160px' }}
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
            />
          </div>

          {/* Send button - circular CTA */}
          <button
            type="submit"
            disabled={(!value.trim() && attachedImages.length === 0) || disabled}
            className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center
                       bg-cta text-cta-text
                       hover:bg-cta-hover active:scale-95
                       disabled:opacity-38 disabled:cursor-not-allowed disabled:active:scale-100
                       transition-all duration-200"
          >
            <Send size={18} />
          </button>
        </div>

        {/* Hints */}
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-text-muted">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface text-[10px] font-mono">Enter</kbd>
            {' '}to send
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface text-[10px] font-mono">Shift+Enter</kbd>
            {' '}for new line
          </span>
          <span className="opacity-60">
            Drop files or images
          </span>
        </div>
      </div>
    </form>
  )
}

export default memo(InputBox)
