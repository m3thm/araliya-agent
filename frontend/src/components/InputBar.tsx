import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useMessageStore } from "../store/messageStore";
import { useCartStore } from "../store/cartStore";
import { useOrdersStore } from "../store/ordersStore";
import { useUiStore } from "../store/uiStore";
import { useConversationStore } from "../store/conversationStore";
import { usePrefsStore } from "../store/prefsStore";
import { sendMessage } from "../services/chatClient";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function InputBar() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addUserMessage = useMessageStore((s) => s.addUserMessage);
  const addBotText = useMessageStore((s) => s.addBotText);
  const addBotToolCall = useMessageStore((s) => s.addBotToolCall);
  const addBotProduct = useMessageStore((s) => s.addBotProduct);
  const addCheckoutPrepRecord = useMessageStore((s) => s.addCheckoutPrepRecord);

  const cartItems = useCartStore((s) => s.items);
  const addItemToCart = useCartStore((s) => s.addItem);
  const setGiftDetails = useCartStore((s) => s.setGiftDetails);

  const ordersChatContext = useOrdersStore((s) => s.chatContext);
  const applyTrackingRow = useOrdersStore((s) => s.applyTrackingRow);

  const isTyping = useUiStore((s) => s.isTyping);
  const setTyping = useUiStore((s) => s.setTyping);
  const setCartOpen = useUiStore((s) => s.setCartOpen);
  const composerDraft = useUiStore((s) => s.composerDraft);
  const clearComposerDraft = useUiStore((s) => s.clearComposerDraft);

  const persona = usePrefsStore((s) => s.persona);

  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const setConversationTitle = useConversationStore((s) => s.setConversationTitle);

  // A suggestion chip (EmptyState) asked us to pre-fill the box — consume
  // it once, then clear so it doesn't re-apply on a later render.
  useEffect(() => {
    if (composerDraft === null) return;
    setValue(composerDraft);
    clearComposerDraft();
    textareaRef.current?.focus();
  }, [composerDraft, clearComposerDraft]);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isTyping) return;
    if (!activeConversationId) {
      setError("No active conversation — please create a new chat.");
      return;
    }

    setError(null);
    addUserMessage(trimmed);
    setValue("");
    setTyping(true);

    try {
      const { events, generatedTitle } = await sendMessage(
        trimmed,
        activeConversationId,
        cartItems,
        persona,
        ordersChatContext()
      );

      for (const event of events) {
        if (event.type === "tool-call") {
          addBotToolCall(event.label);
          await wait(500);
        } else if (event.type === "product") {
          addBotProduct(event.product);
          await wait(250);
        } else if (event.type === "text") {
          addBotText(event.content);
        } else if (event.type === "checkout-prep") {
          setGiftDetails(event.giftDetails);
          setCartOpen(true);
          addCheckoutPrepRecord(event.giftDetails);
          await wait(300);
        } else if (event.type === "add-to-cart") {
          for (const item of event.items) addItemToCart(item);
          toast.success(
            event.items.length === 1 ? `Added ${event.items[0].name} to cart` : "Added items to cart"
          );
          await wait(300);
        } else if (event.type === "order-tracked") {
          applyTrackingRow(event.order);
          toast.success("Order tracking updated");
          await wait(300);
        }
      }

      if (generatedTitle && activeConversationId) {
        setConversationTitle(activeConversationId, generatedTitle);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't reach the concierge backend. Is it running on port 8787?";
      setError(message);
      toast.error(message);
    } finally {
      setTyping(false);
    }
  }, [value, isTyping, activeConversationId, cartItems, persona, ordersChatContext]);

  useEffect(() => {
    if (!isTyping) textareaRef.current?.focus();
  }, [isTyping]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const canSend = !isTyping && value.trim().length > 0;

  return (
    <div className="border-t border-border bg-surface px-3 sm:px-6 md:px-8 py-3 sm:py-4 flex-shrink-0">
      <div className="max-w-3xl mx-auto">
        {error && (
          <p role="alert" className="text-xs text-danger text-center mb-2">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2 bg-white border border-border rounded-2xl p-1.5 sm:p-2 shadow-sm focus-within:border-brand/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Tell Araliya who and what you're shopping for…"
            disabled={isTyping}
            aria-label="Message input"
            className="flex-1 resize-none bg-transparent outline-none px-2.5 sm:px-3 py-2 text-sm max-h-32 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label="Send message"
            className="size-9 rounded-xl bg-brand text-white grid place-items-center disabled:opacity-40 hover:bg-brand-dark transition-colors flex-shrink-0"
          >
            <Send className="size-4" />
          </button>
        </div>
        <p className="hidden sm:block text-center text-[11px] text-ink/30 mt-2">
          Press{" "}
          <kbd className="px-1 py-0.5 rounded border border-border bg-surface-card font-sans">Enter</kbd> to
          send,{" "}
          <kbd className="px-1 py-0.5 rounded border border-border bg-surface-card font-sans">Shift+Enter</kbd>{" "}
          for a new line.
        </p>
      </div>
    </div>
  );
}