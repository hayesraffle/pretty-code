import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react'

export default function QuestionPrompt({ questions, onSubmit }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [animationPhase, setAnimationPhase] = useState('idle') // idle, exit, enter
  const [focusedOption, setFocusedOption] = useState(0) // keyboard navigation within options

  const currentQuestion = questions[currentIndex]
  const isLastQuestion = currentIndex === questions.length - 1
  const selectedAnswer = answers[`question_${currentIndex}`]
  const otherValue = answers[`question_${currentIndex}_other`] || ''
  const hasAnswer = selectedAnswer || otherValue

  // Check if all questions are answered
  const isComplete = questions.every((q, i) => {
    const key = `question_${i}`
    const otherKey = `${key}_other`
    return answers[key] || answers[otherKey]
  })

  const animateTransition = useCallback((newIndex) => {
    // Simple crossfade
    setAnimationPhase('exit')
    setTimeout(() => {
      setCurrentIndex(newIndex)
      setAnimationPhase('enter')
      setTimeout(() => setAnimationPhase('idle'), 150)
    }, 150)
  }, [])

  const goBack = useCallback(() => {
    if (currentIndex > 0 && animationPhase === 'idle') {
      animateTransition(currentIndex - 1)
    }
  }, [currentIndex, animationPhase, animateTransition])

  const advance = useCallback(() => {
    if (animationPhase !== 'idle') return

    if (isLastQuestion) {
      // Submit all answers
      const response = {}
      questions.forEach((q, i) => {
        const key = `question_${i}`
        const otherKey = `${key}_other`
        if (answers[otherKey]) {
          response[q.header || q.question] = answers[otherKey]
        } else if (answers[key]) {
          const val = answers[key]
          response[q.header || q.question] = Array.isArray(val) ? val.join(', ') : val
        }
      })
      onSubmit?.(response)
    } else {
      animateTransition(currentIndex + 1)
    }
  }, [isLastQuestion, questions, answers, onSubmit, animationPhase, currentIndex, animateTransition])

  const handleOptionClick = (optionLabel) => {
    if (animationPhase !== 'idle') return

    const key = `question_${currentIndex}`

    if (currentQuestion.multiSelect) {
      // Toggle selection for multi-select
      setAnswers(prev => {
        const current = prev[key] || []
        if (current.includes(optionLabel)) {
          return { ...prev, [key]: current.filter(l => l !== optionLabel) }
        } else {
          return { ...prev, [key]: [...current, optionLabel] }
        }
      })
    } else {
      // Single select - set and auto-advance
      setAnswers(prev => ({ ...prev, [key]: optionLabel, [`${key}_other`]: '' }))
      setTimeout(() => advance(), 50)
    }
  }

  const handleOtherChange = (value) => {
    const key = `question_${currentIndex}`
    setAnswers(prev => {
      const update = {
        ...prev,
        [`${key}_other`]: value,
      }
      // Only clear selected option for single-select (not multi-select)
      if (!currentQuestion.multiSelect) {
        update[key] = undefined
      }
      return update
    })
  }

  const handleOtherSubmit = (e) => {
    e.preventDefault()
    if (otherValue.trim()) {
      advance()
    }
  }

  // Reset focused option when question changes
  useEffect(() => {
    setFocusedOption(0)
  }, [currentIndex])

  // Total options including "Other"
  const totalOptions = (currentQuestion.options?.length || 0) + 1

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't capture if typing in input or animating
      if (e.target.tagName === 'INPUT' || animationPhase !== 'idle') return

      // Number keys 1-9 to select options
      if (e.key >= '1' && e.key <= '9') {
        const optionIndex = parseInt(e.key) - 1
        if (currentQuestion.options && optionIndex < currentQuestion.options.length) {
          handleOptionClick(currentQuestion.options[optionIndex].label)
        }
      }

      // Up/Down to navigate options
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedOption(prev => (prev - 1 + totalOptions) % totalOptions)
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedOption(prev => (prev + 1) % totalOptions)
      }

      // Enter to select focused option or advance
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const optionsCount = currentQuestion.options?.length || 0
        if (focusedOption < optionsCount) {
          // Select the focused option
          handleOptionClick(currentQuestion.options[focusedOption].label)
        } else if (currentQuestion.multiSelect && hasAnswer) {
          // "Other" is focused or multi-select with answers - advance
          advance()
        }
      }

      // Left/Right to navigate between questions
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        goBack()
      }
      if (e.key === 'ArrowRight' && hasAnswer) {
        advance()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentQuestion, hasAnswer, advance, goBack, currentIndex, animationPhase, focusedOption, totalOptions])

  const isOptionSelected = (label) => {
    if (currentQuestion.multiSelect) {
      return (selectedAnswer || []).includes(label)
    }
    return selectedAnswer === label
  }

  return (
    <div className="py-4 animate-fade-in">
      {/* Question card */}
      <div
        className={`transition-opacity duration-150 ${
          animationPhase === 'exit' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {/* Question header badge */}
        {currentQuestion.header && (
          <div className="inline-block text-[11px] font-medium text-accent uppercase tracking-wider mb-2">
            {currentQuestion.header}
          </div>
        )}

        {/* Question text */}
        <p className="text-[15px] text-text mb-4 leading-relaxed">
          {currentQuestion.question}
          {currentQuestion.multiSelect && (
            <span className="text-text-muted text-sm ml-2">(select multiple)</span>
          )}
        </p>

        {/* Options grid */}
        <div className="space-y-1.5">
          {currentQuestion.options?.map((option, i) => {
            const selected = isOptionSelected(option.label)
            const focused = focusedOption === i
            return (
              <button
                key={i}
                onClick={() => handleOptionClick(option.label)}
                onMouseEnter={() => setFocusedOption(i)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-150
                           flex items-center justify-between group
                           ${selected
                             ? 'bg-accent/15 text-accent'
                             : focused
                             ? 'bg-text/[0.06]'
                             : 'bg-surface hover:bg-text/[0.06]'
                           }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Keyboard hint */}
                  <span className={`text-xs font-mono w-4 flex-shrink-0 ${
                    selected ? 'text-accent/70' : 'text-text-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <span className={`text-sm ${selected ? 'font-medium' : ''}`}>
                      {option.label}
                    </span>
                    {option.description && (
                      <span className={`text-xs ml-2 ${
                        selected ? 'text-accent/70' : 'text-text-muted'
                      }`}>
                        — {option.description}
                      </span>
                    )}
                  </div>
                </div>
                {selected && (
                  <Check size={16} className="flex-shrink-0" />
                )}
              </button>
            )
          })}

          {/* Other option - inline input */}
          <div
            onMouseEnter={() => setFocusedOption(currentQuestion.options?.length || 0)}
            className={`rounded-lg transition-colors duration-150 ${
              otherValue
                ? 'bg-accent/15'
                : focusedOption === (currentQuestion.options?.length || 0)
                ? 'bg-text/[0.06]'
                : 'bg-surface'
            }`}
          >
            <form onSubmit={handleOtherSubmit} className="flex items-center">
              <span className={`text-xs font-mono w-4 ml-3 flex-shrink-0 ${
                otherValue ? 'text-accent/70' : 'text-text-muted'
              }`}>
                {(currentQuestion.options?.length || 0) + 1}
              </span>
              <input
                type="text"
                placeholder="Other..."
                value={otherValue}
                onChange={(e) => handleOtherChange(e.target.value)}
                onFocus={() => setFocusedOption(currentQuestion.options?.length || 0)}
                className={`flex-1 bg-transparent text-sm py-2.5 px-3 focus:outline-none
                           ${otherValue ? 'text-accent placeholder:text-accent/50' : 'text-text placeholder:text-text-muted'}`}
              />
              {otherValue && (
                <button
                  type="submit"
                  className="px-3 py-2 text-accent/70 hover:text-accent"
                >
                  <CornerDownLeft size={14} />
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Ok button for multi-select */}
        {currentQuestion.multiSelect && hasAnswer && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={advance}
              className="flex items-center gap-2 px-4 py-2 rounded-lg
                       bg-accent text-white hover:bg-accent/90
                       text-sm font-medium transition-colors"
            >
              {isLastQuestion ? 'Submit' : 'Ok'}
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Navigation: < 1 of 3 > */}
      <div className="mt-4 flex items-center justify-center gap-1 text-xs text-text-muted">
        <button
          onClick={goBack}
          disabled={currentIndex === 0 || animationPhase !== 'idle'}
          className={`p-1 rounded transition-colors ${
            currentIndex > 0
              ? 'hover:text-text hover:bg-surface cursor-pointer'
              : 'opacity-30 cursor-default'
          }`}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="tabular-nums px-1">{currentIndex + 1} of {questions.length}</span>
        <button
          onClick={() => hasAnswer && advance()}
          disabled={!hasAnswer || animationPhase !== 'idle'}
          className={`p-1 rounded transition-colors ${
            hasAnswer
              ? 'hover:text-text hover:bg-surface cursor-pointer'
              : 'opacity-30 cursor-default'
          }`}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
