import { useEffect, useState } from "react";
import { Package, RefreshCw, ExternalLink, Search, Trash2 } from "lucide-react";
import { useUiStore } from "../store/uiStore";
import { useOrdersStore } from "../store/ordersStore";
import Sheet from "./ui/Sheet";
import type { OrderRecord } from "../types";

// Real Kapruka status values (per kapruka_track_order's schema) plus
// "pending", which is our own local placeholder for "not tracked yet" and
// never comes back from Kapruka itself.
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-ink/5 text-ink/60",
  received: "bg-ink/5 text-ink/60",
  confirmed: "bg-success/10 text-success",
  shipped: "bg-brand/10 text-brand",
  delivered: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};

function statusClass(status: string) {
  return STATUS_STYLES[status.toLowerCase()] ?? "bg-accent/10 text-accent";
}

function OrderCard({ order }: { order: OrderRecord }) {
  const trackingRef = useOrdersStore((s) => s.trackingRef);
  const trackError = useOrdersStore((s) => s.trackError[order.orderRef]);
  const trackOrder = useOrdersStore((s) => s.trackOrder);
  const deletingRef = useOrdersStore((s) => s.deletingRef);
  const deleteError = useOrdersStore((s) => s.deleteError[order.orderRef]);
  const deleteOrder = useOrdersStore((s) => s.deleteOrder);

  const [numberInput, setNumberInput] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isTracking = trackingRef === order.orderRef;
  const isDeleting = deletingRef === order.orderRef;
  const needsNumber = !order.kaprukaOrderNumber;
  // Mirrors the backend's own restriction — only an order that's still
  // pending and was never tracked (so definitely never paid) can be
  // deleted. In practice this is the same condition as needsNumber, but
  // checking status too keeps this in lockstep with the server's rule.
  const canDelete = order.status === "pending" && needsNumber;

  const submitNumber = () => {
    const trimmed = numberInput.trim();
    if (!trimmed || isTracking) return;
    trackOrder(order.orderRef, trimmed);
  };

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{order.orderRef}</p>
          <p className="text-[11px] text-ink/40">
            {new Date(order.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusClass(
              order.status
            )}`}
          >
            {order.status}
          </span>
          {canDelete && !confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting}
              aria-label="Delete order"
              className="size-6 rounded-full grid place-items-center text-ink/30 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {confirmingDelete ? (
        <div className="mb-2 rounded-lg bg-danger/5 border border-danger/20 p-2.5">
          <p className="text-[11px] text-ink/70 mb-2">
            Delete this order? It hasn't been paid for, so nothing is cancelled on Kapruka's side —
            it's just removed from your history here.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => deleteOrder(order.orderRef)}
              disabled={isDeleting}
              className="h-6.5 px-2.5 rounded-full bg-danger text-white text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              className="h-6.5 px-2.5 rounded-full border border-border text-[11px] font-semibold text-ink/60 hover:bg-black/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {deleteError && <p className="text-[11px] text-danger mt-1.5">{deleteError}</p>}
        </div>
      ) : null}

      <p className="text-xs text-ink/60 mb-2 line-clamp-2">
        {order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ")}
      </p>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-ink">
          {order.currency} {(order.grandTotal ?? 0).toLocaleString()}
        </p>
        {order.checkoutUrl && (
          <a
            href={order.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-7 px-2.5 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-brand-dark transition-colors"
          >
            Pay <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {needsNumber ? (
        <div className="pt-2 border-t border-border/60">
          <p className="text-[11px] text-ink/50 mb-1.5">
            Enter the order number from your Kapruka confirmation email to track this order.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNumber()}
              placeholder="e.g. VIMP34456CB2"
              maxLength={40}
              className="flex-1 min-w-0 h-7 px-2.5 rounded-full border border-border text-[11px] text-ink placeholder:text-ink/30 focus:outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={submitNumber}
              disabled={isTracking || numberInput.trim().length < 4}
              aria-label="Track order"
              className="h-7 px-2.5 rounded-full border border-border text-[11px] font-semibold text-ink/60 hover:bg-black/5 transition-colors flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
            >
              <Search className={`size-3 ${isTracking ? "animate-pulse" : ""}`} />
              Track
            </button>
          </div>
          {trackError && <p className="text-[11px] text-danger mt-1.5">{trackError}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <p className="text-[11px] text-ink/40 truncate">Order # {order.kaprukaOrderNumber}</p>
          <button
            type="button"
            onClick={() => trackOrder(order.orderRef)}
            disabled={isTracking}
            aria-label="Refresh tracking status"
            className="h-7 px-2.5 rounded-full border border-border text-[11px] font-semibold text-ink/60 hover:bg-black/5 transition-colors flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`size-3 ${isTracking ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      )}
      {!needsNumber && trackError && <p className="text-[11px] text-danger mt-1.5">{trackError}</p>}
    </div>
  );
}

export default function OrderHistorySheet() {
  const open = useUiStore((s) => s.ordersOpen);
  const setOpen = useUiStore((s) => s.setOrdersOpen);

  const orders = useOrdersStore((s) => s.orders);
  const loading = useOrdersStore((s) => s.loading);
  const loadOrders = useOrdersStore((s) => s.loadOrders);

  useEffect(() => {
    if (open) loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} side="right" title="Order history">
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        {loading && orders.length === 0 && (
          <p className="text-center text-sm text-ink/40 py-12">Loading…</p>
        )}
        {!loading && orders.length === 0 && (
          <div className="text-center py-12 text-ink/40">
            <Package className="size-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No orders yet</p>
            <p className="text-xs mt-1">Orders you place will show up here.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </div>
    </Sheet>
  );
}