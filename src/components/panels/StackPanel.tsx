import { Layers } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";

function formatParameters(parameters: Record<string, { type: string; value: number }>): string {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return "()";
  return `(${entries.map(([name, value]) => `${name}=${formatExecutionValue(value)}`).join(", ")})`;
}

/**
 * Call-stack visualization (Phase 4) — lives as a tab alongside AST and
 * Visualization (see AppShell.tsx), not its own PanelShell-wrapped
 * panel, matching how the AST tab was added in Phase 2. Frames are
 * listed innermost/active first, matching the common debugger
 * convention (VS Code, GDB's `bt`) rather than the call order — the
 * active frame is also explicitly labeled regardless, so the ordering
 * choice can't cause ambiguity about which frame is current.
 */
export function StackPanel() {
  const status = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);

  if (!currentStep || currentStep.callStack.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
        {status === "idle"
          ? "Run or step through your program to see the call stack here."
          : "No active calls right now."}
      </div>
    );
  }

  // Innermost/active frame first.
  const frames = [...currentStep.callStack].reverse();

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      {frames.map((frame) => (
        <div
          key={`${frame.callDepth}-${frame.functionName}`}
          className={`rounded-md border ${frame.isActive ? "border-active bg-active/10" : "border-border bg-surface-raised"}`}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <Layers size={13} className={frame.isActive ? "text-active" : "text-fg-muted"} />
            <span className="font-mono text-sm text-fg">
              {frame.functionName}
              {formatParameters(frame.parameters)}
            </span>
            {frame.isActive && (
              <span className="ml-auto rounded-full bg-active px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-canvas">
                active
              </span>
            )}
            <span className="font-mono text-xs text-fg-muted">line {frame.line + 1}</span>
          </div>
          {Object.keys(frame.locals).length > 0 && (
            <div className="border-t border-border px-2.5 py-1.5">
              {Object.entries(frame.locals).map(([name, value]) => (
                <div key={name} className="flex justify-between gap-3 font-mono text-xs text-fg-muted">
                  <span>{name}</span>
                  <span>{formatExecutionValue(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
