import { useMemo } from "react";
import { Layers, MemoryStick, Table, Box } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress, type Address } from "../../memory/memory";
import type { ExecutionValue, HeapBlock, StackFrame } from "../../execution/models/executionTypes";

interface VizEntry {
  name: string;
  value: ExecutionValue;
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

function formatParameters(parameters: Record<string, ExecutionValue>): string {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return "()";
  return `(${entries.map(([name, value]) => `${name}=${formatExecutionValue(value)}`).join(", ")})`;
}

/** Resolves a pointer chain: pp → p → x (or pp → p → H001) */
function resolveChain(
  name: string,
  allVars: Record<string, ExecutionValue>,
  entries: VizEntry[],
  maxDepth: number,
): string {
  let current = allVars[name];
  const parts: string[] = [name];
  let depth = 0;
  while (current?.kind === "pointer" && current.target && depth < maxDepth) {
    const targetAddr = formatAddress(current.target);
    const targetEntry = entries.find(
      (e) => e.address && formatAddress(e.address) === targetAddr && e.name !== parts[parts.length - 1],
    );
    if (targetEntry) {
      parts.push(targetEntry.name);
      current = targetEntry.value;
    } else {
      parts.push(targetAddr);
      break;
    }
    depth++;
  }
  return parts.length > 1 ? parts.join(" → ") : "";
}

/**
 * Phase 6.4.1 Refined: New DECLARATIONS Tab
 *
 * Establishes the new Declarations view representing runtime declarations and objects.
 * Arranges Stack declarations and Heap allocations side-by-side matching the established
 * visual style of the Stack and old Visualization tabs.
 * Preserves the existing array rendering behavior without redesign (reserved for Phase 6.4.3).
 */
export function DeclarationsPanel() {
  const status = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);
  // Global declarations separated into variables and arrays
  const { globalVariables, globalArrays } = useMemo(() => {
    const vars: VizEntry[] = [];
    const arrs: ArrayEntry[] = [];
    if (!currentStep?.globals) return { globalVariables: vars, globalArrays: arrs };

    for (const [name, val] of Object.entries(currentStep.globals)) {
      const addr = currentStep.globalAddresses?.[name];
      if (val.kind === "array") {
        const is2D = !!val.dimensions && val.dimensions.length === 2;
        const rows = is2D ? val.dimensions![0] : 1;
        const cols = is2D ? val.dimensions![1] : val.length;
        arrs.push({ name, value: val, address: addr, is2D, rows, cols });
      } else {
        vars.push({ name, value: val, address: addr });
      }
    }
    return { globalVariables: vars, globalArrays: arrs };
  }, [currentStep?.globals, currentStep?.globalAddresses]);

  const frames = currentStep?.callStack ? [...currentStep.callStack].reverse() : [];
  const heap = currentStep?.heap ?? [];
  const stepAccesses = currentStep?.stepAccesses ?? [];

  const getAccessHighlight = (addr?: Address): "read" | "write" | null => {
    if (!addr) return null;
    const access = stepAccesses.find(
      (a) =>
        a.address.space === addr.space &&
        a.address.id === addr.id &&
        (addr.slot === undefined || a.address.slot === undefined || a.address.slot === addr.slot),
    );
    return access ? access.kind : null;
  };

  const hasGlobals = globalVariables.length > 0 || globalArrays.length > 0;
  if (!currentStep || (frames.length === 0 && heap.length === 0 && !hasGlobals) || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
        <Layers size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">Declarations</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          Runtime declarations, scope variables, and array objects will appear here once you run or step through code.
        </p>
      </div>
    );
  }

  // Flatten all stack entries across frames + globals for pointer resolution
  const allEntries: VizEntry[] = [
    ...(currentStep.globals
      ? Object.entries(currentStep.globals).map(([name, value]) => ({
          name,
          value,
          address: currentStep.globalAddresses?.[name],
        }))
      : []),
    ...frames.flatMap((frame) => {
      const allVars = { ...frame.parameters, ...frame.locals };
      return Object.entries(allVars).map(([name, value]) => ({
        name,
        value,
        address: frame.addresses[name],
      }));
    }),
  ];

  return (
    <div className="flex h-full overflow-auto bg-canvas/50 p-3 gap-4">
      {/* STACK DECLARATIONS COLUMN */}
      <div className="flex flex-1 min-w-[260px] flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent mb-0.5">
          <Layers size={13} />
          <span>Stack</span>
        </div>

        {/* Global Declarations Card (if any) */}
        {(globalVariables.length > 0 || globalArrays.length > 0) && (
          <div className="rounded-md border border-border bg-surface-raised">
            <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border">
              <Box size={13} className="text-accent" />
              <span className="text-sm font-medium text-fg">Global Declarations</span>
              <span className="ml-auto rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                global
              </span>
            </div>

            {/* Global Scalar & Pointer Variables */}
            {globalVariables.length > 0 && (
              <div className="p-2.5 flex flex-col gap-2 font-mono text-xs">
                {globalVariables.map(({ name, value, address }) => {
                  const isPtr = value.kind === "pointer";
                  const isNull = isPtr && !value.target;
                  const targetAddr = isPtr && value.target ? formatAddress(value.target) : null;
                  const highlight = getAccessHighlight(address);

                  let targetLabel = "";
                  if (isPtr && value.target) {
                    if (value.target.space === "heap") {
                      const heapBlock = heap.find((b) => b.address.id === value.target!.id);
                      targetLabel = heapBlock
                        ? `→ ${formatAddress(value.target)}${heapBlock.active ? "" : " (freed)"}`
                        : `→ ${formatAddress(value.target)}`;
                    } else {
                      const targetEntry = allEntries.find(
                        (e) => e.address && formatAddress(e.address) === targetAddr && e.name !== name,
                      );
                      targetLabel = targetEntry ? `→ ${targetEntry.name}` : `→ ${targetAddr}`;
                    }
                  }

                  let accessBg = "";
                  if (highlight === "write") accessBg = "bg-[#f59e0b]/10 rounded px-1 -mx-1";
                  else if (highlight === "read") accessBg = "bg-[#22d3ee]/10 rounded px-1 -mx-1";

                  return (
                    <div key={name} className={`flex flex-col gap-0.5 ${accessBg}`}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-fg">{name}</span>
                          {address && (
                            <span className="text-[10px] text-fg-muted">@{formatAddress(address)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-right shrink-0">
                          <span className="text-fg-muted text-[11px]">{value.type}{isPtr ? " *" : ""}</span>
                          {isPtr ? (
                            isNull ? (
                              <span className="text-fg-muted">NULL</span>
                            ) : (
                              <span className="text-accent font-medium">{targetLabel}</span>
                            )
                          ) : (
                            <span className="text-fg">{formatExecutionValue(value)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Global Arrays Section (reuses ExistingArrayCard) */}
            {globalArrays.length > 0 && (
              <div className={`${globalVariables.length > 0 ? "border-t border-border" : ""} px-2.5 py-2 flex flex-col gap-2.5`}>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent/80 font-mono">
                  <Table size={12} />
                  <span>Arrays ({globalArrays.length})</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {globalArrays.map((arr) => (
                    <ExistingArrayCard
                      key={arr.name}
                      arr={arr}
                      getAccessHighlight={getAccessHighlight}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stack Frame Cards */}
        {frames.length === 0 ? (
          <div className="rounded-md border border-border bg-surface-raised p-3 text-center text-xs text-fg-muted">
            No active stack frames
          </div>
        ) : (
          frames.map((frame) => (
            <StackFrameCard
              key={`${frame.callDepth}-${frame.functionName}`}
              frame={frame}
              allEntries={allEntries}
              heap={heap}
              getAccessHighlight={getAccessHighlight}
            />
          ))
        )}
      </div>

      {/* HEAP ALLOCATIONS COLUMN */}
      <div className="flex flex-1 min-w-[260px] flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-active mb-0.5">
          <MemoryStick size={13} />
          <span>Heap</span>
        </div>

        {heap.length === 0 ? (
          <div className="rounded-md border border-border bg-surface-raised p-3 text-center text-xs text-fg-muted">
            No heap allocations
          </div>
        ) : (
          heap.map((block) => (
            <HeapBlockCard
              key={formatAddress(block.address)}
              block={block}
              stackEntries={allEntries}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface StackFrameCardProps {
  frame: StackFrame;
  allEntries: VizEntry[];
  heap: HeapBlock[];
  getAccessHighlight: (addr?: Address) => "read" | "write" | null;
}

function StackFrameCard({ frame, allEntries, heap, getAccessHighlight }: StackFrameCardProps) {
  const { variables, arrays, allVars } = useMemo(() => {
    const vars: VizEntry[] = [];
    const arrs: ArrayEntry[] = [];
    const combined: Record<string, ExecutionValue> = { ...frame.parameters, ...frame.locals };

    for (const [name, val] of Object.entries(combined)) {
      const addr = frame.addresses[name];
      if (val.kind === "array") {
        const is2D = !!val.dimensions && val.dimensions.length === 2;
        const rows = is2D ? val.dimensions![0] : 1;
        const cols = is2D ? val.dimensions![1] : val.length;
        arrs.push({ name, value: val, address: addr, is2D, rows, cols });
      } else {
        vars.push({ name, value: val, address: addr });
      }
    }

    return { variables: vars, arrays: arrs, allVars: combined };
  }, [frame]);

  return (
    <div
      className={`rounded-md border transition-colors ${
        frame.isActive ? "border-accent/40 bg-accent/10" : "border-border bg-surface-raised"
      }`}
    >
      {/* Frame Header - Matches StackPanel and VisualizationPanel */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Layers size={13} className={frame.isActive ? "text-accent" : "text-fg-muted"} />
        <span className="font-mono text-sm text-fg">
          {frame.functionName}
          {formatParameters(frame.parameters)}
        </span>
        {frame.isActive && (
          <span className="ml-auto rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            active
          </span>
        )}
        <span className="font-mono text-xs text-fg-muted">line {frame.line + 1}</span>
      </div>

      {/* Frame Variables List */}
      {variables.length > 0 && (
        <div className="border-t border-border px-2.5 py-1.5 flex flex-col gap-1.5 font-mono text-xs">
          {variables.map(({ name, value, address }) => {
            const isPtr = value.kind === "pointer";
            const isNull = isPtr && !value.target;
            const targetAddr = isPtr && value.target ? formatAddress(value.target) : null;
            const highlight = getAccessHighlight(address);

            let targetLabel = "";
            if (isPtr && value.target) {
              if (value.target.space === "heap") {
                const heapBlock = heap.find((b) => b.address.id === value.target!.id);
                targetLabel = heapBlock
                  ? `→ ${formatAddress(value.target)}${heapBlock.active ? "" : " (freed)"}`
                  : `→ ${formatAddress(value.target)}`;
              } else {
                const targetEntry = allEntries.find(
                  (e) => e.address && formatAddress(e.address) === targetAddr && e.name !== name,
                );
                targetLabel = targetEntry ? `→ ${targetEntry.name}` : `→ ${targetAddr}`;
              }
            }

            const chain = isPtr ? resolveChain(name, allVars, allEntries, 4) : "";

            let accessBg = "";
            if (highlight === "write") accessBg = "bg-[#f59e0b]/10 rounded px-1 -mx-1";
            else if (highlight === "read") accessBg = "bg-[#22d3ee]/10 rounded px-1 -mx-1";

            return (
              <div key={name} className={`flex flex-col gap-0.5 ${accessBg}`}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium text-fg">{name}</span>
                    {address && (
                      <span className="text-[10px] text-fg-muted">@{formatAddress(address)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-right shrink-0">
                    <span className="text-fg-muted text-[11px]">{value.type}{isPtr ? " *" : ""}</span>
                    {isPtr ? (
                      isNull ? (
                        <span className="text-fg-muted">NULL</span>
                      ) : (
                        <span className="text-accent font-medium">{targetLabel}</span>
                      )
                    ) : (
                      <span className="text-fg">{formatExecutionValue(value)}</span>
                    )}
                  </div>
                </div>
                {chain && (
                  <div className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent font-mono self-start">
                    {chain}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Arrays Section (Preserved existing array rendering behavior) */}
      {arrays.length > 0 && (
        <div className="border-t border-border px-2.5 py-2 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent/80 font-mono">
            <Table size={12} />
            <span>Arrays ({arrays.length})</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {arrays.map((arr) => (
              <ExistingArrayCard
                key={arr.name}
                arr={arr}
                getAccessHighlight={getAccessHighlight}
              />
            ))}
          </div>
        </div>
      )}

      {variables.length === 0 && arrays.length === 0 && (
        <div className="border-t border-border px-2.5 py-1 text-xs text-fg-muted italic">
          No local variables
        </div>
      )}
    </div>
  );
}

/**
 * Heap Block Card - Matches the exact visual representation of the old Visualization tab.
 */
interface HeapBlockCardProps {
  block: HeapBlock;
  stackEntries: VizEntry[];
}

function HeapBlockCard({ block, stackEntries }: HeapBlockCardProps) {
  const addrStr = formatAddress(block.address);
  const referencingPtrs = stackEntries
    .filter(
      (e) =>
        e.value.kind === "pointer" &&
        e.value.target &&
        e.value.target.space === "heap" &&
        e.value.target.id === block.address.id,
    )
    .map((e) => e.name);

  return (
    <div
      className={`rounded-md border transition-colors ${
        block.active ? "border-active/40 bg-active/10" : "border-danger/30 bg-danger/10"
      }`}
    >
      {/* Header - Matches Stack/Visualization structure */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <MemoryStick size={13} className={block.active ? "text-active" : "text-danger"} />
        <span className={`font-mono text-sm font-medium ${block.active ? "text-active" : "text-danger"}`}>
          {addrStr}
        </span>
        <span
          className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            block.active
              ? "bg-active/20 text-active"
              : "bg-danger/20 text-danger"
          }`}
        >
          {block.active ? "active" : "freed"}
        </span>
        <span className="font-mono text-xs text-fg-muted">{block.byteSize} bytes</span>
      </div>

      {/* Body - Matches Stack/Visualization border-t structure */}
      <div className="border-t border-border px-2.5 py-1.5 flex flex-col gap-1 font-mono text-xs">
        <div className="flex justify-between gap-3 text-fg-muted">
          <span>origin</span>
          <span>
            {block.origin}
            {block.slotCount > 1 ? ` · ${block.slotCount} slots` : ""}
          </span>
        </div>

        {referencingPtrs.length > 0 && (
          <div className="flex justify-between gap-3 text-fg-muted">
            <span>pointer</span>
            <span className="text-accent font-medium">← {referencingPtrs.join(", ")}</span>
          </div>
        )}

        <div className="flex justify-between gap-3">
          <span className="text-fg-muted">value</span>
          <span className={block.active ? "text-fg font-medium" : "text-fg-muted/60"}>
            {block.values.length === 1
              ? formatExecutionValue(block.values[0])
              : `[${block.values.map((v) => formatExecutionValue(v)).join(", ")}]`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Existing array rendering behavior: preserved exactly as in Variable & Array View.
 */
function ExistingArrayCard({
  arr,
  getAccessHighlight,
}: {
  arr: ArrayEntry;
  getAccessHighlight: (addr?: Address) => "read" | "write" | null;
}) {
  const baseAddr = arr.address;

  return (
    <div className="rounded border border-border bg-surface p-2 shadow-sm">
      {/* Array Header */}
      <div className="flex items-center justify-between border-b border-border/80 pb-1 mb-2 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-fg">{arr.name}</span>
          <span className="rounded bg-surface-raised px-1 py-0.5 text-[9px] text-fg-muted">
            {arr.value.type}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-fg-muted">
            {arr.is2D
              ? `${arr.rows} × ${arr.cols} matrix (${arr.value.length} elements)`
              : `${arr.value.length} elements`}
          </span>
          {baseAddr && (
            <span className="text-accent font-medium">@{formatAddress(baseAddr)}</span>
          )}
        </div>
      </div>

      {/* 1D or 2D Array layout */}
      {!arr.is2D ? (
        <div className="flex flex-wrap gap-1.5">
          {arr.value.values.map((elem, i) => {
            const slotAddr: Address | undefined = baseAddr
              ? { space: baseAddr.space, id: baseAddr.id, slot: i }
              : undefined;
            const highlight = getAccessHighlight(slotAddr);

            let slotBorder = "border-border";
            let slotBg = "bg-surface-raised";
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
                className={`flex flex-col items-center justify-between rounded border px-2 py-1 font-mono min-w-[64px] transition-colors ${slotBorder} ${slotBg}`}
              >
                <div className="flex w-full items-center justify-between gap-1 text-[8.5px] text-fg-muted">
                  <span>[{i}]</span>
                  {slotAddr && <span className="opacity-70">@{slotAddr.id}:{slotAddr.slot}</span>}
                </div>
                <div className="my-0.5 text-xs font-semibold">
                  <span className={valColor}>{formatExecutionValue(elem)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-x-auto">
          {Array.from({ length: arr.rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-[9px] font-semibold text-fg-muted uppercase tracking-wider">
                Row {r}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: arr.cols }).map((_, c) => {
                  const slotIndex = r * arr.cols + c;
                  const elem = arr.value.values[slotIndex] ?? { kind: "scalar", type: "int", value: 0 };
                  const slotAddr: Address | undefined = baseAddr
                    ? { space: baseAddr.space, id: baseAddr.id, slot: slotIndex }
                    : undefined;
                  const highlight = getAccessHighlight(slotAddr);

                  let slotBorder = "border-border";
                  let slotBg = "bg-surface-raised";
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
                      className={`flex flex-col items-center justify-between rounded border px-2 py-1 font-mono min-w-[60px] transition-colors ${slotBorder} ${slotBg}`}
                    >
                      <div className="flex w-full items-center justify-between gap-1 text-[8.5px] text-fg-muted">
                        <span>[{r}][{c}]</span>
                        {slotAddr && <span className="opacity-70">@{slotAddr.id}:{slotAddr.slot}</span>}
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
}
