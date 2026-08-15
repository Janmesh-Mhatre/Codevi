import type { ExecutionValue } from "../models/executionTypes";

/** Formats one runtime value for display — shared by VariablePanel,
 * MemoryPanel, and StackPanel so a `char` reads as `'a'` (65)` etc.
 * consistently everywhere rather than three slightly different
 * implementations. */
export function formatExecutionValue(value: ExecutionValue): string {
  if (value.type === "char") {
    const code = value.value;
    const printable = code >= 32 && code <= 126;
    return printable ? `'${String.fromCharCode(code)}' (${code})` : `(${code})`;
  }
  if (value.type === "float" || value.type === "double") {
    return Number.isInteger(value.value) ? `${value.value}.0` : String(value.value);
  }
  return String(value.value);
}
