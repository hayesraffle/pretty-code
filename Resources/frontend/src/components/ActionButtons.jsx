import { useState } from 'react'

/**
 * Renders action buttons from Claude's ui-action output
 * When clicked, sends the button's value as a user message
 */
export default function ActionButtons({ buttons, onSend, disabled }) {
  const [clicked, setClicked] = useState(null)

  if (!buttons || buttons.length === 0) return null

  const handleClick = (button) => {
    if (disabled || clicked) return
    setClicked(button.label)
    onSend?.(button.value)
  }

  // If already clicked, show which button was selected
  if (clicked) {
    return (
      <div className="flex items-center gap-2 mt-3">
        <span className="text-sm text-text-muted">
          Selected: <span className="text-text font-medium">{clicked}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {buttons.map((button, i) => (
        <button
          key={i}
          onClick={() => handleClick(button)}
          disabled={disabled}
          className="px-4 py-2 text-sm font-medium rounded-full
                     bg-surface border border-border text-text
                     hover:bg-surface-hover hover:border-text/20
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {button.label}
        </button>
      ))}
    </div>
  )
}
