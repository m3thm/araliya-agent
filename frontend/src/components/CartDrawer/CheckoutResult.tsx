import { useEffect, useRef } from "react";
import { Link2, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "../../store/cartStore";
import type { CheckoutStatus } from "../../types";

export default function CheckoutResult() {
  const checkoutStatus = useCartStore((s) => s.checkoutStatus);
  const checkoutResult = useCartStore((s) => s.checkoutResult);
  const error = useCartStore((s) => s.error);
  const placeOrder = useCartStore((s) => s.placeOrder);
  const clearCheckoutResult = useCartStore((s) => s.clearCheckoutResult);
  const items = useCartStore((s) => s.items);
  const prevStatusRef = useRef<CheckoutStatus>("idle");
  const toastedStatusRef = useRef<CheckoutStatus>("idle");

  useEffect(() => {
    if (checkoutStatus === "confirmed" && prevStatusRef.current === "confirmed") {
      clearCheckoutResult();
    }
    prevStatusRef.current = checkoutStatus;
  }, [items.length]);

  // Fire a toast exactly once per confirmed/failed transition, not on
  // every re-render while that status is still active.
  useEffect(() => {
    if (checkoutStatus === toastedStatusRef.current) return;
    if (checkoutStatus === "confirmed" && checkoutResult) {
      toast.success(`Order ${checkoutResult.orderRef} created`);
    } else if (checkoutStatus === "failed" && error) {
      toast.error(error);
    }
    toastedStatusRef.current = checkoutStatus;
  }, [checkoutStatus, checkoutResult, error]);

  const isProcessing = checkoutStatus === "validating" || checkoutStatus === "creating";
  const isIdle = checkoutStatus === "idle";
  const cartEmpty = items.length === 0;

  const ghostBtnClass =
    "flex-1 h-9 rounded-full border border-border bg-surface text-xs font-semibold text-ink/70 hover:bg-black/5 transition-colors";

  return (
    <div className="mt-4 border-t border-border pt-4">
      {isIdle && (
        <button
          type="button"
          onClick={() => placeOrder()}
          disabled={cartEmpty}
          className="w-full h-11 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          {cartEmpty ? "Cart is empty" : "Place order & get payment link"}
        </button>
      )}

      {isProcessing && (
        <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-ink/60">
          <Loader2 className="size-4 animate-spin text-brand" />
          {checkoutStatus === "validating" ? "Checking delivery availability…" : "Creating your order…"}
        </div>
      )}

      {checkoutStatus === "confirmed" && checkoutResult && (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success mb-1.5">
            <CheckCircle2 className="size-4" /> Order created!
          </p>
          <p className="text-xs text-ink/50 mb-3">
            Reference: <strong className="text-ink">{checkoutResult.orderRef}</strong>
          </p>

          <button
            type="button"
            onClick={() => window.open(checkoutResult.checkoutUrl, "_blank")}
            className="w-full h-11 rounded-full bg-success text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity mb-2"
          >
            <Link2 className="size-4" />
            Pay {checkoutResult.summary.currency} {checkoutResult.summary.grandTotal.toLocaleString()}
          </button>

          <p className="text-[11px] text-ink/40 leading-relaxed mb-3">
            Expires {new Date(checkoutResult.expiresAt).toLocaleTimeString()}. No Kapruka account needed.
          </p>

          <div className="flex gap-2">
            <button type="button" onClick={placeOrder} disabled={isProcessing} className={ghostBtnClass}>
              Regenerate link
            </button>
            <button type="button" onClick={clearCheckoutResult} className={ghostBtnClass}>
              Edit cart
            </button>
          </div>
        </div>
      )}

      {checkoutStatus === "expired" && (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 mb-3">
            <Clock className="size-4" /> Payment link expired
          </p>
          <button
            type="button"
            onClick={() => {
              if (!isProcessing) placeOrder();
            }}
            className="w-full h-11 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Generate new link
          </button>
        </div>
      )}

      {checkoutStatus === "failed" && error && (
        <div>
          <p className="flex items-start gap-1.5 text-xs text-danger leading-relaxed mb-3">
            <AlertCircle className="size-4 flex-shrink-0 mt-0.5" /> {error}
          </p>
          <button type="button" onClick={clearCheckoutResult} className={`${ghostBtnClass} w-full`}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}