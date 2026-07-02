import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { apiUrl } from "../lib/apiBase";
import type { OrderChatContext, OrderRecord } from "../types";

interface OrdersStore {
  orders: OrderRecord[];
  loading: boolean;
  trackingRef: string | null; // orderRef currently being refreshed, for a per-row spinner
  trackError: Record<string, string>; // orderRef -> last tracking error message, for inline display
  deletingRef: string | null; // orderRef currently being deleted, for a per-row spinner
  deleteError: Record<string, string>; // orderRef -> last delete error message, for inline display
  loadOrders: () => Promise<void>;
  /**
   * Refreshes tracking status for an order. `orderNumber` only needs to be
   * passed the first time (or to correct a typo) — once saved, subsequent
   * calls can omit it and the backend reuses what's on file.
   */
  trackOrder: (orderRef: string, orderNumber?: string) => Promise<void>;
  /**
   * Deletes a pending, never-tracked order from history. The backend
   * refuses this once an order has a Kapruka order number on file, so this
   * only ever removes abandoned/unpaid checkouts.
   */
  deleteOrder: (orderRef: string) => Promise<void>;
  /** Lightweight order summaries to send with each /api/chat call, mirroring cartItems. */
  chatContext: () => OrderChatContext[];
  /** Applies a tracking update the chat backend already made (via set_kapruka_order_number), same shape /api/orders/:orderRef/track returns. */
  applyTrackingRow: (row: Record<string, unknown>) => void;
}

export function mapRow(row: Record<string, unknown>): OrderRecord {
  return {
    id: row.id as string,
    orderRef: row.order_ref as string,
    kaprukaOrderNumber: (row.kapruka_order_number as string | null) ?? null,
    checkoutUrl: (row.checkout_url as string | null) ?? null,
    items: (row.items as OrderRecord["items"]) ?? [],
    itemsTotal: (row.items_total as number | null) ?? null,
    deliveryFee: (row.delivery_fee as number | null) ?? null,
    grandTotal: (row.grand_total as number | null) ?? null,
    currency: (row.currency as string) ?? "LKR",
    status: (row.status as string) ?? "pending",
    tracking: (row.tracking as Record<string, unknown> | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  orders: [],
  loading: false,
  trackingRef: null,
  trackError: {},
  deletingRef: null,
  deleteError: {},

  loadOrders: async () => {
    if (!supabase) return;
    set({ loading: true });

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ordersStore] failed to load:", error.message);
      set({ loading: false });
      return;
    }

    set({ orders: (data ?? []).map(mapRow), loading: false });
  },

  trackOrder: async (orderRef, orderNumber) => {
    if (!supabase) return;
    set({ trackingRef: orderRef, trackError: { ...get().trackError, [orderRef]: "" } });

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token ?? "";

      const response = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderRef)}/track`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(orderNumber ? { orderNumber } : {}),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);

      const updated = mapRow(data);
      set({
        orders: get().orders.map((order) => (order.orderRef === orderRef ? updated : order)),
      });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Couldn't refresh tracking";
      console.error("[ordersStore] failed to refresh tracking:", err);
      set({ trackError: { ...get().trackError, [orderRef]: messageText } });
    } finally {
      set({ trackingRef: null });
    }
  },

  deleteOrder: async (orderRef) => {
    if (!supabase) return;
    set({ deletingRef: orderRef, deleteError: { ...get().deleteError, [orderRef]: "" } });

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token ?? "";

      const response = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderRef)}`), {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      set({ orders: get().orders.filter((order) => order.orderRef !== orderRef) });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Couldn't delete order";
      console.error("[ordersStore] failed to delete order:", err);
      set({ deleteError: { ...get().deleteError, [orderRef]: messageText } });
    } finally {
      set({ deletingRef: null });
    }
  },

  chatContext: () => {
    return get().orders.map((order) => ({
      orderRef: order.orderRef,
      itemsSummary: order.items.map((i) => `${i.name} x${i.quantity}`).join(", ") || "no items on record",
      status: order.status,
      hasKaprukaOrderNumber: Boolean(order.kaprukaOrderNumber),
      createdAt: order.createdAt,
    }));
  },

  applyTrackingRow: (row) => {
    const updated = mapRow(row);
    set({
      orders: get().orders.map((order) => (order.orderRef === updated.orderRef ? updated : order)),
    });
  },
}));