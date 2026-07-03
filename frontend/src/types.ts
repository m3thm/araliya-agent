export interface Product {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  description: string;
  imageUrl?: string;
  url?: string;
}

export type MessageType = "text" | "tool-call" | "product" | "checkout-prep";

export interface ChatMessageItem {
  id: string;
  role: "user" | "bot";
  type: MessageType;
  content?: string;
  product?: Product;
  toolLabel?: string;
  /** Present when type is "checkout-prep" — whatever fields the model had collected so far. */
  giftDetails?: Partial<GiftDetails>;
}

// Mirrors the event shape the backend sends back from /api/chat.
export type ChatEvent =
  | { type: "tool-call"; label: string }
  | { type: "product"; product: Product }
  | { type: "text"; content: string }
  | { type: "checkout-prep"; giftDetails: GiftDetails }
  | { type: "add-to-cart"; items: CartItem[] }
  | { type: "order-tracked"; order: Record<string, unknown> };

// History format the backend forwards on to OpenRouter.
export interface HistoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

// ── Cart and checkout types ──────────────────────────────────────────────

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  imageUrl?: string;
}

export interface GiftDetails {
  recipientName: string;
  recipientPhone: string;
  senderName: string;
  anonymous: boolean;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string; // YYYY-MM-DD
  locationType: "house" | "apartment" | "office" | "other";
  deliveryInstructions: string;
  giftMessage: string;
}

export interface CheckoutResponse {
  checkoutUrl: string;
  orderRef: string;
  summary: {
    itemsTotal: number;
    deliveryFee: number;
    grandTotal: number;
    currency: string;
  };
  expiresAt: string;
}

export type CheckoutStatus =
  | "idle"
  | "validating"
  | "creating"
  | "confirmed"
  | "expired"
  | "failed";

// ── Persona, currency, saved items, and order history ────────────────────

export type Persona = "concierge" | "traditional" | "budget";

// "en" leaves the assistant's replies in English. "si" translates them to
// Sinhala for display. Independent of input — a Sinhala message is
// auto-detected and translated to English regardless of this setting, so
// switching this back to "en" doesn't require typing in English too.
export type Language = "en" | "si";


// Kept intentionally small — this is a *display* currency for browsing
// prices, not something checkout ever uses. Real checkout is always LKR,
// since that's the only currency Kapruka accepts.
export const DISPLAY_CURRENCIES = ["LKR", "USD", "GBP", "EUR", "AUD", "CAD"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export interface SavedProduct {
  id: string;
  productId: string;
  name: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  productUrl: string | null;
  createdAt: string;
}

// Lightweight order summary sent to the backend on every /api/chat call —
// mirrors how CartItem[] is sent — so the model knows which orders exist
// and whether each already has a Kapruka order number on file.
export interface OrderChatContext {
  orderRef: string;
  itemsSummary: string;
  status: string;
  hasKaprukaOrderNumber: boolean;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  orderRef: string;
  /**
   * The customer-facing Kapruka order number (e.g. 'VIMP34456CB2'), emailed
   * to them after payment completes. Distinct from `orderRef`, which is our
   * internal pre-payment checkout reference and is never accepted by
   * kapruka_track_order. Null until the customer enters it.
   */
  kaprukaOrderNumber: string | null;
  checkoutUrl: string | null;
  items: Array<{
    productId: string;
    name: string;
    price: number | null;
    currency: string;
    imageUrl: string | null;
    quantity: number;
  }>;
  itemsTotal: number | null;
  deliveryFee: number | null;
  grandTotal: number | null;
  currency: string;
  status: string;
  tracking: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}