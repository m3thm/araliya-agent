import type { CartItem, ChatEvent, OrderChatContext } from "../types";
import { supabase } from "../lib/supabaseClient";
import { apiUrl } from "../lib/apiBase";

/**
 * Sends a message to the backend.
 *
 * The backend now owns context reconstruction — it reads message rows from
 * Supabase directly using the conversationId, so we no longer need to send
 * the full history array. We do pass the live cart state (not persisted in
 * Supabase) and a lightweight order summary (which orders exist and whether
 * each already has a Kapruka order number on file) so the model always has
 * current context without re-fetching it itself.
 *
 * The Supabase JWT is forwarded as a Bearer token so the backend can verify
 * the caller's identity and confirm they own the conversation.
 */
export async function sendMessage(
  message: string,
  conversationId: string,
  cartItems?: CartItem[],
  persona?: string,
  orders?: OrderChatContext[]
): Promise<{ events: ChatEvent[]; generatedTitle: string | null }> {
  // Get the current session token. supabase is guaranteed non-null when
  // the user is authenticated (AuthScreen guards the main UI), but we
  // guard defensively here anyway.
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const token = session?.access_token ?? "";

  const response = await fetch(apiUrl("/api/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, conversationId, cartItems, persona, orders }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  const data = (await response.json()) as { events: ChatEvent[]; generatedTitle?: string };
  return { events: data.events, generatedTitle: data.generatedTitle ?? null };
}