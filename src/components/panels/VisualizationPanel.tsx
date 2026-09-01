import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress, type Address } from "../../memory/memory";
import type { ExecutionValue, HeapBlock } from "../../execution/models/executionTypes";

/**
 * Live visualization of stack–heap memory layout (Phase 5.1). Shows:
 * - Stack section: each variable with address, type, and value
 * - Heap section: each allocation with ID, size, origin, status, values
 * - Pointer relationships: visual indicators from pointers to targets
 * - Freed blocks: shown dimmed with danger border
 * - Pointer-to-pointer chains: pp → p → x displayed inline
 * - Multiple pointers to same target: all shown referencing same block
 *
 * Pure React + CSS — no external graph library, keeping it lightweight.
 * Two-column layout: Stack on left, Heap on right.
 */
export function VisualizationPanel() {
  const status = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);
  const activeFrame = currentStep?.callStack.find((frame) => frame.isActive) ?? null;
  const heap = currentStep?.heap ?? [];

  if (!activeFrame || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm font-medium text-fg-muted">Memory visualization</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          Stack, heap, and pointer diagrams will render here once you step through code.
        </p>
      </div>
    );
  }

  const allVars = { ...activeFrame.parameters, ...activeFrame.locals };
  const entries = Object.entries(allVars).map(([name, value]) => ({
    name,
    value,
    address: activeFrame.addresses[name],
  }));

  return (
    <div className="flex h-full overflow-auto bg-canvas/50 p-4 gap-6">
      {/* STACK COLUMN */}
      <div className="flex flex-col gap-2 min-w-[200px]">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent mb-1">
          Stack
        </div>
        {entries.length === 0 ? (
          <div className="rounded border border-border bg-surface px-3 py-2 text-xs text-fg-muted">
            No variables
          </div>
        ) : (
          entries.map(({ name, value, address }) => (
            <StackVarCard
              key={name}
              name={name}
              value={value}
              address={address ? formatAddress(address) : "—"}
              allVars={allVars}
              allEntries={entries}
              heap={heap}
            />
          ))
        )}
      </div>

      {/* HEAP COLUMN */}
      <div className="flex flex-col gap-2 min-w-[220px]">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-active mb-1">
          Heap
        </div>
        {heap.length === 0 ? (
          <div className="rounded border border-border bg-surface px-3 py-2 text-xs text-fg-muted">
            No heap allocations
          </div>
        ) : (
          heap.map((block) => (
            <HeapBlockCard
              key={formatAddress(block.address)}
              block={block}
              stackEntries={entries}
            />
          ))
        )}
      </div>
    </div>
  );
}

type VizEntry = { name: string; value: ExecutionValue; address: Address | undefined };

interface StackVarCardProps {
  name: string;
  value: ExecutionValue;
  address: string;
  allVars: Record<string, ExecutionValue>;
  allEntries: VizEntry[];
  heap: HeapBlock[];
}

function StackVarCard({ name, value, address, allVars, allEntries, heap }: StackVarCardProps) {
  const isPtr = value.kind === "pointer";
  const isNull = isPtr && !value.target;
  const targetAddr = isPtr && value.target ? formatAddress(value.target) : null;

  // Determine target label
  let targetLabel = "";
  if (isPtr && value.target) {
    if (value.target.space === "heap") {
      const heapBlock = heap.find((b) => b.address.id === value.target!.id);
      targetLabel = heapBlock
        ? `→ ${formatAddress(value.target)} ${heapBlock.active ? "" : "(freed)"}`
        : `→ ${formatAddress(value.target)}`;
    } else {
      // Points to a stack variable
      const targetEntry = allEntries.find(
        (e) => e.address && formatAddress(e.address) === targetAddr && e.name !== name,
      );
      targetLabel = targetEntry ? `→ ${targetEntry.name}` : `→ ${targetAddr}`;
    }
  }

  // Resolve pointer chain for pointer-to-pointer
  const chain = isPtr ? resolveChain(name, allVars, allEntries, 4) : "";

  return (
    <div
      className={`codevi-viz-stack-var rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
        isPtr
          ? isNull
            ? "border-fg-muted/30 bg-surface"
            : "border-accent/40 bg-accent/5"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-fg">{name}</span>
        <span className="text-[10px] text-fg-muted">{address}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-fg-muted">{value.type}{isPtr ? " *" : ""}</span>
        <span className="text-fg">{formatExecutionValue(value)}</span>
      </div>
      {isPtr && isNull && (
        <div className="mt-1 text-[10px] text-fg-muted">NULL</div>
      )}
      {isPtr && targetLabel && (
        <div className="mt-1 text-[10px] text-accent font-medium">{targetLabel}</div>
      )}
      {chain && (
        <div className="mt-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
          {chain}
        </div>
      )}
    </div>
  );
}

interface HeapBlockCardProps {
  block: HeapBlock;
  stackEntries: { name: string; value: ExecutionValue }[];
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
      className={`codevi-viz-heap-block rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
        block.active
          ? "border-active/40 bg-active/5"
          : "border-danger/30 bg-danger/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${block.active ? "text-active" : "text-danger"}`}>
          {addrStr}
        </span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            block.active
              ? "bg-active/20 text-active"
              : "bg-danger/20 text-danger"
          }`}
        >
          {block.active ? "active" : "freed"}
        </span>
      </div>

      <div className="mt-1 text-fg-muted">
        {block.byteSize} bytes · {block.origin}
        {block.slotCount > 1 && ` · ${block.slotCount} slots`}
      </div>

      {referencingPtrs.length > 0 && (
        <div className="mt-1 text-accent text-[10px]">
          ← {referencingPtrs.join(", ")}
        </div>
      )}

      <div className={`mt-1 ${block.active ? "text-fg" : "text-fg-muted/60"}`}>
        {block.values.length === 1 ? (
          <span>value: {formatExecutionValue(block.values[0])}</span>
        ) : (
          <span>values: [{block.values.map((v) => formatExecutionValue(v)).join(", ")}]</span>
        )}
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
