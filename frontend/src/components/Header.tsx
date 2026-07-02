import { useEffect, useState } from "react";
import { Menu, ShoppingBag, LogOut, ChevronDown, User, Heart, Package } from "lucide-react";
import { useCartStore } from "../store/cartStore";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { usePrefsStore } from "../store/prefsStore";
import { useSavedProductsStore } from "../store/savedProductsStore";
import { DISPLAY_CURRENCIES, type Persona, type DisplayCurrency } from "../types";
import Dropdown, { DropdownLabel, DropdownSeparator, DropdownItem } from "./ui/Dropdown";

const PERSONAS: Record<Persona, { label: string; hint: string }> = {
  concierge: { label: "Concierge", hint: "Balanced, warm recommendations" },
  traditional: { label: "Gift Expert", hint: "Heritage-first, traditional picks" },
  budget: { label: "Budget Hunter", hint: "Best value under your budget" },
};

export default function Header() {
  const itemCount = useCartStore((s) => s.itemCount());
  const toggleCart = useUiStore((s) => s.toggleCart);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSavedOpen = useUiStore((s) => s.setSavedOpen);
  const setOrdersOpen = useUiStore((s) => s.setOrdersOpen);
  const signOut = useAuthStore((s) => s.signOut);

  const persona = usePrefsStore((s) => s.persona);
  const setPersona = usePrefsStore((s) => s.setPersona);
  const currency = usePrefsStore((s) => s.currency);
  const setCurrency = usePrefsStore((s) => s.setCurrency);

  const savedCount = useSavedProductsStore((s) => s.items.length);

  const [bounced, setBounced] = useState(false);
  useEffect(() => {
    if (itemCount === 0) return;
    setBounced(true);
    const id = setTimeout(() => setBounced(false), 500);
    return () => clearTimeout(id);
  }, [itemCount]);

  return (
    <header className="h-14 bg-brand text-white flex items-center justify-between px-3 sm:px-5 flex-shrink-0 shadow-sm z-30 relative">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open conversation history"
          title="Conversations (⌘K)"
          className="size-9 grid place-items-center rounded-lg hover:bg-white/10 active:bg-white/15 transition-colors flex-shrink-0"
        >
          <Menu className="size-5" />
        </button>
        <span className="font-display italic text-xl font-bold tracking-wide truncate">
          Araliya
        </span>

        <Dropdown
          triggerClassName="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
          trigger={
            <>
              {PERSONAS[persona].label}
              <ChevronDown className="size-3" />
            </>
          }
        >
          <DropdownLabel>Concierge persona</DropdownLabel>
          <DropdownSeparator />
          {(Object.keys(PERSONAS) as Persona[]).map((key) => (
            <DropdownItem key={key} onClick={() => setPersona(key)}>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{PERSONAS[key].label}</span>
                  {persona === key && <span className="text-brand text-xs">✓</span>}
                </span>
                <span className="block text-[11px] text-ink/50">{PERSONAS[key].hint}</span>
              </span>
            </DropdownItem>
          ))}
        </Dropdown>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        <Dropdown
          triggerClassName="h-9 px-3 rounded-full hover:bg-white/10 text-xs font-semibold transition-colors inline-flex items-center gap-1"
          align="end"
          trigger={
            <>
              {currency}
              <ChevronDown className="size-3" />
            </>
          }
        >
          <DropdownLabel>Display currency</DropdownLabel>
          <DropdownSeparator />
          {DISPLAY_CURRENCIES.map((c: DisplayCurrency) => (
            <DropdownItem key={c} onClick={() => setCurrency(c)}>
              <span className="flex-1 flex items-center justify-between">
                {c}
                {currency === c && <span className="text-brand">✓</span>}
              </span>
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <p className="px-3.5 pb-1 text-[11px] text-ink/40 leading-relaxed">
            For browsing only — checkout is always charged in LKR.
          </p>
        </Dropdown>

        <button
          type="button"
          onClick={toggleCart}
          aria-label={`Open cart, ${itemCount} item${itemCount !== 1 ? "s" : ""}`}
          className="relative h-9 px-2.5 sm:px-3 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors flex items-center gap-2 text-sm font-semibold"
        >
          <ShoppingBag className={`size-5 ${bounced ? "animate-bounce" : ""}`} />
          <span className="hidden sm:inline">Cart</span>
          {itemCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 sm:static min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-accent text-white text-[10px] font-bold leading-none">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          )}
        </button>

        <Dropdown
          align="end"
          triggerClassName="size-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center transition-colors"
          trigger={<User className="size-4" />}
        >
          <DropdownLabel>Account</DropdownLabel>
          <DropdownSeparator />
          <DropdownItem onClick={() => setSavedOpen(true)}>
            <Heart className="size-4" /> Saved ({savedCount})
          </DropdownItem>
          <DropdownItem onClick={() => setOrdersOpen(true)}>
            <Package className="size-4" /> Order history
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}