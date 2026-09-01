import { defineConfig } from "vitest/config";

/**
 * Test-only configuration. Standalone rather than merged with
 * vite.config.ts (that one's exported as an async factory function,
 * which Vitest/Vite's mergeConfig can't combine with directly, and
 * nothing under tests/ currently needs its plugins or the `@/` alias
 * anyway — every test file imports via relative paths).
 *
 * `fileParallelism: false` runs test files one at a time rather than
 * several forked processes in parallel. Kept as a conservative default
 * for a suite this WASM-heavy (many files drive web-tree-sitter through
 * many sequential parse/interpret cycles) — a real, now-fixed bug in
 * this codebase (not Vitest) previously made failures here manifest as
 * a confusing `RangeError: Maximum call stack size exceeded` deep
 * inside Node's IPC serialization rather than a normal test failure;
 * see docs/PHASE_5_POINTERS.md -> "A test-infrastructure crash, not an
 * application bug" for the full diagnosis and the actual root cause
 * (InterpreterError was holding a live WASM node reference, which a
 * pretty-printer choked on while formatting a failing assertion's
 * diff — fixed by never letting a WASM reference leave the interpreter
 * layer, the same rule every other exported type in this project
 * already followed).
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
