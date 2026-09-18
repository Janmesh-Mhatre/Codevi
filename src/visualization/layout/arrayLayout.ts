import type { StructureNode, PlacedNode } from "../models/structureTypes";

export const ARRAY_SLOT_W = 54;
export const ARRAY_SLOT_H = 46;
export const ARRAY_HEADER_H = 28;
export const ARRAY_PAD = 16;
export const ARRAY_ROW_GAP = 24;

export interface ArrayLayoutResult {
  placedNodes: PlacedNode[];
  width: number;
  height: number;
}

/**
 * Computes exact positions and bounding boxes for array structures.
 * Lays out contiguous slots horizontally with clear index badges,
 * values, and address information.
 */
export function layoutArrayStructures(
  nodes: StructureNode[],
  startX: number = ARRAY_PAD,
  startY: number = ARRAY_PAD,
): ArrayLayoutResult {
  const placedNodes: PlacedNode[] = [];
  let currentY = startY;
  let maxWidth = 300;

  for (const node of nodes) {
    const is2D = typeof node.metadata?.rows === "number" && typeof node.metadata?.cols === "number";
    const rows = is2D ? (node.metadata!.rows as number) : 1;
    const cols = is2D ? (node.metadata!.cols as number) : Math.max(1, node.slots.length);
    const contentW = cols * ARRAY_SLOT_W + 24;
    const cardW = Math.max(220, contentW);
    /** Phase 6.1: account for active index tags stacked above slots. */
    const maxTagLayers = node.slots.reduce(
      (max, s) => Math.max(max, (s.activeIndexTags?.length ?? 0)),
      0,
    );
    const tagExtraH = maxTagLayers * 14;
    const cardH = ARRAY_HEADER_H + rows * ARRAY_SLOT_H + (rows - 1) * 6 + 20 + tagExtraH;

    placedNodes.push({
      x: startX,
      y: currentY,
      w: cardW,
      h: cardH,
      node,
    });

    if (startX + cardW + ARRAY_PAD > maxWidth) {
      maxWidth = startX + cardW + ARRAY_PAD;
    }

    currentY += cardH + ARRAY_ROW_GAP;
  }

  return {
    placedNodes,
    width: maxWidth,
    height: currentY + ARRAY_PAD,
  };
}
