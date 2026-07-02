import type { ChatMessageItem } from "../../types";
import ProductCard from "./ProductCard";

interface Props {
  message: ChatMessageItem;
}

export default function BotMessage({ message }: Props) {
  return (
    <div className="flex gap-3">
      <div
        className="size-8 rounded-full bg-brand text-white grid place-items-center text-sm flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        A
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {message.type === "tool-call" && (
          <p className="text-sm italic text-ink/50">{message.toolLabel}</p>
        )}

        {message.type === "text" && (
          <div className="text-sm leading-relaxed text-ink whitespace-pre-wrap break-words">
            {message.content}
          </div>
        )}

        {/* Standalone product messages are normally grouped into a
            ProductCarousel by MessageList before they ever reach here —
            this is a fallback only. */}
        {message.type === "product" && message.product && (
          <div className="max-w-[220px]">
            <ProductCard product={message.product} />
          </div>
        )}
      </div>
    </div>
  );
}
