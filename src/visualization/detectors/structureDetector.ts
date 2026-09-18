import type { ExecutionStep, ExecutionValue, HeapBlock, StackFrame } from "../../execution/models/executionTypes";
import { formatAddress } from "../../memory/memory";
import type {
  StructureGraph,
  StructureItem,
  StructureNode,
  StructureSlot,
  StructureLink,
} from "../models/structureTypes";

/**
 * Extracts all active data structures (arrays, heap blocks, pointer networks)
 * from the runtime memory state of an execution step.
 */
export function extractStructureGraph(step: ExecutionStep | null): StructureGraph {
  if (!step) {
    return { structures: [], changes: [] };
  }

  const structures: StructureItem[] = [];

  // 1. Detect Arrays (both in stack frames and multi-slot heap blocks)
  const activeFrame = step.callStack.find((f) => f.isActive) ?? step.callStack[step.callStack.length - 1];
  if (activeFrame) {
    extractStackArrays(activeFrame, structures);
  }

  // 2. Detect Heap allocations (dynamically allocated arrays or objects)
  extractHeapStructures(step.heap, structures);

  // 3. Extract the full Pointer Graph (Stack-to-Stack, Stack-to-Heap, NULL pointers)
  extractPointerGraph(step, structures);

  // Phase 6.1: annotate array slots with active index tags and bounds cues
  if (activeFrame) {
    annotateActiveIndices(activeFrame, structures);
    annotateBoundsCues(structures);
  }

  return {
    structures,
    changes: [], // populated by structureDiff
  };
}

/**
 * Extracts stack-allocated array variables into dedicated array structure items.
 */
function extractStackArrays(frame: StackFrame, out: StructureItem[]): void {
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(frame.parameters),
    ...Object.entries(frame.locals),
  ];

  for (const [varName, val] of allVars) {
    if (val.kind === "array") {
      const baseAddr = val.address ?? frame.addresses[varName] ?? { space: "stack", id: 0, slot: 0 };
      const is2D = val.dimensions && val.dimensions.length === 2;
      const rows = is2D ? val.dimensions![0] : 1;
      const cols = is2D ? val.dimensions![1] : val.length;

      const slots: StructureSlot[] = val.values.map((elem, i) => {
        let slotName = `[${i}]`;
        if (is2D) {
          const r = Math.floor(i / cols);
          const c = i % cols;
          slotName = `[${r}][${c}]`;
        }
        return {
          index: i,
          name: slotName,
          value: elem,
          address: { space: baseAddr.space, id: baseAddr.id, slot: i },
          highlight: "none",
        };
      });

      const node: StructureNode = {
        id: `stack:arr:${varName}`,
        kind: "array",
        label: varName,
        address: baseAddr,
        type: val.type,
        slots,
        highlight: "none",
        metadata: {
          scope: frame.functionName,
          length: val.length,
          dimensions: val.dimensions,
          rows: is2D ? rows : undefined,
          cols: is2D ? cols : undefined,
        },
      };

      out.push({
        id: `array:${varName}`,
        kind: "array",
        name: `Array: ${varName}`,
        nodes: [node],
        links: [],
      });
    }
  }
}

/**
 * Extracts heap blocks. Multi-slot blocks (e.g. calloc or malloc(sizeof(int)*N))
 * are also represented as array structures.
 */
function extractHeapStructures(heap: HeapBlock[], out: StructureItem[]): void {
  for (const block of heap) {
    const addrStr = formatAddress(block.address);
    const slots: StructureSlot[] = [];

    const slotTotal = Math.max(block.slotCount, block.values.length);
    for (let i = 0; i < slotTotal; i++) {
      const slotVal = block.values[i] ?? { kind: "scalar", type: "int", value: 0 };
      slots.push({
        index: i,
        name: `[${i}]`,
        value: slotVal,
        address: { space: "heap", id: block.address.id, slot: i },
        highlight: "none",
      });
    }

    if (block.slotCount > 1) {
      const node: StructureNode = {
        id: `heap:block:${addrStr}`,
        kind: "array",
        label: `Heap Block ${addrStr}`,
        address: block.address,
        type: `${slots[0]?.value.type ?? "int"}[${block.slotCount}]`,
        slots,
        highlight: block.active ? "none" : "target",
        metadata: {
          origin: block.origin,
          byteSize: block.byteSize,
          active: block.active,
        },
      };

      out.push({
        id: `heap-array:${addrStr}`,
        kind: "array",
        name: `Dynamic Array ${addrStr} (${block.origin})`,
        nodes: [node],
        links: [],
      });
    }
  }
}

/**
 * Extracts the complete Pointer Graph including stack variables, heap targets,
 * and directional pointer relationships with status and routing style.
 */
function extractPointerGraph(step: ExecutionStep, out: StructureItem[]): void {
  const pv = step.pointerView;
  if (!pv) return;

  const nodes: StructureNode[] = [];
  const links: StructureLink[] = [];

  // 1. Stack nodes
  for (const v of pv.stackVariables) {
    const val = v.value;
    const isArr = v.isArray && val.kind === "array";
    const slots: StructureSlot[] =
      val.kind === "array" && v.isArray
        ? val.values.map((elem, i) => ({
            index: i,
            name: `[${i}]`,
            value: elem,
            address: { space: v.address.space, id: v.address.id, slot: i },
            highlight: "none",
          }))
        : [
            {
              index: 0,
              name: v.name,
              value: v.value,
              address: v.address,
              highlight: "none",
            },
          ];

    nodes.push({
      id: `stack:${v.name}`,
      kind: isArr ? "array" : "pointer-graph",
      label: v.name,
      address: v.address,
      type: v.value.type,
      slots,
      highlight: "none",
    });
  }

  // 2. Heap nodes
  for (const b of pv.heapBlocks) {
    const addrStr = formatAddress(b.address);
    const slots: StructureSlot[] = b.values.map((elem, i) => ({
      index: i,
      name: `[${i}]`,
      value: elem,
      address: { space: "heap", id: b.address.id, slot: i },
      highlight: "none",
    }));

    nodes.push({
      id: `heap:${addrStr}`,
      kind: "pointer-graph",
      label: addrStr,
      address: b.address,
      type: b.origin,
      slots,
      highlight: b.active ? "none" : "target",
      metadata: {
        active: b.active,
        byteSize: b.byteSize,
      },
    });
  }

  // 3. Links from pointer relationships
  for (let i = 0; i < pv.relationships.length; i++) {
    const rel = pv.relationships[i];
    const srcNode = nodes.find((n) => n.id === `stack:${rel.pointerName}`);
    if (!srcNode) continue;

    let targetNodeId: string | null = null;
    let targetSlot = 0;
    let routingStyle: "bezier" | "outward-loop" | "self-loop" | "direct" = "bezier";

    if (rel.status === "null") {
      targetNodeId = null;
      routingStyle = "bezier";
    } else if (rel.targetRegion === "heap" && rel.targetAddress) {
      targetNodeId = `heap:${formatAddress({ space: "heap", id: rel.targetAddress.id, slot: 0 })}`;
      targetSlot = rel.targetAddress.slot;
      routingStyle = "bezier";
    } else if (rel.targetAddress) {
      // Stack target
      const targetNode = nodes.find(
        (n) => n.address.space === rel.targetAddress!.space && n.address.id === rel.targetAddress!.id
      );
      if (targetNode) {
        targetNodeId = targetNode.id;
        targetSlot = rel.targetAddress.slot;
        if (targetNode.id === srcNode.id) {
          routingStyle = "self-loop";
        } else {
          routingStyle = "outward-loop";
        }
      }
    }

    links.push({
      id: `link:${rel.pointerName}->${targetNodeId ?? "NULL"}`,
      sourceNodeId: srcNode.id,
      sourceSlotIndex: 0,
      targetNodeId,
      targetSlotIndex: targetSlot,
      targetAddress: rel.targetAddress,
      label: rel.pointerName,
      status: rel.status,
      routingStyle,
    });
  }

  out.push({
    id: "pointer-graph",
    kind: "pointer-graph",
    name: "Pointer Graph",
    nodes,
    links,
  });
}

/** Phase 6.1: scans all integer/scalar variables in the active frame
 * for values that match valid indices of any array structure, then
 * annotates the corresponding slot with a tag like "i ▾" or "p ➔". */
function annotateActiveIndices(frame: StackFrame, structures: StructureItem[]): void {
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(frame.parameters),
    ...Object.entries(frame.locals),
  ];

  // Collect all scalar integer variables as potential index candidates
  const candidates: { name: string; value: number; isPointer: boolean }[] = [];
  for (const [name, val] of allVars) {
    if (val.kind === "scalar" && (val.type === "int" || val.type === "char")) {
      candidates.push({ name, value: val.value, isPointer: false });
    }
  }

  // For each array structure, check if any candidate maps to a valid index
  for (const struct of structures) {
    if (struct.kind !== "array") continue;
    for (const node of struct.nodes) {
      if (node.kind !== "array" || node.slots.length === 0) continue;
      const arrayLen = node.slots.length;
      const is2D = typeof node.metadata?.rows === "number" && typeof node.metadata?.cols === "number";
      const rows = is2D ? (node.metadata!.rows as number) : 1;
      const cols = is2D ? (node.metadata!.cols as number) : arrayLen;

      if (is2D && candidates.length >= 2) {
        for (let ri = 0; ri < candidates.length; ri++) {
          for (let ci = 0; ci < candidates.length; ci++) {
            if (ri === ci) continue;
            const rCand = candidates[ri];
            const cCand = candidates[ci];
            if (rCand.value >= 0 && rCand.value < rows && cCand.value >= 0 && cCand.value < cols) {
              const slotIdx = rCand.value * cols + cCand.value;
              const slot = node.slots[slotIdx];
              if (slot) {
                if (!slot.activeIndexTags) slot.activeIndexTags = [];
                const tag = `${rCand.name},${cCand.name} ▾`;
                if (!slot.activeIndexTags.includes(tag)) {
                  slot.activeIndexTags.push(tag);
                }
              }
            }
          }
        }
      } else {
        for (const cand of candidates) {
          const idx = cand.value;
          if (idx >= 0 && idx < arrayLen) {
            const slot = node.slots[idx];
            if (!slot.activeIndexTags) slot.activeIndexTags = [];
            const tag = cand.isPointer ? `${cand.name} ➔` : `${cand.name} ▾`;
            if (!slot.activeIndexTags.includes(tag)) {
              slot.activeIndexTags.push(tag);
            }
          }
        }
      }
    }
  }
}

/** Phase 6.1: marks first and last slots of array nodes with boundary
 * cues for the SVG renderer. */
function annotateBoundsCues(structures: StructureItem[]): void {
  for (const struct of structures) {
    if (struct.kind !== "array") continue;
    for (const node of struct.nodes) {
      if (node.kind !== "array" || node.slots.length === 0) continue;
      node.slots[0].boundsCue = "start";
      node.slots[node.slots.length - 1].boundsCue = "end";
    }
  }
}
