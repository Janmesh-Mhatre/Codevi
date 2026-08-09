import { create } from "zustand";
import { ExecutionEngine } from "../execution/engine/ExecutionEngine";
import { INITIAL_EXECUTION_STATE, type ExecutionState } from "../execution/models/executionTypes";

/**
 * Live as of Phase 3 — was an inert placeholder through Phase 2. The
 * store itself holds no logic; it's a thin Zustand mirror of
 * ExecutionEngine's state (see src/execution/engine/ExecutionEngine.ts),
 * kept in sync via engine.subscribe(). Components call the exported
 * action functions below rather than the engine directly, so nothing in
 * src/components ever imports ExecutionEngine itself.
 */
export const executionEngine = new ExecutionEngine();

export const useExecutionStore = create<ExecutionState>()(() => INITIAL_EXECUTION_STATE);

executionEngine.subscribe((state) => {
  useExecutionStore.setState(state);
});

export function runExecution(): void {
  executionEngine.run();
}
export function pauseExecution(): void {
  executionEngine.pause();
}
export function stepExecution(): void {
  executionEngine.step();
}
export function resetExecution(): void {
  executionEngine.reset();
}
