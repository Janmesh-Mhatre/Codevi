import { MemoryStick } from "lucide-react";
import { ComingSoon, PanelShell } from "../common/PanelShell";

/** Raw, address-level view of stack/heap/global memory. Reads from
 * useMemoryStore starting in Phase 4. */
export function MemoryPanel() {
  return (
    <PanelShell title="Memory" icon={MemoryStick}>
      <ComingSoon>Raw memory view coming soon</ComingSoon>
    </PanelShell>
  );
}
