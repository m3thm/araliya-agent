import { useCartStore } from "../../store/cartStore";
import type { CheckoutResponse } from "../../types";

interface Props {
  checkoutResult: CheckoutResponse | null;
}

export default function OrderSummary({ checkoutResult }: Props) {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());

  const currency = items[0]?.currency ?? "LKR";
  const deliveryFee = checkoutResult?.summary.deliveryFee;
  const grandTotal = checkoutResult?.summary.grandTotal;

  return (
    <div className="border-t border-border pt-3 mt-3">
      <Row label="Subtotal" value={`${currency} ${subtotal.toLocaleString()}`} />
      <Row
        label="Delivery"
        value={deliveryFee !== undefined ? `${currency} ${deliveryFee.toLocaleString()}` : "—"}
      />
      <Row label="Tax" value="Included" muted />
      <Row label="Discount" value="—" muted />
      <div className="flex justify-between font-bold text-sm border-t border-border pt-2 mt-1">
        <span className="text-ink">Total</span>
        <span className="text-ink">
          {currency} {(grandTotal ?? subtotal).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-[13px] mb-1.5">
      <span className="text-ink/50">{label}</span>
      <span className={muted ? "text-ink/30 text-[11px]" : "text-ink"}>{value}</span>
    </div>
  );
}
