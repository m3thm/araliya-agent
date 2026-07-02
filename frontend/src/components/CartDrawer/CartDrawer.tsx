import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCartStore } from "../../store/cartStore";
import { useUiStore } from "../../store/uiStore";
import Sheet from "../ui/Sheet";
import OrderSummary from "./OrderSummary";
import GiftForm from "./GiftForm";
import CheckoutResult from "./CheckoutResult";

export default function CartDrawer() {
  const cartOpen = useUiStore((s) => s.cartOpen);
  const setCartOpen = useUiStore((s) => s.setCartOpen);
  const items = useCartStore((s) => s.items);
  const itemCount = useCartStore((s) => s.itemCount());
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const checkoutResult = useCartStore((s) => s.checkoutResult);

  return (
    <Sheet
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      side="right"
      title={`Your cart${itemCount > 0 ? ` (${itemCount})` : ""}`}
    >
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        {items.length === 0 ? (
          <div className="text-center py-12 text-ink/40">
            <ShoppingBag className="size-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Your cart is empty</p>
            <p className="text-xs mt-1">Ask the concierge to find some gifts!</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              {items.map((item) => {
                const lineTotal = item.price * item.quantity;
                return (
                  <div key={item.productId} className="flex gap-3 py-3 border-b border-border last:border-b-0">
                    <div className="size-12 rounded-lg bg-surface border border-border flex-shrink-0 overflow-hidden grid place-items-center text-lg">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        "🎁"
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink line-clamp-2 leading-snug mb-0.5">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-ink/40 mb-1.5">
                        {item.currency} {item.price.toLocaleString()} each
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-border rounded-full h-6 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, -1)}
                            aria-label="Decrease"
                            className="w-6 h-full grid place-items-center text-brand hover:bg-brand/5"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="w-6 text-center text-[11px] font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, 1)}
                            aria-label="Increase"
                            className="w-6 h-full grid place-items-center text-brand hover:bg-brand/5"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <span className="text-[11px] font-semibold text-ink ml-auto">
                          {item.currency} {lineTotal.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          aria-label="Remove item"
                          className="text-ink/30 hover:text-danger transition-colors p-1"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <OrderSummary checkoutResult={checkoutResult} />
            <GiftForm />
            <CheckoutResult />
          </>
        )}
      </div>
    </Sheet>
  );
}
