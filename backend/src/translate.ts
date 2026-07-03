// Thin wrapper around Azure AI Translator's v3 REST API. Used for two
// things: (1) auto-detecting and translating incoming Sinhala messages to
// English before they reach the (deliberately lightweight) LLM, so it only
// ever has to reason in English, and (2) translating the LLM's English
// replies to Sinhala for display when the shopper has the language toggle
// set to Sinhala.
//
// Both directions fail open — if the Translator API is unreachable or
// misconfigured, we log a warning and fall back to the original text
// rather than breaking the chat. A translation hiccup should degrade
// gracefully, not take down the whole conversation.

const ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT ?? "https://api.cognitive.microsofttranslator.com";

interface AzureTranslateResult {
  detectedLanguage?: { language: string; score: number };
  translations: Array<{ text: string; to: string }>;
}

async function callAzureTranslate(
  text: string,
  to: string,
  from?: string
): Promise<AzureTranslateResult | null> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key || !region) {
    console.warn("[translate] AZURE_TRANSLATOR_KEY/REGION not configured — skipping translation");
    return null;
  }

  const params = new URLSearchParams({ "api-version": "3.0", to });
  if (from) params.set("from", from);

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

/**
 * Translates English text to the given target language (currently only
 * ever "si" in this app). Falls back to the original English text if the
 * API call fails, so the shopper still gets a reply — just in English —
 * rather than an error.
 */
export async function translateFromEnglish(text: string, to: string): Promise<string> {
  if (!text.trim()) return text;

  const result = await callAzureTranslate(text, to, "en");
  if (!result || !result.translations[0]) {
    return text;
  }
  return result.translations[0].text;
}
