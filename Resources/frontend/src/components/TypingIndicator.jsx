export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1 ml-1 animate-fade-in">
      <span className="w-1.5 h-1.5 bg-text-muted rounded-full typing-dot" />
      <span className="w-1.5 h-1.5 bg-text-muted rounded-full typing-dot" />
      <span className="w-1.5 h-1.5 bg-text-muted rounded-full typing-dot" />
    </div>
  )
}
