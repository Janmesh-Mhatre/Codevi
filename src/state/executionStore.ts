import { create } from "zustand";
import type { ExecutionStatus } from "../types";

interface ExecutionState {
  status: ExecutionStatus;
  currentLine: number | null;
}

/**
 * Placeholder store — intentionally inert in Phase 1.
 *
 * Nothing in this phase writes to this store; the Toolbar's Run / Pause /
 * Step / Reset buttons show a "not implemented" toast instead of touching
 * it. It exists now so the Execution Engine (Phase 3) has a destination to
 * write to and the Toolbar/Console/panels already know how to read it.
 */
export const useExecutionStore = create<ExecutionState>()(() => ({
  status: "idle",
  currentLine: null,
}));
