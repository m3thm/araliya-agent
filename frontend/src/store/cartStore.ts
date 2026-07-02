import { create } from "zustand";
import type { CartItem, GiftDetails, CheckoutResponse, CheckoutStatus } from "../types";
import { supabase } from "../lib/supabaseClient";
import { apiUrl } from "../lib/apiBase";

interface CartStore {
  // State
  items: CartItem[];
  giftDetails: GiftDetails;
  checkoutResult: CheckoutResponse | null;
  checkoutStatus: CheckoutStatus;
  error: string | null;

  // Derived
  itemCount: () => number;
  subtotal: () => number;

  // Actions
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (productId: string, delta: number) => void;
  removeItem: (productId: string) => void;
  updateGiftField: <K extends keyof GiftDetails>(field: K, value: GiftDetails[K]) => void;
  setGiftDetails: (details: Partial<GiftDetails>) => void;
  clearCart: () => void;
  clearCheckoutResult: () => void;

  // Persistence
  /** Loads cart + gift details from Supabase for the given conversation. */
  loadCart: (conversationId: string) => Promise<void>;

  // Async
  placeOrder: () => Promise<void>;
}

export const defaultGiftDetails: GiftDetails = {
  recipientName: "",
  recipientPhone: "",
  senderName: "",
  anonymous: false,
  deliveryAddress: "",
  deliveryCity: "",
  deliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  locationType: "house",
  deliveryInstructions: "",
  giftMessage: "",
};

// ── Persistence helpers ───────────────────────────────────────────────────────

// The conversation the cart is currently bound to. Mutations call
// schedulePersist() which debounces writes so rapid changes (e.g. tapping +
// several times) don't fire a DB write per keystroke.
let _activeConversationId: string | null = null;
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (!_activeConversationId) return;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    void persistCart(_activeConversationId!);
  }, 600);
}

async function persistCart(conversationId: string) {
  if (!supabase) return;
  const { items, giftDetails } = useCartStore.getState();
  const { error } = await supabase.from("conversation_carts").upsert(
    {
      conversation_id: conversationId,
      items,
      gift_details: giftDetails,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" }
  );
  if (error) {
    console.error("[cartStore] failed to persist cart:", error.message);
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  giftDetails: { ...defaultGiftDetails },
  checkoutResult: null,
  checkoutStatus: "idle",
  error: null,

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  subtotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId
              ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
              : i
          ),
          checkoutResult: null,
          checkoutStatus: "idle" as CheckoutStatus,
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: item.productId,
            name: item.name,
            price: item.price,
            currency: item.currency,
            quantity: item.quantity ?? 1,
            imageUrl: item.imageUrl,
          },
        ],
        checkoutResult: null,
        checkoutStatus: "idle" as CheckoutStatus,
      };
    });
    schedulePersist();
  },

  updateQuantity: (productId, delta) => {
    set((state) => {
      const updated = state.items
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0);
      return { items: updated, checkoutResult: null, checkoutStatus: "idle" as CheckoutStatus };
    });
    schedulePersist();
  },

  removeItem: (productId) => {
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
      checkoutResult: null,
      checkoutStatus: "idle" as CheckoutStatus,
    }));
    schedulePersist();
  },

  updateGiftField: (field, value) => {
    set((state) => ({
      giftDetails: { ...state.giftDetails, [field]: value },
      checkoutResult: null,
      checkoutStatus: "idle" as CheckoutStatus,
    }));
    schedulePersist();
  },

  setGiftDetails: (details) => {
    set((state) => ({
      giftDetails: { ...state.giftDetails, ...details },
      checkoutResult: null,
      checkoutStatus: "idle" as CheckoutStatus,
    }));
    schedulePersist();
  },

  clearCart: () => {
    // Flush any pending write before resetting so a stale timer can't
    // overwrite the cleared state after the fact.
    if (_persistTimer) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
    }
    // If we're clearing because the user signed out, also detach from the
    // conversation so schedulePersist() is a no-op until the next loadCart.
    _activeConversationId = null;
    set({
      items: [],
      giftDetails: { ...defaultGiftDetails },
      checkoutResult: null,
      checkoutStatus: "idle",
      error: null,
    });
  },

  clearCheckoutResult: () => {
    set({ checkoutResult: null, checkoutStatus: "idle", error: null });
  },

  loadCart: async (conversationId: string) => {
    // Bind mutations to this conversation immediately — any addItem call
    // that arrives before the DB read completes will persist against the
    // right conversation ID.
    _activeConversationId = conversationId;

    if (!supabase) return;

    const { data, error } = await supabase
      .from("conversation_carts")
      .select("items, gift_details")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error) {
      console.error("[cartStore] failed to load cart:", error.message);
      return;
    }

    if (!data) {
      // No persisted cart for this conversation yet — reset to defaults
      // without touching _activeConversationId (already set above).
      set({
        items: [],
        giftDetails: { ...defaultGiftDetails },
        checkoutResult: null,
        checkoutStatus: "idle",
        error: null,
      });
      return;
    }

    set({
      items: (data.items as CartItem[]) ?? [],
      giftDetails: {
        ...defaultGiftDetails,
        ...((data.gift_details as Partial<GiftDetails>) ?? {}),
      },
      checkoutResult: null,
      checkoutStatus: "idle",
      error: null,
    });
  },

  placeOrder: async () => {
    const { items, giftDetails } = get();

    if (items.length === 0) {
      set({ error: "Cart is empty", checkoutStatus: "failed" });
      return;
    }
    if (
      !giftDetails.recipientName ||
      !giftDetails.recipientPhone ||
      !giftDetails.senderName ||
      !giftDetails.deliveryAddress ||
      !giftDetails.deliveryCity ||
      !giftDetails.deliveryDate
    ) {
      set({ error: "Please fill in all required gift details", checkoutStatus: "failed" });
      return;
    }

    set({ checkoutStatus: "validating", error: null, checkoutResult: null });

    try {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const token = session?.access_token ?? "";

      const response = await fetch(apiUrl("/api/checkout"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ items, giftDetails, conversationId: _activeConversationId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      set({
        checkoutResult: data as CheckoutResponse,
        checkoutStatus: "confirmed",
        error: null,
      });
    } catch (err) {
      set({
        checkoutStatus: "failed",
        error: err instanceof Error ? err.message : "Checkout failed",
        checkoutResult: null,
      });
    }
  },
}));