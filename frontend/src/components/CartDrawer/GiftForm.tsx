import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCartStore } from "../../store/cartStore";
import type { GiftDetails } from "../../types";

const inputClass =
  "w-full h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-brand/50 focus:bg-white placeholder:text-ink/35";
const labelClass = "text-[11px] font-semibold text-ink/40 uppercase tracking-wide";

export default function GiftForm() {
  const giftDetails = useCartStore((s) => s.giftDetails);
  const updateField = useCartStore((s) => s.updateGiftField);
  const [collapsed, setCollapsed] = useState(false);

  const update = <K extends keyof GiftDetails>(field: K, value: GiftDetails[K]) => {
    updateField(field, value);
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between py-2 border-t border-border text-sm font-semibold text-ink"
      >
        Gift &amp; delivery details
        <span className="flex items-center gap-1 text-xs text-ink/40 font-medium">
          {collapsed ? (
            <>
              Show <ChevronRight className="size-3.5" />
            </>
          ) : (
            <>
              Hide <ChevronDown className="size-3.5" />
            </>
          )}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-2 mt-2">
          <label className={labelClass}>Recipient</label>
          <input
            className={inputClass}
            placeholder="Name *"
            value={giftDetails.recipientName}
            onChange={(e) => update("recipientName", e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Phone (e.g. +9477…) *"
            value={giftDetails.recipientPhone}
            onChange={(e) => update("recipientPhone", e.target.value)}
          />

          <label className={`${labelClass} mt-1`}>Sender</label>
          <input
            className={inputClass}
            placeholder="Your name *"
            value={giftDetails.senderName}
            onChange={(e) => update("senderName", e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-ink/60 cursor-pointer">
            <input
              type="checkbox"
              checked={giftDetails.anonymous}
              onChange={(e) => update("anonymous", e.target.checked)}
              className="size-3.5 accent-brand cursor-pointer"
            />
            Send anonymously
          </label>

          <label className={`${labelClass} mt-1`}>Delivery</label>
          <input
            className={inputClass}
            placeholder="Street address *"
            value={giftDetails.deliveryAddress}
            onChange={(e) => update("deliveryAddress", e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="City *"
            value={giftDetails.deliveryCity}
            onChange={(e) => update("deliveryCity", e.target.value)}
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className={`${inputClass} w-full sm:flex-1`}
              placeholder="Delivery date (YYYY-MM-DD) *"
              value={giftDetails.deliveryDate}
              onChange={(e) => update("deliveryDate", e.target.value)}
            />
            <select
              className={`${inputClass} w-full sm:w-auto sm:min-w-[110px] sm:flex-none`}
              value={giftDetails.locationType}
              onChange={(e) =>
                update("locationType", e.target.value as "house" | "apartment" | "office" | "other")
              }
            >
              <option value="house">House</option>
              <option value="apartment">Apartment</option>
              <option value="office">Office</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input
            className={inputClass}
            placeholder="Delivery instructions (optional)"
            value={giftDetails.deliveryInstructions}
            onChange={(e) => update("deliveryInstructions", e.target.value)}
          />

          <label className={`${labelClass} mt-1`}>Gift message</label>
          <textarea
            className={`${inputClass} h-[72px] py-2 resize-y leading-relaxed`}
            placeholder="Write a gift message (max 300 chars)"
            maxLength={300}
            value={giftDetails.giftMessage}
            onChange={(e) => update("giftMessage", e.target.value)}
          />
          <span className="text-[10px] text-ink/30 text-right -mt-1">
            {giftDetails.giftMessage.length}/300
          </span>
        </div>
      )}
    </div>
  );
}