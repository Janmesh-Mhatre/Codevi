import { Layers, MemoryStick } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress, type Address } from "../../memory/memory";
import type { ExecutionValue, HeapBlock, StackFrame } from "../../execution/models/executionTypes";

function formatParameters(parameters: Record<string, ExecutionValue>): string {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return "()";
  return `(${entries.map(([name, value]) => `${name}=${formatExecutionValue(value)}`).join(", ")})`;
}

type VizEntry = { name: string; value: ExecutionValue; address: Address | undefined };

/**
 * Live visualization of stack–heap memory layout (Phase 5.1).
 *
 * Designed to visually match the Stack panel (call stack) in structure,
 * typography, badges, and card borders while preserving the distinct color
 * coding:
 * - Stack: blueprint blue (`accent` tokens)
 * - Heap: amber (`active` tokens), danger for freed blocks
 */
export function VisualizationPanel() {
  const status = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);
  const heap = currentStep?.heap ?? [];
  const frames = currentStep?.callStack ? [...currentStep.callStack].reverse() : [];

  if (!currentStep || frames.length === 0 || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm font-medium text-fg-muted">Memory visualization</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          Stack, heap, and pointer diagrams will render here once you step through code.
        </p>
      </div>
    );
  }

  // Flatten all stack entries across all frames so pointers can resolve targets
  const allEntries: VizEntry[] = frames.flatMap((frame) => {
    const allVars = { ...frame.parameters, ...frame.locals };
    return Object.entries(allVars).map(([name, value]) => ({
      name,
      value,
      address: frame.addresses[name],
    }));
  });

  return (
    <div className="flex h-full overflow-auto bg-canvas/50 p-3 gap-4">
      {/* STACK COLUMN */}
      <div className="flex flex-1 min-w-[220px] flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent mb-0.5">
          <Layers size={13} />
          <span>Stack</span>
        </div>

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
            />
          ))
        )}
      </div>

      {/* HEAP COLUMN */}
      <div className="flex flex-1 min-w-[220px] flex-col gap-2">
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
}

function StackFrameCard({ frame, allEntries, heap }: StackFrameCardProps) {
  const allVars = { ...frame.parameters, ...frame.locals };
  const varEntries = Object.entries(allVars).map(([name, value]) => ({
    name,
    value,
    address: frame.addresses[name],
  }));

  return (
    <div
      className={`rounded-md border ${
        frame.isActive ? "border-accent/40 bg-accent/10" : "border-border bg-surface-raised"
      }`}
    >
      {/* Frame Header - Matches StackPanel */}
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

      {/* Frame Variables - Matches StackPanel border-t list */}
      {varEntries.length > 0 ? (
        <div className="border-t border-border px-2.5 py-1.5 flex flex-col gap-1.5 font-mono text-xs">
          {varEntries.map(({ name, value, address }) => {
            const isPtr = value.kind === "pointer";
            const isNull = isPtr && !value.target;
            const targetAddr = isPtr && value.target ? formatAddress(value.target) : null;

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

            return (
              <div key={name} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium text-fg">{name}</span>
                    {address && (
                      <span className="text-[10px] text-fg-muted">{formatAddress(address)}</span>
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
      ) : (
        <div className="border-t border-border px-2.5 py-1 text-xs text-fg-muted italic">
          No local variables
        </div>
      )}
    </div>
  );
}

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
      {/* Header - Matches StackPanel structure */}
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

      {/* Body - Matches StackPanel border-t structure */}
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
