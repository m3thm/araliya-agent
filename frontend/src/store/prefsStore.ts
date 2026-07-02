import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { fetchLkrRates, convertFromLkr, formatMoney } from "../lib/currency";
import type { Persona, DisplayCurrency } from "../types";

interface PrefsStore {
  persona: Persona;
  currency: DisplayCurrency;
  loaded: boolean;
  rates: Record<string, number> | null;

  loadPrefs: () => Promise<void>;
  setPersona: (persona: Persona) => void;
  setCurrency: (currency: DisplayCurrency) => void;

  /** Convert + format an LKR amount for display in the user's chosen currency. */
  formatPrice: (amountLkr: number) => string;
}

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  persona: "concierge",
  currency: "LKR",
  loaded: false,
  rates: null,

  loadPrefs: async () => {
    // Kick off the FX fetch in parallel — it doesn't depend on auth and
    // shouldn't block persona/currency from loading.
    fetchLkrRates().then((rates) => set({ rates }));

    if (!supabase) {
      set({ loaded: true });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      set({ loaded: true });
      return;
    }

    const { data, error } = await supabase
      .from("user_prefs")
      .select("persona, currency")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[prefsStore] failed to load prefs:", error.message);
      set({ loaded: true });
      return;
    }

    if (data) {
      set({
        persona: (data.persona as Persona) ?? "concierge",
        currency: (data.currency as DisplayCurrency) ?? "LKR",
        loaded: true,
      });
    } else {
      // First time this user's been seen — create their prefs row so
      // future updates can just `update` instead of upsert-guessing.
      await supabase.from("user_prefs").insert({ user_id: userId });
      set({ loaded: true });
    }
  },

  setPersona: (persona) => {
    set({ persona });
    void persistPrefs({ persona });
  },

  setCurrency: (currency) => {
    set({ currency });
    void persistPrefs({ currency });
  },

  formatPrice: (amountLkr) => {
    const { currency, rates } = get();
    const converted = convertFromLkr(amountLkr, currency, rates);
    return formatMoney(converted, currency);
  },
}));

async function persistPrefs(patch: Partial<{ persona: Persona; currency: DisplayCurrency }>) {
  if (!supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  const { error } = await supabase
    .from("user_prefs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) console.error("[prefsStore] failed to save prefs:", error.message);
}