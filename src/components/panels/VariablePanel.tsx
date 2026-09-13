import { Braces } from "lucide-react";
import { PanelShell } from "../common/PanelShell";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress } from "../../memory/memory";
import { useChangedKeys } from "../../execution/utils/useChangedKeys";
import type { PointerRelationship } from "../../execution/models/executionTypes";

/**
 * Live as of Phase 4, enhanced in Phase 6 with pointer target/status
 * details and array element display. Reads the active call frame's
 * parameters and locals straight off executionStore's currentStep.
 */
export function VariablePanel() {
  const status = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);
  const activeFrame = currentStep?.callStack.find((frame) => frame.isActive) ?? null;
  const pointerView = currentStep?.pointerView;
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

  // Build a lookup from pointer name to its relationship data
  const ptrRelMap = new Map<string, PointerRelationship>();
  if (pointerView) {
    for (const rel of pointerView.relationships) {
      ptrRelMap.set(rel.pointerName, rel);
    }
  }

  return (
    <PanelShell title="Variables" icon={Braces}>
      <div className="flex h-full flex-col overflow-auto">
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
                <th className="px-2 py-1 font-medium">Info</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ name, value, kind }) => {
                const rel = ptrRelMap.get(name);
                const isPtr = value.kind === "pointer";
                const isArr = value.kind === "array";
                const ownAddress = activeFrame.addresses[name];

                return (
                  <tr
                    key={name}
                    className={`border-t border-border font-mono transition-colors duration-500 ${
                      changed.has(name) ? "bg-active/20" : ""
                    }`}
                  >
                    <td className="px-2 py-1 text-fg">{name}</td>
                    <td className="px-2 py-1 text-fg-muted">
                      {value.type}
                      {isPtr && " *"}
                    </td>
                    <td className="px-2 py-1 text-fg">
                      {isPtr && "→ "}
                      {formatExecutionValue(value)}
                      {/* Pointer target details */}
                      {isPtr && rel && rel.status !== "null" && rel.targetName && (
                        <span className="ml-1.5 text-[10px] text-accent">
                          ({rel.targetName})
                        </span>
                      )}
                      {/* Variable location */}
                      {ownAddress && !isArr && (
                        <span
                          className="ml-2 text-[10px] text-fg-muted/75 font-mono"
                          title={`Simulated location: ${formatAddress(ownAddress)}`}
                        >
                          @{formatAddress(ownAddress)}
                        </span>
                      )}
                      {/* Array elements inline */}
                      {isArr && value.kind === "array" && value.values.length > 0 && (
                        <div className="mt-0.5 flex gap-0.5 flex-wrap">
                          {value.values.map((elem, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded bg-surface-raised px-1 py-0.5 text-[10px] text-fg-muted"
                            >
                              [{i}]={formatExecutionValue(elem)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {isPtr && rel ? (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                            rel.status === "valid" ? "bg-accent/15 text-accent" :
                            rel.status === "null" ? "bg-surface-raised text-fg-muted" :
                            "bg-danger/15 text-danger"
                          }`}
                        >
                          {rel.status}
                        </span>
                      ) : isArr ? (
                        <span className="text-[10px] text-fg-muted">{kind}</span>
                      ) : (
                        <span className="text-[10px] text-fg-muted">{kind}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PanelShell>
  );
}
