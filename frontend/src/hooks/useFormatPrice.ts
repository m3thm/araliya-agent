import { usePrefsStore } from "../store/prefsStore";

// hooks/useFormatPrice.ts
export function useFormatPrice() {
  const formatPrice = usePrefsStore((s) => s.formatPrice);
  usePrefsStore((s) => s.currency); // subscribe for re-render only
  usePrefsStore((s) => s.rates);
  return formatPrice;
}