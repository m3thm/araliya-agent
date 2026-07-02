import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useMessageStore } from "./messageStore";
import { useCartStore } from "./cartStore";

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ConversationRow): Conversation {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

interface ConversationStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  loading: boolean;
  error: string | null;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string | null>;
  selectConversation: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  /** Applies a title to a conversation in the local list immediately — no DB round-trip needed since the backend already wrote it. */
  setConversationTitle: (id: string, title: string) => void;
  /**
   * Deletes a conversation (and its messages/cart, via DB cascade) and
   * removes it from the local list. If the deleted conversation was the
   * active one, falls back to the next most recent conversation, or
   * creates a fresh one if none remain.
   */
  deleteConversation: (id: string) => Promise<void>;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  loading: false,
  error: null,

  loadConversations: async () => {
    set({ loading: true, error: null });

    const { data, error } = await supabase!
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }

    const conversations = (data ?? []).map(fromRow);
    set({ conversations, loading: false });

    if (!get().activeConversationId) {
      if (conversations.length > 0) {
        await get().selectConversation(conversations[0].id);
      } else {
        await get().createConversation();
      }
    }
  },

  createConversation: async () => {
    const { data: userData } = await supabase!.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      set({ error: "Not signed in" });
      return null;
    }

    const { data, error } = await supabase!
      .from("conversations")
      .insert({ user_id: userId, title: null })
      .select("id, title, created_at, updated_at")
      .single();

    if (error || !data) {
      set({ error: error?.message ?? "Could not create conversation" });
      return null;
    }

    const conversation = fromRow(data);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
    }));

    // New conversation — empty thread and a fresh cart.
    useMessageStore.getState().clearMessages();
    useCartStore.getState().loadCart(conversation.id);

    return conversation.id;
  },

  selectConversation: async (id: string) => {
    if (id === get().activeConversationId) return;

    set({ activeConversationId: id });

    // Clear immediately so the user sees a blank slate while both loads
    // are in flight rather than stale content from the previous conversation.
    useMessageStore.getState().clearMessages();

    // Load messages and cart in parallel — neither depends on the other.
    await Promise.all([
      useMessageStore.getState().loadMessages(id),
      useCartStore.getState().loadCart(id),
    ]);
  },

  refreshConversations: async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) return;
    set({ conversations: (data ?? []).map(fromRow) });
  },

  setConversationTitle: (id: string, title: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  deleteConversation: async (id: string) => {
    if (!supabase) return;

    const { conversations, activeConversationId } = get();
    const previousConversations = conversations;
    const wasActive = id === activeConversationId;

    // Optimistic removal so the UI feels instant.
    const remaining = conversations.filter((c) => c.id !== id);
    set({ conversations: remaining });

    const { error } = await supabase!.from("conversations").delete().eq("id", id);

    if (error) {
      // Roll back on failure.
      set({ conversations: previousConversations, error: error.message });
      return;
    }

    if (!wasActive) return;

    // The active conversation was deleted — fall back to the next most
    // recent one, or spin up a fresh conversation if none remain.
    if (remaining.length > 0) {
      set({ activeConversationId: null });
      await get().selectConversation(remaining[0].id);
    } else {
      set({ activeConversationId: null });
      useMessageStore.getState().clearMessages();
      await get().createConversation();
    }
  },
}));