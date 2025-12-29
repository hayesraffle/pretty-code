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
    // Build response object
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

  const isComplete = questions.every((q, i) => {
    const key = `question_${i}`
    const otherKey = `${key}_other`
    return answers[key] || answers[otherKey]
  })

  return (
    <div className="border border-accent/30 rounded-xl p-4 bg-accent/5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <HelpCircle size={18} className="text-accent" />
        <span className="font-medium text-text">Claude needs your input</span>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((question, qIndex) => (
          <div key={qIndex} className="space-y-2">
            {/* Question header chip */}
            {question.header && (
              <span className="inline-block px-2 py-0.5 text-xs bg-accent/20 text-accent rounded-full">
                {question.header}
              </span>
            )}

            {/* Question text */}
            <p className="text-sm text-text">{question.question}</p>

            {/* Options */}
            <div className="flex flex-wrap gap-2">
              {question.options?.map((option, oIndex) => {
                const isSelected = question.multiSelect
                  ? (answers[`question_${qIndex}`] || []).includes(option.label)
                  : answers[`question_${qIndex}`] === option.label

                return (
                  <button
                    key={oIndex}
                    onClick={() =>
                      handleOptionToggle(qIndex, option.label, question.multiSelect)
                    }
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-background border-border hover:border-accent/50'
                    }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                )
              })}

              {/* Other option */}
              <input
                type="text"
                placeholder="Other..."
                value={answers[`question_${qIndex}_other`] || ''}
                onChange={(e) => handleOtherInput(qIndex, e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background
                           focus:outline-none focus:border-accent w-32"
              />
            </div>

            {/* Show selected option description */}
            {answers[`question_${qIndex}`] && !question.multiSelect && (
              <p className="text-xs text-text-muted">
                {question.options?.find((o) => o.label === answers[`question_${qIndex}`])?.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
        <button
          onClick={handleSubmit}
          disabled={!isComplete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-accent text-white hover:bg-accent/90
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-sm font-medium transition-colors"
        >
          <Check size={14} />
          Submit
        </button>

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
      </div>
    </div>
  )
}
