/** Will host the React Flow canvas (stack frames, heap blocks, pointer
 * arrows) starting in Phase 4. Reads from useVisualizationStore once that
 * store has real content — for now the store is empty on purpose, so this
 * always shows the placeholder.
 *
 * No PanelShell here (unlike Variable/Memory panels) — this now lives
 * inside the Visualization/AST tab group in AppShell, which supplies the
 * shared header. See docs/PHASE_2_PARSER.md → "Layout change" for why. */
export function VisualizationPanel() {
  return (
    <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-sm font-medium text-fg-muted">Memory visualization coming soon</p>
      <p className="max-w-xs text-xs text-fg-muted/80">
        Stack, heap, and pointer diagrams will render here once you can step through code.
      </p>
    </div>
  );
}
