import { MemoryStick } from "lucide-react";
import { PanelShell } from "../common/PanelShell";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";

/**
 * Live as of Phase 4 — a conceptual "storage" view of the active
 * frame's variables. Codevi's interpreter has no address/pointer model
 * (that's explicitly out of scope through at least Phase 4 — see
 * docs/PHASE_4_VISUALIZATION.md → "Known limitations"), so this
 * deliberately shows no address column at all rather than a fabricated
 * one. Real address-level and heap visualization belongs to a later
 * phase, once the interpreter actually has addresses to show.
 */
export function MemoryPanel() {
  const currentStep = useExecutionStore((state) => state.currentStep);
  const activeFrame = currentStep?.callStack.find((frame) => frame.isActive) ?? null;

  if (!activeFrame) {
    return (
      <PanelShell title="Memory" icon={MemoryStick}>
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
          Run or step through your program to see a conceptual memory view.
        </div>
      </PanelShell>
    );
  }

  const entries = Object.entries({ ...activeFrame.parameters, ...activeFrame.locals });

  return (
    <PanelShell title="Memory" icon={MemoryStick}>
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border px-2 py-1.5 text-[11px] text-fg-muted">
          Conceptual representation — no real memory addresses are available.
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
            Nothing stored yet at this point.
          </div>
        ) : (
          <table className="w-full flex-1 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fg-muted">
                <th className="px-2 py-1 font-medium">Variable</th>
                <th className="px-2 py-1 font-medium">Storage</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([name, value]) => (
                <tr key={name} className="border-t border-border font-mono">
                  <td className="px-2 py-1 text-fg">{name}</td>
                  <td className="px-2 py-1 text-fg">{formatExecutionValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PanelShell>
  );
}
