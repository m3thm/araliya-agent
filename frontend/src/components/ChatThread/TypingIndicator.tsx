export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 pl-11" role="status" aria-label="Concierge is typing">
      <span className="size-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:-0.3s]" />
      <span className="size-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:-0.15s]" />
      <span className="size-1.5 rounded-full bg-ink/30 animate-bounce" />
    </div>
  );
}
