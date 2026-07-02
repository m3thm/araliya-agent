// Now driven by the actual Kapruka MCP response schemas discovered
// from the server (scripts/discover-schemas.ts). The key fields are:
//
//   kapruka_search_products (JSON):
//     id, name, summary, price: {amount, currency}, image_url, url
//
//   kapruka_get_product (JSON):
//     id, name, description, summary, price: {amount, currency}, images[], url
//
// Both use price as an object {amount: number, currency: string} —
// not a flat number. That's the single biggest difference from the
// earlier guesswork-based implementation.

export interface Product {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  description: string;
  imageUrl?: string;
  url?: string;
}

/** Extract a flat number and currency from the price object Kapruka returns. */
function extractPrice(
  value: unknown
): { amount: number | null; currency: string } {
  if (value && typeof value === "object") {
    const p = value as Record<string, unknown>;
    const amount = coerceNumber(p.amount);
    const currency = String(p.currency ?? "LKR");
    return { amount, currency };
  }
  // Fallback: treat as raw number/string (unlikely for Kapruka, kept for compat)
  return { amount: coerceNumber(value), currency: "LKR" };
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.]/g, "");
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeOne(raw: Record<string, unknown>): Product | null {
  const id = raw.id ?? raw.product_id ?? raw.productId ?? raw.sku;
  const name = raw.name ?? raw.title ?? raw.product_name;

  if (!id && !name) return null;

  // Kapruka search returns summary (not description) as the product blurb.
  // Kapruka get_product returns both description and summary.
  const description =
    String(raw.description ?? raw.summary ?? raw.short_description ?? "");

  // Kapruka returns price as {amount: number, currency: string}
  const { amount, currency } = extractPrice(raw.price);

  // Search results use image_url (singular); get_product uses images (array).
  // Handle both.
  let imageUrl: string | undefined;
  if (typeof raw.image_url === "string") {
    imageUrl = raw.image_url;
  } else if (typeof raw.imageUrl === "string") {
    imageUrl = raw.imageUrl;
  } else if (Array.isArray(raw.images) && raw.images.length > 0) {
    imageUrl = String(raw.images[0]);
  } else if (typeof raw.image === "string") {
    imageUrl = raw.image;
  } else if (Array.isArray(raw.image) && raw.image.length > 0) {
    imageUrl = String(raw.image[0]);
  }

  const url =
    typeof raw.url === "string"
      ? raw.url
      : typeof raw.product_url === "string"
        ? raw.product_url
        : typeof raw.link === "string"
          ? raw.link
          : undefined;

  return {
    id: String(id ?? name),
    name: String(name ?? "Unnamed product"),
    price: amount,
    currency,
    description,
    imageUrl,
    url,
  };
}

/**
 * Parses a tool's raw text content into normalized products.
 * Returns `{ products }` on success, or `{ raw }` if the content wasn't
 * parseable JSON — the caller can fall back to showing `raw` as plain text.
 */
export function parseProductsFromToolResult(resultText: string):
  | { products: Product[] }
  | { raw: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    return { raw: resultText };
  }

  let candidates: unknown[];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    // Kapruka search response: { results: [...] }
    // Kapruka categories response: { categories: [...] }
    // Generic fallbacks: products, items, data
    const nested =
      obj.results ?? obj.products ?? obj.items ?? obj.data ?? obj.categories;
    if (Array.isArray(nested)) {
      candidates = nested;
    } else {
      candidates = [obj];
    }
  } else {
    return { raw: resultText };
  }

  const products = candidates
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map(normalizeOne)
    .filter((p): p is Product => p !== null);

  if (products.length === 0) {
    console.warn(
      "[kapruka] tool result parsed as JSON but no recognizable product fields were found:",
      resultText.slice(0, 500)
    );
    return { raw: resultText };
  }

  return { products };
}