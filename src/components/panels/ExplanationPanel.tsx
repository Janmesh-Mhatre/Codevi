import { MessageSquareText } from "lucide-react";

/** One line of plain-language narration for whatever just executed.
 * Reads from the Explanation Layer's history starting in Phase 10 — until
 * then this always shows the same quiet placeholder line. */
export function ExplanationPanel() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-3 py-2">
      <MessageSquareText size={14} className="shrink-0 text-fg-muted" />
      <p className="truncate text-sm text-fg-muted">
        Explanation will appear here as you step through your program.
      </p>
    </div>
  );
}
