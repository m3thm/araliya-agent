// Thin wrapper around Azure AI Translator's v3 REST API. Used for two
// things: (1) auto-detecting and translating incoming Sinhala messages to
// English before they reach the LLM, so it only
// ever has to reason in English, and (2) translating the LLM's English
// replies to Sinhala for display when the shopper has the language toggle
// set to Sinhala.
//
// Both directions fail open — if the Translator API is unreachable or
// misconfigured, we log a warning and fall back to the original text
// rather than breaking the chat. A translation hiccup should degrade
// gracefully, not take down the whole conversation.
//
// Product-name protection: when translating an English reply to Sinhala,
// any known product names (from that turn's productCache) are wrapped in
// <span class="notranslate"> and the request is sent with textType=html,
// which is Azure's documented mechanism for excluding specific spans from
// translation. See protectProductNames / stripProtectionMarkup below.

import type { Product } from "./normalizeProduct.js";

const ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT ?? "https://api.cognitive.microsofttranslator.com";

interface AzureTranslateResult {
  detectedLanguage?: { language: string; score: number };
  translations: Array<{ text: string; to: string }>;
}

async function callAzureTranslate(
  text: string,
  to: string,
  from?: string,
  textType?: "plain" | "html"
): Promise<AzureTranslateResult | null> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key || !region) {
    console.warn("[translate] AZURE_TRANSLATOR_KEY/REGION not configured — skipping translation");
    return null;
  }

  const params = new URLSearchParams({ "api-version": "3.0", to });
  if (from) params.set("from", from);
  if (textType) params.set("textType", textType);

  try {
    const response = await fetch(`${ENDPOINT}/translate?${params.toString()}`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ Text: text }]),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[translate] Azure Translator returned ${response.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as AzureTranslateResult[];
    return data[0] ?? null;
  } catch (err) {
    console.warn("[translate] Azure Translator request failed:", err);
    return null;
  }
}

/**
 * Auto-detects the language of `text` and translates it to English if it
 * isn't already. Used on every incoming shopper message, regardless of the
 * language toggle — a shopper might type in Sinhala even while the toggle
 * is set to English, and the model should never have to parse Sinhala
 * itself either way.
 */
export async function detectAndTranslateToEnglish(
  text: string
): Promise<{ text: string; wasTranslated: boolean; detectedLanguage: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { text, wasTranslated: false, detectedLanguage: null };
  }

  const result = await callAzureTranslate(trimmed, "en");
  if (!result || !result.translations[0]) {
    // Fail open — the model gets the original text. If it's genuinely
    // Sinhala and the API is down, replies may be degraded, but the
    // conversation keeps working rather than erroring out.
    return { text, wasTranslated: false, detectedLanguage: null };
  }

  const detectedLanguage = result.detectedLanguage?.language ?? null;
  if (detectedLanguage && detectedLanguage.startsWith("en")) {
    // Already English — use the original text verbatim rather than a
    // round-tripped version, which could subtly reword idiomatic English.
    return { text, wasTranslated: false, detectedLanguage };
  }

  return { text: result.translations[0].text, wasTranslated: true, detectedLanguage };
}

// ── Product-name protection ─────────────────────────────────────────────
//
// Azure's textType=html mode requires the input to actually be valid-ish
// HTML — stray &, <, > left over from plain English text could be misread
// as markup — so any text going through this path needs to be escaped
// first, and the corresponding entities need to be undone afterward.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unescapeHtml(text: string): string {
  // &amp; must be unescaped last, or "&amp;lt;" would incorrectly become "<".
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * HTML-escapes `text`, then wraps any of `names` that appear in it with
 * <span class="notranslate">, so Azure's translator leaves that exact
 * substring untouched. Longest names are matched first so e.g. "Royal Lily
 * Bouquet" is claimed whole rather than leaving "Lily Bouquet" to match
 * separately inside it, and matched ranges are tracked so no character is
 * wrapped twice. Matching is case-insensitive but the original casing as
 * it appears in `text` is preserved in the output.
 */
export function protectProductNames(text: string, names: string[]): string {
  const escapedText = escapeHtml(text);

  const uniqueNames = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))
  ).sort((a, b) => b.length - a.length);

  if (uniqueNames.length === 0) return escapedText;

  const consumed = new Array(escapedText.length).fill(false);
  const matches: Array<{ start: number; end: number }> = [];

  for (const name of uniqueNames) {
    const escapedName = escapeHtml(name);
    if (!escapedName) continue;

    const pattern = new RegExp(`\\b${escapeRegExp(escapedName)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(escapedText)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      let overlaps = false;
      for (let i = start; i < end; i++) {
        if (consumed[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = start; i < end; i++) consumed[i] = true;
        matches.push({ start, end });
      }

      // Guard against zero-length matches looping forever.
      if (pattern.lastIndex === m.index) pattern.lastIndex++;
    }
  }

  if (matches.length === 0) return escapedText;

  matches.sort((a, b) => a.start - b.start);

  let result = "";
  let cursor = 0;
  for (const { start, end } of matches) {
    result += escapedText.slice(cursor, start);
    result += `<span class="notranslate">${escapedText.slice(start, end)}</span>`;
    cursor = end;
  }
  result += escapedText.slice(cursor);
  return result;
}

/**
 * Reverses protectProductNames' output on the *translated* text: strips
 * the notranslate span tags Azure passed through untouched, then
 * HTML-unescapes the rest of the sentence (which came back from Azure as
 * HTML since we sent textType=html).
 */
export function stripProtectionMarkup(text: string): string {
  const withoutSpans = text
    .replace(/<span class="notranslate">/gi, "")
    .replace(/<\/span>/gi, "");
  return unescapeHtml(withoutSpans);
}

/**
 * Translates English text to the given target language (currently only
 * ever "si" in this app). Falls back to the original English text if the
 * API call fails, so the shopper still gets a reply — just in English —
 * rather than an error.
 *
 * If `products` is given, any of their names found in `text` are protected
 * from translation via Azure's notranslate span mechanism, so product
 * names come back in the Sinhala reply exactly as written rather than
 * transliterated or reworded.
 */
export async function translateFromEnglish(
  text: string,
  to: string,
  products: Product[] = []
): Promise<string> {
  if (!text.trim()) return text;

  const names = products
    .map((p) => p.name)
    .filter((n): n is string => Boolean(n && n.trim()));

  if (names.length === 0) {
    const result = await callAzureTranslate(text, to, "en");
    if (!result || !result.translations[0]) {
      return text;
    }
    return result.translations[0].text;
  }

  const protectedText = protectProductNames(text, names);
  const result = await callAzureTranslate(protectedText, to, "en", "html");
  if (!result || !result.translations[0]) {
    // Fail open — original, unprotected English text rather than an error.
    return text;
  }
  return stripProtectionMarkup(result.translations[0].text);
}