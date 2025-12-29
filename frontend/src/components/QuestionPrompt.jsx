import { useState } from 'react'
import { HelpCircle, Check, X } from 'lucide-react'

export default function QuestionPrompt({ questions, onSubmit, onCancel }) {
  const [answers, setAnswers] = useState({})

  const handleOptionToggle = (questionIndex, optionLabel, isMultiSelect) => {
    setAnswers((prev) => {
      const key = `question_${questionIndex}`
      if (isMultiSelect) {
        const current = prev[key] || []
        if (current.includes(optionLabel)) {
          return { ...prev, [key]: current.filter((l) => l !== optionLabel) }
        } else {
          return { ...prev, [key]: [...current, optionLabel] }
        }
      } else {
        return { ...prev, [key]: optionLabel }
      }
    })
  }

  const handleOtherInput = (questionIndex, value) => {
    setAnswers((prev) => ({
      ...prev,
      [`question_${questionIndex}_other`]: value,
    }))
  }

  const handleSubmit = () => {
    const response = {}
    questions.forEach((q, i) => {
      const key = `question_${i}`
      const otherKey = `${key}_other`
      if (answers[otherKey]) {
        response[q.header || key] = answers[otherKey]
      } else if (answers[key]) {
        response[q.header || key] = answers[key]
      }
    })
    onSubmit?.(response)
  }

  const answeredCount = questions.filter((q, i) => {
    const key = `question_${i}`
    const otherKey = `${key}_other`
    return answers[key] || answers[otherKey]
  }).length

  const isComplete = answeredCount === questions.length

  return (
    <div className="border border-accent/30 rounded-xl bg-accent/5 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <HelpCircle size={18} className="text-accent" />
          <span className="font-medium text-text">Claude needs your input</span>
        </div>
        <span className="text-xs text-text-muted">
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      {/* Scrollable questions area */}
      <div className="max-h-[50vh] overflow-y-auto p-4 space-y-4">
        {questions.map((question, qIndex) => {
          const selectedAnswer = answers[`question_${qIndex}`]
          const otherValue = answers[`question_${qIndex}_other`] || ''

          return (
            <div
              key={qIndex}
              className="border border-border rounded-lg p-4 bg-surface/50"
            >
              {/* Question header */}
              {question.header && (
                <div className="text-xs font-medium text-accent uppercase tracking-wide mb-1">
                  {question.header}
                </div>
              )}

              {/* Question text */}
              <p className="text-sm text-text mb-3">{question.question}</p>

              {/* Options */}
              <div className="space-y-2">
                {question.options?.map((option, oIndex) => {
                  const isSelected = question.multiSelect
                    ? (selectedAnswer || []).includes(option.label)
                    : selectedAnswer === option.label

                  return (
                    <div
                      key={oIndex}
                      onClick={() =>
                        handleOptionToggle(qIndex, option.label, question.multiSelect)
                      }
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50 hover:bg-accent/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Radio or Checkbox indicator */}
                        {question.multiSelect ? (
                          <div
                            className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-accent border-accent'
                                : 'border-border'
                            }`}
                          >
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                        ) : (
                          <div
                            className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'border-accent'
                                : 'border-border'
                            }`}
                          >
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-accent" />
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-text">
                            {option.label}
                          </span>
                          {option.description && (
                            <p className="text-xs text-text-muted mt-0.5">
                              {option.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Other option */}
                <div
                  className={`p-3 rounded-lg border transition-colors ${
                    otherValue
                      ? 'border-accent bg-accent/10'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {question.multiSelect ? (
                      <div
                        className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                          otherValue
                            ? 'bg-accent border-accent'
                            : 'border-border'
                        }`}
                      >
                        {otherValue && <Check size={10} className="text-white" />}
                      </div>
                    ) : (
                      <div
                        className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                          otherValue
                            ? 'border-accent'
                            : 'border-border'
                        }`}
                      >
                        {otherValue && (
                          <div className="w-2 h-2 rounded-full bg-accent" />
                        )}
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Other..."
                      value={otherValue}
                      onChange={(e) => handleOtherInput(qIndex, e.target.value)}
                      className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/50 bg-surface/30">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       border border-border hover:bg-text/5
                       text-sm transition-colors"
          >
            <X size={14} />
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!isComplete}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg
                     bg-accent text-white hover:bg-accent/90
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-sm font-medium transition-colors"
        >
          <Check size={14} />
          Submit
        </button>
      </div>
    </div>
  )
}
