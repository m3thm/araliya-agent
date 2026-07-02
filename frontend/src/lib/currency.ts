import type { DisplayCurrency } from "../types";

// Free, keyless FX data (https://github.com/fawazahmed0/exchange-api).
// Served as static JSON via two CDNs — try jsdelivr first, fall back to
// the Cloudflare Pages mirror if that's unreachable (their own docs
// recommend this pattern). Rates are LKR-based since that's the currency
// every price in this app originates in.
const PRIMARY_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/lkr.json";
const FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/lkr.json";

/** Fetches { usd: 0.0034, gbp: 0.0027, ... } — LKR-per-unit rates, keyed lowercase. */
export async function fetchLkrRates(): Promise<Record<string, number>> {
  for (const url of [PRIMARY_URL, FALLBACK_URL]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { lkr: Record<string, number> };
      return data.lkr;
    } catch {
      // try the next URL
    }
  }
  console.error("[currency] failed to fetch FX rates from both sources");
  return {};
}

/** Converts an LKR amount to `target` using an already-loaded rates map. */
export function convertFromLkr(
  amountLkr: number,
  target: DisplayCurrency,
  rates: Record<string, number> | null
): number {
  if (target === "LKR" || !rates) return amountLkr;
  const rate = rates[target.toLowerCase()];
  return typeof rate === "number" ? amountLkr * rate : amountLkr;
}

export function formatMoney(amount: number, currency: DisplayCurrency): string {
  const decimals = currency === "LKR" ? 0 : 2;
  const rounded = amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currency} ${rounded}`;
}