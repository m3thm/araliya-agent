import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Product, SavedProduct } from "../types";

interface SavedProductsStore {
  items: SavedProduct[];
  loading: boolean;
  loadSaved: () => Promise<void>;
  isSaved: (productId: string) => boolean;
  saveProduct: (product: Product) => Promise<void>;
  unsaveProduct: (productId: string) => Promise<void>;
}

function mapRow(row: Record<string, unknown>): SavedProduct {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    name: row.name as string,
    price: (row.price as number | null) ?? null,
    currency: (row.currency as string) ?? "LKR",
    imageUrl: (row.image_url as string | null) ?? null,
    productUrl: (row.product_url as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export const useSavedProductsStore = create<SavedProductsStore>((set, get) => ({
  items: [],
  loading: false,

  loadSaved: async () => {
    if (!supabase) return;
    set({ loading: true });

    const { data, error } = await supabase
      .from("saved_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[savedProductsStore] failed to load:", error.message);
      set({ loading: false });
      return;
    }

    set({ items: (data ?? []).map(mapRow), loading: false });
  },

  isSaved: (productId) => get().items.some((item) => item.productId === productId),

  saveProduct: async (product) => {
    if (!supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    // Optimistic update — the UI (heart icon) should flip immediately.
    const optimistic: SavedProduct = {
      id: `optimistic-${product.id}`,
      productId: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      imageUrl: product.imageUrl ?? null,
      productUrl: product.url ?? null,
      createdAt: new Date().toISOString(),
    };
    set({ items: [optimistic, ...get().items] });

    const { data, error } = await supabase
      .from("saved_products")
      .insert({
        user_id: userId,
        product_id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        image_url: product.imageUrl ?? null,
        product_url: product.url ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[savedProductsStore] failed to save:", error.message);
      set({ items: get().items.filter((item) => item.id !== optimistic.id) });
      return;
    }

    set({
      items: get().items.map((item) => (item.id === optimistic.id ? mapRow(data) : item)),
    });
  },

  unsaveProduct: async (productId) => {
    if (!supabase) return;
    const previous = get().items;
    set({ items: previous.filter((item) => item.productId !== productId) });

    const { error } = await supabase.from("saved_products").delete().eq("product_id", productId);

    if (error) {
      console.error("[savedProductsStore] failed to unsave:", error.message);
      set({ items: previous });
    }
  },
}));