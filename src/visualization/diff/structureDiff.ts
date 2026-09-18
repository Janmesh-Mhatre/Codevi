import type { ExecutionStep, ExecutionValue, HeapBlock, StepMemoryAccess } from "../../execution/models/executionTypes";
import { formatAddress, addressesEqual } from "../../memory/memory";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import type {
  StructuralChange,
  StructureGraph,
} from "../models/structureTypes";

/**
 * Phase 6.1: event-driven structural diff.
 *
 * Compares two execution steps to detect structural mutations:
 * allocations, frees, array slot writes/reads/swaps, pointer redirections,
 * and variable declarations. Also applies real-time highlight flags
 * to affected nodes/slots in currGraph.
 *
 * The primary source of truth for read/write detection is now
 * `currStep.stepAccesses` — per-step memory events captured directly
 * by the interpreter — rather than fragile heuristics based on AST
 * node types or description strings.
 */
export function diffExecutionSteps(
  prevStep: ExecutionStep | null,
  currStep: ExecutionStep | null,
  currGraph: StructureGraph,
): StructuralChange[] {
  if (!currStep) return [];
  const changes: StructuralChange[] = [];

  // 1. Detect heap allocations and deallocations
  detectHeapChanges(prevStep?.heap ?? [], currStep.heap, changes);

  // 2. Detect pointer relationship mutations
  detectPointerChanges(prevStep, currStep, changes);

  // 3. Detect new array/variable declarations
  detectDeclarations(prevStep, currStep, changes);

  // 4. Event-driven read/write/swap detection via stepAccesses
  detectAccessEvents(prevStep, currStep, changes);

  // Apply visual highlights to the active graph based on detected changes
  applyHighlightsToGraph(currGraph, changes);

  currGraph.changes = changes;
  return changes;
}

function detectHeapChanges(
  prevHeap: HeapBlock[],
  currHeap: HeapBlock[],
  out: StructuralChange[],
): void {
  for (const currBlock of currHeap) {
    const prevBlock = prevHeap.find((b) => addressesEqual(b.address, currBlock.address));
    const addrStr = formatAddress(currBlock.address);

    if (!prevBlock) {
      out.push({
        type: "allocate",
        targetNodeId: `heap:${addrStr}`,
        description: `Allocated heap block @${addrStr} (${currBlock.byteSize} bytes via ${currBlock.origin})`,
      });
    } else if (prevBlock.active && !currBlock.active) {
      out.push({
        type: "deallocate",
        targetNodeId: `heap:${addrStr}`,
        description: `Freed heap block @${addrStr}`,
      });
    }
  }
}

function detectPointerChanges(
  prevStep: ExecutionStep | null,
  currStep: ExecutionStep,
  out: StructuralChange[],
): void {
  const prevRels = prevStep?.pointerView?.relationships ?? [];
  const currRels = currStep.pointerView?.relationships ?? [];

  for (const currRel of currRels) {
    const prevRel = prevRels.find((r) => r.pointerName === currRel.pointerName);
    const hasChanged =
      !prevRel ||
      !addressesEqual(prevRel.targetAddress, currRel.targetAddress) ||
      prevRel.status !== currRel.status;

    if (hasChanged) {
      if (currRel.status === "null") {
        out.push({
          type: "unlink",
          targetNodeId: `stack:${currRel.pointerName}`,
          description: `Pointer '${currRel.pointerName}' reset to NULL`,
        });
      } else if (currRel.targetAddress) {
        const targetStr = currRel.targetName
          ? `'${currRel.targetName}' (@${formatAddress(currRel.targetAddress)})`
          : `@${formatAddress(currRel.targetAddress)}`;
        out.push({
          type: "link",
          targetNodeId: `stack:${currRel.pointerName}`,
          description: `Pointer '${currRel.pointerName}' redirected to ${targetStr}`,
        });
      }
    }
  }
}

/** Phase 6.1: detect newly declared arrays and variables by comparing
 * the current frame's variable set against the previous step's. */
function detectDeclarations(
  prevStep: ExecutionStep | null,
  currStep: ExecutionStep,
  out: StructuralChange[],
): void {
  const currFrame = currStep.callStack[currStep.callStack.length - 1];
  if (!currFrame) return;

  const prevFrame = prevStep?.callStack[prevStep.callStack.length - 1];
  const prevVarNames = new Set<string>();
  if (prevFrame) {
    for (const key of Object.keys(prevFrame.parameters)) prevVarNames.add(key);
    for (const key of Object.keys(prevFrame.locals)) prevVarNames.add(key);
  }

  const currVars: [string, ExecutionValue][] = [
    ...Object.entries(currFrame.parameters),
    ...Object.entries(currFrame.locals),
  ];

  for (const [varName, val] of currVars) {
    if (!prevVarNames.has(varName)) {
      if (val.kind === "array") {
        out.push({
          type: "declare",
          targetNodeId: `stack:arr:${varName}`,
          description: `Declared array '${varName}' with ${val.length} elements`,
        });
      } else {
        out.push({
          type: "declare",
          targetNodeId: `stack:${varName}`,
          description: `Declared variable '${varName}'`,
        });
      }
    }
  }
}

/** Phase 6.1: uses `currStep.stepAccesses` to detect which array slots
 * and variables were read/written. Also detects swap patterns (two
 * writes to distinct slots of the same array within one step). */
function detectAccessEvents(
  prevStep: ExecutionStep | null,
  currStep: ExecutionStep,
  out: StructuralChange[],
): void {
  const accesses = currStep.stepAccesses ?? [];
  if (accesses.length === 0) {
    // Fallback: detect writes by value comparison (pre-6.1 behavior)
    detectArraySlotWritesFallback(prevStep, currStep, out);
    return;
  }

  // Collect writes by array address (id) to detect swaps
  const writesByArrayId = new Map<string, { slotIndex: number; varName: string }[]>();

  // Resolve each access to a structure node and slot
  for (const access of accesses) {
    const resolved = resolveAccessToNodeId(access, currStep);
    if (!resolved) continue;

    if (access.kind === "write") {
      out.push({
        type: "write",
        targetNodeId: resolved.nodeId,
        slotIndex: resolved.slotIndex,
        description: `Written ${resolved.label}`,
      });
      // Track for swap detection
      const arrayKey = `${access.address.space}:${access.address.id}`;
      if (!writesByArrayId.has(arrayKey)) writesByArrayId.set(arrayKey, []);
      writesByArrayId.get(arrayKey)!.push({ slotIndex: resolved.slotIndex, varName: resolved.varName });
    } else if (access.kind === "read") {
      out.push({
        type: "read",
        targetNodeId: resolved.nodeId,
        slotIndex: resolved.slotIndex,
        description: `Read ${resolved.label}`,
      });
    }
  }

  // Detect swaps: two distinct slot writes to the same array in one step
  for (const [, writes] of writesByArrayId) {
    if (writes.length >= 2) {
      const distinctSlots = new Set(writes.map((w) => w.slotIndex));
      if (distinctSlots.size >= 2) {
        const slots = Array.from(distinctSlots).sort((a, b) => a - b);
        const varName = writes[0].varName;
        out.push({
          type: "swap",
          targetNodeId: `stack:arr:${varName}`,
          description: `Swapped ${varName}[${slots[0]}] ↔ ${varName}[${slots[1]}]`,
        });
      }
    }
  }
}

/** Resolves a StepMemoryAccess into a node ID and slot index within
 * the structure graph. Returns null if the access doesn't correspond
 * to any known structure. */
function resolveAccessToNodeId(
  access: StepMemoryAccess,
  step: ExecutionStep,
): { nodeId: string; slotIndex: number; label: string; varName: string } | null {
  const addr = access.address;

  // Check stack arrays and variables
  const frame = step.callStack[step.callStack.length - 1];
  if (frame && addr.space === "stack") {
    const allVars: [string, ExecutionValue][] = [
      ...Object.entries(frame.parameters),
      ...Object.entries(frame.locals),
    ];
    for (const [varName, val] of allVars) {
      if (val.kind === "array" && val.address) {
        if (val.address.id === addr.id) {
          return {
            nodeId: `stack:arr:${varName}`,
            slotIndex: addr.slot,
            label: `${varName}[${addr.slot}]`,
            varName,
          };
        }
      } else {
        // Scalar stack variable — check addresses
        const varAddr = frame.addresses[varName];
        if (varAddr && varAddr.id === addr.id && varAddr.space === "stack") {
          return {
            nodeId: `stack:${varName}`,
            slotIndex: 0,
            label: `'${varName}'`,
            varName,
          };
        }
      }
    }
  }

  // Check heap blocks
  if (addr.space === "heap") {
    for (const block of step.heap) {
      if (block.address.id === addr.id) {
        const baseAddr = formatAddress({ space: "heap", id: addr.id, slot: 0 });
        return {
          nodeId: `heap:block:${baseAddr}`,
          slotIndex: addr.slot,
          label: `heap[${addr.slot}]`,
          varName: baseAddr,
        };
      }
    }
  }

  return null;
}

/** Fallback: detect writes by comparing array element values between
 * previous and current steps. Used only when stepAccesses is empty
 * (backwards compatibility). */
function detectArraySlotWritesFallback(
  prevStep: ExecutionStep | null,
  currStep: ExecutionStep,
  out: StructuralChange[],
): void {
  if (!prevStep) return;

  const prevFrame = prevStep.callStack[prevStep.callStack.length - 1];
  const currFrame = currStep.callStack[currStep.callStack.length - 1];
  if (!prevFrame || !currFrame) return;

  const currVars: [string, ExecutionValue][] = [
    ...Object.entries(currFrame.parameters),
    ...Object.entries(currFrame.locals),
  ];

  for (const [varName, currVal] of currVars) {
    const prevVal = currFrame.parameters[varName] !== undefined
      ? prevFrame.parameters[varName]
      : prevFrame.locals[varName];

    if (currVal.kind === "array" && prevVal?.kind === "array") {
      for (let i = 0; i < currVal.values.length; i++) {
        const cElem = currVal.values[i];
        const pElem = prevVal.values[i];
        if (pElem && formatExecutionValue(cElem) !== formatExecutionValue(pElem)) {
          out.push({
            type: "write",
            targetNodeId: `stack:arr:${varName}`,
            slotIndex: i,
            description: `Written ${varName}[${i}] = ${formatExecutionValue(cElem)} (was ${formatExecutionValue(pElem)})`,
          });
        }
      }
    } else if (currVal.kind === "scalar" && prevVal?.kind === "scalar") {
      if (currVal.value !== prevVal.value) {
        out.push({
          type: "write",
          targetNodeId: `stack:${varName}`,
          slotIndex: 0,
          description: `Updated variable '${varName}' = ${currVal.value}`,
        });
      }
    }
  }
}

/**
 * Annotates nodes and slots in the active graph with highlight flags.
 */
function applyHighlightsToGraph(
  graph: StructureGraph,
  changes: StructuralChange[],
): void {
  for (const change of changes) {
    for (const struct of graph.structures) {
      for (const node of struct.nodes) {
        if (node.id === change.targetNodeId) {
          if (change.type === "write") {
            node.highlight = "write";
            if (change.slotIndex !== undefined && node.slots[change.slotIndex]) {
              node.slots[change.slotIndex].highlight = "write";
            }
          } else if (change.type === "read") {
            node.highlight = "read";
            if (change.slotIndex !== undefined && node.slots[change.slotIndex]) {
              node.slots[change.slotIndex].highlight = "read";
            }
          } else if (change.type === "swap") {
            node.highlight = "active";
            // Highlight both swapped slots
            for (const slot of node.slots) {
              if (changes.some((c) =>
                c.type === "write" &&
                c.targetNodeId === node.id &&
                c.slotIndex === slot.index,
              )) {
                slot.highlight = "write";
              }
            }
          } else if (change.type === "declare") {
            node.highlight = "active";
          } else if (change.type === "link" || change.type === "allocate") {
            node.highlight = "active";
          }
        }
      }
    }
  }
}
