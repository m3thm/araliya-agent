import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  children: ReactNode;
}

/**
 * Responsive slide-over panel: full-screen on mobile (nowhere else for it
 * to go), a fixed-width panel anchored to one edge from `sm` up. Shared by
 * ConversationSidebar and CartDrawer so both panels behave identically.
 */
export default function Sheet({ open, onClose, side, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sideClass = side === "left" ? "left-0" : "right-0";
  const hiddenTranslate = side === "left" ? "-translate-x-full" : "translate-x-full";

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute top-0 ${sideClass} h-full w-full sm:w-[380px] bg-surface-card shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : hiddenTranslate
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-display italic text-lg text-brand">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="size-8 grid place-items-center rounded-full hover:bg-black/5 text-ink/50 hover:text-ink transition-colors flex-shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
