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
  const matrixGraphs = detectAdjacencyMatrixGraphs(step);
  models.push(...matrixGraphs);

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
  stepOrFrame: ExecutionStep | StackFrame,
  globals?: Record<string, ExecutionValue>,
): GraphModel[] {
  const models: GraphModel[] = [];
  const allVars: [string, ExecutionValue][] = [];
  const seenVarNames = new Set<string>();

  if ("callStack" in stepOrFrame) {
    // ExecutionStep: collect from globals and all stack frames
    if (stepOrFrame.globals) {
      for (const [k, v] of Object.entries(stepOrFrame.globals)) {
        if (!seenVarNames.has(k)) {
          seenVarNames.add(k);
          allVars.push([k, v]);
        }
      }
    }
    for (const frame of stepOrFrame.callStack) {
      for (const [k, v] of Object.entries(frame.parameters)) {
        if (!seenVarNames.has(k)) {
          seenVarNames.add(k);
          allVars.push([k, v]);
        }
      }
      for (const [k, v] of Object.entries(frame.locals)) {
        if (!seenVarNames.has(k)) {
          seenVarNames.add(k);
          allVars.push([k, v]);
        }
      }
    }
  } else {
    // StackFrame
    for (const [k, v] of [
      ...Object.entries(stepOrFrame.parameters),
      ...Object.entries(stepOrFrame.locals),
      ...(globals ? Object.entries(globals) : []),
    ]) {
      if (!seenVarNames.has(k)) {
        seenVarNames.add(k);
        allVars.push([k, v]);
      }
    }
  }

  const graphKeywords = ["graph", "adj", "adjacency", "network", "edges"];

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
      /^g\d*$/i.test(lowerName) ||
      /^g_\d+$/i.test(lowerName);

    // Inspect values: extract numbers
    const flatValues = val.values.map((v) =>
      v.kind === "scalar" && typeof v.value === "number" ? v.value : 0,
    );

    const nonZeroCount = flatValues.filter((v) => v !== 0).length;

    // Confidence heuristic:
    // Requires explicit graph naming evidence and at least one non-zero edge,
    // ensuring ordinary 2D arrays (like arr[4][4] or matrix[4][4]) remain normal arrays.
    const isGraphMatrix = hasKeyword && nonZeroCount > 0;

    if (!isGraphMatrix) continue;

    const N = rows;
    const nodes: GraphNode[] = [];
    for (let i = 0; i < N; i++) {
      const charLabel = N <= 26 ? String.fromCharCode(65 + i) : `${i}`;
      nodes.push({
        id: `${varName}_v_${i}`,
        label: `Node ${charLabel}`,
        value: i,
        type: "int",
        metadata: { index: i, variableName: varName },
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
            id: `e_${varName}_${r}_${c}`,
            source: `${varName}_v_${r}`,
            target: `${varName}_v_${c}`,
            directed: true,
            label: weight !== 1 ? `${weight}` : undefined,
            metadata: { weight, row: r, col: c },
          });
        }
      }
    }

    // Detect directed cycles in adjacency matrix using 3-color DFS
    let hasCycles = false;
    if (hasSelfLoops) {
      hasCycles = true;
    } else {
      const visitState = new Array<number>(N).fill(0); // 0=unvisited, 1=visiting, 2=visited
      function dfsCycle(u: number): boolean {
        visitState[u] = 1;
        for (let v = 0; v < N; v++) {
          if (flatValues[u * N + v] !== 0) {
            if (visitState[v] === 1) return true;
            if (visitState[v] === 0 && dfsCycle(v)) return true;
          }
        }
        visitState[u] = 2;
        return false;
      }
      for (let i = 0; i < N; i++) {
        if (visitState[i] === 0) {
          if (dfsCycle(i)) {
            hasCycles = true;
            break;
          }
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
        hasCycles,
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
  const outEdges = new Map<number, { targetId: number; rel: PointerRelationship; slot: number }[]>();
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
      const slot = rel.pointerAddress.slot ?? 0;

      if (blockMap.has(srcId) && blockMap.has(tgtId)) {
        outEdges.get(srcId)?.push({ targetId: tgtId, rel, slot });
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

  // Deconstruct active blocks into weakly connected components using visited set
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

  interface ValidComponent {
    comp: number[];
    hasCycle: boolean;
    hasSelfLoop: boolean;
    hasSharedTarget: boolean;
    maxOutDegree: number;
  }

  const validGraphComponents: ValidComponent[] = [];

  for (const comp of components) {
    if (comp.length === 0) continue;

    let hasCycle = false;
    let hasSelfLoop = false;
    let hasSharedTarget = false;
    let maxOutDegree = 0;
    let totalCompEdges = 0;

    for (const id of comp) {
      const outList = outEdges.get(id) ?? [];
      maxOutDegree = Math.max(maxOutDegree, outList.length);
      totalCompEdges += outList.length;

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

    // Detect general cycle in component using 3-color DFS
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

    // Discard isolated nodes without any edges unless it's a self-loop
    if (totalCompEdges === 0) continue;

    // DISQUALIFICATION RULES:
    // 1. Binary tree: 0 cycles, at most 1 shared destination, out-degree <= 2,
    //    nodes have left/right structure (slots 1 & 2 pointers), and explicit root/tree var.
    const isCandidateTree =
      !hasCycle &&
      !hasSharedTarget &&
      maxOutDegree <= 2 &&
      comp.every((id) => {
        const b = blockMap.get(id);
        return b && b.slotCount >= 3 && b.values[1]?.kind === "pointer" && b.values[2]?.kind === "pointer";
      }) &&
      comp.some((id) => {
        const vars = stackVarNames.get(id) ?? [];
        return vars.some((v) => /root|tree/i.test(v));
      });

    if (isCandidateTree) continue;

    // 2. Linear linked list:
    //    0 cycles, 0 shared targets, out-degree <= 1, in-degree <= 1,
    //    has head pointer, and lacks discrete vertex variables for intermediate nodes.
    const headVars = pv.stackVariables.filter((v) => /head|list|first/i.test(v.name));
    const hasHeadPointer = headVars.length > 0;
    const hasDiscreteVertexVars =
      comp.length > 1 &&
      comp.filter((id) => (stackVarNames.get(id)?.length ?? 0) > 0).length >= 2;

    const isLinearList =
      !hasCycle &&
      !hasSharedTarget &&
      maxOutDegree <= 1 &&
      comp.every((id) => (inDegree.get(id) ?? 0) <= 1) &&
      hasHeadPointer &&
      !hasDiscreteVertexVars;

    // 3. Pure circular linked list:
    //    simple cycle with no branches (out-degree 1, in-degree 1)
    //    and stack pointer is named head/list without separate node variables
    const isPureCircularList =
      hasCycle &&
      !hasSelfLoop &&
      !hasSharedTarget &&
      maxOutDegree <= 1 &&
      comp.every((id) => (inDegree.get(id) ?? 0) === 1) &&
      hasHeadPointer &&
      !hasDiscreteVertexVars;

    if (isLinearList || isPureCircularList) continue;

    validGraphComponents.push({
      comp,
      hasCycle,
      hasSelfLoop,
      hasSharedTarget,
      maxOutDegree,
    });
  }

  if (validGraphComponents.length === 0) return [];

  // Assemble all valid graph components into a unified GraphModel
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  let overallHasCycles = false;
  let overallHasSelfLoops = false;

  for (const { comp, hasCycle, hasSelfLoop } of validGraphComponents) {
    if (hasCycle) overallHasCycles = true;
    if (hasSelfLoop) overallHasSelfLoops = true;

    for (const id of comp) {
      const block = blockMap.get(id)!;
      const addrStr = formatAddress(block.address);
      const nodeId = `heap:${addrStr}`;

      if (!seenNodeIds.has(nodeId)) {
        seenNodeIds.add(nodeId);
        const varNames = stackVarNames.get(id);
        const displayLabel = varNames && varNames.length > 0 ? varNames[0] : addrStr;

        const val0 = block.values[0];
        const dataVal = val0?.kind === "scalar" ? val0.value : undefined;

        allNodes.push({
          id: nodeId,
          label: displayLabel,
          address: block.address,
          value: dataVal,
          type: "struct Node*",
          metadata: {
            heapId: id,
            addressStr: addrStr,
            varNames,
            slots: block.values,
          },
        });
      }

      let edgeCounter = 0;
      for (const edge of outEdges.get(id) ?? []) {
        const tgtBlock = blockMap.get(edge.targetId);
        if (!tgtBlock) continue;
        const tgtAddrStr = formatAddress(tgtBlock.address);
        const targetNodeId = `heap:${tgtAddrStr}`;

        const field = edge.rel.fieldName ?? `slot${edge.slot}`;
        let edgeId = `edge_${addrStr}_s${edge.slot}_to_${tgtAddrStr}_${field}`;
        if (seenEdgeIds.has(edgeId)) {
          edgeId = `edge_${addrStr}_s${edge.slot}_to_${tgtAddrStr}_${field}_${++edgeCounter}`;
        }
        seenEdgeIds.add(edgeId);

        allEdges.push({
          id: edgeId,
          source: nodeId,
          target: targetNodeId,
          directed: true,
          label: edge.rel.fieldName ?? undefined,
          metadata: { fieldName: edge.rel.fieldName, slot: edge.slot },
        });
      }
    }
  }

  if (allNodes.length === 0) return [];

  const compCount = validGraphComponents.length;
  models.push({
    id: "pointer_graph",
    name:
      compCount > 1
        ? `Disconnected Graph (${allNodes.length} nodes, ${compCount} components)`
        : `Pointer Graph (${allNodes.length} nodes)`,
    nodes: allNodes,
    edges: allEdges,
    directed: true,
    representation: "pointer-based",
    metadata: {
      representationBadge: "Representation: Pointer Graph",
      hasCycles: overallHasCycles,
      hasSelfLoops: overallHasSelfLoops,
      componentCount: compCount,
    },
  });

  return models;
}
