import { create } from "zustand";
import type { HeapBlock, StackFrame, VariableValue } from "../types";

interface MemoryState {
  stackFrames: StackFrame[];
  heapBlocks: HeapBlock[];
  globals: VariableValue[];
}

/**
 * Placeholder store — intentionally inert in Phase 1.
 *
 * Mirrors the Memory Layer's snapshot shape from the Phase 0 blueprint
 * (section 7 — Memory Design). The Memory Panel and Variable Panel read
 * from this store but, with all three arrays empty, currently just render
 * their "coming soon" state. Populated starting Phase 4.
 */
export const useMemoryStore = create<MemoryState>()(() => ({
  stackFrames: [],
  heapBlocks: [],
  globals: [],
}));
