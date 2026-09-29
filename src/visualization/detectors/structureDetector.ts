import type { ExecutionStep, ExecutionValue, HeapBlock, StackFrame } from "../../execution/models/executionTypes";
import { formatAddress, type Address } from "../../memory/memory";
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
  const activeFrame = step.callStack.find((f) => f.isActive) ?? step.callStack[step.callStack.length - 1];

  // 1. Detect Arrays (both in globals, stack frames, and multi-slot heap blocks)
  if (step.globals) {
    extractGlobalArrays(step.globals, step.globalAddresses, structures);
  }
  for (const frame of step.callStack) {
    extractStackArrays(frame, structures);
  }

  // Phase 6.2: Detect Linked Lists
  extractLinkedLists(step, structures);

  // 2. Detect Heap allocations (dynamically allocated arrays or objects)
  extractHeapStructures(step.heap, structures);

  // 3. Extract the full Pointer Graph (Stack-to-Stack, Stack-to-Heap, NULL pointers)
  extractPointerGraph(step, structures);

  // Phase 6.1: annotate array slots with active index tags and bounds cues
  annotateActiveIndices(step, structures);
  annotateBoundsCues(structures);

  // Phase 6.3: Detect array-backed and struct-backed Stacks & Queues regardless of declaration scope
  extractStacksAndQueues(step, structures);

  // Phase 6.4: Detect Binary Trees, BSTs, and array-backed Binary Heaps
  extractTrees(step, structures);
  if (activeFrame) {
    extractBinaryHeaps(step, activeFrame, structures);
  }

  return {
    structures,
    changes: [], // populated by structureDiff
  };
}

/**
 * Extracts global array variables into dedicated array structure items.
 */
function extractGlobalArrays(
  globals: Record<string, ExecutionValue>,
  globalAddresses: Record<string, Address> | undefined,
  out: StructureItem[],
): void {
  for (const [varName, val] of Object.entries(globals)) {
    if (val.kind === "array") {
      if (out.some((s) => s.id === `array:${varName}`)) continue;
      const baseAddr = val.address ?? globalAddresses?.[varName] ?? { space: "stack", id: 0, slot: 0 };
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
        id: `global:arr:${varName}`,
        kind: "array",
        label: varName,
        address: baseAddr,
        type: val.type,
        slots,
        highlight: "none",
        metadata: {
          scope: "global",
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
 * Extracts stack-allocated array variables into dedicated array structure items.
 */
function extractStackArrays(frame: StackFrame, out: StructureItem[]): void {
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(frame.parameters),
    ...Object.entries(frame.locals),
  ];

  for (const [varName, val] of allVars) {
    if (val.kind === "array") {
      if (out.some((s) => s.id === `array:${varName}`)) continue;
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
    // Phase 6.4: also skip tree nodes (slot 1 AND slot 2 are pointers)
    const isLinkedListNode = block.slotCount >= 2 && block.values[1]?.kind === "pointer";
    const isTreeNode = block.slotCount >= 3 && block.values[1]?.kind === "pointer" && block.values[2]?.kind === "pointer";
    if (isLinkedListNode || isTreeNode) continue;

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
function annotateActiveIndices(step: ExecutionStep, structures: StructureItem[]): void {
  const allVars: [string, ExecutionValue][] = [
    ...(step.globals ? Object.entries(step.globals) : []),
  ];
  for (const frame of step.callStack) {
    allVars.push(...Object.entries(frame.parameters), ...Object.entries(frame.locals));
  }

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
  // Phase 6.4: exclude blocks that look like tree nodes (slot 1 AND slot 2 are pointers).
  const nodeMap = new Map<string, HeapBlock>();
  for (const block of step.heap) {
    if (!block.active) continue;
    if (block.slotCount >= 2 && block.values.length >= 2) {
      const slot1 = block.values[1];
      if (slot1 && slot1.kind === "pointer") {
        // If slot 2 is also a pointer, this is likely a tree node — skip
        const slot2 = block.values[2];
        if (slot2 && slot2.kind === "pointer") continue;
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
  structures: StructureItem[],
): void {
  // Collect all variables across all available scopes:
  // Globals first, then callStack from outer to inner (so inner frames override globals)
  const allVars: [string, ExecutionValue][] = [
    ...(step.globals ? Object.entries(step.globals) : []),
  ];
  for (const frame of step.callStack) {
    allVars.push(...Object.entries(frame.parameters), ...Object.entries(frame.locals));
  }

  const intVars = new Map<string, number>();
  for (const [name, val] of allVars) {
    if (val.kind === "scalar" && (val.type === "int" || val.type === "char")) {
      intVars.set(name.toLowerCase(), val.value);
    }
  }

  const getScalarVal = (v?: ExecutionValue, fallback: number = -1): number =>
    v && v.kind === "scalar" && typeof v.value === "number" ? v.value : fallback;

  // --- Struct-backed stack/queue detection (local struct or malloc struct) ---
  for (const [varName, val] of allVars) {
    if (val.kind !== "pointer" || !val.target) continue;
    const lowerType = val.type.toLowerCase();
    const lowerName = varName.toLowerCase();
    const isStructStack = lowerType.includes("struct stack") || (lowerType.startsWith("struct") && (lowerName.includes("stack") || lowerName === "s"));
    const isStructQueue = lowerType.includes("struct queue") || (lowerType.startsWith("struct") && (lowerName.includes("queue") || lowerName === "q"));

    if (isStructStack) {
      if (val.target.space === "heap") {
        const block = step.heap.find((b) => b.active && b.address.id === val.target!.id);
        if (block && block.slotCount >= 2) {
          const dataCount = block.slotCount - 1;
          const sTop = getScalarVal(block.values[dataCount], -1);
          const slots: StructureSlot[] = [];
          for (let i = 0; i < dataCount; i++) {
            slots.push({
              index: i,
              name: `[${i}]`,
              value: block.values[i] ?? { kind: "scalar", type: "int", value: 0 },
              address: { space: "heap", id: val.target.id, slot: i },
              highlight: "none",
            });
          }
          if (sTop >= 0 && sTop < slots.length) {
            slots[sTop].activeIndexTags = ["top ▾"];
          }
          const addrStr = formatAddress(block.address);
          const existingIdx = structures.findIndex((s) => s.id === `heap-array:${addrStr}`);
          if (existingIdx >= 0) structures.splice(existingIdx, 1);

          if (!structures.some((s) => s.id === `struct-stack:${varName}`)) {
            structures.push({
              id: `struct-stack:${varName}`,
              kind: "stack",
              name: `Stack: ${varName}`,
              nodes: [{
                id: `struct-stack:node:${varName}`,
                kind: "stack",
                label: `${varName}.data`,
                address: val.target,
                type: val.type,
                slots,
                highlight: "none",
                metadata: {
                  adtKind: "stack",
                  topIndex: sTop,
                },
              }],
              links: [],
            });
          }
        }
      } else if (val.target.space === "stack" && val.structValues && val.structValues.length >= 2) {
        const dataCount = val.structValues.length - 1;
        const sTop = getScalarVal(val.structValues[dataCount], -1);
        const slots: StructureSlot[] = [];
        for (let i = 0; i < dataCount; i++) {
          slots.push({
            index: i,
            name: `[${i}]`,
            value: val.structValues[i],
            address: { space: "stack", id: val.target.id, slot: i },
            highlight: "none",
          });
        }
        if (sTop >= 0 && sTop < slots.length) {
          slots[sTop].activeIndexTags = ["top ▾"];
        }
        if (!structures.some((s) => s.id === `struct-stack:${varName}`)) {
          structures.push({
            id: `struct-stack:${varName}`,
            kind: "stack",
            name: `Stack: ${varName}`,
            nodes: [{
              id: `struct-stack:node:${varName}`,
              kind: "stack",
              label: `${varName}.data`,
              address: val.target,
              type: val.type,
              slots,
              highlight: "none",
              metadata: {
                adtKind: "stack",
                topIndex: sTop,
              },
            }],
            links: [],
          });
        }
      }
    }

    if (isStructQueue) {
      if (val.target.space === "heap") {
        const block = step.heap.find((b) => b.active && b.address.id === val.target!.id);
        if (block && block.slotCount >= 3) {
          const dataCount = block.slotCount - 2;
          const sFront = getScalarVal(block.values[dataCount], 0);
          const sRear = getScalarVal(block.values[dataCount + 1], -1);
          const slots: StructureSlot[] = [];
          for (let i = 0; i < dataCount; i++) {
            slots.push({
              index: i,
              name: `[${i}]`,
              value: block.values[i] ?? { kind: "scalar", type: "int", value: 0 },
              address: { space: "heap", id: val.target.id, slot: i },
              highlight: "none",
            });
          }
          if (sFront >= 0 && sFront < slots.length) {
            slots[sFront].activeIndexTags = ["front ▾"];
          }
          if (sRear >= 0 && sRear < slots.length) {
            if (!slots[sRear].activeIndexTags) slots[sRear].activeIndexTags = [];
            slots[sRear].activeIndexTags.push("rear ▾");
          }
          const addrStr = formatAddress(block.address);
          const existingIdx = structures.findIndex((s) => s.id === `heap-array:${addrStr}`);
          if (existingIdx >= 0) structures.splice(existingIdx, 1);

          if (!structures.some((s) => s.id === `struct-queue:${varName}`)) {
            structures.push({
              id: `struct-queue:${varName}`,
              kind: "queue",
              name: `Queue: ${varName}`,
              nodes: [{
                id: `struct-queue:node:${varName}`,
                kind: "queue",
                label: `${varName}.data`,
                address: val.target,
                type: val.type,
                slots,
                highlight: "none",
                metadata: {
                  adtKind: "queue",
                  frontIndex: sFront,
                  rearIndex: sRear,
                },
              }],
              links: [],
            });
          }
        }
      } else if (val.target.space === "stack" && val.structValues && val.structValues.length >= 3) {
        const dataCount = val.structValues.length - 2;
        const sFront = getScalarVal(val.structValues[dataCount], 0);
        const sRear = getScalarVal(val.structValues[dataCount + 1], -1);
        const slots: StructureSlot[] = [];
        for (let i = 0; i < dataCount; i++) {
          slots.push({
            index: i,
            name: `[${i}]`,
            value: val.structValues[i],
            address: { space: "stack", id: val.target.id, slot: i },
            highlight: "none",
          });
        }
        if (sFront >= 0 && sFront < slots.length) {
          slots[sFront].activeIndexTags = ["front ▾"];
        }
        if (sRear >= 0 && sRear < slots.length) {
          if (!slots[sRear].activeIndexTags) slots[sRear].activeIndexTags = [];
          slots[sRear].activeIndexTags.push("rear ▾");
        }
        if (!structures.some((s) => s.id === `struct-queue:${varName}`)) {
          structures.push({
            id: `struct-queue:${varName}`,
            kind: "queue",
            name: `Queue: ${varName}`,
            nodes: [{
              id: `struct-queue:node:${varName}`,
              kind: "queue",
              label: `${varName}.data`,
              address: val.target,
              type: val.type,
              slots,
              highlight: "none",
              metadata: {
                adtKind: "queue",
                frontIndex: sFront,
                rearIndex: sRear,
              },
            }],
            links: [],
          });
        }
      }
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
      // Only promote standard array structures (global and stack-allocated, not generic heap arrays)
      if (!struct.id.startsWith("array:")) continue;

      const node = struct.nodes[0];
      if (!node || node.kind !== "array" || node.slots.length === 0) continue;

      const arrayLen = node.slots.length;
      const labelLower = node.label.toLowerCase();

      const isNamedStack = labelLower.includes("stack") || labelLower === "s" || labelLower.includes("stk");
      const isNamedQueue = labelLower.includes("queue") || labelLower === "q";

      let shouldPromoteStack = false;
      let shouldPromoteQueue = false;

      if (topVal !== undefined && frontVal !== undefined && rearVal !== undefined) {
        if (isNamedStack) shouldPromoteStack = true;
        else if (isNamedQueue) shouldPromoteQueue = true;
        else shouldPromoteStack = true;
      } else if (topVal !== undefined) {
        if (!isNamedQueue) shouldPromoteStack = true;
      } else if (frontVal !== undefined && rearVal !== undefined) {
        if (!isNamedStack) shouldPromoteQueue = true;
      }

      // Stack promotion
      if (shouldPromoteStack && topVal !== undefined) {
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

      // Queue promotion
      if (shouldPromoteQueue && frontVal !== undefined && rearVal !== undefined) {
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

/**
 * Phase 6.4: Extracts binary tree / BST structures from heap blocks.
 *
 * A tree node is a heap block with 3+ slots where:
 *   - slot 0: data value (scalar)
 *   - slot 1: left child pointer
 *   - slot 2: right child pointer
 *
 * Tree roots are found via stack/global pointers named "root", "tree", "bst", "t"
 * or via in-degree-0 analysis. BST property is validated across the entire tree.
 */
function extractTrees(step: ExecutionStep, out: StructureItem[]): void {
  const activeFrame = step.callStack.find((f) => f.isActive) ?? step.callStack[step.callStack.length - 1];
  if (!activeFrame) return;

  // Find all candidate tree nodes in heap:
  // A heap block with 3+ slots where slot 1 and slot 2 are both pointers.
  const treeNodeMap = new Map<string, HeapBlock>();
  for (const block of step.heap) {
    if (!block.active) continue;
    if (block.slotCount >= 3 && block.values.length >= 3) {
      const slot1 = block.values[1];
      const slot2 = block.values[2];
      if (slot1 && slot1.kind === "pointer" && slot2 && slot2.kind === "pointer") {
        treeNodeMap.set(formatAddress(block.address), block);
      }
    }
  }

  if (treeNodeMap.size === 0) return;

  // Collect stack and global pointers that point to any tree node
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(activeFrame.parameters),
    ...Object.entries(activeFrame.locals),
    ...(step.globals ? Object.entries(step.globals) : []),
  ];

  // Map each node address to stack pointer names
  const nodePointers = new Map<string, string[]>();
  for (const [varName, val] of allVars) {
    if (val.kind === "pointer" && val.target && val.target.space === "heap") {
      const targetStr = formatAddress({ space: "heap", id: val.target.id, slot: 0 });
      if (treeNodeMap.has(targetStr)) {
        const list = nodePointers.get(targetStr) ?? [];
        list.push(varName);
        nodePointers.set(targetStr, list);
      }
    }
  }

  // Determine in-degree (how many other tree nodes point to this node as left/right child)
  const inDegree = new Map<string, number>();
  for (const key of treeNodeMap.keys()) {
    inDegree.set(key, 0);
  }
  for (const block of treeNodeMap.values()) {
    // Left child (slot 1)
    const leftVal = block.values[1];
    if (leftVal && leftVal.kind === "pointer" && leftVal.target && leftVal.target.space === "heap") {
      const leftKey = formatAddress({ space: "heap", id: leftVal.target.id, slot: 0 });
      if (inDegree.has(leftKey)) {
        inDegree.set(leftKey, (inDegree.get(leftKey) ?? 0) + 1);
      }
    }
    // Right child (slot 2)
    const rightVal = block.values[2];
    if (rightVal && rightVal.kind === "pointer" && rightVal.target && rightVal.target.space === "heap") {
      const rightKey = formatAddress({ space: "heap", id: rightVal.target.id, slot: 0 });
      if (inDegree.has(rightKey)) {
        inDegree.set(rightKey, (inDegree.get(rightKey) ?? 0) + 1);
      }
    }
  }

  // Find root candidates
  const rootCandidates: string[] = [];
  const preferredNames = ["root", "tree", "bst", "t"];

  // Priority: stack pointer with preferred name
  for (const [varName, val] of allVars) {
    if (val.kind === "pointer" && val.target && val.target.space === "heap") {
      const targetStr = formatAddress({ space: "heap", id: val.target.id, slot: 0 });
      if (treeNodeMap.has(targetStr) && preferredNames.includes(varName.toLowerCase())) {
        if (!rootCandidates.includes(targetStr)) rootCandidates.unshift(targetStr);
      }
    }
  }

  // In-degree 0 nodes pointed to by stack pointers
  for (const [nodeKey, deg] of inDegree.entries()) {
    if (deg === 0 && nodePointers.has(nodeKey) && !rootCandidates.includes(nodeKey)) {
      rootCandidates.push(nodeKey);
    }
  }

  // Fallback: in-degree 0 nodes
  if (rootCandidates.length === 0) {
    for (const [nodeKey, deg] of inDegree.entries()) {
      if (deg === 0 && !rootCandidates.includes(nodeKey)) {
        rootCandidates.push(nodeKey);
      }
    }
  }

  // Final fallback: any tree node
  if (rootCandidates.length === 0 && treeNodeMap.size > 0) {
    rootCandidates.push(treeNodeMap.keys().next().value!);
  }

  const visitedGlobal = new Set<string>();

  for (const rootKey of rootCandidates) {
    if (visitedGlobal.has(rootKey)) continue;

    const treeNodes: StructureNode[] = [];
    const treeLinks: StructureLink[] = [];
    let nodeIndex = 0;

    // BFS/DFS traversal to collect all nodes in this tree
    const queue: string[] = [rootKey];
    const visitedInTree = new Set<string>();

    while (queue.length > 0) {
      const currentKey = queue.shift()!;
      if (visitedInTree.has(currentKey)) continue;
      if (!treeNodeMap.has(currentKey)) continue;

      visitedInTree.add(currentKey);
      visitedGlobal.add(currentKey);

      const block = treeNodeMap.get(currentKey)!;
      const dataVal = block.values[0] ?? { kind: "scalar", type: "int", value: 0 };
      const leftVal = block.values[1];
      const rightVal = block.values[2];

      // Active traversal tags
      const ptrNames = nodePointers.get(currentKey) ?? [];
      const tags = ptrNames.map((p) => {
        const lower = p.toLowerCase();
        if (lower === "root") return `${p} ➔`;
        return `${p} ▾`;
      });

      const nodeId = `tree:node:${currentKey}`;

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
          name: "left",
          value: leftVal,
          address: { space: "heap", id: block.address.id, slot: 1 },
          highlight: "none",
        },
        {
          index: 2,
          name: "right",
          value: rightVal,
          address: { space: "heap", id: block.address.id, slot: 2 },
          highlight: "none",
        },
      ];

      treeNodes.push({
        id: nodeId,
        kind: "tree",
        label: `Node ${nodeIndex} (${currentKey})`,
        address: block.address,
        type: "struct TreeNode",
        slots,
        highlight: block.active ? "none" : "target",
        metadata: {
          nodeIndex,
          heapAddress: currentKey,
          byteSize: block.byteSize,
        },
      });

      // Left child link
      if (leftVal && leftVal.kind === "pointer") {
        if (leftVal.target === null) {
          treeLinks.push({
            id: `tree:link:${nodeId}->left:null`,
            sourceNodeId: nodeId,
            sourceSlotIndex: 1,
            targetNodeId: null,
            targetSlotIndex: 0,
            targetAddress: null,
            label: "left",
            status: "null",
            routingStyle: "direct",
          });
        } else if (leftVal.target.space === "heap") {
          const leftKey = formatAddress({ space: "heap", id: leftVal.target.id, slot: 0 });
          const targetNodeId = `tree:node:${leftKey}`;
          treeLinks.push({
            id: `tree:link:${nodeId}->left:${targetNodeId}`,
            sourceNodeId: nodeId,
            sourceSlotIndex: 1,
            targetNodeId,
            targetSlotIndex: 0,
            targetAddress: leftVal.target,
            label: "left",
            status: "valid",
            routingStyle: "direct",
          });
          if (!visitedInTree.has(leftKey)) queue.push(leftKey);
        }
      }

      // Right child link
      if (rightVal && rightVal.kind === "pointer") {
        if (rightVal.target === null) {
          treeLinks.push({
            id: `tree:link:${nodeId}->right:null`,
            sourceNodeId: nodeId,
            sourceSlotIndex: 2,
            targetNodeId: null,
            targetSlotIndex: 0,
            targetAddress: null,
            label: "right",
            status: "null",
            routingStyle: "direct",
          });
        } else if (rightVal.target.space === "heap") {
          const rightKey = formatAddress({ space: "heap", id: rightVal.target.id, slot: 0 });
          const targetNodeId = `tree:node:${rightKey}`;
          treeLinks.push({
            id: `tree:link:${nodeId}->right:${targetNodeId}`,
            sourceNodeId: nodeId,
            sourceSlotIndex: 2,
            targetNodeId,
            targetSlotIndex: 0,
            targetAddress: rightVal.target,
            label: "right",
            status: "valid",
            routingStyle: "direct",
          });
          if (!visitedInTree.has(rightKey)) queue.push(rightKey);
        }
      }

      nodeIndex++;
    }

    if (treeNodes.length > 0) {
      // Validate BST property
      const isBST = validateBST(rootKey, treeNodeMap);

      // Determine display name
      const rootPtrNames = nodePointers.get(rootKey);
      const displayName = rootPtrNames && rootPtrNames.length > 0
        ? rootPtrNames[0]
        : rootKey;

      out.push({
        id: `tree:${rootKey}`,
        kind: "tree",
        name: isBST
          ? `BST: ${displayName} (Valid BST)`
          : `Binary Tree: ${displayName}`,
        nodes: treeNodes,
        links: treeLinks,
      });
    }
  }
}

/**
 * Validates the BST property for a tree rooted at the given key.
 * For every node u with value V(u):
 *   - All nodes in u's left subtree have V < V(u)
 *   - All nodes in u's right subtree have V > V(u)
 */
function validateBST(
  rootKey: string,
  nodeMap: Map<string, HeapBlock>,
  minBound: number = -Infinity,
  maxBound: number = Infinity,
): boolean {
  const block = nodeMap.get(rootKey);
  if (!block) return true; // null node is valid

  const dataVal = block.values[0];
  if (!dataVal || dataVal.kind !== "scalar") return false;
  const val = dataVal.value;

  if (val <= minBound || val >= maxBound) return false;

  // Check left subtree
  const leftVal = block.values[1];
  if (leftVal && leftVal.kind === "pointer" && leftVal.target && leftVal.target.space === "heap") {
    const leftKey = formatAddress({ space: "heap", id: leftVal.target.id, slot: 0 });
    if (!validateBST(leftKey, nodeMap, minBound, val)) return false;
  }

  // Check right subtree
  const rightVal = block.values[2];
  if (rightVal && rightVal.kind === "pointer" && rightVal.target && rightVal.target.space === "heap") {
    const rightKey = formatAddress({ space: "heap", id: rightVal.target.id, slot: 0 });
    if (!validateBST(rightKey, nodeMap, val, maxBound)) return false;
  }

  return true;
}

/**
 * Phase 6.4: Detects array-backed binary heap ADTs.
 *
 * Heuristics:
 *   - Array variable named "heap", "minheap", "maxheap", "pq", "priority_queue"
 *   - Alongside an integer named "heap_size", "heapsize", "size", "n"
 *   - Checks Min-Heap property (A[parent] <= A[child]) or Max-Heap property (A[parent] >= A[child])
 *
 * Does NOT modify existing array/stack/queue items — only upgrades matching arrays.
 */
function extractBinaryHeaps(
  step: ExecutionStep,
  activeFrame: StackFrame,
  structures: StructureItem[],
): void {
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(activeFrame.parameters),
    ...Object.entries(activeFrame.locals),
    ...(step.globals ? Object.entries(step.globals) : []),
  ];

  // Collect integer variables
  const intVars = new Map<string, number>();
  for (const [name, val] of allVars) {
    if (val.kind === "scalar" && (val.type === "int" || val.type === "char")) {
      intVars.set(name.toLowerCase(), val.value);
    }
  }

  // Look for heap size variable
  const heapSizeKeys = ["heap_size", "heapsize", "size", "n"];
  let heapSize: number | undefined;
  let heapSizeKey: string | null = null;
  for (const key of heapSizeKeys) {
    if (intVars.has(key)) {
      heapSize = intVars.get(key);
      heapSizeKey = key;
      break;
    }
  }

  // Heap array name patterns
  const heapArrayNames = ["heap", "minheap", "maxheap", "pq", "priority_queue", "min_heap", "max_heap"];

  for (const struct of structures) {
    if (struct.kind !== "array") continue;
    if (!struct.id.startsWith("array:")) continue;

    const node = struct.nodes[0];
    if (!node || node.kind !== "array" || node.slots.length === 0) continue;

    const lower = node.label.toLowerCase();
    if (!heapArrayNames.some((name) => lower.includes(name))) continue;

    // Determine effective size
    const effectiveSize = heapSize !== undefined ? Math.min(heapSize, node.slots.length) : node.slots.length;
    if (effectiveSize <= 0) continue;

    // Extract numeric values from slots
    const values: number[] = [];
    let allScalar = true;
    for (let i = 0; i < effectiveSize; i++) {
      const slotVal = node.slots[i]?.value;
      if (slotVal && slotVal.kind === "scalar") {
        values.push(slotVal.value);
      } else {
        allScalar = false;
        break;
      }
    }

    if (!allScalar || values.length < 2) continue;

    // Check min-heap and max-heap properties
    let isMinHeap = true;
    let isMaxHeap = true;
    for (let i = 1; i < values.length; i++) {
      const parentIdx = Math.floor((i - 1) / 2);
      if (values[parentIdx] > values[i]) isMinHeap = false;
      if (values[parentIdx] < values[i]) isMaxHeap = false;
    }

    if (!isMinHeap && !isMaxHeap) continue;

    // Promote to heap-adt (represented as "tree" kind with heap metadata)
    const heapType = isMinHeap ? "Min-Heap" : "Max-Heap";

    if (!node.metadata) node.metadata = {};
    node.metadata.adtKind = "binary-heap";
    node.metadata.heapType = heapType;
    node.metadata.heapSize = effectiveSize;
    node.metadata.heapSizeKey = heapSizeKey;

    // Annotate parent-child relationships on slots
    for (let i = 0; i < effectiveSize; i++) {
      const slot = node.slots[i];
      if (!slot) continue;
      if (!slot.activeIndexTags) slot.activeIndexTags = [];

      const leftChild = 2 * i + 1;
      const rightChild = 2 * i + 2;
      const parentIdx = i > 0 ? Math.floor((i - 1) / 2) : null;

      const annotations: string[] = [];
      if (parentIdx !== null && parentIdx < effectiveSize) {
        annotations.push(`P:[${parentIdx}]`);
      }
      if (leftChild < effectiveSize) {
        annotations.push(`L:[${leftChild}]`);
      }
      if (rightChild < effectiveSize) {
        annotations.push(`R:[${rightChild}]`);
      }

      for (const ann of annotations) {
        if (!slot.activeIndexTags.includes(ann)) {
          slot.activeIndexTags.push(ann);
        }
      }
    }

    struct.name = `${heapType}: ${node.label}`;
  }
}
