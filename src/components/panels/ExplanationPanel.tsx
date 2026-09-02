import { MessageSquareText, Minus, Plus } from "lucide-react";
import { useUIStore } from "../../state/uiStore";

/**
 * One line of plain-language narration for whatever just executed.
 * Reads from the Explanation Layer's history starting in Phase 10 — until
 * then this always shows the same quiet placeholder line.
 *
 * Can be independently hidden/shown via the toggle button in the header.
 */
export function ExplanationPanel() {
  const isExplanationVisible = useUIStore((state) => state.isExplanationVisible);
  const toggleExplanation = useUIStore((state) => state.toggleExplanation);

  if (!isExplanationVisible) {
    return (
      <div className="flex h-[26px] shrink-0 items-center justify-between border-t border-border bg-surface-raised px-3">
        <button
          type="button"
          onClick={toggleExplanation}
          title="Show Explanation"
          aria-label="Show Explanation"
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
        >
          <MessageSquareText size={13} className="text-fg-muted" />
          <span className="font-mono text-[11px]">Explanation</span>
          <Plus size={12} className="ml-1 text-fg-muted" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <MessageSquareText size={14} className="shrink-0 text-fg-muted" />
        <p className="truncate text-sm text-fg-muted">
          Explanation will appear here as you step through your program.
        </p>
      </div>
      <button
        type="button"
        onClick={toggleExplanation}
        title="Hide Explanation"
        aria-label="Hide Explanation"
        className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface-raised hover:text-fg transition-colors"
      >
        <Minus size={13} />
      </button>
    </div>
  );
}
