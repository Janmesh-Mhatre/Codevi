import { useMemo } from "react";
import { Braces, Table, Grid, Layers, ArrowLeftRight } from "lucide-react";
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

/** Phase 6.3: An array recognized as a stack (has `top` variable). */
interface StackEntry {
  name: string;
  value: ExecutionValue & { kind: "array" };
  address?: Address;
  topIndex: number;
}

/** Phase 6.3: An array recognized as a queue (has `front` + `rear` variables). */
interface QueueEntry {
  name: string;
  value: ExecutionValue & { kind: "array" };
  address?: Address;
  frontIndex: number;
  rearIndex: number;
  frontKey: string;
  rearKey: string;
}

export function VariableArrayViewPanel() {
  const status = useExecutionStore((s) => s.status);
  const currentStep = useExecutionStore((s) => s.currentStep);
  const activeFrame = currentStep?.callStack.find((f) => f.isActive) ?? currentStep?.callStack[currentStep.callStack.length - 1] ?? null;
  const stepAccesses = currentStep?.stepAccesses ?? [];

  // Categorize variables into scalars, arrays, stacks, and queues
  const { scalars, arrays, stacks, queues } = useMemo(() => {
    if (!currentStep) return { scalars: [], arrays: [], stacks: [], queues: [] };

    const getAddress = (varName: string): Address | undefined => {
      if (activeFrame?.addresses[varName]) return activeFrame.addresses[varName];
      for (const frame of currentStep.callStack) {
        if (frame.addresses[varName]) return frame.addresses[varName];
      }
      if (currentStep.globalAddresses?.[varName]) return currentStep.globalAddresses[varName];
      return undefined;
    };

    // 1. Gather all variables across all available scopes:
    // Globals first, then callStack frames from outer to inner (active frame takes precedence)
    const globalVars: [string, ExecutionValue][] = currentStep.globals
      ? Object.entries(currentStep.globals)
      : [];
    const frameVars: [string, ExecutionValue][] = [];
    for (const frame of currentStep.callStack) {
      frameVars.push(...Object.entries(frame.parameters), ...Object.entries(frame.locals));
    }
    const allVars = [...globalVars, ...frameVars];

    // Collect integer scalar names for heuristic matching
    const intVars = new Map<string, number>();
    for (const [name, val] of allVars) {
      if (val.kind === "scalar" && (val.type === "int" || val.type === "char")) {
        intVars.set(name.toLowerCase(), val.value);
      }
    }

    const topVal = intVars.get("top");
    const frontVal = intVars.get("front") ?? intVars.get("head");
    const rearVal = intVars.get("rear") ?? intVars.get("tail");
    const frontKey = intVars.has("front") ? "front" : intVars.has("head") ? "head" : "front";
    const rearKey = intVars.has("rear") ? "rear" : intVars.has("tail") ? "tail" : "rear";

    const scalarsList: ScalarEntry[] = [];
    const arraysList: ArrayEntry[] = [];
    const stacksList: StackEntry[] = [];
    const queuesList: QueueEntry[] = [];

    // Collect all scalars to display
    // Active frame scalars take precedence, then globals that are not shadowed
    const scalarMap = new Map<string, ScalarEntry>();
    for (const [name, val] of globalVars) {
      if (val.kind === "scalar") {
        scalarMap.set(name, { name, value: val, address: getAddress(name) });
      }
    }
    const activeVars = activeFrame ? [...Object.entries(activeFrame.parameters), ...Object.entries(activeFrame.locals)] : [];
    for (const [name, val] of activeVars) {
      if (val.kind === "scalar") {
        scalarMap.set(name, { name, value: val, address: getAddress(name) });
      }
    }
    scalarsList.push(...scalarMap.values());

    const getScalarVal = (v?: ExecutionValue, fallback: number = -1): number =>
      v && v.kind === "scalar" && typeof v.value === "number" ? v.value : fallback;

    // --- Struct-backed stack/queue detection (local struct or malloc struct) ---
    for (const [varName, val] of allVars) {
      if (val.kind !== "pointer" || !val.target) continue;
      const lowerType = val.type.toLowerCase();
      const lowerName = varName.toLowerCase();
      const isStructStack = lowerType.includes("struct stack") || (lowerType.startsWith("struct") && (lowerName.includes("stack") || lowerName === "s"));
      const isStructQueue = lowerType.includes("struct queue") || (lowerType.startsWith("struct") && (lowerName.includes("queue") || lowerName === "q"));

      if (isStructStack) {
        if (val.target.space === "heap") {
          const block = currentStep.heap.find((b) => b.active && b.address.id === val.target!.id);
          if (block && block.slotCount >= 2) {
            const dataCount = block.slotCount - 1;
            const sTop = getScalarVal(block.values[dataCount], -1);
            const dataVals: ExecutionValue[] = [];
            for (let i = 0; i < dataCount; i++) {
              dataVals.push(block.values[i] ?? { kind: "scalar", type: "int", value: 0 });
            }
            const dataArrVal: ExecutionValue & { kind: "array" } = {
              kind: "array",
              type: `int[${dataCount}]`,
              address: val.target,
              length: dataCount,
              values: dataVals,
            };
            if (!stacksList.some((s) => s.name === `${varName}.data`)) {
              stacksList.push({
                name: `${varName}.data`,
                value: dataArrVal,
                address: val.target,
                topIndex: sTop,
              });
            }
          }
        } else if (val.target.space === "stack" && val.structValues && val.structValues.length >= 2) {
          const dataCount = val.structValues.length - 1;
          const sTop = getScalarVal(val.structValues[dataCount], -1);
          const dataVals = val.structValues.slice(0, dataCount);
          const dataArrVal: ExecutionValue & { kind: "array" } = {
            kind: "array",
            type: `int[${dataCount}]`,
            address: val.target,
            length: dataCount,
            values: dataVals,
          };
          if (!stacksList.some((s) => s.name === `${varName}.data`)) {
            stacksList.push({
              name: `${varName}.data`,
              value: dataArrVal,
              address: val.target,
              topIndex: sTop,
            });
          }
        }
      }

      if (isStructQueue) {
        if (val.target.space === "heap") {
          const block = currentStep.heap.find((b) => b.active && b.address.id === val.target!.id);
          if (block && block.slotCount >= 3) {
            const dataCount = block.slotCount - 2;
            const sFront = getScalarVal(block.values[dataCount], 0);
            const sRear = getScalarVal(block.values[dataCount + 1], -1);
            const dataVals: ExecutionValue[] = [];
            for (let i = 0; i < dataCount; i++) {
              dataVals.push(block.values[i] ?? { kind: "scalar", type: "int", value: 0 });
            }
            const dataArrVal: ExecutionValue & { kind: "array" } = {
              kind: "array",
              type: `int[${dataCount}]`,
              address: val.target,
              length: dataCount,
              values: dataVals,
            };
            if (!queuesList.some((q) => q.name === `${varName}.data`)) {
              queuesList.push({
                name: `${varName}.data`,
                value: dataArrVal,
                address: val.target,
                frontIndex: sFront,
                rearIndex: sRear,
                frontKey: "front",
                rearKey: "rear",
              });
            }
          }
        } else if (val.target.space === "stack" && val.structValues && val.structValues.length >= 3) {
          const dataCount = val.structValues.length - 2;
          const sFront = getScalarVal(val.structValues[dataCount], 0);
          const sRear = getScalarVal(val.structValues[dataCount + 1], -1);
          const dataVals = val.structValues.slice(0, dataCount);
          const dataArrVal: ExecutionValue & { kind: "array" } = {
            kind: "array",
            type: `int[${dataCount}]`,
            address: val.target,
            length: dataCount,
            values: dataVals,
          };
          if (!queuesList.some((q) => q.name === `${varName}.data`)) {
            queuesList.push({
              name: `${varName}.data`,
              value: dataArrVal,
              address: val.target,
              frontIndex: sFront,
              rearIndex: sRear,
              frontKey: "front",
              rearKey: "rear",
            });
          }
        }
      }
    }

    // Collect all array variables across scopes
    const arrayMap = new Map<string, { name: string; val: ExecutionValue & { kind: "array" }; address?: Address }>();
    for (const [name, val] of allVars) {
      if (val.kind === "array" && !arrayMap.has(name)) {
        arrayMap.set(name, { name, val, address: val.address ?? getAddress(name) });
      }
    }

    for (const [name, arr] of arrayMap) {
      const val = arr.val;
      const address = arr.address;
      const labelLower = name.toLowerCase();
      const isNamedStack = labelLower.includes("stack") || labelLower === "s" || labelLower.includes("stk");
      const isNamedQueue = labelLower.includes("queue") || labelLower === "q";

      let shouldPromoteStack = false;
      let shouldPromoteQueue = false;

      if (topVal !== undefined && frontVal !== undefined && rearVal !== undefined) {
        if (isNamedStack) shouldPromoteStack = true;
        else if (isNamedQueue) shouldPromoteQueue = true;
        else shouldPromoteStack = true;
      } else if (topVal !== undefined) {
        if (!isNamedQueue) shouldPromoteStack = true;
      } else if (frontVal !== undefined && rearVal !== undefined) {
        if (!isNamedStack) shouldPromoteQueue = true;
      }

      if (shouldPromoteStack && topVal !== undefined) {
        stacksList.push({ name, value: val, address, topIndex: topVal });
      } else if (shouldPromoteQueue && frontVal !== undefined && rearVal !== undefined) {
        queuesList.push({ name, value: val, address, frontIndex: frontVal, rearIndex: rearVal, frontKey, rearKey });
      } else {
        const is2D = Boolean(val.dimensions && val.dimensions.length === 2);
        const rows = is2D ? val.dimensions![0] : 1;
        const cols = is2D ? val.dimensions![1] : val.length;
        arraysList.push({ name, value: val, address, is2D, rows, cols });
      }
    }

    return { scalars: scalarsList, arrays: arraysList, stacks: stacksList, queues: queuesList };
  }, [currentStep, activeFrame]);

  // Helper to determine access highlight for an address
  const getAccessHighlight = (targetAddr?: Address): "read" | "write" | null => {
    if (!targetAddr || stepAccesses.length === 0) return null;
    const hit = stepAccesses.find((a: StepMemoryAccess) => addressesEqual(a.address, targetAddr));
    return hit ? hit.kind : null;
  };

  if (!currentStep || status === "idle") {
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

  const hasContent = scalars.length > 0 || arrays.length > 0 || stacks.length > 0 || queues.length > 0;

  if (!hasContent) {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Grid size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">No Variables in Scope</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          No scalar variables, arrays, stacks, or queues are currently active.
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
            {activeFrame?.functionName ? `${activeFrame.functionName}()` : "Global Scope"}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-fg-muted">
            Call Depth {activeFrame?.callDepth ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-fg-muted">
          <span>{scalars.length} Variable{scalars.length === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{arrays.length + stacks.length + queues.length} Array{arrays.length + stacks.length + queues.length === 1 ? "" : "s"}</span>
          {stacks.length > 0 && <><span>·</span><span className="text-[#34d399]">{stacks.length} Stack{stacks.length === 1 ? "" : "s"}</span></>}
          {queues.length > 0 && <><span>·</span><span className="text-[#a78bfa]">{queues.length} Queue{queues.length === 1 ? "" : "s"}</span></>}
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

      {/* 3. STACKS SECTION (Phase 6.3) */}
      {stacks.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#34d399]">
            <Layers size={13} />
            <span>Stack (LIFO)</span>
          </div>

          <div className="flex flex-col gap-4">
            {stacks.map((stk) => {
              const baseAddr = stk.address;
              const topIdx = stk.topIndex;
              const isEmpty = topIdx < 0;

              return (
                <div
                  key={stk.name}
                  className="rounded-md border border-[#34d399]/30 bg-[#34d399]/5 p-3 shadow-sm"
                >
                  {/* Stack Card Header */}
                  <div className="flex items-center justify-between border-b border-[#34d399]/20 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-[#34d399]" />
                      <span className="font-mono text-sm font-bold text-fg">
                        {stk.name}
                      </span>
                      <span className="rounded bg-[#34d399]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#34d399] font-semibold">
                        STACK
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-fg-muted text-[10px]">
                        top = {topIdx}{isEmpty ? " (empty)" : ""}
                      </span>
                      <span className="text-fg-muted text-[10px]">
                        · {stk.value.length} capacity
                      </span>
                      {baseAddr && (
                        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-[#34d399] font-medium">
                          @{formatAddress(baseAddr)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stack Body: Vertical, top element at the top */}
                  <div className="flex flex-col-reverse gap-1.5">
                    {stk.value.values.map((elem, i) => {
                      const slotAddr: Address | undefined = baseAddr
                        ? { space: baseAddr.space, id: baseAddr.id, slot: i }
                        : undefined;
                      const highlight = getAccessHighlight(slotAddr);
                      const isTop = i === topIdx;
                      const isAboveTop = i > topIdx;

                      let slotBorder = "border-border/60";
                      let slotBg = "bg-surface";
                      let valColor = "text-fg";

                      if (isTop) {
                        slotBorder = "border-[#34d399]";
                        slotBg = "bg-[#34d399]/15";
                        valColor = "text-[#34d399]";
                      } else if (isAboveTop) {
                        slotBorder = "border-border/30";
                        slotBg = "bg-surface/40";
                        valColor = "text-fg-muted/40";
                      }

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
                          className={`flex items-center justify-between rounded border px-3 py-1.5 font-mono transition-colors ${slotBorder} ${slotBg}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-fg-muted w-6">[{i}]</span>
                            <span className={`text-xs font-semibold ${valColor}`}>
                              {formatExecutionValue(elem)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isTop && (
                              <span className="rounded-full bg-[#34d399]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#34d399] animate-pulse">
                                ← TOP
                              </span>
                            )}
                            {slotAddr && (
                              <span className="text-[9px] text-fg-muted/60">
                                @{slotAddr.id}:{slotAddr.slot}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Push/Pop direction indicator */}
                  <div className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-[#34d399]/15">
                    <span className="text-[9px] text-fg-muted/60 uppercase tracking-widest">
                      push ↑ · pop ↓
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. QUEUES SECTION (Phase 6.3) */}
      {queues.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#a78bfa]">
            <ArrowLeftRight size={13} />
            <span>Queue (FIFO)</span>
          </div>

          <div className="flex flex-col gap-4">
            {queues.map((q) => {
              const baseAddr = q.address;
              const fIdx = q.frontIndex;
              const rIdx = q.rearIndex;
              const isEmpty = fIdx > rIdx;

              return (
                <div
                  key={q.name}
                  className="rounded-md border border-[#a78bfa]/30 bg-[#a78bfa]/5 p-3 shadow-sm"
                >
                  {/* Queue Card Header */}
                  <div className="flex items-center justify-between border-b border-[#a78bfa]/20 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight size={14} className="text-[#a78bfa]" />
                      <span className="font-mono text-sm font-bold text-fg">
                        {q.name}
                      </span>
                      <span className="rounded bg-[#a78bfa]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#a78bfa] font-semibold">
                        QUEUE
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-fg-muted text-[10px]">
                        {q.frontKey} = {fIdx} · {q.rearKey} = {rIdx}{isEmpty ? " (empty)" : ""}
                      </span>
                      <span className="text-fg-muted text-[10px]">
                        · {q.value.length} capacity
                      </span>
                      {baseAddr && (
                        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-[#a78bfa] font-medium">
                          @{formatAddress(baseAddr)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Queue Body: Horizontal pipe layout */}
                  <div className="flex items-stretch gap-0 overflow-x-auto">
                    {q.value.values.map((elem, i) => {
                      const slotAddr: Address | undefined = baseAddr
                        ? { space: baseAddr.space, id: baseAddr.id, slot: i }
                        : undefined;
                      const highlight = getAccessHighlight(slotAddr);
                      const isFront = i === fIdx;
                      const isRear = i === rIdx;
                      const isInRange = i >= fIdx && i <= rIdx;
                      const isOutside = !isInRange;

                      let slotBorder = "border-border/60";
                      let slotBg = "bg-surface";
                      let valColor = "text-fg";

                      if (isFront) {
                        slotBorder = "border-[#22d3ee]";
                        slotBg = "bg-[#22d3ee]/15";
                        valColor = "text-[#22d3ee]";
                      } else if (isRear) {
                        slotBorder = "border-[#a78bfa]";
                        slotBg = "bg-[#a78bfa]/15";
                        valColor = "text-[#a78bfa]";
                      } else if (isOutside) {
                        slotBorder = "border-border/30";
                        slotBg = "bg-surface/40";
                        valColor = "text-fg-muted/40";
                      }

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
                          className={`flex flex-col items-center justify-between border px-3 py-1.5 font-mono min-w-[72px] transition-colors ${slotBorder} ${slotBg} ${i === 0 ? "rounded-l" : ""} ${i === q.value.length - 1 ? "rounded-r" : ""}`}
                        >
                          {/* Top label: front / rear badges */}
                          <div className="flex flex-col items-center gap-0.5 mb-1 min-h-[16px]">
                            {isFront && (
                              <span className="rounded-full bg-[#22d3ee]/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#22d3ee]">
                                {q.frontKey} ↓
                              </span>
                            )}
                            {isRear && (
                              <span className="rounded-full bg-[#a78bfa]/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#a78bfa]">
                                {q.rearKey} ↓
                              </span>
                            )}
                          </div>

                          <div className="text-[9px] text-fg-muted">[{i}]</div>
                          <div className={`text-xs font-semibold ${valColor}`}>
                            {formatExecutionValue(elem)}
                          </div>

                          {slotAddr && (
                            <div className="text-[8px] text-fg-muted/50 mt-0.5">
                              @{slotAddr.id}:{slotAddr.slot}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Dequeue/Enqueue direction indicator */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#a78bfa]/15 text-[9px] text-fg-muted/60 uppercase tracking-widest">
                    <span>← dequeue ({q.frontKey})</span>
                    <span>enqueue ({q.rearKey}) →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
