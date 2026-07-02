import { useState, useEffect } from "react";
import { Minus, Plus, ExternalLink, ShoppingBag, Check, Heart } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "../../types";
import { useCartStore } from "../../store/cartStore";
import { useFormatPrice } from "../../hooks/useFormatPrice"; 
import { useSavedProductsStore } from "../../store/savedProductsStore";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const cartItem = useCartStore((s) => s.items.find((i) => i.productId === product.id));
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const [justCommitted, setJustCommitted] = useState<"added" | "removed" | null>(null);

  const formatPrice = useFormatPrice();

  const isSaved = useSavedProductsStore((s) => s.isSaved(product.id));
  const saveProduct = useSavedProductsStore((s) => s.saveProduct);
  const unsaveProduct = useSavedProductsStore((s) => s.unsaveProduct);

  const inCart = (cartItem?.quantity ?? 0) > 0;

  // The one number the stepper shows. Seeded from the cart quantity, but
  // freely editable — nothing hits the store until "Add" is pressed.
  const [qty, setQty] = useState(cartItem?.quantity ?? 1);

  // Re-sync if the cart quantity changes from elsewhere (e.g. edited in a
  // cart drawer, or cleared) — and also snaps qty back after our own commit.
  useEffect(() => {
    setQty(cartItem?.quantity ?? 1);
  }, [cartItem?.quantity]);

  const noChangeToCommit = inCart && qty === cartItem!.quantity;
  const nothingToAdd = !inCart && qty === 0;

  const handleCommit = () => {
    if (qty === 0) {
      if (inCart) {
        removeItem(product.id);
        toast.success("Removed from cart");
        setJustCommitted("removed");
        setTimeout(() => setJustCommitted(null), 1200);
      }
      return;
    }

    if (!inCart) {
      addItem({
        productId: product.id,
        name: product.name,
        price: product.price ?? 0,
        currency: product.currency,
        imageUrl: product.imageUrl,
        quantity: qty,
      });
    } else if (qty !== cartItem!.quantity) {
      // store only exposes a delta-based updater, so compute the delta
      // needed to land on the absolute number the user picked
      updateQuantity(product.id, qty - cartItem!.quantity);
    }

    setJustCommitted("added");
    setTimeout(() => setJustCommitted(null), 1200);
  };

  const handleToggleSave = () => {
    if (isSaved) {
      unsaveProduct(product.id);
    } else {
      saveProduct(product);
      toast.success("Saved for later");
    }
  };

  return (
    <div className="w-full rounded-xl border border-border bg-surface-card overflow-hidden shadow-sm flex flex-col">
      <div className="relative aspect-square bg-surface overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-3xl" aria-hidden="true">
            🎁
          </div>
        )}
        <button
          type="button"
          onClick={handleToggleSave}
          aria-label={isSaved ? "Remove from saved" : "Save for later"}
          aria-pressed={isSaved}
          className="absolute top-1.5 right-1.5 size-7 grid place-items-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
        >
          <Heart className={`size-3.5 ${isSaved ? "fill-brand text-brand" : "text-ink/40"}`} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <h4 className="font-display text-sm leading-snug line-clamp-2 text-ink min-h-[2.5em]">
          {product.name}
        </h4>
        <p className="text-accent font-bold text-sm">
          {product.price !== null ? formatPrice(product.price) : "Price unavailable"}
        </p>

        <div className="flex items-center gap-2 mt-1">
          <div className="flex items-center border border-border rounded-full">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(0, q - 1))}
              disabled={qty === 0}
              aria-label="Decrease quantity"
              className="size-7 grid place-items-center text-brand hover:bg-brand/5 rounded-l-full disabled:text-ink/20 disabled:hover:bg-transparent"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-6 text-center text-xs font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              aria-label="Increase quantity"
              className="size-7 grid place-items-center text-brand hover:bg-brand/5 rounded-r-full"
            >
              <Plus className="size-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCommit}
            disabled={noChangeToCommit || nothingToAdd}
            className="flex-1 h-7 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:hover:bg-brand"
          >
            {justCommitted === "added" ? (
              <>
                <Check className="size-3" /> {qty === 0 ? "Removed" : "Added"}
              </>
            ) : qty === 0 && inCart ? (
              "Remove"
            ) : inCart && qty !== cartItem!.quantity ? (
              "Update"
            ) : inCart ? (
              <>
                <Check className="size-3" /> In cart
              </>
            ) : (
              <>
                <ShoppingBag className="size-3" /> Add
              </>
            )}
          </button>
        </div>

        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-brand/70 hover:text-brand inline-flex items-center gap-1 mt-1"
          >
            View on Kapruka <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}