import { useEffect, useRef } from 'react'
import { Code, FileText, Lightbulb, Wrench } from 'lucide-react'
import Message from './Message'
import TypingIndicator from './TypingIndicator'
import CodeBlock from './CodeBlock'

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

const quickActions = [
  {
    icon: Code,
    label: 'Write code',
    prompt: 'Help me write a function that',
    color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    icon: Wrench,
    label: 'Debug',
    prompt: 'Help me debug this issue:',
    color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
    iconColor: 'text-emerald-600',
  },
  {
    icon: FileText,
    label: 'Explain',
    prompt: 'Explain how this code works:',
    color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    iconColor: 'text-amber-600',
  },
  {
    icon: Lightbulb,
    label: 'Ideas',
    prompt: 'Suggest ideas for',
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
    iconColor: 'text-purple-600',
  },
]

export default function Chat({
  messages,
  isStreaming,
  onQuickAction,
  onRegenerate,
  onEditMessage,
}) {
  const bottomRef = useRef(null)

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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
            {/* Logo */}
            <img src="/logo.png" alt="Pretty Code" className="w-20 h-20 rounded-2xl mb-6" />

            {/* Greeting */}
            <h1 className="text-[28px] leading-[36px] font-normal text-text mb-3">
              Hi, how can I help you today?
            </h1>
            <p className="text-[16px] leading-[24px] text-text-muted max-w-md mb-10">
              Ask me to write code, explain concepts, debug issues, or explore new ideas.
            </p>

            {/* Quick actions - Colorful chips */}
            <div className="flex flex-wrap justify-center gap-3 mb-12">
              {quickActions.map(({ icon: Icon, label, prompt, color, iconColor }) => (
                <button
                  key={label}
                  onClick={() => onQuickAction?.(prompt)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full
                             border ${color}
                             active:scale-[0.98]
                             transition-all duration-200 text-[14px] leading-[20px]`}
                >
                  <Icon size={16} className={iconColor} />
                  <span className="text-text">{label}</span>
                </button>
              ))}
            </div>

            {/* Demo code block */}
            <div className="w-full max-w-2xl text-left">
              <p className="text-[13px] text-text-muted mb-3 text-center">
                Toggle between <strong>Pretty</strong> and <strong>Classic</strong> modes with the button in the header
              </p>
              <CodeBlock code={DEMO_CODE} language="javascript" />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((message, index) => (
              <Message
                key={index}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                isLast={index === lastAssistantAbsoluteIndex}
                onRegenerate={
                  message.role === 'assistant' && !isStreaming ? onRegenerate : undefined
                }
                onEdit={
                  message.role === 'user' && !isStreaming
                    ? (newContent) => onEditMessage?.(index, newContent)
                    : undefined
                }
              />
            ))}
            {isStreaming && messages[messages.length - 1]?.content === '' && (
              <TypingIndicator />
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
