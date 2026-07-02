import { useEffect, useRef, useState, type ReactNode } from "react";

interface DropdownProps {
  trigger: ReactNode;
  align?: "start" | "end";
  children: ReactNode;
  triggerClassName?: string;
}

export default function Dropdown({ trigger, align = "start", children, triggerClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-2 z-50 min-w-[200px] rounded-xl bg-surface-card border border-border shadow-xl py-1.5 text-ink ${
            align === "end" ? "right-0" : "left-0"
          }`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <div className="px-3.5 py-1.5 text-[11px] font-semibold text-ink/40 uppercase tracking-wide">{children}</div>;
}

export function DropdownSeparator() {
  return <div className="my-1.5 border-t border-border" />;
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function DropdownItem({ children, onClick, disabled, danger }: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left px-3.5 py-2 text-sm flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-default ${
        danger ? "text-danger hover:bg-danger/5" : "text-ink hover:bg-brand/5"
      }`}
    >
      {children}
    </button>
  );
}