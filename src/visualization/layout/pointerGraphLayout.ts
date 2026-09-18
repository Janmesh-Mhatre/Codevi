import type { StructureNode, StructureLink, PlacedNode, PlacedLink, LayoutRect } from "../models/structureTypes";
import {
  routeConnector,
  getStatusColor,
  getStatusDash,
  getMarkerId,
} from "../connectors/connectorRouting";

export const PG_NODE_W = 160;
export const PG_NODE_H = 38;
export const PG_ARRAY_HEADER_H = 24;
export const PG_HEAP_NODE_W = 180;
export const PG_HEAP_NODE_H = 56;
export const PG_COL_GAP = 200;
export const PG_ROW_GAP = 16;
export const PG_PAD = 24;
export const PG_NULL_NODE_W = 64;
export const PG_NULL_NODE_H = 28;

export interface PointerGraphLayoutResult {
  stackNodes: PlacedNode[];
  heapNodes: PlacedNode[];
  placedLinks: PlacedLink[];
  nullNodeRect: LayoutRect | null;
  width: number;
  height: number;
}

/**
 * Computes 2-column layout for pointer graphs (Stack column on left,
 * Heap column on right, NULL node in the center gap) with routed SVG links.
 */
export function layoutPointerGraph(
  nodes: StructureNode[],
  links: StructureLink[],
): PointerGraphLayoutResult {
  const stackNodes: PlacedNode[] = [];
  const heapNodes: PlacedNode[] = [];

  let stackY = PG_PAD + 20; // Room for STACK column label
  const heapX = PG_PAD + PG_NODE_W + PG_COL_GAP;
  let heapY = PG_PAD + 20;  // Room for HEAP column label

  for (const node of nodes) {
    if (node.id.startsWith("heap:")) {
      heapNodes.push({
        x: heapX,
        y: heapY,
        w: PG_HEAP_NODE_W,
        h: PG_HEAP_NODE_H,
        node,
      });
      heapY += PG_HEAP_NODE_H + PG_ROW_GAP;
    } else {
      const isArray = node.kind === "array";
      const h = isArray ? PG_ARRAY_HEADER_H + PG_NODE_H : PG_NODE_H;
      stackNodes.push({
        x: PG_PAD,
        y: stackY,
        w: PG_NODE_W,
        h,
        node,
      });
      stackY += h + PG_ROW_GAP;
    }
  }

  // Check for NULL targets
  const hasNull = links.some((l) => l.status === "null");
  const nullNodeRect: LayoutRect | null = hasNull
    ? {
        x: PG_PAD + PG_NODE_W + PG_COL_GAP / 2 - PG_NULL_NODE_W / 2,
        y: stackY + 8,
        w: PG_NULL_NODE_W,
        h: PG_NULL_NODE_H,
      }
    : null;

  // Route connections
  const placedLinks: PlacedLink[] = [];
  let stackToStackIndex = 0;

  for (const link of links) {
    const srcNode = stackNodes.find((n) => n.node.id === link.sourceNodeId);
    if (!srcNode) continue;

    const x1 = srcNode.x + srcNode.w;
    const y1 = srcNode.y + srcNode.h / 2;

    let x2 = 0;
    let y2 = 0;

    if (link.status === "null") {
      if (nullNodeRect) {
        x2 = nullNodeRect.x;
        y2 = nullNodeRect.y + nullNodeRect.h / 2;
      }
    } else if (link.targetNodeId?.startsWith("heap:")) {
      const tgtNode = heapNodes.find((n) => n.node.id === link.targetNodeId);
      if (tgtNode) {
        x2 = tgtNode.x;
        y2 = tgtNode.y + tgtNode.h / 2;
      }
    } else if (link.targetNodeId) {
      const tgtNode = stackNodes.find((n) => n.node.id === link.targetNodeId);
      if (tgtNode) {
        x2 = tgtNode.x + tgtNode.w;
        y2 = tgtNode.y + tgtNode.h / 2;
        if (tgtNode.node.kind === "array" && link.targetSlotIndex > 0) {
          y2 = tgtNode.y + PG_NODE_H + PG_ARRAY_HEADER_H / 2;
        }
      }
    }

    if (x2 === 0 && y2 === 0 && link.status !== "null") continue;

    const tierIdx = link.routingStyle === "outward-loop" ? stackToStackIndex++ : 0;
    const pathD = routeConnector(x1, y1, x2, y2, link.routingStyle, tierIdx);

    placedLinks.push({
      link,
      pathD,
      markerId: getMarkerId(link.status),
      color: getStatusColor(link.status),
      dash: getStatusDash(link.status),
    });
  }

  const width = heapX + PG_HEAP_NODE_W + PG_PAD;
  const height = Math.max(
    stackY,
    heapY,
    nullNodeRect ? nullNodeRect.y + nullNodeRect.h + PG_PAD : 0
  ) + PG_PAD;

  return {
    stackNodes,
    heapNodes,
    placedLinks,
    nullNodeRect,
    width,
    height,
  };
}
