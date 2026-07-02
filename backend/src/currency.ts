// backend/currency.ts

const PRIMARY_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/lkr.json";
const FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/lkr.json";

// Rates are LKR-per-unit-of-currency (e.g. rates.usd = 0.0034 means 1 LKR = 0.0034 USD).
let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour is plenty fresh for a chat concierge

export async function fetchLkrRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedRates && now - cachedAt < CACHE_TTL_MS) return cachedRates;

  for (const url of [PRIMARY_URL, FALLBACK_URL]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { lkr: Record<string, number> };
      cachedRates = data.lkr;
      cachedAt = now;
      return cachedRates;
    } catch {
      // try the next URL
    }
  }

  console.error("[currency] failed to fetch FX rates from both sources");
  // Serve a stale cache rather than nothing if we have one
  return cachedRates ?? {};
}

/**
 * Converts `amount` from one currency code to another, routing through LKR
 * since that's the only base the free API gives us. Returns null if either
 * code isn't recognized.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  ratesLkrBase: Record<string, number>
): number | null {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  if (fromLower === toLower) return amount;

  let amountInLkr: number;
  if (fromLower === "lkr") {
    amountInLkr = amount;
  } else {
    const rate = ratesLkrBase[fromLower];
    if (typeof rate !== "number" || rate === 0) return null;
    amountInLkr = amount / rate;
  }

  if (toLower === "lkr") return amountInLkr;

  const targetRate = ratesLkrBase[toLower];
  if (typeof targetRate !== "number") return null;
  return amountInLkr * targetRate;
}