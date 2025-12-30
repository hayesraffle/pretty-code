import { useEffect, useRef } from 'react'
import { FolderOpen, Check } from 'lucide-react'
import Message from './Message'
import CodeBlock from './CodeBlock'
import GitActionBar from './GitActionBar'
import { useSettings } from '../contexts/SettingsContext'

const DEMO_CODE = `function calculateTotal(items, taxRate) {
  // Sum all item prices with tax
  const subtotal = items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);

  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return {
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    total: total.toFixed(2)
  };
}`

const PERMISSION_MODES = [
  {
    value: 'plan',
    label: 'Plan',
    description: 'Plan before executing',
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 dark:border-purple-500/30',
    dotColor: 'bg-purple-500',
  },
  {
    value: 'bypassPermissions',
    label: 'Autopilot',
    description: 'Auto-approve all tools',
    color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:border-emerald-500/30',
    dotColor: 'bg-emerald-500',
  },
  {
    value: 'acceptEdits',
    label: 'Review some',
    description: 'Ask for writes only',
    color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:border-amber-500/30',
    dotColor: 'bg-amber-500',
  },
  {
    value: 'default',
    label: 'Review all',
    description: 'Ask for every tool',
    color: 'bg-red-50 hover:bg-red-100 border-red-200 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:border-red-500/30',
    dotColor: 'bg-red-500',
  },
]

export default function Chat({
  messages,
  isStreaming,
  onRegenerate,
  onEditMessage,
  onQuestionSubmit,
  showCodePreview,
  workingDir,
  onChangeWorkingDir,
  showCommitPrompt,
  initialGitState,
  onCommitDismiss,
  onCelebrate,
}) {
  const bottomRef = useRef(null)
  const { permissionMode, setPermissionMode } = useSettings()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Find the last assistant message index for regenerate button
  const lastAssistantIndex = [...messages]
    .reverse()
    .findIndex((m) => m.role === 'assistant')
  const lastAssistantAbsoluteIndex =
    lastAssistantIndex >= 0 ? messages.length - 1 - lastAssistantIndex : -1

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className="max-w-3xl mx-auto px-4 py-8 min-h-full">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            {/* Logo */}
            <img src="/logo.png" alt="Pretty Code" className="w-20 h-20 rounded-2xl mb-6" />

            {/* Greeting */}
            <h1 className="text-[28px] leading-[36px] font-normal text-text mb-4">
              Hi, how can I help you today?
            </h1>

            {/* Working Directory */}
            <div className="mb-8">
              <button
                onClick={onChangeWorkingDir}
                title="Change working directory"
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-pretty-selection) 50%, transparent)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-pretty-selection)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-pretty-selection) 50%, transparent)'
                }}
              >
                <FolderOpen size={14} className="text-text-muted flex-shrink-0" />
                <span className="text-[13px] text-text-muted mr-1">Working in:</span>
                <span className="text-[13px] text-text font-mono truncate">{workingDir || '/'}</span>
              </button>
            </div>

            {/* Permission mode selector */}
            <div className="flex flex-wrap justify-center gap-3 mb-12">
              {PERMISSION_MODES.map((mode) => {
                const isSelected = permissionMode === mode.value
                return (
                  <button
                    key={mode.value}
                    onClick={() => setPermissionMode(mode.value)}
                    className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full
                               border ${mode.color}
                               active:scale-[0.98]
                               transition-all duration-200 text-[14px] leading-[20px]`}
                  >
                    <span className={`w-2 h-2 rounded-full ${mode.dotColor}`} />
                    <span className="text-text">{mode.label}</span>
                    {isSelected && (
                      <Check size={14} className="text-text-muted" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Code preview - controlled from settings */}
            {showCodePreview && (
              <div className="w-full max-w-2xl text-left">
                <CodeBlock code={DEMO_CODE} language="javascript" />
              </div>
            )}

            {/* Git action bar - show in empty state if there are uncommitted changes */}
            {showCommitPrompt && (
              <div className="mt-8">
                <GitActionBar
                  initialState={initialGitState}
                  onDismiss={onCommitDismiss}
                  onCelebrate={onCelebrate}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((message, index) => (
              <Message
                key={index}
                role={message.role}
                content={message.content}
                events={message.events}
                images={message.images}
                timestamp={message.timestamp}
                isLast={index === lastAssistantAbsoluteIndex}
                isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
                permissionMode={permissionMode}
                parsedQuestions={message.parsedQuestions}
                questionsAnswered={message.questionsAnswered}
                questionAnswers={message.questionAnswers}
                onQuestionSubmit={
                  message.parsedQuestions && !message.questionsAnswered
                    ? (answers) => onQuestionSubmit?.(index, answers)
                    : undefined
                }
                onRegenerate={
                  message.role === 'assistant' && !isStreaming ? onRegenerate : undefined
                }
                onEdit={
                  message.role === 'user' && !isStreaming
                    ? (newContent) => onEditMessage?.(index, newContent)
                    : undefined
                }
                showGitActionBar={showCommitPrompt && index === lastAssistantAbsoluteIndex}
                initialGitState={initialGitState}
                onCommitDismiss={onCommitDismiss}
                onCelebrate={onCelebrate}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
