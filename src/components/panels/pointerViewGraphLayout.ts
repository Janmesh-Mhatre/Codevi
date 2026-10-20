import type {
  HeapBlock,
  PointerRelationship,
  PointerViewVariable,
} from "../../execution/models/executionTypes";
import { getFieldColor } from "../../visualization/connectors/connectorRouting";

const HEAP_NODE_W = 180;
const HEAP_NODE_H = 56;
const H_GAP = 40;
const LEVEL_V_GAP = 64;
const COMPONENT_GAP = 60;

export interface PlacedGraphLink {
  id: string;
  sourceId: number;
  targetId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pathD: string;
  color: string;
  label?: string;
  isSelfLoop?: boolean;
  labelX?: number;
  labelY?: number;
}

export interface DetectedGraph {
  representationBadge: string;
  hasCycles: boolean;
  hasSelfLoops: boolean;
  placedNodes: Map<number, { x: number; y: number; w: number; h: number; b: HeapBlock }>;
  graphLinks: PlacedGraphLink[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GraphLayoutDetectionResult {
  detectedGraph: DetectedGraph | null;
  graphBlockIds: Set<number>;
  allPlacedGraphNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[];
  maxX: number;
  maxY: number;
}

/**
 * Detects pointer-based graphs in Pointer View and computes deterministic 2D layout.
 * Runs only when structures are not simple trees or linear linked lists.
 */
export function detectPointerViewGraph(
  heapBlocks: HeapBlock[],
  relationships: PointerRelationship[],
  stackVariables: PointerViewVariable[],
  startX: number,
  startY: number,
  treeBlockIds: Set<number>,
): GraphLayoutDetectionResult {
  const activeBlocks = heapBlocks.filter(
    (b) => b.active && !treeBlockIds.has(b.address.id),
  );

  const emptyResult: GraphLayoutDetectionResult = {
    detectedGraph: null,
    graphBlockIds: new Set<number>(),
    allPlacedGraphNodes: [],
    maxX: startX,
    maxY: startY,
  };

  if (activeBlocks.length < 2) {
    // Check if there is a 1-node self-loop
    const selfLoopRel = relationships.find(
      (r) =>
        r.pointerAddress?.space === "heap" &&
        r.targetAddress?.space === "heap" &&
        r.pointerAddress.id === r.targetAddress.id &&
        activeBlocks.some((b) => b.address.id === r.pointerAddress!.id),
    );

    if (!selfLoopRel || activeBlocks.length === 0) {
      return emptyResult;
    }
  }

  const blockMap = new Map<number, HeapBlock>();
  for (const b of activeBlocks) {
    blockMap.set(b.address.id, b);
  }

  // Directed edges between active heap blocks
  const outEdges = new Map<number, { targetId: number; rel: PointerRelationship }[]>();
  const inDegree = new Map<number, number>();

  for (const b of activeBlocks) {
    outEdges.set(b.address.id, []);
    inDegree.set(b.address.id, 0);
  }

  let totalHeapEdges = 0;
  let hasSelfLoop = false;

  for (const rel of relationships) {
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
        totalHeapEdges++;
        if (srcId === tgtId) {
          hasSelfLoop = true;
        }
      }
    }
  }

  if (totalHeapEdges === 0 && !hasSelfLoop) {
    return emptyResult;
  }

  // Check graph evidence:
  // 1. Shared destination (in-degree >= 2)
  // 2. Cycle (or self-loop)
  // 3. Multi-branching (out-degree >= 3)
  // 4. Disconnected components
  let hasSharedTarget = false;
  let maxOutDegree = 0;

  for (const b of activeBlocks) {
    const out = outEdges.get(b.address.id)?.length ?? 0;
    maxOutDegree = Math.max(maxOutDegree, out);
    if ((inDegree.get(b.address.id) ?? 0) >= 2) {
      hasSharedTarget = true;
    }
  }

  // Check cycles via DFS
  let hasCycles = hasSelfLoop;
  if (!hasCycles) {
    const visitedState = new Map<number, "unvisited" | "visiting" | "visited">();
    for (const b of activeBlocks) visitedState.set(b.address.id, "unvisited");

    function dfs(nodeId: number): boolean {
      visitedState.set(nodeId, "visiting");
      for (const e of outEdges.get(nodeId) ?? []) {
        const state = visitedState.get(e.targetId);
        if (state === "visiting") return true;
        if (state === "unvisited" && dfs(e.targetId)) return true;
      }
      visitedState.set(nodeId, "visited");
      return false;
    }

    for (const b of activeBlocks) {
      if (visitedState.get(b.address.id) === "unvisited") {
        if (dfs(b.address.id)) {
          hasCycles = true;
          break;
        }
      }
    }
  }

  // Find components
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const b of activeBlocks) {
    if (visited.has(b.address.id)) continue;
    const comp: number[] = [];
    const queue: number[] = [b.address.id];
    visited.add(b.address.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);

      // Outgoing
      for (const edge of outEdges.get(curr) ?? []) {
        if (!visited.has(edge.targetId)) {
          visited.add(edge.targetId);
          queue.push(edge.targetId);
        }
      }

      // Incoming
      for (const [src, edges] of outEdges.entries()) {
        if (edges.some((e) => e.targetId === curr) && !visited.has(src)) {
          visited.add(src);
          queue.push(src);
        }
      }
    }

    components.push(comp);
  }

  const isDisconnectedGraph = components.length >= 2 && totalHeapEdges >= 2;

  // Disqualification check: if it's purely a single linear linked list without cycles/branches
  const isLinearChain =
    !hasCycles &&
    !hasSharedTarget &&
    maxOutDegree <= 1 &&
    components.length === 1 &&
    activeBlocks.every((b) => (inDegree.get(b.address.id) ?? 0) <= 1);

  // Pure circular linked list: simple cycle with no branches (out-degree 1, in-degree 1)
  // and stack pointer is named head/list
  const isPureCircularList =
    hasCycles &&
    !hasSelfLoop &&
    !hasSharedTarget &&
    maxOutDegree <= 1 &&
    components.length === 1 &&
    activeBlocks.every((b) => (inDegree.get(b.address.id) ?? 0) === 1) &&
    stackVariables.length <= 2 &&
    stackVariables.some((v) => /head|list|first/i.test(v.name));

  if (isLinearChain || isPureCircularList) {
    return emptyResult;
  }

  const isGenuineGraph = hasCycles || hasSharedTarget || isDisconnectedGraph || maxOutDegree >= 3;
  if (!isGenuineGraph) {
    return emptyResult;
  }

  // Qualified as Graph! Compute deterministic layout
  const graphBlockIds = new Set<number>(activeBlocks.map((b) => b.address.id));
  const placedMap = new Map<number, { x: number; y: number; w: number; h: number; b: HeapBlock }>();
  const allPlacedGraphNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[] = [];

  let currY = startY;
  let maxX = startX + HEAP_NODE_W;

  // Helper to test if a directed path exists from `from` to `to` in `outEdges`
  function canReach(from: number, to: number): boolean {
    if (from === to) return true;
    const q = [from];
    const seen = new Set<number>([from]);
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const edge of outEdges.get(curr) ?? []) {
        if (edge.targetId === to) return true;
        if (!seen.has(edge.targetId)) {
          seen.add(edge.targetId);
          q.push(edge.targetId);
        }
      }
    }
    return false;
  }

  for (const comp of components) {
    const nodeLayer = new Map<number, number>();
    const roots = comp.filter((id) => (inDegree.get(id) ?? 0) === 0);
    let entryNode = comp[0];
    if (roots.length === 0) {
      // In a cycle, prioritize the node referenced by the first stack variable
      for (const v of stackVariables) {
        if (
          v.value.kind === "pointer" &&
          v.value.target?.space === "heap" &&
          comp.includes(v.value.target.id)
        ) {
          entryNode = v.value.target.id;
          break;
        }
      }
    }
    const entryNodes = roots.length > 0 ? roots : [entryNode];

    for (const r of entryNodes) {
      nodeLayer.set(r, 0);
    }

    const queue: number[] = [...entryNodes];
    const visitedInComp = new Set<number>(entryNodes);

    while (queue.length > 0) {
      const u = queue.shift()!;
      const uLayer = nodeLayer.get(u) ?? 0;

      for (const edge of outEdges.get(u) ?? []) {
        const v = edge.targetId;
        if (!comp.includes(v)) continue;

        // If v can reach u, then u -> v is a cycle back-edge. Ancestor v must not be pushed down.
        const isBackEdge = canReach(v, u);
        const nextLayer = uLayer + 1;

        if (!visitedInComp.has(v)) {
          visitedInComp.add(v);
          nodeLayer.set(v, nextLayer);
          queue.push(v);
        } else if (!isBackEdge && nextLayer > (nodeLayer.get(v) ?? 0)) {
          nodeLayer.set(v, nextLayer);
          queue.push(v);
        }
      }
    }

    for (const id of comp) {
      if (!nodeLayer.has(id)) nodeLayer.set(id, 0);
    }

    // Group nodes by layer
    const layers = new Map<number, number[]>();
    for (const id of comp) {
      const l = nodeLayer.get(id)!;
      const list = layers.get(l) ?? [];
      list.push(id);
      layers.set(l, list);
    }

    const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);

    // Compute max layer width across all layers in this component for centering
    let maxLayerWidth = 0;
    for (const l of sortedLayers) {
      const count = layers.get(l)!.length;
      const lw = count * HEAP_NODE_W + (count - 1) * H_GAP;
      maxLayerWidth = Math.max(maxLayerWidth, lw);
    }

    let compMaxX = startX + maxLayerWidth;

    for (const l of sortedLayers) {
      const nodesInLayer = layers.get(l)!;
      const y = currY + l * (HEAP_NODE_H + LEVEL_V_GAP);
      const layerWidth = nodesInLayer.length * HEAP_NODE_W + (nodesInLayer.length - 1) * H_GAP;
      const layerOffset = Math.max(0, (maxLayerWidth - layerWidth) / 2);

      for (let i = 0; i < nodesInLayer.length; i++) {
        const id = nodesInLayer[i];
        const b = blockMap.get(id)!;
        const x = startX + layerOffset + i * (HEAP_NODE_W + H_GAP);
        const nodeItem = { x, y, w: HEAP_NODE_W, h: HEAP_NODE_H, b };

        placedMap.set(id, nodeItem);
        allPlacedGraphNodes.push(nodeItem);
      }
    }

    maxX = Math.max(maxX, compMaxX);
    const compH =
      sortedLayers.length > 0
        ? (sortedLayers[sortedLayers.length - 1] + 1) * (HEAP_NODE_H + LEVEL_V_GAP)
        : HEAP_NODE_H;

    currY += compH + COMPONENT_GAP;
  }

  // Build SVG path links
  const graphLinks: PlacedGraphLink[] = [];
  const multiEdgeCounts = new Map<string, number>();

  for (const b of activeBlocks) {
    const srcCoords = placedMap.get(b.address.id);
    if (!srcCoords) continue;

    for (const edge of outEdges.get(b.address.id) ?? []) {
      const tgtCoords = placedMap.get(edge.targetId);
      if (!tgtCoords) continue;

      const fieldName = edge.rel.fieldName ?? "next";
      const edgeColor = getFieldColor(fieldName, edge.rel.status);

      // 1. Self-loop
      if (edge.targetId === b.address.id) {
        const x1 = srcCoords.x + srcCoords.w - 28;
        const y1 = srcCoords.y;
        const x2 = srcCoords.x + 28;
        const y2 = srcCoords.y;
        const loopH = 34;

        const pathD = `M ${x1} ${y1} C ${x1 + 14} ${y1 - loopH}, ${x2 - 14} ${y2 - loopH}, ${x2} ${y2}`;

        graphLinks.push({
          id: `g_link_${b.address.id}_self`,
          sourceId: b.address.id,
          targetId: b.address.id,
          x1,
          y1,
          x2,
          y2,
          pathD,
          color: edgeColor,
          label: fieldName,
          isSelfLoop: true,
          labelX: srcCoords.x + srcCoords.w / 2,
          labelY: srcCoords.y - loopH - 4,
        });
        continue;
      }

      // 2. Directed link
      const pairKey = `${b.address.id}->${edge.targetId}`;
      const pairIdx = multiEdgeCounts.get(pairKey) ?? 0;
      multiEdgeCounts.set(pairKey, pairIdx + 1);

      const isDownward = tgtCoords.y > srcCoords.y;
      const isSameLayer = tgtCoords.y === srcCoords.y;

      let pathD: string;
      let x1: number, y1: number, x2: number, y2: number;
      let labelX: number, labelY: number;

      if (isDownward) {
        // Forward downward edge: distribute exit and entry anchors based on relative direction
        const dx = tgtCoords.x - srcCoords.x;
        const srcRatio = dx < -20 ? 0.35 : dx > 20 ? 0.65 : 0.5;
        const tgtRatio = dx < -20 ? 0.68 : dx > 20 ? 0.32 : 0.5;

        x1 = srcCoords.x + srcCoords.w * srcRatio + pairIdx * 12;
        y1 = srcCoords.y + srcCoords.h;
        x2 = tgtCoords.x + tgtCoords.w * tgtRatio + pairIdx * 12;
        y2 = tgtCoords.y;

        const dy = y2 - y1;
        const cp = Math.max(20, dy * 0.45);
        pathD = `M ${x1} ${y1} C ${x1} ${y1 + cp}, ${x2} ${y2 - cp}, ${x2} ${y2}`;

        labelX = (x1 + x2) / 2;
        labelY = (y1 + y2) / 2;
      } else if (isSameLayer) {
        // Horizontal connection on same layer
        const isFwd = tgtCoords.x > srcCoords.x;
        x1 = isFwd ? srcCoords.x + srcCoords.w : srcCoords.x;
        y1 = srcCoords.y + srcCoords.h * 0.5 + (pairIdx > 0 ? (isFwd ? 8 : -8) : 0);
        x2 = isFwd ? tgtCoords.x : tgtCoords.x + tgtCoords.w;
        y2 = tgtCoords.y + tgtCoords.h * 0.5 + (pairIdx > 0 ? (isFwd ? 8 : -8) : 0);

        const dx = Math.abs(x2 - x1);
        const cp = Math.max(14, dx * 0.35);
        const arch = isFwd ? -12 : 12;

        pathD = `M ${x1} ${y1} C ${x1 + (isFwd ? cp : -cp)} ${y1 + arch}, ${x2 - (isFwd ? cp : -cp)} ${y2 + arch}, ${x2} ${y2}`;

        labelX = (x1 + x2) / 2;
        labelY = (y1 + y2) / 2 + (isFwd ? -14 : 14);
      } else {
        // Upward edge (cycle back-edge)
        // Route around the outer perimeter on the side closest to the source node
        const isLeftOfTarget = srcCoords.x + srcCoords.w / 2 < tgtCoords.x + tgtCoords.w / 2;

        if (isLeftOfTarget) {
          x1 = srcCoords.x;
          y1 = srcCoords.y + srcCoords.h * 0.45 + pairIdx * 8;
          x2 = tgtCoords.x;
          y2 = tgtCoords.y + tgtCoords.h * 0.55 + pairIdx * 8;

          const minXVal = Math.min(x1, x2);
          const loopX = Math.max(12, minXVal - 26 - pairIdx * 14);
          pathD = `M ${x1} ${y1} C ${loopX} ${y1}, ${loopX} ${y2}, ${x2} ${y2}`;

          labelX = (minXVal + loopX) / 2;
          labelY = (y1 + y2) / 2;
        } else {
          x1 = srcCoords.x + srcCoords.w;
          y1 = srcCoords.y + srcCoords.h * 0.45 + pairIdx * 8;
          x2 = tgtCoords.x + tgtCoords.w;
          y2 = tgtCoords.y + tgtCoords.h * 0.55 + pairIdx * 8;

          const maxXVal = Math.max(x1, x2);
          const loopX = maxXVal + 26 + pairIdx * 14;
          pathD = `M ${x1} ${y1} C ${loopX} ${y1}, ${loopX} ${y2}, ${x2} ${y2}`;

          labelX = (maxXVal + loopX) / 2;
          labelY = (y1 + y2) / 2;
          maxX = Math.max(maxX, loopX + 30);
        }
      }

      graphLinks.push({
        id: `g_link_${b.address.id}_${edge.targetId}_${pairIdx}`,
        sourceId: b.address.id,
        targetId: edge.targetId,
        x1,
        y1,
        x2,
        y2,
        pathD,
        color: edgeColor,
        label: fieldName,
        isSelfLoop: false,
        labelX,
        labelY,
      });
    }
  }

  const detectedGraph: DetectedGraph = {
    representationBadge: "Representation: Pointer Graph",
    hasCycles,
    hasSelfLoops: hasSelfLoop,
    placedNodes: placedMap,
    graphLinks,
    minX: startX,
    maxX,
    minY: startY,
    maxY: currY,
  };

  return {
    detectedGraph,
    graphBlockIds,
    allPlacedGraphNodes,
    maxX,
    maxY: currY,
  };
}
