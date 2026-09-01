import { useEffect, useRef, useState } from "react";
import type { ExecutionValue } from "../models/executionTypes";

const HIGHLIGHT_DURATION_MS = 700;

/** Value equality that understands both value shapes — two pointers are
 * "the same" when they target the same address (or are both NULL), not
 * by object identity. */
function valuesEqual(a: ExecutionValue, b: ExecutionValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "pointer" && b.kind === "pointer") {
    if (a.target === null || b.target === null) return a.target === b.target;
    return a.target.space === b.target.space && a.target.id === b.target.id && a.target.slot === b.target.slot;
  }
  return a.type === b.type && (a as { value: number }).value === (b as { value: number }).value;
}

/**
 * Returns the set of variable names whose value differs from the
 * previous time this hook saw `values` change, for a brief window —
 * the "subtle visual indication" the Phase 4 brief asks for on
 * variable change. Compares by value+type (or by pointer target), not
 * by reference, since a new ExecutionStep object is created every step
 * even when a particular variable didn't change.
 */
export function useChangedKeys(values: Record<string, ExecutionValue>): Set<string> {
  const previousRef = useRef<Record<string, ExecutionValue>>({});
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const previous = previousRef.current;
    const next = new Set<string>();
    for (const [name, value] of Object.entries(values)) {
      const prior = previous[name];
      if (!prior || !valuesEqual(prior, value)) {
        next.add(name);
      }
    }
    previousRef.current = values;
    // Skip the very first population (everything would show as "changed"
    // just because there was nothing before it).
    if (Object.keys(previous).length > 0) {
      setChanged(next);
      const timer = window.setTimeout(() => setChanged(new Set()), HIGHLIGHT_DURATION_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [values]);

  return changed;
}
