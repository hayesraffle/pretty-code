import { useState, useCallback } from 'react'

const MAX_HISTORY = 50

export function useCommandHistory() {
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [tempInput, setTempInput] = useState('')

  const addToHistory = useCallback((command) => {
    if (!command.trim()) return

    setHistory((prev) => {
      // Don't add duplicates of the last command
      if (prev[0] === command) return prev
      // Keep history limited
      const newHistory = [command, ...prev.slice(0, MAX_HISTORY - 1)]
      return newHistory
    })
    setHistoryIndex(-1)
    setTempInput('')
  }, [])

  const navigateHistory = useCallback((direction, currentInput) => {
    if (history.length === 0) return null

    let newIndex = historyIndex

    if (direction === 'up') {
      if (historyIndex === -1) {
        // Save current input before navigating
        setTempInput(currentInput)
        newIndex = 0
      } else if (historyIndex < history.length - 1) {
        newIndex = historyIndex + 1
      }
    } else if (direction === 'down') {
      if (historyIndex > 0) {
        newIndex = historyIndex - 1
      } else if (historyIndex === 0) {
        // Return to the temp input
        setHistoryIndex(-1)
        return tempInput
      }
    }

    if (newIndex !== historyIndex && newIndex >= 0 && newIndex < history.length) {
      setHistoryIndex(newIndex)
      return history[newIndex]
    }

    return null
  }, [history, historyIndex, tempInput])

  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1)
    setTempInput('')
  }, [])

  return {
    addToHistory,
    navigateHistory,
    resetNavigation,
    historyLength: history.length,
  }
}
