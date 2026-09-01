import { Braces } from "lucide-react";
import { PanelShell } from "../common/PanelShell";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { useChangedKeys } from "../../execution/utils/useChangedKeys";

/**
 * Live as of Phase 4 — reads the active call frame's parameters and
 * locals straight off executionStore's currentStep. Every value shown
 * here is exactly what the interpreter is actually holding (see
 * docs/PHASE_4_VISUALIZATION.md → "Accuracy") — nothing is
 * approximated or invented, and a variable that's out of scope simply
 * isn't in the list, the same way it wouldn't be in a real debugger.
 */
export function VariablePanel() {
  const status = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);
  const activeFrame = currentStep?.callStack.find((frame) => frame.isActive) ?? null;
  const changed = useChangedKeys(activeFrame ? { ...activeFrame.parameters, ...activeFrame.locals } : {});

  if (!activeFrame) {
    return (
      <PanelShell title="Variables" icon={Braces}>
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
          {status === "idle"
            ? "Run or step through your program to see variable values here."
            : "No variables in scope right now."}
        </div>
      </PanelShell>
    );
  }

  const entries = [
    ...Object.entries(activeFrame.parameters).map(([name, value]) => ({ name, value, kind: "parameter" as const })),
    ...Object.entries(activeFrame.locals).map(([name, value]) => ({ name, value, kind: "local" as const })),
  ];

  return (
    <PanelShell title="Variables" icon={Braces}>
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border px-2 py-1.5 font-mono text-[11px] text-fg-muted">
          {activeFrame.functionName}()
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
            No variables declared yet at this point.
          </div>
        ) : (
          <table className="w-full flex-1 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fg-muted">
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">Value</th>
                <th className="px-2 py-1 font-medium">Scope</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ name, value, kind }) => (
                <tr
                  key={name}
                  className={`border-t border-border font-mono transition-colors duration-500 ${
                    changed.has(name) ? "bg-active/20" : ""
                  }`}
                >
                  <td className="px-2 py-1 text-fg">{name}</td>
                  <td className="px-2 py-1 text-fg-muted">
                    {value.type}
                    {value.kind === "pointer" && " *"}
                  </td>
                  <td className="px-2 py-1 text-fg">
                    {value.kind === "pointer" && "→ "}
                    {formatExecutionValue(value)}
                  </td>
                  <td className="px-2 py-1 text-fg-muted">{kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PanelShell>
  );
}
