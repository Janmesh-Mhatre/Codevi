import { SquareTerminal } from "lucide-react";
import { useParserStore } from "../../state/parserStore";
import { useExecutionStore } from "../../state/executionStore";

/** Program stdout/stderr, syntax diagnostics (Phase 2), and now the
 * execution engine's lifecycle log (Phase 3) — reusing this one panel
 * rather than adding a separate diagnostics/execution area, per both
 * phases' briefs. Real program stdout (from a printf, say) still isn't
 * produced by anything — Phase 3's interpreter doesn't implement
 * library calls — so this remains parser + execution status only. */
export function ConsolePanel() {
  const parserStatus = useParserStore((state) => state.status);
  const diagnostics = useParserStore((state) => state.diagnostics);
  const executionLog = useExecutionStore((state) => state.log);

  return (
    <div className="flex h-40 shrink-0 flex-col border-t border-border bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <SquareTerminal size={14} className="text-fg-muted" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Console</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-sm text-fg-muted">
        {parserStatus === "initializing" && <p>Loading parser…</p>}
        {parserStatus === "error" && <p className="text-danger">Parser failed to load — see the AST tab for details.</p>}
        {parserStatus === "ready" && diagnostics.length === 0 && executionLog.length === 0 && <p>Ready.</p>}
        {parserStatus === "ready" &&
          diagnostics.map((diagnostic) => (
            <p key={diagnostic.id} className="text-danger">
              Line {diagnostic.startPosition.row + 1}, Col {diagnostic.startPosition.column + 1} — {diagnostic.message}
            </p>
          ))}
        {executionLog.map((entry) => (
          <p key={entry.id} className={entry.level === "error" ? "text-danger" : "text-fg"}>
            {entry.message}
          </p>
        ))}
      </div>
    </div>
  );
}
