import type {
  ExecutionStep,
  ExecutionValue,
  HeapBlock,
  StackFrame,
  PointerRelationship,
} from "../../execution/models/executionTypes";
import { formatAddress } from "../../memory/memory";
import type { GraphModel, GraphNode, GraphEdge } from "../models/graphTypes";

/**
 * Detects graphs from the execution step.
 * Returns normalized GraphModels for all detected graphs.
 */
export function detectGraphModels(step: ExecutionStep | null): GraphModel[] {
  if (!step) return [];

  const models: GraphModel[] = [];

  const activeFrame =
    step.callStack.find((f) => f.isActive) ??
    step.callStack[step.callStack.length - 1];

  // 1. Detect Adjacency Matrix graphs
  if (activeFrame) {
    const matrixGraphs = detectAdjacencyMatrixGraphs(activeFrame, step.globals);
    models.push(...matrixGraphs);
  }

  // 2. Detect Adjacency List graphs
  if (activeFrame) {
    const listGraphs = detectAdjacencyListGraphs(step, activeFrame);
    models.push(...listGraphs);
  }

  // 3. Detect Pointer-based graphs
  const pointerGraphs = detectPointerGraphs(step, activeFrame);
  models.push(...pointerGraphs);

  return models;
}

// ---------------------------------------------------------------------------
// 1. ADJACENCY MATRIX DETECTION
// ---------------------------------------------------------------------------

function detectAdjacencyMatrixGraphs(
  frame: StackFrame,
  globals?: Record<string, ExecutionValue>,
): GraphModel[] {
  const models: GraphModel[] = [];
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(frame.parameters),
    ...Object.entries(frame.locals),
    ...(globals ? Object.entries(globals) : []),
  ];

  const graphKeywords = ["graph", "adj", "mat", "matrix", "edges", "network", "cost", "dist"];

  for (const [varName, val] of allVars) {
    if (val.kind !== "array" || !val.dimensions || val.dimensions.length !== 2) {
      continue;
    }

    const [rows, cols] = val.dimensions;
    // Conservative: Must be square matrix with size between 2 and 16
    if (rows !== cols || rows < 2 || rows > 16) {
      continue;
    }

    const lowerName = varName.toLowerCase();
    const hasKeyword =
      graphKeywords.some((kw) => lowerName.includes(kw)) ||
      lowerName === "g";

    // Inspect values: extract numbers
    const flatValues = val.values.map((v) =>
      v.kind === "scalar" && typeof v.value === "number" ? v.value : 0,
    );

    const nonZeroCount = flatValues.filter((v) => v !== 0).length;

    // Check if binary (0 or 1)
    const isBinary = flatValues.every((v) => v === 0 || v === 1);

    // Confidence heuristic:
    // If name matches keyword and has at least one edge, OR if it's binary with realistic edge density
    const isGraphMatrix =
      (hasKeyword && nonZeroCount > 0) ||
      (isBinary && nonZeroCount >= 1 && nonZeroCount <= rows * cols - 1);

    if (!isGraphMatrix) continue;

    const N = rows;
    const nodes: GraphNode[] = [];
    for (let i = 0; i < N; i++) {
      const charLabel = N <= 26 ? String.fromCharCode(65 + i) : `${i}`;
      nodes.push({
        id: `v_${i}`,
        label: `Node ${charLabel}`,
        value: i,
        type: "int",
        metadata: { index: i },
      });
    }

    const edges: GraphEdge[] = [];
    let hasSelfLoops = false;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const weight = flatValues[r * N + c];
        if (weight !== 0) {
          if (r === c) hasSelfLoops = true;
          edges.push({
            id: `e_${r}_${c}`,
            source: `v_${r}`,
            target: `v_${c}`,
            directed: true,
            label: weight !== 1 ? `${weight}` : undefined,
            metadata: { weight, row: r, col: c },
          });
        }
      }
    }

    models.push({
      id: `matrix:${varName}`,
      name: `Graph: ${varName} (${N} vertices)`,
      nodes,
      edges,
      directed: true,
      representation: "adjacency-matrix",
      metadata: {
        representationBadge: "Representation: Adjacency Matrix",
        variableName: varName,
        matrixSize: N,
        hasSelfLoops,
      },
    });
  }

  return models;
}

// ---------------------------------------------------------------------------
// 2. ADJACENCY LIST DETECTION
// ---------------------------------------------------------------------------

function detectAdjacencyListGraphs(
  step: ExecutionStep,
  frame: StackFrame,
): GraphModel[] {
  const models: GraphModel[] = [];
  const allVars: [string, ExecutionValue][] = [
    ...Object.entries(frame.parameters),
    ...Object.entries(frame.locals),
    ...(step.globals ? Object.entries(step.globals) : []),
  ];

  const listKeywords = ["adj", "graph", "head", "adjlist", "neighbors", "list", "edges", "g"];

  for (const [varName, val] of allVars) {
    if (val.kind !== "array" || (val.dimensions && val.dimensions.length > 1)) {
      continue;
    }

    const N = val.length;
    if (N < 2 || N > 16) continue;

    // Check if elements are pointers to struct Node
    const isPointerArray =
      val.values.every((elem) => elem.kind === "pointer") ||
      (val.type && val.type.includes("*"));

    if (!isPointerArray) continue;

    const lowerName = varName.toLowerCase();
    const hasKeyword =
      listKeywords.some((kw) => lowerName.includes(kw)) ||
      lowerName === "g" ||
      lowerName === "adj";

    if (!hasKeyword) continue;

    // Map heap blocks by ID for fast traversal
    const heapMap = new Map<number, HeapBlock>();
    for (const b of step.heap) {
      if (b.active) heapMap.set(b.address.id, b);
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let edgeCount = 0;
    let hasSelfLoops = false;

    for (let i = 0; i < N; i++) {
      const charLabel = N <= 26 ? String.fromCharCode(65 + i) : `${i}`;
      nodes.push({
        id: `v_${i}`,
        label: `Node ${charLabel}`,
        value: i,
        type: "int",
        metadata: { index: i },
      });

      const headVal = val.values[i];
      if (headVal && headVal.kind === "pointer" && headVal.target && headVal.target.space === "heap") {
        let currBlockId: number | null = headVal.target.id;
        const visitedInList = new Set<number>();

        while (currBlockId !== null && heapMap.has(currBlockId)) {
          if (visitedInList.has(currBlockId)) break; // cycle protection
          visitedInList.add(currBlockId);

          const block: HeapBlock | undefined = heapMap.get(currBlockId);
          if (!block) break;
          // Slot 0: vertex index or target
          const targetSlotVal = block.values[0];
          let targetIndex: number | null = null;
          if (targetSlotVal && targetSlotVal.kind === "scalar" && typeof targetSlotVal.value === "number") {
            targetIndex = targetSlotVal.value;
          }

          if (targetIndex !== null && targetIndex >= 0 && targetIndex < N) {
            if (i === targetIndex) hasSelfLoops = true;
            edges.push({
              id: `e_${i}_${targetIndex}_${edgeCount++}`,
              source: `v_${i}`,
              target: `v_${targetIndex}`,
              directed: true,
              metadata: { listNodeId: currBlockId },
            });
          }

          // Slot 1: next pointer
          const nextVal: ExecutionValue | undefined = block.values[1];
          if (nextVal && nextVal.kind === "pointer" && nextVal.target && nextVal.target.space === "heap") {
            currBlockId = nextVal.target.id;
          } else {
            currBlockId = null;
          }
        }
      }
    }

    // Must have at least some nodes or edges to qualify
    if (nodes.length >= 2) {
      models.push({
        id: `adjlist:${varName}`,
        name: `Graph: ${varName} (${N} vertices)`,
        nodes,
        edges,
        directed: true,
        representation: "adjacency-list",
        metadata: {
          representationBadge: "Representation: Adjacency List",
          variableName: varName,
          vertexCount: N,
          hasSelfLoops,
        },
      });
    }
  }

  return models;
}

// ---------------------------------------------------------------------------
// 3. POINTER-BASED GRAPH DETECTION
// ---------------------------------------------------------------------------

function detectPointerGraphs(
  step: ExecutionStep,
  _frame: StackFrame | undefined,
): GraphModel[] {
  const models: GraphModel[] = [];
  const pv = step.pointerView;
  if (!pv || pv.heapBlocks.length === 0) return [];

  const activeBlocks = pv.heapBlocks.filter((b) => b.active);
  if (activeBlocks.length === 0) return [];

  // Build adjacency representation from pointer relationships
  const blockMap = new Map<number, HeapBlock>();
  for (const b of activeBlocks) {
    blockMap.set(b.address.id, b);
  }

  // Map of source block id -> target block ids
  const outEdges = new Map<number, { targetId: number; rel: PointerRelationship }[]>();
  const inDegree = new Map<number, number>();

  for (const b of activeBlocks) {
    outEdges.set(b.address.id, []);
    inDegree.set(b.address.id, 0);
  }

  for (const rel of pv.relationships) {
    if (
      rel.pointerAddress?.space === "heap" &&
      rel.targetAddress?.space === "heap" &&
      rel.status === "valid"
    ) {
      const srcId = rel.pointerAddress.id;
      const tgtId = rel.targetAddress.id;

      if (blockMap.has(srcId) && blockMap.has(tgtId)) {
        outEdges.get(srcId)?.push({ targetId: tgtId, rel });
        inDegree.set(tgtId, (inDegree.get(tgtId) ?? 0) + 1);
      }
    }
  }

  // Map stack variable names to heap block targets
  const stackVarNames = new Map<number, string[]>();
  for (const v of pv.stackVariables) {
    const targetAddr = v.value.kind === "pointer" ? v.value.target : undefined;
    if (targetAddr?.space === "heap") {
      const list = stackVarNames.get(targetAddr.id) ?? [];
      list.push(v.name);
      stackVarNames.set(targetAddr.id, list);
    }
  }

  // Deconstruct active blocks into weakly connected components
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const blockId of blockMap.keys()) {
    if (visited.has(blockId)) continue;

    const comp: number[] = [];
    const queue: number[] = [blockId];
    visited.add(blockId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);

      // Outgoing neighbors
      for (const edge of outEdges.get(curr) ?? []) {
        if (!visited.has(edge.targetId)) {
          visited.add(edge.targetId);
          queue.push(edge.targetId);
        }
      }

      // Incoming neighbors (undirected traversal for components)
      for (const [src, edges] of outEdges.entries()) {
        if (edges.some((e) => e.targetId === curr) && !visited.has(src)) {
          visited.add(src);
          queue.push(src);
        }
      }
    }

    if (comp.length > 0) {
      components.push(comp);
    }
  }

  // Check each component or the whole network for GRAPH characteristics:
  // 1. Cycle (including self loops)
  // 2. Shared destination (in-degree >= 2)
  // 3. Multi-branching beyond binary tree (out-degree >= 3)
  // 4. Cross-edges / DAG structure
  for (const comp of components) {
    if (comp.length === 0) continue;

    let hasCycle = false;
    let hasSelfLoop = false;
    let hasSharedTarget = false;
    let maxOutDegree = 0;

    for (const id of comp) {
      const outList = outEdges.get(id) ?? [];
      maxOutDegree = Math.max(maxOutDegree, outList.length);

      const inDeg = inDegree.get(id) ?? 0;
      if (inDeg >= 2) {
        hasSharedTarget = true;
      }

      for (const edge of outList) {
        if (edge.targetId === id) {
          hasSelfLoop = true;
          hasCycle = true;
        }
      }
    }

    // Detect general cycle in component using DFS color marking
    if (!hasCycle) {
      const state = new Map<number, "unvisited" | "visiting" | "visited">();
      for (const id of comp) state.set(id, "unvisited");

      function dfsCycle(node: number): boolean {
        state.set(node, "visiting");
        for (const edge of outEdges.get(node) ?? []) {
          const tgtState = state.get(edge.targetId);
          if (tgtState === "visiting") return true;
          if (tgtState === "unvisited" && dfsCycle(edge.targetId)) return true;
        }
        state.set(node, "visited");
        return false;
      }

      for (const id of comp) {
        if (state.get(id) === "unvisited") {
          if (dfsCycle(id)) {
            hasCycle = true;
            break;
          }
        }
      }
    }

    // DISQUALIFICATION RULES:
    // 1. If it's a binary tree: 0 cycles, at most 1 shared destination, out-degree <= 2,
    //    and nodes have left/right structure.
    const isCandidateTree =
      !hasCycle &&
      !hasSharedTarget &&
      maxOutDegree <= 2 &&
      comp.every((id) => {
        const b = blockMap.get(id);
        return b && b.slotCount >= 3 && b.values[1]?.kind === "pointer" && b.values[2]?.kind === "pointer";
      });

    if (isCandidateTree) continue;

    // 2. If it's a simple linear linked list:
    //    0 cycles, 0 shared targets, out-degree <= 1, in-degree <= 1
    const isLinearList =
      !hasCycle &&
      !hasSharedTarget &&
      maxOutDegree <= 1 &&
      comp.every((id) => (inDegree.get(id) ?? 0) <= 1);

    // 3. If it's a pure circular linked list:
    //    simple cycle with no branches (out-degree 1, in-degree 1)
    //    and stack pointer is named head/list
    const stackVars = step.pointerView?.stackVariables ?? [];
    const isPureCircularList =
      hasCycle &&
      !hasSelfLoop &&
      !hasSharedTarget &&
      maxOutDegree <= 1 &&
      comp.every((id) => (inDegree.get(id) ?? 0) === 1) &&
      stackVars.length <= 2 &&
      stackVars.some((v) => /head|list|first/i.test(v.name));

    if (isLinearList || isPureCircularList) continue;

    // If it reaches here, it has genuine graph properties:
    // (Cycle, shared target, cross-edge, self-loop, or multi-branching)
    const isGraph = hasCycle || hasSharedTarget || hasSelfLoop || maxOutDegree >= 3;
    if (!isGraph && comp.length < 2) continue;

    // Build GraphModel for this component
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const id of comp) {
      const block = blockMap.get(id)!;
      const addrStr = formatAddress(block.address);
      const varNames = stackVarNames.get(id);
      const displayLabel = varNames && varNames.length > 0 ? varNames[0] : addrStr;

      // Extract scalar data from slot 0
      const val0 = block.values[0];
      const dataVal = val0?.kind === "scalar" ? val0.value : undefined;

      nodes.push({
        id: `heap:${addrStr}`,
        label: displayLabel,
        address: block.address,
        value: dataVal,
        type: `struct Node*`,
        metadata: {
          heapId: id,
          addressStr: addrStr,
          varNames,
          slots: block.values,
        },
      });

      for (const edge of outEdges.get(id) ?? []) {
        const tgtBlock = blockMap.get(edge.targetId);
        if (!tgtBlock) continue;
        const tgtAddrStr = formatAddress(tgtBlock.address);

        edges.push({
          id: `edge_${addrStr}_to_${tgtAddrStr}_${edge.rel.fieldName ?? "next"}`,
          source: `heap:${addrStr}`,
          target: `heap:${tgtAddrStr}`,
          directed: true,
          label: edge.rel.fieldName ?? undefined,
          metadata: { fieldName: edge.rel.fieldName },
        });
      }
    }

    if (nodes.length > 0) {
      models.push({
        id: `pointer_graph_comp_${comp[0]}`,
        name: `Pointer Graph (${nodes.length} nodes)`,
        nodes,
        edges,
        directed: true,
        representation: "pointer-based",
        metadata: {
          representationBadge: "Representation: Pointer Graph",
          hasCycles: hasCycle,
          hasSelfLoops: hasSelfLoop,
          componentCount: 1,
        },
      });
    }
  }

  // Handle case of multiple disconnected components where at least one is a graph
  // If multiple components exist and none were classified individually as list/tree,
  // group into a unified graph if overall structure represents disconnected graph components.
  if (models.length === 0 && components.length >= 2 && activeBlocks.length >= 4) {
    const totalEdges = activeBlocks.reduce(
      (acc, b) => acc + (outEdges.get(b.address.id)?.length ?? 0),
      0,
    );
    // If there are disconnected components with edges
    if (totalEdges >= 2) {
      const allNodes: GraphNode[] = [];
      const allEdges: GraphEdge[] = [];

      for (const b of activeBlocks) {
        const addrStr = formatAddress(b.address);
        const varNames = stackVarNames.get(b.address.id);
        const displayLabel = varNames && varNames.length > 0 ? varNames[0] : addrStr;
        const val0 = b.values[0];
        const dataVal = val0?.kind === "scalar" ? val0.value : undefined;

        allNodes.push({
          id: `heap:${addrStr}`,
          label: displayLabel,
          address: b.address,
          value: dataVal,
          type: "struct Node*",
          metadata: { heapId: b.address.id, addressStr: addrStr, varNames },
        });

        for (const edge of outEdges.get(b.address.id) ?? []) {
          const tgtBlock = blockMap.get(edge.targetId);
          if (!tgtBlock) continue;
          allEdges.push({
            id: `edge_${addrStr}_${formatAddress(tgtBlock.address)}`,
            source: `heap:${addrStr}`,
            target: `heap:${formatAddress(tgtBlock.address)}`,
            directed: true,
            label: edge.rel.fieldName,
          });
        }
      }

      models.push({
        id: "pointer_graph_disconnected",
        name: `Disconnected Graph (${allNodes.length} nodes, ${components.length} components)`,
        nodes: allNodes,
        edges: allEdges,
        directed: true,
        representation: "pointer-based",
        metadata: {
          representationBadge: "Representation: Pointer Graph",
          componentCount: components.length,
        },
      });
    }
  }

  return models;
}
