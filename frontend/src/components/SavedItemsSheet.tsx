import { useEffect } from "react";
import { Heart, ShoppingBag, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUiStore } from "../store/uiStore";
import { useSavedProductsStore } from "../store/savedProductsStore";
import { useCartStore } from "../store/cartStore";
import { usePrefsStore } from "../store/prefsStore";
import Sheet from "./ui/Sheet";

export default function SavedItemsSheet() {
  const open = useUiStore((s) => s.savedOpen);
  const setOpen = useUiStore((s) => s.setSavedOpen);

  const items = useSavedProductsStore((s) => s.items);
  const loading = useSavedProductsStore((s) => s.loading);
  const loadSaved = useSavedProductsStore((s) => s.loadSaved);
  const unsaveProduct = useSavedProductsStore((s) => s.unsaveProduct);

  const addItemToCart = useCartStore((s) => s.addItem);
  const formatPrice = usePrefsStore((s) => s.formatPrice);

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} side="right" title="Saved gifts">
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        {loading && items.length === 0 && (
          <p className="text-center text-sm text-ink/40 py-12">Loading…</p>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-ink/40">
            <Heart className="size-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nothing saved yet</p>
            <p className="text-xs mt-1">Tap the heart on a product card to save it for later.</p>
          </div>
        )}

        <div className="flex flex-col">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3 py-3 border-b border-border last:border-b-0">
              <div className="size-14 rounded-lg bg-surface border border-border flex-shrink-0 overflow-hidden grid place-items-center text-lg">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  "🎁"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ink line-clamp-2 leading-snug mb-1">
                  {item.name}
                </p>
                <p className="text-[11px] text-accent font-bold mb-1.5">
                  {item.price !== null ? formatPrice(item.price) : "Price unavailable"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      addItemToCart({
                        productId: item.productId,
                        name: item.name,
                        price: item.price ?? 0,
                        currency: item.currency,
                        imageUrl: item.imageUrl ?? undefined,
                      });
                      toast.success(`Added ${item.name} to cart`);
                    }}
                    className="h-7 px-2.5 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-brand-dark transition-colors"
                  >
                    <ShoppingBag className="size-3" /> Add to cart
                  </button>
                  {item.productUrl && (
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="size-7 grid place-items-center rounded-full text-brand/60 hover:bg-brand/5"
                      aria-label="View on Kapruka"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => unsaveProduct(item.productId)}
                    aria-label="Remove from saved"
                    className="size-7 grid place-items-center rounded-full text-ink/30 hover:text-danger ml-auto"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}