import type { ExecutionValue } from "../models/executionTypes";
import { formatAddress } from "../../memory/memory";

/** Formats one runtime value for display — shared by VariablePanel,
 * MemoryPanel, and StackPanel so a `char` reads as `'a'` (65)` and a
 * pointer reads as an address or `NULL` consistently everywhere,
 * rather than several slightly different implementations. */
export function formatExecutionValue(value: ExecutionValue): string {
  if (value.kind === "pointer") {
    return value.target ? formatAddress(value.target) : "NULL";
  }
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
