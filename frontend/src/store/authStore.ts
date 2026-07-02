import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { useMessageStore } from "./messageStore";
import { useConversationStore } from "./conversationStore";
import { useCartStore } from "./cartStore";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

const SUPABASE_NOT_CONFIGURED =
  "Supabase is not configured. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";

interface AuthStore {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  error: string | null;
  /** Call once on app mount. Safe to call more than once. */
  initialize: () => void;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

/** Wipes all user-scoped client state. Called on sign-out and before a new session loads. */
function clearAllUserState() {
  useMessageStore.getState().clearMessages();
  useCartStore.getState().clearCart();
  useConversationStore.setState({
    conversations: [],
    activeConversationId: null,
    loading: false,
    error: null,
  });
}

let initialized = false;

export const useAuthStore = create<AuthStore>((set) => ({
  status: "loading",
  session: null,
  user: null,
  error: null,

  initialize: () => {
    if (initialized) return;
    initialized = true;

    if (!supabase) {
      set({ status: "unauthenticated", error: SUPABASE_NOT_CONFIGURED });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        user: data.session?.user ?? null,
        status: data.session ? "authenticated" : "unauthenticated",
      });
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
        // User signed out — wipe everything before flipping to unauthenticated
        // so the auth screen never briefly renders with stale data visible.
        clearAllUserState();
        set({ session: null, user: null, status: "unauthenticated" });
        return;
      }

      if (session) {
        const wasUnauthenticated =
          useAuthStore.getState().status !== "authenticated" ||
          useAuthStore.getState().user?.id !== session.user.id;

        set({ session, user: session.user, status: "authenticated" });

        // A different user just signed in — clear previous user's data and
        // load the new user's conversations. The guard avoids re-triggering
        // on token refreshes for the same user already in session.
        if (wasUnauthenticated) {
          clearAllUserState();
          useConversationStore.getState().loadConversations();
        }
      }
    });
  },

  signUp: async (email, password) => {
    if (!supabase) {
      set({ error: SUPABASE_NOT_CONFIGURED });
      return { error: SUPABASE_NOT_CONFIGURED };
    }
    set({ error: null });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ error: error.message });
      return { error: error.message };
    }
    return { error: null };
  },

  signIn: async (email, password) => {
    if (!supabase) {
      set({ error: SUPABASE_NOT_CONFIGURED });
      return { error: SUPABASE_NOT_CONFIGURED };
    }
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      return { error: error.message };
    }
    return { error: null };
  },

  signOut: async () => {
    if (!supabase) return;
    // The onAuthStateChange SIGNED_OUT event handles the actual state wipe —
    // we just trigger the Supabase sign-out here.
    await supabase.auth.signOut();
  },
}));