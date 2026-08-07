import { SquareTerminal } from "lucide-react";
import { useParserStore } from "../../state/parserStore";

/** Program stdout/stderr, plus (as of Phase 2) syntax diagnostics from
 * the parser — reusing this panel rather than adding a separate
 * diagnostics area, per the Phase 2 brief. Program output itself still
 * reads from the Execution Layer starting in Phase 3; until then this
 * only ever shows parser state. */
export function ConsolePanel() {
  const status = useParserStore((state) => state.status);
  const diagnostics = useParserStore((state) => state.diagnostics);

  return (
    <div className="flex h-40 shrink-0 flex-col border-t border-border bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <SquareTerminal size={14} className="text-fg-muted" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Console</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-sm text-fg-muted">
        {status === "initializing" && <p>Loading parser…</p>}
        {status === "error" && <p className="text-danger">Parser failed to load — see the AST tab for details.</p>}
        {status === "ready" && diagnostics.length === 0 && <p>Ready.</p>}
        {status === "ready" &&
          diagnostics.map((diagnostic) => (
            <p key={diagnostic.id} className="text-danger">
              Line {diagnostic.startPosition.row + 1}, Col {diagnostic.startPosition.column + 1} — {diagnostic.message}
            </p>
          ))}
      </div>
    </div>
  );
}
