import { Braces } from "lucide-react";
import { ComingSoon, PanelShell } from "../common/PanelShell";

/** Named, live variable values (the beginner-friendly counterpart to the
 * Memory Panel's raw addresses). Reads from useMemoryStore starting in
 * Phase 5. */
export function VariablePanel() {
  return (
    <PanelShell title="Variables" icon={Braces}>
      <ComingSoon>Variable tracking coming soon</ComingSoon>
    </PanelShell>
  );
}
