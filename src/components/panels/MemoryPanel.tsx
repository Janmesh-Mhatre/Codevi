import { MemoryStick } from "lucide-react";
import { PanelShell } from "../common/PanelShell";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress } from "../../memory/memory";

/**
 * Live as of Phase 4, extended in Phase 5 with real (simulated)
 * addresses and heap blocks. Phase 5.1 adds freed-block value display
 * (last-known values shown dimmed) for debugging use-after-free
 * scenarios, and pointer chain indicators for pointer-to-pointer
 * variables. Codevi never draws a real hardware memory map — every
 * address is a labeled, made-up identifier (S001, H002[1], ...)
 * assigned by MemoryModel.
 */
export function MemoryPanel() {
  const currentStep = useExecutionStore((state) => state.currentStep);
  const activeFrame = currentStep?.callStack.find((frame) => frame.isActive) ?? null;
  const heap = currentStep?.heap ?? [];

  if (!activeFrame) {
    return (
      <PanelShell title="Memory" icon={MemoryStick}>
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
          Run or step through your program to see simulated memory here.
        </div>
      </PanelShell>
    );
  }

  const allVars = { ...activeFrame.parameters, ...activeFrame.locals };
  const stackEntries = Object.entries(allVars).map(([name, value]) => ({
    name,
    value,
    address: activeFrame.addresses[name],
  }));

  /** Resolve a pointer chain for display: pp → p → x */
  function resolvePointerChain(name: string, maxDepth = 4): string {
    let current = allVars[name];
    const parts: string[] = [name];
    let depth = 0;
    while (current?.kind === "pointer" && current.target && depth < maxDepth) {
      const targetAddr = formatAddress(current.target);
      // Find a stack variable at this target address
      const targetEntry = stackEntries.find(
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

  return (
    <PanelShell title="Memory" icon={MemoryStick}>
      <div className="flex h-full flex-col overflow-auto">
        <div className="shrink-0 border-b border-border px-2 py-1.5 text-[11px] text-fg-muted">
          Simulated addresses — not real hardware memory.
        </div>

        <div className="shrink-0 border-b border-border px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
          Stack
        </div>
        {stackEntries.length === 0 ? (
          <p className="px-2 py-2 text-sm text-fg-muted">Nothing on the stack yet.</p>
        ) : (
          <table className="w-full shrink-0 text-left text-sm">
            <tbody>
              {stackEntries.map(({ name, value, address }) => {
                const chain = value.kind === "pointer" ? resolvePointerChain(name) : "";
                return (
                  <tr key={name} className="border-t border-border font-mono">
                    <td className="px-2 py-1 text-fg-muted">{address ? formatAddress(address) : "—"}</td>
                    <td className="px-2 py-1 text-fg">{name}</td>
                    <td className="px-2 py-1 text-fg">
                      {formatExecutionValue(value)}
                      {value.kind === "pointer" && value.target && (
                        <span className="text-fg-muted"> → {formatAddress(value.target)}</span>
                      )}
                      {value.kind === "pointer" && !value.target && (
                        <span className="text-danger/70"> (invalid/freed)</span>
                      )}
                      {chain && <div className="text-[10px] text-accent">{chain}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="mt-2 shrink-0 border-y border-border px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
          Heap
        </div>
        {heap.length === 0 ? (
          <p className="px-2 py-2 text-sm text-fg-muted">No heap allocations yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 p-2">
            {heap.map((block) => {
              // Find all stack pointers referencing this block
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
                  key={formatAddress(block.address)}
                  className={`rounded border px-2 py-1.5 font-mono text-xs ${
                    block.active
                      ? "border-border bg-surface-raised"
                      : "border-danger/30 bg-surface-raised/40 text-fg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${block.active ? "text-fg" : "text-fg-muted"}`}>
                      {formatAddress(block.address)}
                    </span>
                    <span>
                      {block.byteSize} bytes · {block.origin}
                    </span>
                    <span className={`ml-auto ${block.active ? "text-accent" : "text-danger"}`}>
                      {block.active ? "active" : "freed"}
                    </span>
                  </div>
                  {referencingPtrs.length > 0 && (
                    <div className="mt-0.5 text-accent">
                      ← {referencingPtrs.join(", ")}
                    </div>
                  )}
                  <div className={`mt-0.5 ${block.active ? "" : "text-fg-muted/60"}`}>
                    values: [{block.values.map((v) => formatExecutionValue(v)).join(", ")}]
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
