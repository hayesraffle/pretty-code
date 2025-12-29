import { useEffect, useRef } from 'react'
import { Code, FileText, Lightbulb, Wrench } from 'lucide-react'
import Message from './Message'
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
    color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:border-blue-500/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Wrench,
    label: 'Debug',
    prompt: 'Help me debug this issue:',
    color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:border-emerald-500/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: FileText,
    label: 'Explain',
    prompt: 'Explain how this code works:',
    color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 dark:border-orange-500/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    icon: Lightbulb,
    label: 'Ideas',
    prompt: 'Suggest ideas for',
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 dark:border-purple-500/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
]

export default function Chat({
  messages,
  isStreaming,
  onQuickAction,
  onRegenerate,
  onEditMessage,
  permissionMode,
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
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className="max-w-3xl mx-auto px-4 py-8 min-h-full">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            {/* Logo */}
            <img src="/logo.png" alt="Pretty Code" className="w-20 h-20 rounded-2xl mb-6" />

            {/* Greeting */}
            <h1 className="text-[28px] leading-[36px] font-normal text-text mb-8">
              Hi, how can I help you today?
            </h1>

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
                events={message.events}
                images={message.images}
                timestamp={message.timestamp}
                isLast={index === lastAssistantAbsoluteIndex}
                isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
                permissionMode={permissionMode}
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
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
