import { AlertCircle, Loader2 } from "lucide-react";
import { useParserStore } from "../../state/parserStore";
import { AstTreeNode } from "./AstTreeNode";

/**
 * Renders the parsed AST as an expandable tree (Feature 4 — AST Viewer).
 * No PanelShell here — see VisualizationPanel.tsx's comment; this sits
 * in the same tab group.
 *
 * Deliberately just one view mode (an expandable tree), not also a
 * separate raw-JSON toggle — the Phase 2 brief's "focus on clarity
 * rather than appearance" reads as "build the one good view," and a
 * second, less legible view of the same data doesn't add clarity.
 */
export function AstViewerPanel() {
  const status = useParserStore((state) => state.status);
  const ast = useParserStore((state) => state.ast);
  const diagnostics = useParserStore((state) => state.diagnostics);
  const parseTimeMs = useParserStore((state) => state.parseTimeMs);
  const usedIncrementalParse = useParserStore((state) => state.usedIncrementalParse);
  const nodeCount = useParserStore((state) => state.nodeCount);
  const errorMessage = useParserStore((state) => state.errorMessage);

  if (status === "initializing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-fg-muted">
        <Loader2 size={18} className="animate-spin" />
        <p className="text-sm">Loading parser…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertCircle size={18} className="text-danger" />
        <p className="text-sm font-medium text-danger">Parser failed to load</p>
        {errorMessage && <p className="max-w-xs text-xs text-fg-muted">{errorMessage}</p>}
      </div>
    );
  }

  if (!ast) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
        Start typing to see the parsed structure of your program.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-2 py-1.5 font-mono text-[11px] text-fg-muted">
        <span>{nodeCount} nodes</span>
        <span>{parseTimeMs !== null ? `${parseTimeMs.toFixed(2)} ms` : ""}</span>
        <span>{usedIncrementalParse ? "incremental" : "full parse"}</span>
        {diagnostics.length > 0 && (
          <span className="ml-auto text-danger">
            {diagnostics.length} {diagnostics.length === 1 ? "error" : "errors"}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        <AstTreeNode node={ast} depth={0} />
      </div>
    </div>
  );
}
