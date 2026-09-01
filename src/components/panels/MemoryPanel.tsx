import { MemoryStick } from "lucide-react";
import { PanelShell } from "../common/PanelShell";
import { useExecutionStore } from "../../state/executionStore";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { formatAddress } from "../../memory/memory";

/**
 * Live as of Phase 4, extended in Phase 5 with real (simulated)
 * addresses and heap blocks. Codevi never draws a real hardware memory
 * map — every address is a labeled, made-up identifier (S001, H002[1],
 * ...) assigned by MemoryModel, exactly as the Phase 5 brief asks for.
 * See docs/PHASE_5_POINTERS.md → "Memory Panel".
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

  const stackEntries = Object.entries({ ...activeFrame.parameters, ...activeFrame.locals }).map(([name, value]) => ({
    name,
    value,
    address: activeFrame.addresses[name],
  }));

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
              {stackEntries.map(({ name, value, address }) => (
                <tr key={name} className="border-t border-border font-mono">
                  <td className="px-2 py-1 text-fg-muted">{address ? formatAddress(address) : "—"}</td>
                  <td className="px-2 py-1 text-fg">{name}</td>
                  <td className="px-2 py-1 text-fg">
                    {formatExecutionValue(value)}
                    {value.kind === "pointer" && value.target && (
                      <span className="text-fg-muted"> → {formatAddress(value.target)}</span>
                    )}
                  </td>
                </tr>
              ))}
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
            {heap.map((block) => (
              <div
                key={formatAddress(block.address)}
                className={`rounded border px-2 py-1.5 font-mono text-xs ${
                  block.active ? "border-border bg-surface-raised" : "border-border/60 bg-surface-raised/40 text-fg-muted line-through"
                }`}
              >
                <div className="flex items-center gap-2 no-underline">
                  <span className="font-medium text-fg">{formatAddress(block.address)}</span>
                  <span>
                    {block.byteSize} bytes · {block.origin}
                  </span>
                  <span className="ml-auto">{block.active ? "active" : "freed"}</span>
                </div>
                {block.active && (
                  <div className="mt-0.5 no-underline">
                    values: [{block.values.map((v) => formatExecutionValue(v)).join(", ")}]
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
