import type {
  StructureNode,
  StructureLink,
  PlacedNode,
  PlacedLink,
} from "../models/structureTypes";
import {
  getStatusColor,
  getStatusDash,
  getMarkerId,
} from "../connectors/connectorRouting";

export const GRAPH_NODE_W = 160;
export const GRAPH_NODE_H = 56;
export const GRAPH_H_GAP = 44;
export const GRAPH_LEVEL_V_GAP = 64;
export const GRAPH_COMPONENT_GAP = 60;
export const GRAPH_HEADER_CLEARANCE = 64;

export interface GraphLayoutResult {
  placedNodes: PlacedNode[];
  placedLinks: PlacedLink[];
  width: number;
  height: number;
}

/**
 * Computes deterministic, collision-aware coordinates for graph nodes and links.
 * Handles multiple incoming/outgoing edges, cycles, self-loops, and disconnected components.
 */
export function layoutGraphStructures(
  nodes: StructureNode[],
  links: StructureLink[],
  startX = 24,
  startY = 24,
): GraphLayoutResult {
  if (nodes.length === 0) {
    return { placedNodes: [], placedLinks: [], width: 0, height: 0 };
  }

  const nodeMap = new Map<string, StructureNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Adjacency graph
  const outNeighbors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    outNeighbors.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  for (const link of links) {
    if (!link.targetNodeId || !nodeMap.has(link.targetNodeId)) continue;
    if (link.sourceNodeId !== link.targetNodeId) {
      outNeighbors.get(link.sourceNodeId)?.push(link.targetNodeId);
      inDegree.set(link.targetNodeId, (inDegree.get(link.targetNodeId) ?? 0) + 1);
    }
  }

  // Find weakly connected components
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const queue: string[] = [n.id];
    visited.add(n.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);

      // Outgoing
      for (const tgt of outNeighbors.get(curr) ?? []) {
        if (!visited.has(tgt)) {
          visited.add(tgt);
          queue.push(tgt);
        }
      }

      // Incoming
      for (const [src, neighbors] of outNeighbors.entries()) {
        if (neighbors.includes(curr) && !visited.has(src)) {
          visited.add(src);
          queue.push(src);
        }
      }
    }

    components.push(comp);
  }

  const placedNodes: PlacedNode[] = [];
  const placedNodeCoords = new Map<string, { x: number; y: number; w: number; h: number }>();

  // Provide initial header/badge clearance above layer 0
  let currY = startY + GRAPH_HEADER_CLEARANCE;
  let maxTotalW = startX;

  // Helper to test if a directed path exists from `from` to `to` in `outNeighbors`
  const reachCache = new Map<string, boolean>();
  function canReach(from: string, to: string): boolean {
    if (from === to) return true;
    const cacheKey = `${from}->${to}`;
    if (reachCache.has(cacheKey)) return reachCache.get(cacheKey)!;

    const q = [from];
    const seen = new Set<string>([from]);
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const tgt of outNeighbors.get(curr) ?? []) {
        if (tgt === to) {
          reachCache.set(cacheKey, true);
          return true;
        }
        if (!seen.has(tgt)) {
          seen.add(tgt);
          q.push(tgt);
        }
      }
    }
    reachCache.set(cacheKey, false);
    return false;
  }

  // Process each component
  for (const comp of components) {
    // Determine layer for each node in this component
    const nodeLayer = new Map<string, number>();

    // Potential roots: in-degree 0 in this component
    const roots = comp.filter((id) => (inDegree.get(id) ?? 0) === 0);
    // If entire component is a cycle, pick first node as root
    const entryNodes = roots.length > 0 ? roots : [comp[0]];

    for (const r of entryNodes) {
      nodeLayer.set(r, 0);
    }

    // BFS with cycle-breaking to compute layer depths
    const queue: string[] = [...entryNodes];
    const visitedInComp = new Set<string>(entryNodes);
    let iterations = 0;
    const maxIterations = comp.length * 10;

    while (queue.length > 0 && ++iterations <= maxIterations) {
      const u = queue.shift()!;
      const uLayer = nodeLayer.get(u) ?? 0;

      for (const v of outNeighbors.get(u) ?? []) {
        if (!comp.includes(v)) continue;

        const isBackEdge = canReach(v, u);
        const nextLayer = uLayer + 1;

        if (!visitedInComp.has(v)) {
          visitedInComp.add(v);
          nodeLayer.set(v, nextLayer);
          queue.push(v);
        } else if (!isBackEdge && nextLayer < comp.length && nextLayer > (nodeLayer.get(v) ?? 0)) {
          nodeLayer.set(v, nextLayer);
          queue.push(v);
        }
      }
    }

    // Fallback: any node in component not reached gets layer 0
    for (const id of comp) {
      if (!nodeLayer.has(id)) {
        nodeLayer.set(id, 0);
      }
    }

    // Group nodes by layer
    const layers = new Map<number, string[]>();
    for (const id of comp) {
      const l = nodeLayer.get(id)!;
      const list = layers.get(l) ?? [];
      list.push(id);
      layers.set(l, list);
    }

    const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);
    let maxLayerWidth = 0;
    for (const l of sortedLayers) {
      const count = layers.get(l)!.length;
      const lw = count * GRAPH_NODE_W + (count - 1) * GRAPH_H_GAP;
      maxLayerWidth = Math.max(maxLayerWidth, lw);
    }
    let compMaxX = startX + maxLayerWidth;

    for (const l of sortedLayers) {
      const nodesInLayer = layers.get(l)!;
      const y = currY + l * (GRAPH_NODE_H + GRAPH_LEVEL_V_GAP);
      const layerWidth = nodesInLayer.length * GRAPH_NODE_W + (nodesInLayer.length - 1) * GRAPH_H_GAP;
      const layerOffset = Math.max(0, (maxLayerWidth - layerWidth) / 2);

      for (let i = 0; i < nodesInLayer.length; i++) {
        const id = nodesInLayer[i];
        const node = nodeMap.get(id)!;
        const x = startX + layerOffset + i * (GRAPH_NODE_W + GRAPH_H_GAP);
        const coords = { x, y, w: GRAPH_NODE_W, h: GRAPH_NODE_H };

        placedNodes.push({ ...coords, node });
        placedNodeCoords.set(id, coords);
      }
    }

    maxTotalW = Math.max(maxTotalW, compMaxX);
    const compHeight =
      sortedLayers.length > 0
        ? (sortedLayers[sortedLayers.length - 1] + 1) * (GRAPH_NODE_H + GRAPH_LEVEL_V_GAP)
        : GRAPH_NODE_H;

    currY += compHeight + GRAPH_COMPONENT_GAP;
  }

  // Route connections
  const placedLinks: PlacedLink[] = [];
  const multiEdgeCounts = new Map<string, number>();

  for (const link of links) {
    const srcCoords = placedNodeCoords.get(link.sourceNodeId);
    if (!srcCoords) continue;

    // 1. Self-loop (routed below the node's bottom boundary)
    if (link.targetNodeId === link.sourceNodeId) {
      const x1 = srcCoords.x + srcCoords.w - 24;
      const y1 = srcCoords.y + srcCoords.h;
      const x2 = srcCoords.x + 24;
      const y2 = srcCoords.y + srcCoords.h;
      const loopHeight = 34;

      const pathD = `M ${x1} ${y1} C ${x1 + 16} ${y1 + loopHeight}, ${x2 - 16} ${y2 + loopHeight}, ${x2} ${y2}`;
      const labelX = (x1 + x2) / 2;
      const labelY = y1 + loopHeight + 14;

      placedLinks.push({
        link,
        pathD,
        markerId: getMarkerId(link.status),
        color: getStatusColor(link.status),
        dash: getStatusDash(link.status),
        labelX,
        labelY,
      });
      continue;
    }

    // 2. Directed link to other node
    const tgtCoords = link.targetNodeId ? placedNodeCoords.get(link.targetNodeId) : null;
    if (!tgtCoords) continue;

    const pairKey = `${link.sourceNodeId}->${link.targetNodeId}`;
    const pairIndex = multiEdgeCounts.get(pairKey) ?? 0;
    multiEdgeCounts.set(pairKey, pairIndex + 1);

    const isDownward = tgtCoords.y > srcCoords.y;
    const isSameLayer = tgtCoords.y === srcCoords.y;

    let pathD: string;
    let labelX: number;
    let labelY: number;

    if (isDownward) {
      const minY = srcCoords.y + srcCoords.h;
      const maxY = tgtCoords.y;

      let hasObstacle = false;
      let maxObstacleRight = Math.max(srcCoords.x + srcCoords.w, tgtCoords.x + tgtCoords.w);

      for (const [nodeId, node] of placedNodeCoords.entries()) {
        if (nodeId === link.sourceNodeId || nodeId === link.targetNodeId) continue;
        const vertBetween = node.y + 4 < maxY && node.y + node.h - 4 > minY;
        if (!vertBetween) continue;

        const corridorLeft = Math.min(srcCoords.x, tgtCoords.x) - 16;
        const corridorRight = Math.max(srcCoords.x + srcCoords.w, tgtCoords.x + tgtCoords.w) + 16;
        if (node.x + node.w > corridorLeft && node.x < corridorRight) {
          hasObstacle = true;
          maxObstacleRight = Math.max(maxObstacleRight, node.x + node.w);
        }
      }

      if (hasObstacle) {
        // Skip-layer cross-edge: route around intermediate obstacles on the outer right perimeter
        const loopX = maxObstacleRight + 32 + pairIndex * 14;
        const x1 = srcCoords.x + srcCoords.w;
        const y1 = srcCoords.y + srcCoords.h * 0.5;
        const x2 = tgtCoords.x + tgtCoords.w;
        const y2 = tgtCoords.y + tgtCoords.h * 0.5;

        pathD = `M ${x1} ${y1} C ${loopX} ${y1}, ${loopX} ${y2}, ${x2} ${y2}`;
        labelX = loopX + 10;
        labelY = (y1 + y2) / 2;
        maxTotalW = Math.max(maxTotalW, loopX + 30);
      } else {
        // Normal downward / forward edge
        const dx = tgtCoords.x - srcCoords.x;
        const srcRatio = dx < -20 ? 0.35 : dx > 20 ? 0.65 : 0.5;
        const tgtRatio = dx < -20 ? 0.68 : dx > 20 ? 0.32 : 0.5;

        const x1 = srcCoords.x + srcCoords.w * srcRatio + pairIndex * 12;
        const y1 = srcCoords.y + srcCoords.h;
        const x2 = tgtCoords.x + tgtCoords.w * tgtRatio + pairIndex * 12;
        const y2 = tgtCoords.y;
        const dy = y2 - y1;
        const cp = Math.max(20, dy * 0.45);

        pathD = `M ${x1} ${y1} C ${x1} ${y1 + cp}, ${x2} ${y2 - cp}, ${x2} ${y2}`;
        labelX = (x1 + x2) / 2 + (pairIndex > 0 ? 10 : 0);
        labelY = (y1 + y2) / 2;
      }
    } else if (isSameLayer) {
      const isForward = tgtCoords.x > srcCoords.x;
      const leftLimit = Math.min(srcCoords.x + srcCoords.w, tgtCoords.x + tgtCoords.w);
      const rightLimit = Math.max(srcCoords.x, tgtCoords.x);

      // Find any intermediate nodes on this layer between source and target
      const obstaclesOnLayer: { x: number; y: number; w: number; h: number }[] = [];
      for (const [nodeId, node] of placedNodeCoords.entries()) {
        if (nodeId === link.sourceNodeId || nodeId === link.targetNodeId) continue;
        if (Math.abs(node.y - srcCoords.y) < 10) {
          if (node.x + node.w > leftLimit && node.x < rightLimit) {
            obstaclesOnLayer.push(node);
          }
        }
      }

      if (obstaclesOnLayer.length > 0) {
        // Priority 1: Route around obstructing node(s) with clear minimum clearance
        if (isForward) {
          // Forward cross-edge (e.g. B -> D around C): route cleanly ABOVE the obstacle node(s)
          const minObsY = Math.min(...obstaclesOnLayer.map((o) => o.y));
          const clearanceGap = 26 + pairIndex * 14;
          const yArch = minObsY - clearanceGap;

          const x1 = srcCoords.x + srcCoords.w * 0.75;
          const y1 = srcCoords.y;
          const x2 = tgtCoords.x + tgtCoords.w * 0.25;
          const y2 = tgtCoords.y;

          pathD = `M ${x1} ${y1} C ${x1} ${yArch}, ${x2} ${yArch}, ${x2} ${y2}`;
          labelX = (x1 + x2) / 2;
          labelY = yArch - 8;
        } else {
          // Backward cross-edge (e.g. D -> B around C): route cleanly BELOW the obstacle node(s)
          const maxObsBottom = Math.max(...obstaclesOnLayer.map((o) => o.y + o.h));
          const hasSelfLoopBelow = links.some(
            (l) =>
              l.sourceNodeId === l.targetNodeId &&
              obstaclesOnLayer.some((o) => {
                const c = placedNodeCoords.get(l.sourceNodeId);
                return c && c.x === o.x && c.y === o.y;
              }),
          );
          const loopAllowance = hasSelfLoopBelow ? 38 : 0;
          const clearanceGap = 26 + loopAllowance + pairIndex * 14;
          const yArch = maxObsBottom + clearanceGap;

          const x1 = srcCoords.x + srcCoords.w * 0.25;
          const y1 = srcCoords.y + srcCoords.h;
          const x2 = tgtCoords.x + tgtCoords.w * 0.75;
          const y2 = tgtCoords.y + tgtCoords.h;

          pathD = `M ${x1} ${y1} C ${x1} ${yArch}, ${x2} ${yArch}, ${x2} ${y2}`;
          labelX = (x1 + x2) / 2;
          labelY = yArch + 14;
        }
      } else {
        // Adjacent nodes on same layer: short direct connector in the horizontal gap
        const x1 = isForward ? srcCoords.x + srcCoords.w : srcCoords.x;
        const y1 = srcCoords.y + srcCoords.h * 0.5 + (pairIndex > 0 ? (isForward ? 8 : -8) : 0);
        const x2 = isForward ? tgtCoords.x : tgtCoords.x + tgtCoords.w;
        const y2 = tgtCoords.y + tgtCoords.h * 0.5 + (pairIndex > 0 ? (isForward ? 8 : -8) : 0);
        const dx = Math.abs(x2 - x1);
        const cp = Math.max(14, dx * 0.35);
        const arch = isForward ? -12 : 12;

        pathD = `M ${x1} ${y1} C ${x1 + (isForward ? cp : -cp)} ${y1 + arch}, ${x2 - (isForward ? cp : -cp)} ${y2 + arch}, ${x2} ${y2}`;
        labelX = (x1 + x2) / 2;
        labelY = (y1 + y2) / 2 + (isForward ? -14 : 14);
      }
    } else {
      // Upward edge (cycle back-edge): route smoothly around outer perimeter
      const isLeftOfTarget = srcCoords.x + srcCoords.w / 2 < tgtCoords.x + tgtCoords.w / 2;
      const minY = Math.min(srcCoords.y, tgtCoords.y);
      const maxY = Math.max(srcCoords.y + srcCoords.h, tgtCoords.y + tgtCoords.h);

      if (isLeftOfTarget) {
        let minLeft = Math.min(srcCoords.x, tgtCoords.x);
        for (const [id, node] of placedNodeCoords.entries()) {
          if (id === link.sourceNodeId || id === link.targetNodeId) continue;
          if (node.y + node.h > minY && node.y < maxY) {
            if (node.x + node.w <= Math.max(srcCoords.x, tgtCoords.x) + 16) {
              minLeft = Math.min(minLeft, node.x);
            }
          }
        }
        const x1 = srcCoords.x;
        const y1 = srcCoords.y + srcCoords.h * 0.45 + pairIndex * 8;
        const x2 = tgtCoords.x;
        const y2 = tgtCoords.y + tgtCoords.h * 0.55 + pairIndex * 8;

        const loopX = Math.max(12, minLeft - 26 - pairIndex * 14);
        pathD = `M ${x1} ${y1} C ${loopX} ${y1}, ${loopX} ${y2}, ${x2} ${y2}`;
        labelX = loopX - 10;
        labelY = (y1 + y2) / 2;
      } else {
        let maxRight = Math.max(srcCoords.x + srcCoords.w, tgtCoords.x + tgtCoords.w);
        for (const [id, node] of placedNodeCoords.entries()) {
          if (id === link.sourceNodeId || id === link.targetNodeId) continue;
          if (node.y + node.h > minY && node.y < maxY) {
            if (node.x >= Math.min(srcCoords.x, tgtCoords.x) - 16) {
              maxRight = Math.max(maxRight, node.x + node.w);
            }
          }
        }
        const x1 = srcCoords.x + srcCoords.w;
        const y1 = srcCoords.y + srcCoords.h * 0.45 + pairIndex * 8;
        const x2 = tgtCoords.x + tgtCoords.w;
        const y2 = tgtCoords.y + tgtCoords.h * 0.55 + pairIndex * 8;

        const loopX = maxRight + 26 + pairIndex * 14;
        pathD = `M ${x1} ${y1} C ${loopX} ${y1}, ${loopX} ${y2}, ${x2} ${y2}`;
        maxTotalW = Math.max(maxTotalW, loopX + 30);
        labelX = loopX + 10;
        labelY = (y1 + y2) / 2;
      }
    }

    placedLinks.push({
      link,
      pathD,
      markerId: getMarkerId(link.status),
      color: getStatusColor(link.status),
      dash: getStatusDash(link.status),
      labelX,
      labelY,
    });
  }

  const finalWidth = maxTotalW + startX + 50;
  const finalHeight = currY + 40;

  return {
    placedNodes,
    placedLinks,
    width: finalWidth,
    height: finalHeight,
  };
}
