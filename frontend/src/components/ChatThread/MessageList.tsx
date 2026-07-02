import { useEffect, useMemo, useRef } from "react";
import type { ChatMessageItem, Product } from "../../types";
import UserMessage from "./UserMessage";
import BotMessage from "./BotMessage";
import ProductCarousel from "./ProductCarousel";
import TypingIndicator from "./TypingIndicator";

interface Props {
  messages: ChatMessageItem[];
  isTyping: boolean;
}

type RenderItem =
  | { kind: "user"; key: string; message: ChatMessageItem }
  | { kind: "bot"; key: string; message: ChatMessageItem }
  | { kind: "product-group"; key: string; products: Product[] };

/**
 * Groups consecutive "product" messages into a single carousel entry so a
 * search result renders as one horizontal row instead of cards stacking
 * one after another. checkout-prep records are skipped entirely — they
 * exist only for history(), never for display. Everything else renders
 * exactly as before, in order.
 */
function buildRenderItems(messages: ChatMessageItem[]): RenderItem[] {
  const items: RenderItem[] = [];
  let productBuffer: ChatMessageItem[] = [];

  const flushProducts = () => {
    if (productBuffer.length > 0) {
      items.push({
        kind: "product-group",
        key: productBuffer.map((m) => m.id).join("-"),
        products: productBuffer.map((m) => m.product as Product),
      });
      productBuffer = [];
    }
  };

  for (const message of messages) {
    if (message.type === "checkout-prep") {
      continue;
    }
    if (message.type === "product" && message.product) {
      productBuffer.push(message);
      continue;
    }
    flushProducts();
    items.push(
      message.role === "user"
        ? { kind: "user", key: message.id, message }
        : { kind: "bot", key: message.id, message }
    );
  }
  flushProducts();

  return items;
}

export default function MessageList({ messages, isTyping }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const renderItems = useMemo(() => buildRenderItems(messages), [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, isTyping]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 md:px-8 py-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        {renderItems.map((item) => {
          if (item.kind === "user") {
            return <UserMessage key={item.key} content={item.message.content ?? ""} />;
          }
          if (item.kind === "product-group") {
            return <ProductCarousel key={item.key} products={item.products} />;
          }
          return <BotMessage key={item.key} message={item.message} />;
        })}
        {isTyping && <TypingIndicator />}
      </div>
    </div>
  );
}
