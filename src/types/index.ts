/**
 * Shared types for Codevi.
 *
 * Phase 1 only needs a handful of these. The rest are typed now, ahead of
 * time, so the stores and components that will fill them in during later
 * phases (see README.md → "Future extension points") have a stable shape
 * to code against instead of a `bump the type later` situation.
 */

/** The language currently loaded in the editor. Only "c" is wired up; the
 * rest exist so `src/languages/*` adapters have a type to target (see
 * Phase 0 blueprint, section 11 — Scalability and Multi-Language Support). */
export type SupportedLanguage = "c" | "cpp" | "java" | "python" | "javascript";

export type ThemeMode = "light" | "dark";

/** High-level program state, driven for real starting Phase 3 (see
 * src/execution/). "preparing" covers validating the AST and setting up
 * the interpreter between clicking Run and the first step actually
 * executing. */
export type ExecutionStatus = "idle" | "preparing" | "running" | "paused" | "completed" | "error";

/** A single stack frame. Populated starting in Phase 4/6. */
export interface StackFrame {
  id: string;
  functionName: string;
  line: number;
  locals: VariableValue[];
}

/** A single heap allocation. Populated starting in Phase 4/7. */
export interface HeapBlock {
  id: string;
  address: string;
  size: number;
  freed: boolean;
}

/** A named variable and its current value. Populated starting in Phase 5. */
export interface VariableValue {
  name: string;
  type: string;
  value: string;
  address?: string;
  isPointer?: boolean;
  pointsTo?: string | null;
}

/** One line of narration from the Explanation Layer. Populated starting in
 * Phase 10. */
export interface ExplanationEntry {
  id: string;
  line: number;
  text: string;
  timestamp: number;
}
