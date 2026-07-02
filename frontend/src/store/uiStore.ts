import { create } from "zustand";

interface UiStore {
  isTyping: boolean;
  setTyping: (value: boolean) => void;

  cartOpen: boolean;
  toggleCart: () => void;
  setCartOpen: (open: boolean) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  savedOpen: boolean;
  setSavedOpen: (open: boolean) => void;

  ordersOpen: boolean;
  setOrdersOpen: (open: boolean) => void;

  // Lets the empty-state suggestion chips (and anything else) populate the
  // composer without the two components needing a direct reference to
  // each other. InputBar reads this on mount/change and clears it once
  // consumed, so it behaves like a one-shot "fill the box with this" call.
  composerDraft: string | null;
  setComposerDraft: (text: string) => void;
  clearComposerDraft: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isTyping: false,
  setTyping: (value) => set({ isTyping: value }),

  cartOpen: false,
  toggleCart: () => set((s) => ({ cartOpen: !s.cartOpen })),
  setCartOpen: (open) => set({ cartOpen: open }),

  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  savedOpen: false,
  setSavedOpen: (open) => set({ savedOpen: open }),

  ordersOpen: false,
  setOrdersOpen: (open) => set({ ordersOpen: open }),

  composerDraft: null,
  setComposerDraft: (text) => set({ composerDraft: text }),
  clearComposerDraft: () => set({ composerDraft: null }),
}));