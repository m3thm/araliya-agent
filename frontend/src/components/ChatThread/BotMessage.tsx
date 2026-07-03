import type { ChatMessageItem } from "../../types";
import { usePrefsStore } from "../../store/prefsStore";
import ProductCard from "./ProductCard";

interface Props {
  message: ChatMessageItem;
}

export default function BotMessage({ message }: Props) {
  const language = usePrefsStore((s) => s.language);

  // When the language toggle is "si" and a Sinhala translation is available,
  // show that instead of the English original. Since we subscribe to the
  // prefs store via Zustand, every BotMessage re-renders instantly when the
  // user switches the language dropdown — no manual event wiring needed.
  const displayContent =
    message.type === "text" && language === "si" && message.content_si
      ? message.content_si
      : message.content;

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
            {displayContent}
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
