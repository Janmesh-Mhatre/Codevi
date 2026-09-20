import type {
  StructureNode,
  StructureLink,
  PlacedNode,
  PlacedLink,
  LayoutRect,
} from "../models/structureTypes";
import { getStatusColor, getStatusDash, getMarkerId } from "../connectors/connectorRouting";

export const LL_NODE_W = 164;
export const LL_NODE_H = 80;
export const LL_COL_GAP = 64;
export const LL_ROW_GAP = 40;
export const LL_PAD = 24;
export const LL_NULL_W = 54;
export const LL_NULL_H = 34;

export interface LinkedListLayoutResult {
  placedNodes: PlacedNode[];
  placedLinks: PlacedLink[];
  nullNodeRect: LayoutRect | null;
  width: number;
  height: number;
}

/**
 * Computes horizontal linear layout for linked list chains with dual-compartment
 * nodes ([ data | next ]), direct horizontal connectors, and terminal NULL badge.
 */
export function layoutLinkedListStructures(
  nodes: StructureNode[],
  links: StructureLink[],
  startX: number = LL_PAD,
  startY: number = LL_PAD,
): LinkedListLayoutResult {
  const placedNodes: PlacedNode[] = [];
  const placedLinks: PlacedLink[] = [];

  let currentX = startX;
  const currentY = startY + 20; // Room for traversal tags floating above

  // Map for fast node coordinate lookup
  const nodeRectMap = new Map<string, LayoutRect>();

  for (const node of nodes) {
    const maxTagLayers = node.slots.reduce(
      (max, s) => Math.max(max, s.activeIndexTags?.length ?? 0),
      0,
    );
    const tagExtraH = maxTagLayers * 14;
    const nodeH = LL_NODE_H + tagExtraH;

    const rect: LayoutRect = {
      x: currentX,
      y: currentY - tagExtraH,
      w: LL_NODE_W,
      h: nodeH,
    };

    placedNodes.push({
      ...rect,
      node,
    });

    nodeRectMap.set(node.id, rect);
    currentX += LL_NODE_W + LL_COL_GAP;
  }

  // Check for NULL terminal link
  const nullLink = links.find((l) => l.status === "null");
  const nullNodeRect: LayoutRect | null = nullLink
    ? {
        x: currentX - LL_COL_GAP / 2 + 10,
        y: currentY + 24,
        w: LL_NULL_W,
        h: LL_NULL_H,
      }
    : null;

  // Route connections between nodes
  for (const link of links) {
    const srcRect = nodeRectMap.get(link.sourceNodeId);
    if (!srcRect) continue;

    // Anchor at the center-right of the "next" compartment (slot 1)
    const startX = srcRect.x + srcRect.w;
    const startY = srcRect.y + srcRect.h - 22;

    let endX: number;
    let endY: number;
    let pathD: string;

    if (link.status === "null" && nullNodeRect) {
      endX = nullNodeRect.x;
      endY = nullNodeRect.y + nullNodeRect.h / 2;
      pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
    } else if (link.targetNodeId && nodeRectMap.has(link.targetNodeId)) {
      const tgtRect = nodeRectMap.get(link.targetNodeId)!;
      endX = tgtRect.x;
      endY = tgtRect.y + tgtRect.h - 22;

      if (endX < startX) {
        // Backward / cycle link: route in an outward curve underneath
        const arcY = Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + 40;
        pathD = `M ${startX} ${startY} C ${startX + 30} ${arcY}, ${endX - 30} ${arcY}, ${endX} ${endY}`;
      } else {
        pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
      }
    } else {
      continue;
    }

    placedLinks.push({
      link,
      pathD,
      color: getStatusColor(link.status),
      dash: getStatusDash(link.status),
      markerId: getMarkerId(link.status),
    });
  }

  const totalWidth = Math.max(
    300,
    nullNodeRect ? nullNodeRect.x + nullNodeRect.w + LL_PAD : currentX + LL_PAD,
  );
  const totalHeight = currentY + LL_NODE_H + 60;

  return {
    placedNodes,
    placedLinks,
    nullNodeRect,
    width: totalWidth,
    height: totalHeight,
  };
}
