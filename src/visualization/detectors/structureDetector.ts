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

  // Phase 6.2: Detect Linked Lists
  extractLinkedLists(step, structures);

  // 2. Detect Heap allocations (dynamically allocated arrays or objects)
  extractHeapStructures(step.heap, structures);

  // 3. Extract the full Pointer Graph (Stack-to-Stack, Stack-to-Heap, NULL pointers)
  extractPointerGraph(step, structures);

  // Phase 6.1: annotate array slots with active index tags and bounds cues
  if (activeFrame) {
    annotateActiveIndices(activeFrame, structures);
    annotateBoundsCues(structures);
  }

  // Phase 6.3: Detect array-backed Stacks & Queues (upgrades existing array items)
  if (activeFrame) {
    extractStacksAndQueues(step, activeFrame, structures);
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
    // Phase 6.2: skip struct Node blocks (slot 1 is a pointer) so they don't produce duplicate arrays
    const isLinkedListNode = block.slotCount >= 2 && block.values[1]?.kind === "pointer";
    if (isLinkedListNode) continue;

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
    let srcNode = nodes.find((n) => n.id === `stack:${rel.pointerName}`);
    let sourceSlotIndex = 0;

    if (!srcNode && rel.pointerAddress?.space === "heap") {
      const heapAddrStr = formatAddress({ space: "heap", id: rel.pointerAddress.id, slot: 0 });
      srcNode = nodes.find((n) => n.id === `heap:${heapAddrStr}`);
      sourceSlotIndex = rel.pointerAddress.slot;
    }
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
      routingStyle = srcNode.id.startsWith("heap:")
        ? (targetNodeId === srcNode.id ? "self-loop" : "outward-loop")
        : "bezier";
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
      sourceSlotIndex,
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

/**
 * Phase 6.2: Extracts linked list chains from heap blocks and stack pointers.
 * Detects struct Node allocations (where slot 1 is a next pointer), resolves
 * chain linkages, attaches active traversal pointer tags (e.g. curr ▾, head ➔),
 * and handles circular list termination gracefully.
 */
function extractLinkedLists(step: ExecutionStep, out: StructureItem[]): void {
  const activeFrame = step.callStack.find((f) => f.isActive) ?? step.callStack[step.callStack.length - 1];
  if (!activeFrame) return;

  // Find all candidate linked list nodes in heap:
  // A heap block with at least 2 slots where slot 1 is a pointer (or null pointer).
  const nodeMap = new Map<string, HeapBlock>();
  for (const block of step.heap) {
    if (!block.active) continue;
    if (block.slotCount >= 2 && block.values.length >= 2) {
      const slot1 = block.values[1];
      if (slot1 && slot1.kind === "pointer") {
        nodeMap.set(formatAddress(block.address), block);
      }
    }
  }

  if (nodeMap.size === 0) return;

  // Collect stack and global pointers that point to any of these nodes
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(activeFrame.parameters),
    ...Object.entries(activeFrame.locals),
    ...(step.globals ? Object.entries(step.globals) : []),
  ];

  // Map each node address to stack pointer names pointing to it (e.g. "head", "curr")
  const nodePointers = new Map<string, string[]>();
  for (const [varName, val] of allVars) {
    if (val.kind === "pointer" && val.target && val.target.space === "heap") {
      const targetStr = formatAddress({ space: "heap", id: val.target.id, slot: 0 });
      if (nodeMap.has(targetStr)) {
        const list = nodePointers.get(targetStr) ?? [];
        list.push(varName);
        nodePointers.set(targetStr, list);
      }
    }
  }

  // Determine the list heads.
  // In-degree: how many other nodes have `next` pointing to this node?
  const inDegree = new Map<string, number>();
  for (const key of nodeMap.keys()) {
    inDegree.set(key, 0);
  }
  for (const block of nodeMap.values()) {
    const nextVal = block.values[1];
    if (nextVal && nextVal.kind === "pointer" && nextVal.target && nextVal.target.space === "heap") {
      const nextKey = formatAddress({ space: "heap", id: nextVal.target.id, slot: 0 });
      if (inDegree.has(nextKey)) {
        inDegree.set(nextKey, (inDegree.get(nextKey) ?? 0) + 1);
      }
    }
  }

  // Candidate heads:
  // 1. Stack pointer named "head", "list", "first", "root"
  // 2. Nodes with in-degree === 0 that are pointed to by any stack pointer
  // 3. Any node pointed to by a stack pointer if all in-degree > 0 (cycle)
  const headCandidates: string[] = [];
  for (const [varName, val] of allVars) {
    if (val.kind === "pointer" && val.target && val.target.space === "heap") {
      const targetStr = formatAddress({ space: "heap", id: val.target.id, slot: 0 });
      if (nodeMap.has(targetStr)) {
        const lower = varName.toLowerCase();
        if (lower === "head" || lower === "list" || lower === "first" || lower === "root") {
          if (!headCandidates.includes(targetStr)) headCandidates.unshift(targetStr);
        }
      }
    }
  }

  for (const [nodeKey, deg] of inDegree.entries()) {
    if (deg === 0 && nodePointers.has(nodeKey) && !headCandidates.includes(nodeKey)) {
      headCandidates.push(nodeKey);
    }
  }

  // Fallback: if no stack pointer matches, any in-degree 0 node
  if (headCandidates.length === 0) {
    for (const [nodeKey, deg] of inDegree.entries()) {
      if (deg === 0 && !headCandidates.includes(nodeKey)) {
        headCandidates.push(nodeKey);
      }
    }
  }

  // If still none (e.g. single circular list), take the first node pointed to by stack
  if (headCandidates.length === 0 && nodePointers.size > 0) {
    headCandidates.push(nodePointers.keys().next().value!);
  }

  const visitedGlobal = new Set<string>();

  for (const headKey of headCandidates) {
    if (visitedGlobal.has(headKey)) continue;

    const chainNodes: StructureNode[] = [];
    const chainLinks: StructureLink[] = [];
    let currentKey: string | null = headKey;
    const visitedInChain = new Set<string>();
    let nodeIndex = 0;

    while (currentKey && nodeMap.has(currentKey)) {
      if (visitedInChain.has(currentKey)) {
        // Cycle detected: add link back to the cycle node and break
        const prevNode = chainNodes[chainNodes.length - 1];
        if (prevNode) {
          chainLinks.push({
            id: `ll:link:${prevNode.id}->${currentKey}`,
            sourceNodeId: prevNode.id,
            sourceSlotIndex: 1,
            targetNodeId: `ll:node:${currentKey}`,
            targetSlotIndex: 0,
            targetAddress: nodeMap.get(currentKey)!.address,
            label: "next (cycle)",
            status: "valid",
            routingStyle: "outward-loop",
          });
        }
        break;
      }

      visitedInChain.add(currentKey);
      visitedGlobal.add(currentKey);

      const block = nodeMap.get(currentKey)!;
      const dataVal = block.values[0] ?? { kind: "scalar", type: "int", value: 0 };
      const nextVal = block.values[1];

      // Active index tags for this node from stack pointers
      const ptrNames = nodePointers.get(currentKey) ?? [];
      const tags = ptrNames.map((p) => (p.toLowerCase() === "head" ? `${p} ➔` : `${p} ▾`));

      const nodeId = `ll:node:${currentKey}`;
      const slots: StructureSlot[] = [
        {
          index: 0,
          name: "data",
          value: dataVal,
          address: { space: "heap", id: block.address.id, slot: 0 },
          highlight: "none",
          activeIndexTags: tags.length > 0 ? tags : undefined,
        },
        {
          index: 1,
          name: "next",
          value: nextVal,
          address: { space: "heap", id: block.address.id, slot: 1 },
          highlight: "none",
        },
      ];

      chainNodes.push({
        id: nodeId,
        kind: "linked-list",
        label: `Node ${nodeIndex} (${currentKey})`,
        address: block.address,
        type: "struct Node",
        slots,
        highlight: block.active ? "none" : "target",
        metadata: {
          nodeIndex,
          heapAddress: currentKey,
          byteSize: block.byteSize,
        },
      });

      // Link to next
      if (nextVal && nextVal.kind === "pointer") {
        if (nextVal.target === null) {
          chainLinks.push({
            id: `ll:link:${nodeId}->null`,
            sourceNodeId: nodeId,
            sourceSlotIndex: 1,
            targetNodeId: null,
            targetSlotIndex: 0,
            targetAddress: null,
            label: "next",
            status: "null",
            routingStyle: "direct",
          });
          currentKey = null;
        } else if (nextVal.target.space === "heap") {
          const nextKey = formatAddress({ space: "heap", id: nextVal.target.id, slot: 0 });
          const targetNodeId = `ll:node:${nextKey}`;
          chainLinks.push({
            id: `ll:link:${nodeId}->${targetNodeId}`,
            sourceNodeId: nodeId,
            sourceSlotIndex: 1,
            targetNodeId,
            targetSlotIndex: 0,
            targetAddress: nextVal.target,
            label: "next",
            status: "valid",
            routingStyle: "direct",
          });
          currentKey = nextKey;
        } else {
          currentKey = null;
        }
      } else {
        currentKey = null;
      }

      nodeIndex++;
    }

    if (chainNodes.length > 0) {
      out.push({
        id: `linked-list:${headKey}`,
        kind: "linked-list",
        name: `Linked List (${headKey})`,
        nodes: chainNodes,
        links: chainLinks,
      });
    }
  }
}

/**
 * Phase 6.3: Detects array-backed stack and queue ADTs by examining naming conventions.
 *
 * Array-backed:
 *   - Stack: An array alongside an integer variable named `top`.
 *   - Queue: An array alongside integers named `front` and `rear` (or `head`/`tail`).
 *
 * This function mutates existing StructureItems in-place, upgrading their
 * `kind` from "array" → "stack"/"queue" and attaching topIndex/frontIndex/rearIndex metadata.
 */
function extractStacksAndQueues(
  step: ExecutionStep,
  activeFrame: StackFrame,
  structures: StructureItem[],
): void {
  // Collect all scalar integer variables as potential index candidates
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(activeFrame.parameters),
    ...Object.entries(activeFrame.locals),
    ...(step.globals ? Object.entries(step.globals) : []),
  ];

  const intVars = new Map<string, number>();
  for (const [name, val] of allVars) {
    if (val.kind === "scalar" && (val.type === "int" || val.type === "char")) {
      intVars.set(name.toLowerCase(), val.value);
    }
  }

  // --- Array-backed stack/queue detection ---
  const topVal = intVars.get("top");
  const frontVal = intVars.get("front") ?? intVars.get("head");
  const rearVal = intVars.get("rear") ?? intVars.get("tail");

  // Find which key was actually used for front/rear (for display labels)
  const frontKey = intVars.has("front") ? "front" : intVars.has("head") ? "head" : null;
  const rearKey = intVars.has("rear") ? "rear" : intVars.has("tail") ? "tail" : null;

  if (topVal !== undefined || (frontVal !== undefined && rearVal !== undefined)) {
    for (const struct of structures) {
      if (struct.kind !== "array") continue;
      // Only promote stack-local arrays (not heap arrays)
      if (!struct.id.startsWith("array:")) continue;

      const node = struct.nodes[0];
      if (!node || node.kind !== "array" || node.slots.length === 0) continue;

      const arrayLen = node.slots.length;

      // Stack: if `top` variable exists, and no front+rear, promote to stack
      if (topVal !== undefined && (frontVal === undefined || rearVal === undefined)) {
        struct.kind = "stack";
        struct.name = `Stack: ${node.label}`;
        node.kind = "stack";

        // Annotate the top slot
        if (!node.metadata) node.metadata = {};
        node.metadata.topIndex = topVal;
        node.metadata.adtKind = "stack";

        // Tag the slot at top with "top ▾"
        if (topVal >= 0 && topVal < arrayLen) {
          const slot = node.slots[topVal];
          if (slot) {
            if (!slot.activeIndexTags) slot.activeIndexTags = [];
            if (!slot.activeIndexTags.includes("top ▾")) {
              slot.activeIndexTags.push("top ▾");
            }
          }
        }
      }

      // Queue: if `front` and `rear` exist, promote to queue
      if (frontVal !== undefined && rearVal !== undefined) {
        struct.kind = "queue";
        struct.name = `Queue: ${node.label}`;
        node.kind = "queue";

        if (!node.metadata) node.metadata = {};
        node.metadata.frontIndex = frontVal;
        node.metadata.rearIndex = rearVal;
        node.metadata.frontKey = frontKey;
        node.metadata.rearKey = rearKey;
        node.metadata.adtKind = "queue";

        // Tag front slot
        if (frontVal >= 0 && frontVal < arrayLen) {
          const fSlot = node.slots[frontVal];
          if (fSlot) {
            if (!fSlot.activeIndexTags) fSlot.activeIndexTags = [];
            const fTag = `${frontKey ?? "front"} ▾`;
            if (!fSlot.activeIndexTags.includes(fTag)) {
              fSlot.activeIndexTags.push(fTag);
            }
          }
        }

        // Tag rear slot
        if (rearVal >= 0 && rearVal < arrayLen) {
          const rSlot = node.slots[rearVal];
          if (rSlot) {
            if (!rSlot.activeIndexTags) rSlot.activeIndexTags = [];
            const rTag = `${rearKey ?? "rear"} ▾`;
            if (!rSlot.activeIndexTags.includes(rTag)) {
              rSlot.activeIndexTags.push(rTag);
            }
          }
        }
      }
    }
  }
}
