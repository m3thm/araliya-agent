import { Sparkles } from "lucide-react";
import { useUiStore } from "../../store/uiStore";

const SUGGESTIONS = [
  { title: "Birthday gift for Amma in Kandy", hint: "Under LKR 8,000" },
  { title: "Avurudu sweets hamper", hint: "Traditional favourites" },
  { title: "Anniversary flowers, same-day", hint: "Delivered island-wide" },
  { title: "Corporate gift box × 20", hint: "Ceylon tea & chocolates" },
];

export default function EmptyState() {
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand/5 text-brand text-xs font-bold mb-5">
        <Sparkles className="size-3.5" /> Powered by Kapruka
      </span>

      <h1 className="font-display italic text-3xl sm:text-4xl text-brand mb-3">
        What are we gifting today?
      </h1>
      <p className="text-sm text-ink/50 max-w-md mb-8">
        Tell me the recipient, occasion, and budget — I'll search Kapruka and hand-pick a few.
      </p>

      <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => setComposerDraft(s.title)}
            className="rounded-xl border border-border bg-surface-card px-4 py-3.5 hover:border-brand/30 hover:shadow-sm transition-all"
          >
            <p className="text-sm font-semibold text-ink font-display">{s.title}</p>
            <p className="text-xs text-ink/40 mt-0.5">{s.hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}