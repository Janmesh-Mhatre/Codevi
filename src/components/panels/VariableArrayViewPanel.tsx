import { useMemo } from "react";
import { Braces, Table, Grid } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress, addressesEqual, type Address } from "../../memory/memory";
import type { ExecutionValue, StepMemoryAccess } from "../../execution/models/executionTypes";

interface ScalarEntry {
  name: string;
  value: ExecutionValue & { kind: "scalar" };
  address?: Address;
}

interface ArrayEntry {
  name: string;
  value: ExecutionValue & { kind: "array" };
  address?: Address;
  is2D: boolean;
  rows: number;
  cols: number;
}

export function VariableArrayViewPanel() {
  const status = useExecutionStore((s) => s.status);
  const currentStep = useExecutionStore((s) => s.currentStep);
  const activeFrame = currentStep?.callStack.find((f) => f.isActive) ?? currentStep?.callStack[currentStep.callStack.length - 1] ?? null;
  const stepAccesses = currentStep?.stepAccesses ?? [];

  // Categorize variables into scalars and arrays only (exclude pointers and heap blocks)
  const { scalars, arrays } = useMemo(() => {
    if (!activeFrame) return { scalars: [], arrays: [] };

    const allVars: [string, ExecutionValue][] = [
      ...Object.entries(activeFrame.parameters),
      ...Object.entries(activeFrame.locals),
    ];

    const scalarsList: ScalarEntry[] = [];
    const arraysList: ArrayEntry[] = [];

    for (const [name, val] of allVars) {
      const address = activeFrame.addresses[name];
      if (val.kind === "scalar") {
        scalarsList.push({ name, value: val, address });
      } else if (val.kind === "array") {
        const is2D = Boolean(val.dimensions && val.dimensions.length === 2);
        const rows = is2D ? val.dimensions![0] : 1;
        const cols = is2D ? val.dimensions![1] : val.length;
        arraysList.push({
          name,
          value: val,
          address,
          is2D,
          rows,
          cols,
        });
      }
    }

    return { scalars: scalarsList, arrays: arraysList };
  }, [activeFrame]);

  // Helper to determine access highlight for an address
  const getAccessHighlight = (targetAddr?: Address): "read" | "write" | null => {
    if (!targetAddr || stepAccesses.length === 0) return null;
    const hit = stepAccesses.find((a: StepMemoryAccess) => addressesEqual(a.address, targetAddr));
    return hit ? hit.kind : null;
  };

  if (!currentStep || !activeFrame || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Grid size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">Variable & Array View</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          Simple variables and 1D / 2D arrays will appear here as you step through code.
        </p>
      </div>
    );
  }

  const hasContent = scalars.length > 0 || arrays.length > 0;

  if (!hasContent) {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Grid size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">No Variables in Scope</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          No scalar variables or arrays are declared in the current function scope ({activeFrame.functionName}()).
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-canvas/50 p-4 gap-6">
      {/* Scope Header */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-fg">
            {activeFrame.functionName}()
          </span>
          <span className="text-[10px] uppercase tracking-wider text-fg-muted">
            Call Depth {activeFrame.callDepth}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-fg-muted">
          <span>{scalars.length} Variable{scalars.length === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{arrays.length} Array{arrays.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* 1. SIMPLE VARIABLES SECTION */}
      {scalars.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent">
            <Braces size={13} />
            <span>Variables</span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
            {scalars.map(({ name, value, address }) => {
              const highlight = getAccessHighlight(address);
              let cardBorder = "border-border";
              let cardBg = "bg-surface-raised";

              if (highlight === "write") {
                cardBorder = "border-[#f59e0b]";
                cardBg = "bg-[#f59e0b]/10";
              } else if (highlight === "read") {
                cardBorder = "border-[#22d3ee]";
                cardBg = "bg-[#22d3ee]/10";
              }

              return (
                <div
                  key={name}
                  className={`flex flex-col justify-between rounded-md border p-2.5 transition-all ${cardBorder} ${cardBg}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="font-mono text-xs font-semibold text-fg">
                      {name}
                    </span>
                    <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                      {value.type}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <span className="font-mono text-sm font-bold text-fg">
                      {formatExecutionValue(value)}
                    </span>
                    {address && (
                      <span
                        className="font-mono text-[10px] text-accent/80"
                        title={`Location: ${formatAddress(address)}`}
                      >
                        @{formatAddress(address)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. ARRAYS SECTION (1D and 2D) */}
      {arrays.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent">
            <Table size={13} />
            <span>Arrays (1D & 2D)</span>
          </div>

          <div className="flex flex-col gap-4">
            {arrays.map((arr) => {
              const baseAddr = arr.address;

              return (
                <div
                  key={arr.name}
                  className="rounded-md border border-border bg-surface-raised p-3 shadow-sm"
                >
                  {/* Array Card Header */}
                  <div className="flex items-center justify-between border-b border-border/80 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-fg">
                        {arr.name}
                      </span>
                      <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                        {arr.value.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-fg-muted text-[10px]">
                        {arr.is2D ? `${arr.rows} × ${arr.cols} matrix (${arr.value.length} elements)` : `${arr.value.length} elements`}
                      </span>
                      {baseAddr && (
                        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-accent font-medium">
                          @{formatAddress(baseAddr)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Array Body: 1D or 2D */}
                  {!arr.is2D ? (
                    /* 1D Array Layout: [0] = 1, [1] = 2 */
                    <div className="flex flex-wrap gap-2">
                      {arr.value.values.map((elem, i) => {
                        const slotAddr: Address | undefined = baseAddr
                          ? { space: baseAddr.space, id: baseAddr.id, slot: i }
                          : undefined;
                        const highlight = getAccessHighlight(slotAddr);

                        let slotBorder = "border-border";
                        let slotBg = "bg-surface";
                        let valColor = "text-fg";

                        if (highlight === "write") {
                          slotBorder = "border-[#f59e0b]";
                          slotBg = "bg-[#f59e0b]/15";
                          valColor = "text-[#fbbf24]";
                        } else if (highlight === "read") {
                          slotBorder = "border-[#22d3ee]";
                          slotBg = "bg-[#22d3ee]/15";
                          valColor = "text-[#67e8f9]";
                        }

                        return (
                          <div
                            key={i}
                            className={`flex flex-col items-center justify-between rounded border px-2.5 py-1.5 font-mono min-w-[72px] transition-colors ${slotBorder} ${slotBg}`}
                          >
                            <div className="flex w-full items-center justify-between gap-2 text-[9px] text-fg-muted">
                              <span>[{i}]</span>
                              {slotAddr && (
                                <span className="opacity-70">
                                  @{slotAddr.id}:{slotAddr.slot}
                                </span>
                              )}
                            </div>
                            <div className="my-0.5 text-xs font-semibold">
                              <span className="text-fg-muted text-[10px] mr-1">[{i}] =</span>
                              <span className={valColor}>{formatExecutionValue(elem)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* 2D Array Layout: [0][0] = 1, [0][2] = 4 */
                    <div className="flex flex-col gap-2.5 overflow-x-auto">
                      {Array.from({ length: arr.rows }).map((_, r) => (
                        <div key={r} className="flex items-center gap-2">
                          <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
                            Row {r}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: arr.cols }).map((_, c) => {
                              const slotIndex = r * arr.cols + c;
                              const elem = arr.value.values[slotIndex] ?? { kind: "scalar", type: "int", value: 0 };
                              const slotAddr: Address | undefined = baseAddr
                                ? { space: baseAddr.space, id: baseAddr.id, slot: slotIndex }
                                : undefined;
                              const highlight = getAccessHighlight(slotAddr);

                              let slotBorder = "border-border";
                              let slotBg = "bg-surface";
                              let valColor = "text-fg";

                              if (highlight === "write") {
                                slotBorder = "border-[#f59e0b]";
                                slotBg = "bg-[#f59e0b]/15";
                                valColor = "text-[#fbbf24]";
                              } else if (highlight === "read") {
                                slotBorder = "border-[#22d3ee]";
                                slotBg = "bg-[#22d3ee]/15";
                                valColor = "text-[#67e8f9]";
                              }

                              return (
                                <div
                                  key={c}
                                  className={`flex flex-col items-center justify-between rounded border px-2.5 py-1.5 font-mono min-w-[68px] transition-colors ${slotBorder} ${slotBg}`}
                                >
                                  <div className="flex w-full items-center justify-between gap-1.5 text-[9px] text-fg-muted">
                                    <span>[{r}][{c}]</span>
                                    {slotAddr && (
                                      <span className="opacity-70">
                                        @{slotAddr.id}:{slotAddr.slot}
                                      </span>
                                    )}
                                  </div>
                                  <div className="my-0.5 text-xs font-semibold">
                                    <span className={valColor}>{formatExecutionValue(elem)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
