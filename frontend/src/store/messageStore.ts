import { create } from "zustand";
import type { ChatMessageItem, GiftDetails, HistoryEntry, Product } from "../types";
import { supabase } from "../lib/supabaseClient";

let nextId = 1;
const makeId = () => `msg-${nextId++}`;

// ── Synthetic-note helpers ────────────────────────────────────────────────────
// These are kept here for history() (used by the checkout flow and as a
// fallback), but they are no longer called on every send — the backend now
// reconstructs context from DB rows using identical logic in server.ts.

const REQUIRED_GIFT_FIELDS: (keyof GiftDetails)[] = [
  "recipientName",
  "recipientPhone",
  "senderName",
  "deliveryAddress",
  "deliveryCity",
  "deliveryDate",
];

function summarizeProducts(products: Product[]): string {
  const items = products
    .map((p) => `"${p.name}" (id ${p.id}, ${p.currency} ${p.price ?? "unknown"})`)
    .join(", ");
  return `For your own reference, not to repeat to the shopper: you already showed these products earlier in this chat — ${items}.`;
}

function summarizeToolCall(label: string): string {
  return `For your own reference, not to repeat to the shopper: earlier in this chat you already did this — ${label}.`;
}

function summarizeCheckoutPrep(giftDetails: Partial<GiftDetails>): string {
  const missing = REQUIRED_GIFT_FIELDS.filter((field) => !giftDetails[field]);
  if (missing.length > 0) {
    return `For your own reference: you tried to prepare checkout earlier in this chat but were still missing ${missing.join(", ")}.`;
  }
  const parts = [
    `recipient ${giftDetails.recipientName} (${giftDetails.recipientPhone})`,
    `sender ${giftDetails.senderName}`,
    `delivering to ${giftDetails.deliveryAddress}, ${giftDetails.deliveryCity}`,
    `on ${giftDetails.deliveryDate}`,
  ];
  return `For your own reference: you already filled in the checkout form earlier in this chat with ${parts.join(", ")}. No need to collect these again unless the shopper wants to change one.`;
}

// ── Supabase message row ──────────────────────────────────────────────────────

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "bot";
  type: "text" | "product" | "tool-call" | "checkout-prep";
  content: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface MessageStore {
  messages: ChatMessageItem[];
  loadingHistory: boolean;
  addUserMessage: (content: string) => ChatMessageItem;
  addBotText: (content: string) => void;
  addBotToolCall: (label: string) => void;
  addBotProduct: (product: ChatMessageItem["product"]) => void;
  /** Not rendered — exists so history() can tell the model this already happened. */
  addCheckoutPrepRecord: (giftDetails: Partial<GiftDetails>) => void;
  /** Resets the thread — used when switching or creating a conversation. */
  clearMessages: () => void;
  /**
   * Loads persisted message rows from Supabase for a conversation and
   * hydrates the local message list. Called whenever the user switches
   * to a conversation.
   */
  loadMessages: (conversationId: string) => Promise<void>;
  /**
   * Builds the history array from local in-memory messages. The backend
   * now owns context reconstruction from DB rows, but this is kept for
   * the checkout flow and any code that still needs a local history snapshot.
   */
  history: () => HistoryEntry[];
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  loadingHistory: false,

  addUserMessage: (content) => {
    const message: ChatMessageItem = {
      id: makeId(),
      role: "user",
      type: "text",
      content,
    };
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  addBotText: (content) => {
    set((state) => ({
      messages: [...state.messages, { id: makeId(), role: "bot", type: "text", content }],
    }));
  },

  addBotToolCall: (label) => {
    set((state) => ({
      messages: [
        ...state.messages,
        { id: makeId(), role: "bot", type: "tool-call", toolLabel: label },
      ],
    }));
  },

  addBotProduct: (product) => {
    set((state) => ({
      messages: [...state.messages, { id: makeId(), role: "bot", type: "product", product }],
    }));
  },

  addCheckoutPrepRecord: (giftDetails) => {
    set((state) => ({
      messages: [
        ...state.messages,
        { id: makeId(), role: "bot", type: "checkout-prep", giftDetails },
      ],
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  loadMessages: async (conversationId: string) => {
    if (!supabase) return;

    set({ loadingHistory: true });

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[messageStore] failed to load messages:", error.message);
      set({ loadingHistory: false });
      return;
    }

    const rows = (data ?? []) as MessageRow[];

    // Map DB rows back to ChatMessageItem[] for display in MessageList.
    // The shapes are 1-to-1 — we just rename DB snake_case to camelCase
    // and restore the typed union fields.
    const messages: ChatMessageItem[] = rows.map((row): ChatMessageItem => {
      if (row.type === "text") {
        return {
          id: row.id,
          role: row.role,
          type: "text",
          content: row.content ?? "",
        };
      }
      if (row.type === "product") {
        return {
          id: row.id,
          role: "bot",
          type: "product",
          product: row.payload as unknown as Product,
        };
      }
      if (row.type === "tool-call") {
        return {
          id: row.id,
          role: "bot",
          type: "tool-call",
          toolLabel: (row.payload?.label as string) ?? "",
        };
      }
      // checkout-prep
      return {
        id: row.id,
        role: "bot",
        type: "checkout-prep",
        giftDetails: row.payload as Partial<GiftDetails>,
      };
    });

    set({ messages, loadingHistory: false });
  },

  history: () => {
    const entries: HistoryEntry[] = [];
    let productBuffer: Product[] = [];

    const flushProducts = () => {
      if (productBuffer.length > 0) {
        entries.push({ role: "system", content: summarizeProducts(productBuffer) });
        productBuffer = [];
      }
    };

    for (const m of get().messages) {
      if (m.type === "text" && m.content) {
        flushProducts();
        entries.push({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        });
      } else if (m.type === "product" && m.product) {
        productBuffer.push(m.product);
      } else if (m.type === "tool-call" && m.toolLabel) {
        flushProducts();
        entries.push({ role: "system", content: summarizeToolCall(m.toolLabel) });
      } else if (m.type === "checkout-prep" && m.giftDetails) {
        flushProducts();
        entries.push({ role: "system", content: summarizeCheckoutPrep(m.giftDetails) });
      }
    }
    flushProducts();

    return entries;
  },
}));