import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { mcpClient } from "./mcpClient.js";
import { callOpenRouter, type ChatMessage } from "./openrouter.js";
import { parseProductsFromToolResult, type Product } from "./normalizeProduct.js";
import type { OpenAIToolDef } from "./mcpClient.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { fetchLkrRates, convertCurrency } from "./currency.js";
import { detectAndTranslateToEnglish, translateFromEnglish } from "./translate.js";

// ── Shape the frontend's cartStore expects ───────────────────────────────────
interface CartItem {
  productId: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  imageUrl?: string;
}

// Lightweight order context the frontend sends on every /api/chat call
// (mirrors how cartItems is sent) — just enough for the model to know
// which orders exist and whether each already has a Kapruka order number
// on file, without shipping full order/tracking payloads every turn.
interface OrderContext {
  orderRef: string;
  itemsSummary: string;
  status: string;
  hasKaprukaOrderNumber: boolean;
  createdAt: string;
}

type ChatEvent =
  | { type: "tool-call"; label: string }
  | { type: "product"; product: Product }
  | { type: "text"; content: string; content_si?: string }
  | { type: "checkout-prep"; giftDetails: Record<string, unknown> }
  | { type: "add-to-cart"; items: CartItem[] }
  | { type: "order-tracked"; order: Record<string, unknown> };

// ── Supabase message row shape ────────────────────────────────────────────────
interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "bot";
  type: "text" | "product" | "tool-call" | "checkout-prep";
  content: string | null;
  // English translation of `content`, populated only for user rows that
  // arrived in a non-English language. `content` itself stays exactly what
  // the shopper typed, for faithful UI display; this is what LLM context
  // reconstruction uses instead, so Sinhala never leaks back into the
  // model on later turns. Null means `content` was already English (or
  // this is an older row from before translation support existed).
  content_en: string | null;
  // Sinhala translation of `content`, populated only for bot rows
  // that were translated for display. Null means the message was
  // generated while the language toggle was English (or is an older
  // row from before Sinhala support existed).
  content_si: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ── Context reconstruction ────────────────────────────────────────────────────
// These mirror the summarize* helpers in the frontend's messageStore.ts.
// They live here now because the backend is the one rebuilding context from DB
// rows — the frontend no longer sends history at all.

const REQUIRED_GIFT_FIELDS = [
  "recipientName",
  "recipientPhone",
  "senderName",
  "deliveryAddress",
  "deliveryCity",
  "deliveryDate",
] as const;

function summarizeProducts(products: Product[]): string {
  const items = products
    .map((p) => `"${p.name}" (id ${p.id}, ${p.currency} ${p.price ?? "unknown"})`)
    .join(", ");
  return `For your own reference, not to repeat to the shopper: you already showed these products earlier in this chat — ${items}.`;
}

function summarizeToolCall(label: string): string {
  return `For your own reference, not to repeat to the shopper: earlier in this chat you already did this — ${label}.`;
}

function summarizeCheckoutPrep(giftDetails: Record<string, unknown>): string {
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

/**
 * Loads all message rows for a conversation and reconstructs the
 * ChatMessage[] array the LLM expects. The logic mirrors the frontend's
 * messageStore.history() exactly — consecutive product rows collapse into
 * a single synthetic system note, tool-call and checkout-prep rows become
 * compact system notes, and user/bot text rows become user/assistant turns.
 */
async function loadConversationHistory(conversationId: string): Promise<ChatMessage[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[history] failed to load messages:", error.message);
    throw new Error(`Could not load conversation history: ${error.message}`);
  }

  const rows = (data ?? []) as MessageRow[];
  const entries: ChatMessage[] = [];
  let productBuffer: Product[] = [];

  const flushProducts = () => {
    if (productBuffer.length === 0) return;
    entries.push({ role: "system", content: summarizeProducts(productBuffer) });
    productBuffer = [];
  };

  for (const row of rows) {
    if (row.type === "text" && row.content) {
      flushProducts();
      entries.push({
        role: row.role === "user" ? "user" : "assistant",
        // Prefer the English translation for user rows so the model's
        // context is always English, even for a Sinhala message typed
        // several turns ago — otherwise Sinhala accumulates back into
        // the prompt on every subsequent turn, defeating the point of
        // translating it in the first place.
        content: row.role === "user" ? row.content_en ?? row.content : row.content,
      });
    } else if (row.type === "product" && row.payload) {
      // payload is the full Product object
      productBuffer.push(row.payload as unknown as Product);
    } else if (row.type === "tool-call" && row.payload?.label) {
      flushProducts();
      entries.push({ role: "system", content: summarizeToolCall(row.payload.label as string) });
    } else if (row.type === "checkout-prep" && row.payload) {
      flushProducts();
      entries.push({ role: "system", content: summarizeCheckoutPrep(row.payload) });
    }
  }

  flushProducts();
  return entries;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const ALLOWED_TOOLS = [
  "kapruka_search_products",
  "kapruka_get_product",
  "kapruka_list_categories",
  "kapruka_check_delivery",
  "kapruka_list_delivery_cities",
  "kapruka_create_order",
  "kapruka_track_order",
];

const MAX_TOOL_ROUNDS = 8;

const PREPARE_CHECKOUT_TOOL: OpenAIToolDef = {
  type: "function",
  function: {
    name: "prepare_checkout",
    description:
      "Call this when the shopper has told you all their delivery and gift " +
      "details. It will pre-fill the checkout form on their cart so they can " +
      "click Place Order to generate a payment link. Only call this when you " +
      "have collected: recipient name, recipient phone, sender name, " +
      "delivery address, delivery city, and delivery date. Gift message and " +
      "delivery instructions are optional.",
    parameters: {
      type: "object",
      properties: {
        recipientName: { type: "string", description: "Recipient's full name" },
        recipientPhone: { type: "string", description: "Recipient's phone number (E.164 or local format)" },
        senderName: { type: "string", description: "Sender's name" },
        anonymous: { type: "boolean", description: "Send anonymously (default false)" },
        deliveryAddress: { type: "string", description: "Street address for delivery" },
        deliveryCity: { type: "string", description: "City for delivery" },
        deliveryDate: { type: "string", description: "Delivery date in YYYY-MM-DD format" },
        locationType: {
          type: "string",
          enum: ["house", "apartment", "office", "other"],
          description: "Type of delivery location (default house)",
        },
        deliveryInstructions: { type: "string", description: "Optional delivery instructions" },
        giftMessage: { type: "string", description: "Optional gift message (max 300 chars)" },
      },
      required: ["recipientName", "recipientPhone", "senderName", "deliveryAddress", "deliveryCity", "deliveryDate"],
    },
  },
};

const ADD_TO_CART_TOOL: OpenAIToolDef = {
  type: "function",
  function: {
    name: "add_to_cart",
    description:
      "Add one or more products to the shopper's cart when they ask you " +
      "to — e.g. 'add that', 'I'll take this one', 'add 2 of the mug'. " +
      "Use a product_id from a kapruka_search_products or " +
      "kapruka_get_product result you've already seen in this " +
      "conversation. Never invent a product_id. Quantity defaults to 1.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Products to add",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description: "Product id from a search or detail result already shown to the shopper",
              },
              quantity: {
                type: "integer",
                description: "How many to add, default 1",
              },
            },
            required: ["product_id"],
          },
        },
      },
      required: ["items"],
    },
  },
};

const SET_ORDER_NUMBER_TOOL: OpenAIToolDef = {
  type: "function",
  function: {
    name: "set_kapruka_order_number",
    description:
      "Save the Kapruka order number the shopper gives you (from their " +
      "order confirmation email, e.g. 'VIMP34456CB2') against one of " +
      "their orders, and immediately check its delivery status. Only " +
      "call this with a number the shopper actually typed or pasted to " +
      "you in this chat — never invent one, and never reuse an internal " +
      "order reference in its place, since that is a different value " +
      "Kapruka won't recognize. Check the order context you've been " +
      "given first: if an order already has a number on file, don't ask " +
      "for it again. If the shopper has more than one order without a " +
      "saved number, ask which one it's for (referencing what was in " +
      "it, or the date) before calling this.",
    parameters: {
      type: "object",
      properties: {
        order_ref: {
          type: "string",
          description:
            "The internal order reference this number belongs to, from the order context you were given.",
        },
        order_number: {
          type: "string",
          description: "The Kapruka order number the shopper gave you, from their confirmation email.",
        },
      },
      required: ["order_ref", "order_number"],
    },
  },
};

const SHOW_PRODUCTS_TOOL: OpenAIToolDef = {
  type: "function",
  function: {
    name: "show_products",
    description:
      "After calling kapruka_search_products or kapruka_get_product, " +
      "call this with the ids of ONLY the products that genuinely fit " +
      "what the shopper asked for. This is what actually puts product " +
      "cards in front of the shopper — a search result on its own " +
      "shows nothing until you call this. Skip ids that don't fit; you " +
      "don't have to show everything a search returned. If nothing " +
      "fits, don't call this at all.",
    parameters: {
      type: "object",
      properties: {
        product_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Ids of the products to show as cards, from a search or detail result already seen in this conversation",
        },
      },
      required: ["product_ids"],
    },
  },
};

const CONVERT_CURRENCY_TOOL: OpenAIToolDef = {
  type: "function",
  function: {
    name: "convert_currency",
    description:
      "Convert an amount between currencies. Call this whenever the shopper " +
      "states a budget, price, or amount in a currency other than LKR (e.g. " +
      "'$5', '10 pounds', '20 euros') — do it BEFORE searching, so you can " +
      "pass a converted LKR amount to kapruka_search_products, since every " +
      "product price in the store is in LKR. You can also use it in reverse " +
      "to describe an LKR price back in the shopper's stated currency. Use " +
      "standard 3-letter currency codes (USD, GBP, EUR, AUD, etc).",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "The numeric amount to convert" },
        from: { type: "string", description: "3-letter currency code to convert from, e.g. USD" },
        to: { type: "string", description: "3-letter currency code to convert to, e.g. LKR" },
      },
      required: ["amount", "from", "to"],
    },
  },
};

const SYSTEM_INTRO =
  "You are a warm, concise gift shopping concierge for Kapruka, a Sri " +
  "Lankan online gift and grocery store.\n\n";

const SYSTEM_RULES =
  "RULES:\n" +
  "1. Talk like a real person — no markdown, bold, bullets, numbered " +
  "lists, or emojis. Plain conversational sentences only.\n" +
  "2. If the shopper's request is vague, ask a quick clarifying question " +
  "first. You need at least a recipient and a rough budget or occasion " +
  "before searching.\n" +
  "3. Use kapruka_search_products once you have enough context. Never " +
  "invent products. Don't run more than two searches in a row hoping " +
  "for something better — if a search gives you anything reasonably " +
  "on-topic and in budget, move forward with it rather than re-searching.\n" +
  "4. A search result shows nothing on its own. After " +
  "kapruka_search_products or kapruka_get_product returns, call " +
  "show_products with only the ids that genuinely fit the shopper's " +
  "interests, budget, and occasion — skip the rest; showing a mediocre " +
  "or out-of-budget match is worse than showing fewer good ones. If " +
  "nothing fits, don't call show_products — say so, and either ask a " +
  "clarifying question or search once more with different terms. After " +
  "that, call show_products with your closest options rather than keep " +
  "searching — something imperfect shown beats nothing shown.\n" +
  "5. Use kapruka_get_product only when you need more detail on ONE " +
  "item before deciding whether to show it — not to compare several " +
  "candidates back-to-back; search results already have enough for " +
  "that. Follow up with show_products if you still want it displayed.\n" +
  "6. Keep replies to one or two sentences. Product cards come from " +
  "show_products, so never list or repeat those products in your reply " +
  "— instead say something natural about one of them (e.g. \"That cake " +
  "could work well if she likes sweets\"). Never enumerate products, " +
  "and never promise a future action you won't take right now (e.g. " +
  "\"let me check\"). Each reply should be self-contained.\n" +
  "7. Prices in the store are always in LKR. If the shopper states an " +
  "amount in another currency (e.g. \"$5\", \"20 euros\"), call " +
  "convert_currency to get an LKR figure before searching or filtering " +
  "— never estimate a conversion yourself. When quoting a price back in " +
  "their currency, convert the same way and note it's an approximate, " +
  "live-rate conversion.\n" +
  "8. If the shopper wants to add a specific item (\"I'll take it\", " +
  "\"add that\", \"add 2 of the mug\"), call add_to_cart immediately " +
  "with the product_id from a result already shown — no confirmation " +
  "needed. You can also mention they're welcome to add items themselves " +
  "via the plus button on any card.\n" +
  "9. Once the shopper has items in cart and wants to check out, " +
  "proactively collect these one at a time, in order, without waiting " +
  "to be asked: (a) recipient name and phone, (b) sender's name, (c) " +
  "delivery address and city, (d) delivery date, (e) optional gift " +
  "message and delivery instructions. If they volunteer several at " +
  "once, take what you can and ask for the rest.\n" +
  "10. Once all required details are collected (recipient name, " +
  "recipient phone, sender name, delivery address, delivery city, " +
  "delivery date), call prepare_checkout immediately — no other tool " +
  "calls first. Do the same right away if the shopper explicitly asks " +
  "you to prepare/call checkout.\n" +
  "11. Never invent product IDs or prices — always use the search tools.\n" +
  "12. System notes starting \"For your own reference\" describe things " +
  "you already did earlier in this chat — internal context only, never " +
  "to be copied into a reply. Never output a bracketed tag like [Tool: " +
  "...] as a response; call a real tool or reply in plain sentences. " +
  "These notes don't limit repeating an action — if the shopper wants a " +
  "new search, a different product, another item added, or a delivery " +
  "detail changed, just do it again.\n" +
  "13. If the shopper asks about an order's status, check the order " +
  "context you were given. If the relevant order already has a Kapruka " +
  "order number on file, call kapruka_track_order with it directly. If " +
  "it doesn't, ask the shopper for the order number from their Kapruka " +
  "confirmation email — not the reference from the checkout/payment " +
  "page, a separate number that only arrives by email after payment " +
  "completes. As soon as they give it, call set_kapruka_order_number " +
  "with it — that tool already looks up the status for you, so don't " +
  "also call kapruka_track_order yourself in that case. If more than " +
  "one of their orders is missing a number, ask which order it's for " +
  "first.";

// ── Persona variants ──────────────────────────────────────────────────────
// Appended to SYSTEM_PROMPT based on the `persona` field the frontend sends
// with each /api/chat call. "concierge" is the default/balanced behavior
// already fully specified above, so it adds nothing extra. Keep these
// short — they're a tone/emphasis nudge on top of the rules above, not a
// replacement for them.
const PERSONA_PROMPTS: Record<string, string> = {
  concierge: "",
  traditional:
    "\n\nPERSONA: Gift Expert. Lean toward heritage and traditional " +
    "picks — items with cultural or sentimental weight (traditional " +
    "sweets, handcrafted goods, classic gestures like flowers) over " +
    "generic or novelty items, when both fit the budget and occasion " +
    "reasonably well. Mention the cultural context briefly when it's " +
    "genuinely relevant, without turning your reply into a lecture.",
  budget:
    "\n\nPERSONA: Budget Hunter. Be strict about the shopper's stated " +
    "budget — never show or suggest anything over it. When multiple " +
    "options fit, favor the better value one and say why briefly (e.g. " +
    "\"this gets you more for the price\"). If the shopper hasn't given " +
    "a budget yet, ask for one before searching.",
};

function buildSystemPrompt(persona: string | undefined): string {
  const personaBlock = persona && PERSONA_PROMPTS[persona] ? PERSONA_PROMPTS[persona] : "";
  return SYSTEM_INTRO + personaBlock + SYSTEM_RULES;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// CORS_ORIGIN is a comma-separated list of allowed origins (e.g. your Vercel
// deployment's URL). Left unset, CORS stays wide open — the same permissive
// default this app has always used locally — so this is opt-in stricter
// behavior for production, not a breaking change for anyone still running
// this without it configured.
const corsOrigins = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true }));

app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Writes a single message row to Supabase. Retries once after a short delay
 * on failure, then throws — so load-bearing callers (user message, product
 * cards, checkout-prep) can propagate the error rather than silently losing
 * a row that the next turn's context reconstruction depends on.
 *
 * createdAt is assigned by the caller (see nextCreatedAt() in the /api/chat
 * handler) rather than left to the database's default `now()`. That matters
 * specifically because of persistMessageBestEffort below: a fire-and-forget
 * insert's *actual* network completion time has no relationship to where it
 * logically belongs in the sequence — under any network jitter, an awaited
 * insert issued right after it can easily land first and get an earlier
 * `now()` than the backgrounded one before it, silently reordering rows.
 * That reordering is invisible during the live session (the frontend just
 * appends events from one ordered array) but corrupts the sequence
 * permanently once a conversation is reloaded and re-sorted by created_at —
 * which is exactly the "cards line up live, then come back split after
 * reload" symptom. Assigning createdAt synchronously, in call order, before
 * any await or background dispatch happens, removes the race entirely.
 */
async function persistMessage(
  conversationId: string,
  role: "user" | "bot",
  type: "text" | "product" | "tool-call" | "checkout-prep",
  content: string | null,
  payload: Record<string, unknown> | null,
  createdAt: string,
  contentEn: string | null = null,
  contentSi: string | null = null
): Promise<void> {
  const db = supabaseAdmin();
  const row = {
    conversation_id: conversationId,
    role,
    type,
    content,
    content_en: contentEn,
    content_si: contentSi,
    payload,
    created_at: createdAt,
  };

  const { error: firstError } = await db.from("messages").insert(row);
  if (!firstError) return;

  // One retry after 800ms — handles transient network blips without
  // meaningfully delaying the response for the common (success) case.
  console.warn(
    `[db] first attempt to persist ${role}/${type} failed, retrying once:`,
    firstError.message
  );
  await new Promise((resolve) => setTimeout(resolve, 800));

  const { error: secondError } = await db.from("messages").insert(row);
  if (!secondError) return;

  // Both attempts failed — throw so the caller decides what to do.
  const msg = `Failed to persist ${role}/${type} message after retry: ${secondError.message}`;
  console.error(`[db] ${msg}`);
  throw new Error(msg);
}

/**
 * Fire-and-forget variant for low-stakes writes (tool-call indicators).
 * A missing tool-call note degrades context slightly but doesn't corrupt it —
 * the model will just lack a hint about a past search label. Not worth
 * blocking the response or surfacing an error to the user over.
 *
 * Not blocking the response is still fine — createdAt being assigned at the
 * call site (not by the database) is what actually matters, and that's
 * already true the moment the caller passes it in here.
 */
function persistMessageBestEffort(
  conversationId: string,
  role: "user" | "bot",
  type: "text" | "product" | "tool-call" | "checkout-prep",
  content: string | null,
  payload: Record<string, unknown> | null,
  createdAt: string,
  contentSi: string | null = null
): void {
  persistMessage(conversationId, role, type, content, payload, createdAt, undefined, contentSi).catch((err) => {
    console.error(`[db] best-effort persist of ${role}/${type} permanently failed:`, err);
  });
}

/**
 * Generates a short conversation title using a fast LLM call, then writes
 * it to the DB. Called in parallel with the main chat loop on the first
 * message of a conversation so it doesn't add latency to the reply.
 *
 * Returns the generated title string so the caller can include it in the
 * API response — the frontend applies it directly rather than polling.
 * Returns null on any failure so the caller can degrade gracefully.
 */
async function generateAndSaveTitle(
  conversationId: string,
  firstMessage: string
): Promise<string | null> {
  try {
    const response = await callOpenRouter(
      [
        {
          role: "system",
          content:
            "You generate short conversation titles for a gift shopping assistant. " +
            "Given the user's first message, respond with ONLY a title — no quotes, " +
            "no punctuation at the end, no explanation. The title must be at most " +
            "6 words, describe what the user wants to shop for, and read naturally " +
            "as a chat thread label. Examples: " +
            '"Birthday gift for mum", ' +
            '"Wedding anniversary flowers", ' +
            '"Teacher appreciation gift under 2000".',
        },
        { role: "user", content: firstMessage },
      ],
      [] // no tools needed
    );

    const title = response.content?.trim().slice(0, 80) ?? null;
    if (!title) return null;

    const db = supabaseAdmin();
    const { error } = await db
      .from("conversations")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) {
      console.error("[title] failed to save generated title:", error.message);
      return null;
    }

    return title;
  } catch (err) {
    console.error("[title] failed to generate title:", err);
    return null;
  }
}

/**
 * Bumps conversations.updated_at so the sidebar sorts correctly after
 * each user message.
 */
async function touchConversation(conversationId: string): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/**
 * Verifies the JWT that the frontend passes in the Authorization header and
 * returns the user's UUID. Returns null if the token is missing or invalid.
 */
async function verifyJwt(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  // Use a per-request anon client to validate the token — createClient with
  // the anon key and then getUser() honours the token's claims and checks the
  // Supabase JWT secret. The service-role client bypasses this, so we use
  // a separate client here deliberately.
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

// ── /api/chat ─────────────────────────────────────────────────────────────────

app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId, cartItems, persona, orders, language } = req.body as {
      message: string;
      conversationId: string;
      cartItems?: Array<{ productId: string; name: string; quantity: number; price: number }>;
      persona?: string;
      orders?: OrderContext[];
      /** "si" translates the assistant's replies to Sinhala for display; anything else (or omitted) leaves them in English. Independent of input — a Sinhala message is auto-detected and translated to English regardless of this setting. */
      language?: string;
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }
    if (!conversationId || typeof conversationId !== "string") {
      return res.status(400).json({ error: "conversationId is required" });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const userId = await verifyJwt(req.headers.authorization);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify the conversation belongs to this user (belt-and-suspenders on
    // top of RLS — the service-role client bypasses RLS so we check manually).
    const db = supabaseAdmin();
    const { data: convoRow, error: convoError } = await db
      .from("conversations")
      .select("user_id")
      .eq("id", conversationId)
      .single();

    if (convoError || !convoRow || convoRow.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const requestStartedAt = Date.now();
    console.log(`\n[chat] new message in conversation ${conversationId}: "${message}"`);

    // Assigns each row in this turn a strictly increasing timestamp, in the
    // exact order calls are made — independent of which insert's network
    // round-trip actually finishes first. See persistMessage's comment for
    // why this matters.
    let sequenceCounter = 0;
    const nextCreatedAt = () => new Date(requestStartedAt + sequenceCounter++).toISOString();

    // ── Auto-detect + translate non-English input ────────────────────────────
    // Independent of the `language` toggle (which only controls the reply
    // direction) — a shopper might type Sinhala even with the toggle set to
    // English, and the model should never have to parse it either way.
    const inputTranslation = await detectAndTranslateToEnglish(message);
    if (inputTranslation.wasTranslated) {
      console.log(
        `[chat] translated input from ${inputTranslation.detectedLanguage ?? "unknown"}: "${message}" → "${inputTranslation.text}"`
      );
    }

    // ── Persist the user message first ───────────────────────────────────────
    // Load-bearing write — if it fails the next turn reconstructs context
    // without the user's message and the model appears to have amnesia.
    // Return a 500 rather than silently proceeding with a broken history.
    try {
      await persistMessage(
        conversationId,
        "user",
        "text",
        message,
        null,
        nextCreatedAt(),
        inputTranslation.wasTranslated ? inputTranslation.text : null
      );
    } catch (err) {
      console.error("[chat] could not persist user message — aborting turn:", err);
      return res.status(500).json({
        error: "Failed to save your message. Please try again.",
      });
    }

    // ── Start title generation in parallel with the main loop ─────────────────
    // We check whether this conversation already has a title and if not, kick
    // off a fast LLM call concurrently. titlePromise resolves alongside the
    // main chat loop — we await it just before sending the response so we can
    // include the generated title in the payload without adding latency.
    const { data: titleCheck } = await supabaseAdmin()
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .single();
    const needsTitle = !titleCheck?.title;

    const titlePromise = needsTitle
      ? generateAndSaveTitle(conversationId, message)
      : Promise.resolve(null);
    touchConversation(conversationId).catch(() => {});

    // ── Reconstruct context from DB ───────────────────────────────────────────
    const dbHistory = await loadConversationHistory(conversationId);

    const mcpTools = await mcpClient.listToolsForOpenAI(ALLOWED_TOOLS);
    const tools = [
      ...mcpTools,
      PREPARE_CHECKOUT_TOOL,
      ADD_TO_CART_TOOL,
      SHOW_PRODUCTS_TOOL,
      CONVERT_CURRENCY_TOOL,
      SET_ORDER_NUMBER_TOOL,
    ];

    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(persona) },
      ...dbHistory,
    ];

    // The user message is already the last entry in dbHistory (we just wrote
    // it), so we don't push it again — dbHistory already ends with it.

    // Inject live cart context after the history
    if (cartItems && cartItems.length > 0) {
      const cartSummary = cartItems
        .map((i) => `${i.name} x${i.quantity} (LKR ${i.price} each)`)
        .join(", ");
      messages.push({
        role: "system",
        content: `The shopper has these items in their cart: ${cartSummary}.`,
      });
    } else {
      messages.push({
        role: "system",
        content: "The shopper's cart is empty.",
      });
    }

    // Inject order context — mirrors the cart block above. Lets the model
    // know which orders exist and whether each already has a Kapruka order
    // number on file, so it doesn't ask for one it already has, and knows
    // which order_ref to pass to set_kapruka_order_number when the shopper
    // gives one.
    if (orders && orders.length > 0) {
      const orderLines = orders
        .map((o) => {
          const numberNote = o.hasKaprukaOrderNumber
            ? "already has a Kapruka order number on file"
            : "does NOT have a Kapruka order number on file yet";
          return `order_ref ${o.orderRef} (${o.itemsSummary}, placed ${o.createdAt}, status: ${o.status}) — ${numberNote}`;
        })
        .join("; ");
      messages.push({
        role: "system",
        content: `The shopper's orders: ${orderLines}.`,
      });
    }

    const events: ChatEvent[] = [];
    const productCache = new Map<string, Product>();

    // ── Agentic tool-calling loop ─────────────────────────────────────────────
    console.log("[chat] sending first OpenRouter call...");
    let response = await callOpenRouter(messages, tools);
    let round = 0;

    while (response.tool_calls && response.tool_calls.length > 0 && round < MAX_TOOL_ROUNDS) {
      round++;

      messages.push({
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls,
      });

      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
        console.log(`[chat] (round ${round}) model requested tool: ${toolName}`, args);

        const queryTerm = args.q ?? args.query ?? args.product_id ?? args.category ?? message;
        const isDetailTool = toolName === "kapruka_get_product";
        const isSearchTool = toolName === "kapruka_search_products";
        const isCityTool = toolName === "kapruka_list_delivery_cities";
        const isDeliveryTool = toolName === "kapruka_check_delivery";
        const isOrderTool = toolName === "kapruka_create_order";
        const isTrackTool = toolName === "kapruka_track_order";
        const isPrepTool = toolName === "prepare_checkout";
        const isAddToCartTool = toolName === "add_to_cart";
        const isShowProductsTool = toolName === "show_products";
        const isConvertCurrencyTool = toolName === "convert_currency";
        const isSetOrderNumberTool = toolName === "set_kapruka_order_number";

        const label = isPrepTool
          ? "Filling in your checkout details..."
          : isAddToCartTool
            ? "Adding to your cart..."
            : isShowProductsTool
              ? "Picking the best matches for you..."
              : isCityTool
                ? `Looking up city "${queryTerm}"`
                : isDeliveryTool
                  ? "Checking delivery availability"
                  : isOrderTool
                    ? "Creating your order..."
                    : isTrackTool || isSetOrderNumberTool
                      ? "Checking your order status..."
                      : `Searching Kapruka for "${queryTerm}"`;

        if (!isDetailTool && !isConvertCurrencyTool) {
          events.push({ type: "tool-call", label });
          // Tool-call indicators are context hints, not load-bearing — a missing
          // one slightly reduces context quality but doesn't corrupt it.
          persistMessageBestEffort(conversationId, "bot", "tool-call", null, { label }, nextCreatedAt());
        }

        if (isAddToCartTool) {
          const requested =
            (args.items as Array<{ product_id?: string; quantity?: number }> | undefined) ?? [];
          const resolved: CartItem[] = [];
          const failed: string[] = [];

          for (const entry of requested) {
            const productId = entry.product_id;
            if (!productId) continue;
            const quantity = Math.max(1, Math.floor(entry.quantity ?? 1));

            try {
              const detailText = await mcpClient.callTool("kapruka_get_product", {
                product_id: productId,
              });
              const parsed = parseProductsFromToolResult(detailText);
              if ("products" in parsed && parsed.products.length > 0) {
                const product = parsed.products[0];
                resolved.push({
                  productId: product.id,
                  name: product.name,
                  price: product.price ?? 0,
                  currency: product.currency,
                  quantity,
                  imageUrl: product.imageUrl,
                });
              } else {
                failed.push(productId);
              }
            } catch (err) {
              console.warn(`[chat] add_to_cart couldn't resolve ${productId}:`, err);
              failed.push(productId);
            }
          }

          if (resolved.length > 0) {
            events.push({ type: "add-to-cart", items: resolved });
          }

          const parts: string[] = [];
          if (resolved.length > 0) {
            parts.push(
              "Added to cart: " + resolved.map((i) => `${i.name} x${i.quantity}`).join(", ") + "."
            );
          }
          if (failed.length > 0) {
            parts.push(`Could not find product(s): ${failed.join(", ")}.`);
          }
          const resultText =
            parts.length > 0
              ? parts.join(" ")
              : "No items were added — no valid product_id was given.";

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: resultText,
          });
        } else if (isPrepTool) {
          const missing: string[] = [];
          if (!args.recipientName) missing.push("recipientName");
          if (!args.recipientPhone) missing.push("recipientPhone");
          if (!args.senderName) missing.push("senderName");
          if (!args.deliveryAddress) missing.push("deliveryAddress");
          if (!args.deliveryCity) missing.push("deliveryCity");
          if (!args.deliveryDate) missing.push("deliveryDate");

          let resultText: string;
          if (missing.length > 0) {
            resultText = `Missing required fields: ${missing.join(", ")}. Please ask the shopper for these details.`;
            events.push({ type: "checkout-prep", giftDetails: args });
            await persistMessage(conversationId, "bot", "checkout-prep", null, args, nextCreatedAt());
          } else {
            const giftDetails = {
              recipientName: args.recipientName,
              recipientPhone: args.recipientPhone,
              senderName: args.senderName,
              anonymous: args.anonymous ?? false,
              deliveryAddress: args.deliveryAddress,
              deliveryCity: args.deliveryCity,
              deliveryDate: args.deliveryDate,
              locationType: args.locationType ?? "house",
              deliveryInstructions: (args.deliveryInstructions as string) ?? "",
              giftMessage: (args.giftMessage as string) ?? "",
            };
            events.push({ type: "checkout-prep", giftDetails });
            await persistMessage(conversationId, "bot", "checkout-prep", null, giftDetails, nextCreatedAt());
            resultText =
              "Checkout form has been pre-filled. The shopper can now click Place Order to generate a payment link.";
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: resultText,
          });
        } else if (isShowProductsTool) {
          const requestedIds = (args.product_ids as string[] | undefined) ?? [];
          const shownNames: string[] = [];
          const notFound: string[] = [];

          for (const id of requestedIds) {
            const product = productCache.get(id);
            if (product) {
              events.push({ type: "product", product });
              shownNames.push(product.name);
              // Load-bearing write — loadConversationHistory reconstructs the
              // product buffer from these rows. Await so a failure surfaces here
              // rather than silently breaking the next turn's context.
              await persistMessage(
                conversationId,
                "bot",
                "product",
                null,
                product as unknown as Record<string, unknown>,
                nextCreatedAt()
              );
            } else {
              notFound.push(id);
            }
          }

          const parts: string[] = [];
          if (shownNames.length > 0) {
            parts.push(`Showed: ${shownNames.join(", ")}.`);
          }
          if (notFound.length > 0) {
            parts.push(`Not found in this turn's results: ${notFound.join(", ")}.`);
          }
          const resultText =
            parts.length > 0
              ? parts.join(" ")
              : "No product ids were given — nothing was shown.";

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: resultText,
          });
        } else if (isConvertCurrencyTool) {
          const amount = typeof args.amount === "number" ? args.amount : parseFloat(String(args.amount));
          const from = String(args.from ?? "").trim();
          const to = String(args.to ?? "").trim();

          let resultText: string;
          if (!from || !to || Number.isNaN(amount)) {
            resultText = "Error: amount, from, and to are all required.";
          } else {
            const rates = await fetchLkrRates();
            const converted = convertCurrency(amount, from, to, rates);
            resultText = converted === null ? `Error: unrecognized currency code ("${from}" or "${to}"). Use a standard 3-letter code.`
            : JSON.stringify({amount, from: from.toUpperCase(), to: to.toUpperCase(), converted: Math.round(converted * 100) / 100, });
          }
          messages.push({ role: "tool", tool_call_id: toolCall.id, name: toolName, content: resultText, });

        } else if (isSetOrderNumberTool) {
          const orderRefArg = String(args.order_ref ?? "").trim();
          const orderNumberArg = String(args.order_number ?? "").trim();

          let resultText: string;

          if (!orderRefArg || !orderNumberArg) {
            resultText = "Error: both order_ref and order_number are required.";
          } else if (orderNumberArg.length < 4 || orderNumberArg.length > 40) {
            resultText = "Error: that doesn't look like a valid Kapruka order number.";
          } else {
            // Ownership check — this writes to the DB on the shopper's behalf,
            // so confirm the order actually belongs to the authenticated user
            // before touching it (same check /api/orders/:orderRef/track does).
            const { data: orderRow, error: orderLookupError } = await db
              .from("orders")
              .select("id, user_id")
              .eq("order_ref", orderRefArg)
              .single();

            if (orderLookupError || !orderRow) {
              resultText = `Error: no order found with reference ${orderRefArg}.`;
            } else if (orderRow.user_id !== userId) {
              resultText = "Error: that order doesn't belong to this shopper.";
            } else {
              const trackResultText = await mcpClient.callTool("kapruka_track_order", {
                order_number: orderNumberArg,
              });

              let tracking: Record<string, unknown> | null = null;
              try {
                tracking = JSON.parse(trackResultText) as Record<string, unknown>;
              } catch {
                tracking = null;
              }

              if (!tracking || tracking.error) {
                resultText = tracking?.error
                  ? `Error: ${String(tracking.error)}`
                  : trackResultText.startsWith("Error:")
                    ? trackResultText
                    : "Error: couldn't look up that order number — double check it and try again.";
              } else {
                const status = typeof tracking.status === "string" ? tracking.status : "pending";

                const { data: updatedOrder, error: updateError } = await db
                  .from("orders")
                  .update({
                    status,
                    tracking,
                    kapruka_order_number: orderNumberArg,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("order_ref", orderRefArg)
                  .select()
                  .single();

                if (updateError || !updatedOrder) {
                  resultText = "Error: found the order status but couldn't save it — try again.";
                } else {
                  events.push({ type: "order-tracked", order: updatedOrder });
                  const statusDisplay =
                    typeof tracking.status_display === "string" ? tracking.status_display : status;
                  resultText = `Order number saved. Current status: ${statusDisplay}.`;
                }
              }
            }
          }

          messages.push({ role: "tool", tool_call_id: toolCall.id, name: toolName, content: resultText });
        } else {
          // ── MCP tool handler ──────────────────────────────────────────────
          const resultText = await mcpClient.callTool(toolName, args);

          if (isSearchTool || isDetailTool) {
            const parsed = parseProductsFromToolResult(resultText);
            if ("products" in parsed) {
              console.log(
                `[chat] parsed ${parsed.products.length} product(s), caching for show_products`
              );
              for (const product of parsed.products) {
                productCache.set(product.id, product);
              }
            }
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: resultText,
          });
        }
      }

      const roundsLeft = MAX_TOOL_ROUNDS - round;
      messages.push({
        role: "system",
        content:
          roundsLeft <= 1
            ? `You have ${roundsLeft} tool-calling round left. This is your ` +
              `last chance to call a tool this turn — if you still need to, ` +
              `call show_products (or prepare_checkout, if applicable) now ` +
              `with your best available results. After this, you must reply ` +
              `in plain text with no further tool calls.`
            : `You have used ${round} of ${MAX_TOOL_ROUNDS} tool-calling ` +
              `rounds this turn. You have ${roundsLeft} left. Plan " +
              "accordingly — don't start a multi-step chain you can't finish.`,
      });

      console.log(`[chat] sending OpenRouter call (round ${round + 1})...`);
      response = await callOpenRouter(messages, tools);
    }

    if (round >= MAX_TOOL_ROUNDS && response.tool_calls && response.tool_calls.length > 0) {
      console.warn(`[chat] hit MAX_TOOL_ROUNDS (${MAX_TOOL_ROUNDS}) with more tool calls pending`);

      const alreadyShownIds = new Set(
        events
          .filter((e): e is { type: "product"; product: Product } => e.type === "product")
          .map((e) => e.product.id)
      );
      const unseenCached = Array.from(productCache.values()).filter(
        (p) => !alreadyShownIds.has(p.id)
      );

      if (unseenCached.length > 0) {
        for (const product of unseenCached.slice(-4)) {
          events.push({ type: "product", product });
          await persistMessage(
            conversationId,
            "bot",
            "product",
            null,
            product as unknown as Record<string, unknown>,
            nextCreatedAt()
          );
        }
        const fallbackText =
          "Sorry that took a bit long — here's what I found so far. Let me know if you'd like more options.";
        const fallbackSi = await translateFromEnglish(fallbackText, "si", Array.from(productCache.values()));
        events.push({
          type: "text",
          content: fallbackText,
          content_si: fallbackSi,
        });
        persistMessageBestEffort(conversationId, "bot", "text", fallbackText, null, nextCreatedAt(), fallbackSi);
      } else {
        const fallbackText2 =
          "Sorry, that's taking a moment longer than expected — could you try that again?";
        const fallbackSi2 = await translateFromEnglish(fallbackText2, "si", Array.from(productCache.values()));
        events.push({
          type: "text",
          content: fallbackText2,
          content_si: fallbackSi2,
        });
        persistMessageBestEffort(conversationId, "bot", "text", fallbackText2, null, nextCreatedAt(), fallbackSi2);
      }
    } else {
      const looksLikeTagEcho = (text: string) =>
        /^\s*[[(](tool|products? shown|checkout form)\b/i.test(text) || text.trim().length === 0;

      let finalContent = response.content ?? "";

      if (looksLikeTagEcho(finalContent)) {
        console.warn(
          `[chat] model echoed a tag instead of replying ("${finalContent}"), retrying once`
        );
        messages.push({ role: "assistant", content: finalContent });
        messages.push({
          role: "system",
          content:
            "Your last reply wasn't valid — it looked like an internal tag instead of a normal " +
            "answer. Reply in plain conversational sentences only, with no brackets or tags. If " +
            "you meant to use a tool, call it for real rather than writing it as text.",
        });

        const retry = await callOpenRouter(messages, tools);
        const retryContent = retry.content ?? "";

        finalContent =
          !retry.tool_calls && !looksLikeTagEcho(retryContent)
            ? retryContent
            : "Sorry, I glitched there for a second — could you say that again?";
      }

      const siContent = await translateFromEnglish(finalContent, "si", Array.from(productCache.values()));
      events.push({
        type: "text",
        content: finalContent,
        content_si: siContent,
      });
      // Load-bearing — the model's reply must be in DB so the next turn sees it.
      // Persisted in English (content) and Sinhala (content_si) so the frontend
      // can display either language depending on the user's toggle — without
      // needing a re-translation on page reload or toggle switch.
      await persistMessage(conversationId, "bot", "text", finalContent, null, nextCreatedAt(), undefined, siContent);
    }

    // Await the title promise — it was running in parallel with the main loop
    // so in most cases it's already resolved by now and this is instant.
    // We include the result in the response so the frontend can apply it
    // directly without polling or a timed refresh.
    const generatedTitle = await titlePromise.catch(() => null);

    console.log(`[chat] done in ${Date.now() - requestStartedAt}ms total\n`);
    res.json({ events, ...(generatedTitle ? { generatedTitle } : {}) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ── /api/checkout ─────────────────────────────────────────────────────────────

interface CheckoutItem {
  productId: string;
  quantity: number;
  // The frontend's cartStore actually sends the full CartItem shape (these
  // extra fields were previously just ignored) — we read them here to
  // build a product snapshot for the orders table.
  name?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
}

interface CheckoutGiftDetails {
  recipientName: string;
  recipientPhone: string;
  senderName: string;
  anonymous: boolean;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  locationType: string;
  deliveryInstructions: string;
  giftMessage: string;
}

/**
 * Fingerprints a checkout attempt from (userId, cart, gift details) so
 * identical resubmissions — a double-click, a slow-network retry, "Regenerate
 * link", or reopening cart and placing the same order again — can be
 * detected before we call kapruka_create_order a second time for the same
 * intent. Items are sorted by productId first so the fingerprint doesn't
 * change just because items were added in a different order.
 */
function computeCheckoutFingerprint(
  userId: string,
  items: CheckoutItem[],
  giftDetails: CheckoutGiftDetails
): string {
  const normalizedItems = items
    .map((item) => ({ productId: item.productId, quantity: item.quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const normalizedGiftDetails = {
    recipientName: giftDetails.recipientName,
    recipientPhone: giftDetails.recipientPhone,
    senderName: giftDetails.senderName,
    anonymous: giftDetails.anonymous ?? false,
    deliveryAddress: giftDetails.deliveryAddress,
    deliveryCity: giftDetails.deliveryCity,
    deliveryDate: giftDetails.deliveryDate,
    locationType: giftDetails.locationType ?? "house",
    deliveryInstructions: giftDetails.deliveryInstructions || "",
    giftMessage: giftDetails.giftMessage || "",
  };

  const canonical = JSON.stringify({ userId, items: normalizedItems, giftDetails: normalizedGiftDetails });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

app.post("/api/checkout", async (req, res) => {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    // Checkout places a real Kapruka order — require a valid session so an
    // unauthenticated caller can't trigger orders against the Kapruka API.
    const userId = await verifyJwt(req.headers.authorization);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { items, giftDetails, conversationId } = req.body as {
      items: CheckoutItem[];
      giftDetails: CheckoutGiftDetails;
      conversationId?: string;
    };

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }
    if (!giftDetails) {
      return res.status(400).json({ error: "Gift details are required" });
    }

    const missing: string[] = [];
    if (!giftDetails.recipientName) missing.push("recipientName");
    if (!giftDetails.recipientPhone) missing.push("recipientPhone");
    if (!giftDetails.senderName) missing.push("senderName");
    if (!giftDetails.deliveryAddress) missing.push("deliveryAddress");
    if (!giftDetails.deliveryCity) missing.push("deliveryCity");
    if (!giftDetails.deliveryDate) missing.push("deliveryDate");
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    const db = supabaseAdmin();
    const fingerprint = computeCheckoutFingerprint(userId, items, giftDetails);

    // ── Idempotency check ──────────────────────────────────────────────────
    // Look for an existing order from this exact same checkout intent
    // (same user, same cart, same gift details) that's still pending, was
    // never tracked (so definitely never paid), and hasn't expired yet. If
    // one exists, this is a resubmission — a double-click, a retried
    // request, "Regenerate link", or re-placing an unedited cart — not a
    // genuinely new order, so reuse it instead of calling
    // kapruka_create_order again.
    const { data: existingOrder, error: existingOrderError } = await db
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("checkout_fingerprint", fingerprint)
      .eq("status", "pending")
      .is("kapruka_order_number", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrderError) {
      // Non-fatal — fingerprint lookup failing (e.g. column not migrated
      // yet) shouldn't block a real checkout attempt. Log and proceed as if
      // no duplicate was found.
      console.warn("[checkout] idempotency lookup failed, proceeding without it:", existingOrderError.message);
    }

    if (existingOrder) {
      console.log("[checkout] duplicate checkout detected, reusing order:", existingOrder.order_ref);
      return res.json({
        checkoutUrl: existingOrder.checkout_url,
        orderRef: existingOrder.order_ref,
        summary: {
          itemsTotal: existingOrder.items_total ?? 0,
          deliveryFee: existingOrder.delivery_fee ?? 0,
          grandTotal: existingOrder.grand_total ?? 0,
          currency: existingOrder.currency ?? "LKR",
        },
        expiresAt: existingOrder.expires_at,
      });
    }

    console.log("[checkout] checking delivery for", giftDetails.deliveryCity, giftDetails.deliveryDate);
    const deliveryResultText = await mcpClient.callTool("kapruka_check_delivery", {
      city: giftDetails.deliveryCity,
      delivery_date: giftDetails.deliveryDate,
      product_id: items[0].productId,
    });

    let deliveryCheck: Record<string, unknown> | null = null;
    try {
      deliveryCheck = JSON.parse(deliveryResultText) as Record<string, unknown>;
    } catch {
      if (deliveryResultText.includes("Error:")) {
        return res.status(400).json({ error: deliveryResultText.replace("Error: ", "").slice(0, 200) });
      }
      console.warn("[checkout] could not parse delivery check response, proceeding anyway");
    }

    if (deliveryCheck && deliveryCheck.available === false) {
      const reason = deliveryCheck.reason ?? "Delivery not available";
      const nextDate = deliveryCheck.next_available_date
        ? ` Next available: ${deliveryCheck.next_available_date}.`
        : "";
      return res.status(400).json({ error: `${reason}.${nextDate}` });
    }

    const deliveryRate = (deliveryCheck?.rate as number) ?? 0;

    console.log("[checkout] creating order...");
    const cartItems = items.map((item) => ({
      product_id: item.productId,
      quantity: Math.min(item.quantity, 99),
    }));

    const orderResultText = await mcpClient.callTool("kapruka_create_order", {
      cart: cartItems,
      recipient: {
        name: giftDetails.recipientName,
        phone: giftDetails.recipientPhone,
      },
      delivery: {
        address: giftDetails.deliveryAddress,
        city: giftDetails.deliveryCity,
        date: giftDetails.deliveryDate,
        location_type: giftDetails.locationType ?? "house",
        instructions: giftDetails.deliveryInstructions || null,
      },
      sender: {
        name: giftDetails.senderName,
        anonymous: giftDetails.anonymous ?? false,
      },
      gift_message: giftDetails.giftMessage || null,
    });

    let orderResponse: Record<string, unknown>;
    try {
      orderResponse = JSON.parse(orderResultText) as Record<string, unknown>;
    } catch {
      if (orderResultText.startsWith("Error:")) {
        return res.status(400).json({ error: orderResultText.replace("Error: ", "").slice(0, 300) });
      }
      return res.status(500).json({ error: "Unexpected order response format" });
    }

    if (orderResponse.error || !orderResponse.checkout_url) {
      return res.status(400).json({
        error:
          typeof orderResponse.error === "string"
            ? orderResponse.error
            : "Order creation failed — no checkout URL returned",
      });
    }

    const summary = orderResponse.summary as Record<string, unknown> | undefined;

    console.log("[checkout] order created:", orderResponse.order_ref);

    const responseBody = {
      checkoutUrl: orderResponse.checkout_url,
      orderRef: orderResponse.order_ref,
      summary: {
        itemsTotal: typeof summary?.items_total === "number" ? summary.items_total : 0,
        deliveryFee: typeof summary?.delivery_fee === "number" ? summary.delivery_fee : deliveryRate,
        grandTotal: typeof summary?.grand_total === "number" ? summary.grand_total : 0,
        currency: summary?.currency ?? "LKR",
      },
      expiresAt: orderResponse.expires_at,
    };

    // Best-effort: persist an order record so Order History has something
    // to show. The real Kapruka order already succeeded above — if this
    // insert fails (e.g. schema not migrated yet), we log and still return
    // the successful checkout response rather than fail the whole request.
    // A unique violation here (code 23505) means another request with the
    // exact same fingerprint won the race and inserted first — see the
    // partial unique index in the migration. That's a rare concurrent-click
    // edge case, not a real failure: the Kapruka order above still
    // succeeded, so we still return it rather than erroring out.
    try {
      await db.from("orders").insert({
        user_id: userId,
        conversation_id: conversationId ?? null,
        order_ref: responseBody.orderRef,
        checkout_url: responseBody.checkoutUrl,
        checkout_fingerprint: fingerprint,
        items: items.map((item) => ({
          productId: item.productId,
          name: item.name ?? item.productId,
          price: item.price ?? null,
          currency: item.currency ?? responseBody.summary.currency,
          imageUrl: item.imageUrl ?? null,
          quantity: item.quantity,
        })),
        items_total: responseBody.summary.itemsTotal,
        delivery_fee: responseBody.summary.deliveryFee,
        grand_total: responseBody.summary.grandTotal,
        currency: responseBody.summary.currency,
        status: "pending",
        expires_at: responseBody.expiresAt ?? null,
      });
    } catch (orderInsertError) {
      console.error("[checkout] failed to save order record (order still placed):", orderInsertError);
    }

    res.json(responseBody);
  } catch (error) {
    console.error("[checkout] error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Checkout failed" });
  }
});

// ── /api/orders/:orderRef/track ─────────────────────────────────────────────
// Refreshes an order's status via Kapruka's tracking tool and persists the
// result.
//
// `orderRef` (the URL param) is OUR internal identifier — the checkout
// reference returned by kapruka_create_order before payment. It is NOT
// what kapruka_track_order needs. That tool requires `order_number`, the
// Kapruka order number the customer only receives by email *after* they
// complete payment (e.g. 'VIMP34456CB2'). We use orderRef purely to look up
// the right row and confirm ownership; the value actually sent to Kapruka
// is the customer-supplied order_number, read from the request body (or
// reused from `kapruka_order_number` if we already saved it from a prior
// call).
app.post("/api/orders/:orderRef/track", async (req, res) => {
  try {
    const userId = await verifyJwt(req.headers.authorization);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { orderRef } = req.params;
    const { orderNumber } = req.body as { orderNumber?: string };
    const db = supabaseAdmin();

    const { data: orderRow, error: orderError } = await db
      .from("orders")
      .select("id, user_id, kapruka_order_number")
      .eq("order_ref", orderRef)
      .single();

    if (orderError || !orderRow) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (orderRow.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Prefer a freshly-submitted number over whatever's already on file —
    // lets the customer correct a typo by just re-entering it.
    const numberToUse = (orderNumber && orderNumber.trim()) || orderRow.kapruka_order_number;

    if (!numberToUse) {
      return res.status(400).json({
        error: "Enter the Kapruka order number from your confirmation email to track this order.",
      });
    }
    // Mirrors kapruka_track_order's own schema constraints (minLength 4,
    // maxLength 40) — fail fast with a clear message rather than letting
    // the MCP server reject it.
    if (numberToUse.length < 4 || numberToUse.length > 40) {
      return res.status(400).json({ error: "That doesn't look like a valid Kapruka order number." });
    }

    const trackResultText = await mcpClient.callTool("kapruka_track_order", {
      order_number: numberToUse,
    });

    let tracking: Record<string, unknown>;
    try {
      tracking = JSON.parse(trackResultText) as Record<string, unknown>;
    } catch {
      if (trackResultText.startsWith("Error:")) {
        return res.status(400).json({ error: trackResultText.replace("Error: ", "").slice(0, 200) });
      }
      console.error("[track] unexpected tracking response:", trackResultText);
      return res.status(502).json({ error: "Couldn't parse tracking response" });
    }

    if (tracking.error) {
      return res.status(400).json({ error: String(tracking.error) });
    }

    const status = typeof tracking.status === "string" ? tracking.status : "pending";

    const { data: updated, error: updateError } = await db
      .from("orders")
      .update({
        status,
        tracking,
        kapruka_order_number: numberToUse,
        updated_at: new Date().toISOString(),
      })
      .eq("order_ref", orderRef)
      .select()
      .single();

    if (updateError) {
      console.error("[track] failed to persist tracking update:", updateError);
      return res.status(500).json({ error: "Failed to save tracking update" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[track] error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Tracking failed" });
  }
});

// ── /api/orders/:orderRef ───────────────────────────────────────────────────
// Deletes an order from the shopper's local history. Only ever removes our
// own row — there's no cancel tool on the Kapruka MCP server, so nothing is
// cancelled on Kapruka's side. That's why this is restricted to orders that
// are still `pending` AND have no `kapruka_order_number` on file: that
// combination means the order was created but never tracked, which means it
// was never paid — Kapruka's own unpaid checkout session already expires on
// its own (see `expires_at`), so there's nothing left to clean up there.
// Once an order has a Kapruka order number, it's a real, trackable order and
// this endpoint refuses to touch it.
app.delete("/api/orders/:orderRef", async (req, res) => {
  try {
    const userId = await verifyJwt(req.headers.authorization);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { orderRef } = req.params;
    const db = supabaseAdmin();

    const { data: orderRow, error: orderError } = await db
      .from("orders")
      .select("id, user_id, status, kapruka_order_number")
      .eq("order_ref", orderRef)
      .single();

    if (orderError || !orderRow) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (orderRow.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (orderRow.status !== "pending" || orderRow.kapruka_order_number) {
      return res.status(400).json({
        error: "Only pending orders that haven't been tracked yet can be deleted.",
      });
    }

    const { error: deleteError } = await db.from("orders").delete().eq("order_ref", orderRef);

    if (deleteError) {
      console.error("[orders] failed to delete order:", deleteError);
      return res.status(500).json({ error: "Failed to delete order" });
    }

    res.status(204).end();
  } catch (error) {
    console.error("[orders] delete error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Delete failed" });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Gift concierge backend listening on http://localhost:${port}`);
});