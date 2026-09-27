import type {
  StructureNode,
  StructureLink,
  PlacedNode,
  PlacedLink,
  LayoutRect,
} from "../models/structureTypes";
import { getStatusDash, getFieldColor, getMarkerForColor } from "../connectors/connectorRouting";

// ─── Layout constants ───────────────────────────────────────────────
export const TREE_NODE_W = 120;
export const TREE_NODE_H = 64;
export const TREE_LEVEL_GAP = 80;
export const TREE_SIBLING_GAP = 32;
export const TREE_PAD = 24;
export const TREE_NULL_W = 40;
export const TREE_NULL_H = 24;

export interface TreeLayoutResult {
  placedNodes: PlacedNode[];
  placedLinks: PlacedLink[];
  nullBadges: LayoutRect[];
  width: number;
  height: number;
}

// ─── Internal positioning helpers ───────────────────────────────────

interface TreePosNode {
  nodeId: string;
  structureNode: StructureNode;
  leftChild: TreePosNode | null;
  rightChild: TreePosNode | null;
  // Computed layout
  x: number;
  y: number;
  subtreeWidth: number;
}

/**
 * Builds a logical tree from flat StructureNode[] and StructureLink[].
 * Returns root(s) as TreePosNode(s).
 */
function buildLogicalTree(
  nodes: StructureNode[],
  links: StructureLink[],
): TreePosNode[] {
  const nodeMap = new Map<string, StructureNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Track children per node
  const childrenMap = new Map<string, { left: string | null; right: string | null }>();
  const childIds = new Set<string>();

  for (const link of links) {
    if (!link.targetNodeId) continue;
    const label = (link.label ?? "").toLowerCase();
    const entry = childrenMap.get(link.sourceNodeId) ?? { left: null, right: null };

    if (label === "left" || label.includes("left")) {
      entry.left = link.targetNodeId;
    } else if (label === "right" || label.includes("right")) {
      entry.right = link.targetNodeId;
    }
    childrenMap.set(link.sourceNodeId, entry);
    childIds.add(link.targetNodeId);
  }

  // Roots = nodes not appearing as children
  const rootIds = nodes.map((n) => n.id).filter((id) => !childIds.has(id));

  // Build recursively with cycle guard
  function buildNode(nodeId: string, visited: Set<string>): TreePosNode | null {
    if (visited.has(nodeId)) return null;
    const sn = nodeMap.get(nodeId);
    if (!sn) return null;

    visited.add(nodeId);
    const children = childrenMap.get(nodeId);
    const leftChild = children?.left ? buildNode(children.left, visited) : null;
    const rightChild = children?.right ? buildNode(children.right, visited) : null;

    return {
      nodeId,
      structureNode: sn,
      leftChild,
      rightChild,
      x: 0,
      y: 0,
      subtreeWidth: 0,
    };
  }

  return rootIds
    .map((id) => buildNode(id, new Set()))
    .filter((n): n is TreePosNode => n !== null);
}

/**
 * Measures the width of a subtree (in pixels) using a bottom-up recursion.
 * Leaf nodes have width TREE_NODE_W. Internal nodes span at least
 * (leftSubtreeWidth + TREE_SIBLING_GAP + rightSubtreeWidth).
 */
function measureSubtreeWidth(node: TreePosNode | null): number {
  if (!node) return 0;

  const leftW = measureSubtreeWidth(node.leftChild);
  const rightW = measureSubtreeWidth(node.rightChild);

  if (leftW === 0 && rightW === 0) {
    node.subtreeWidth = TREE_NODE_W;
  } else if (leftW === 0) {
    // Only right child — still need spacing for the absent left
    node.subtreeWidth = Math.max(TREE_NODE_W, TREE_NODE_W / 2 + TREE_SIBLING_GAP / 2 + rightW);
  } else if (rightW === 0) {
    node.subtreeWidth = Math.max(TREE_NODE_W, leftW + TREE_SIBLING_GAP / 2 + TREE_NODE_W / 2);
  } else {
    node.subtreeWidth = leftW + TREE_SIBLING_GAP + rightW;
  }

  return node.subtreeWidth;
}

/**
 * Assigns X/Y coordinates to every node in the subtree.
 * `centerX` is the X center of the available bounding box for this subtree.
 * `topY` is the Y top of the current level.
 */
function assignPositions(
  node: TreePosNode | null,
  centerX: number,
  topY: number,
): void {
  if (!node) return;

  node.x = centerX - TREE_NODE_W / 2;
  node.y = topY;

  const childY = topY + TREE_NODE_H + TREE_LEVEL_GAP;

  if (node.leftChild && node.rightChild) {
    // Both children: left subtree on left half, right subtree on right half
    const leftHalf = node.leftChild.subtreeWidth;
    const rightHalf = node.rightChild.subtreeWidth;
    const totalSpan = leftHalf + TREE_SIBLING_GAP + rightHalf;
    const leftCenter = centerX - totalSpan / 2 + leftHalf / 2;
    const rightCenter = centerX + totalSpan / 2 - rightHalf / 2;

    assignPositions(node.leftChild, leftCenter, childY);
    assignPositions(node.rightChild, rightCenter, childY);
  } else if (node.leftChild) {
    // Only left: place slightly left of parent center
    const offset = Math.max(TREE_NODE_W / 2 + TREE_SIBLING_GAP / 2, node.leftChild.subtreeWidth / 2);
    assignPositions(node.leftChild, centerX - offset + node.leftChild.subtreeWidth / 2, childY);
  } else if (node.rightChild) {
    // Only right: place slightly right of parent center
    const offset = Math.max(TREE_NODE_W / 2 + TREE_SIBLING_GAP / 2, node.rightChild.subtreeWidth / 2);
    assignPositions(node.rightChild, centerX + offset - node.rightChild.subtreeWidth / 2, childY);
  }
}

/**
 * Collects all TreePosNodes into a flat list via pre-order traversal.
 */
function flattenTree(node: TreePosNode | null, out: TreePosNode[]): void {
  if (!node) return;
  out.push(node);
  flattenTree(node.leftChild, out);
  flattenTree(node.rightChild, out);
}

/**
 * Computes hierarchical 2D layout for tree structures.
 *
 * @param nodes  - StructureNode[] from the tree StructureItem
 * @param links  - StructureLink[] from the tree StructureItem
 * @param startX - X offset for the tree region
 * @param startY - Y offset for the tree region
 */
export function layoutTreeStructures(
  nodes: StructureNode[],
  links: StructureLink[],
  startX: number = TREE_PAD,
  startY: number = TREE_PAD,
): TreeLayoutResult {
  if (nodes.length === 0) {
    return { placedNodes: [], placedLinks: [], nullBadges: [], width: 0, height: 0 };
  }

  const roots = buildLogicalTree(nodes, links);
  if (roots.length === 0) {
    // Fallback: treat each node as an isolated root
    const placed: PlacedNode[] = nodes.map((n, i) => ({
      x: startX + i * (TREE_NODE_W + TREE_SIBLING_GAP),
      y: startY,
      w: TREE_NODE_W,
      h: TREE_NODE_H,
      node: n,
    }));
    const w = startX + nodes.length * (TREE_NODE_W + TREE_SIBLING_GAP) + TREE_PAD;
    return { placedNodes: placed, placedLinks: [], nullBadges: [], width: w, height: TREE_NODE_H + 2 * TREE_PAD };
  }

  // Measure and position each root tree
  let cumulativeX = startX;
  const allFlat: TreePosNode[] = [];

  for (const root of roots) {
    measureSubtreeWidth(root);
    const centerX = cumulativeX + root.subtreeWidth / 2;
    assignPositions(root, centerX, startY);
    flattenTree(root, allFlat);
    cumulativeX += root.subtreeWidth + TREE_SIBLING_GAP * 2;
  }

  // Normalize: ensure no negative X by finding the global min
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of allFlat) {
    if (n.x < minX) minX = n.x;
    if (n.x + TREE_NODE_W > maxX) maxX = n.x + TREE_NODE_W;
    if (n.y + TREE_NODE_H > maxY) maxY = n.y + TREE_NODE_H;
  }

  const shiftX = minX < TREE_PAD ? TREE_PAD - minX : 0;
  for (const n of allFlat) {
    n.x += shiftX;
  }
  maxX += shiftX;

  // Build PlacedNode[]
  const placedNodes: PlacedNode[] = allFlat.map((tn) => ({
    x: tn.x,
    y: tn.y,
    w: TREE_NODE_W,
    h: TREE_NODE_H,
    node: tn.structureNode,
  }));

  // Build coordinate map for link routing
  const rectMap = new Map<string, LayoutRect>();
  for (const tn of allFlat) {
    rectMap.set(tn.nodeId, { x: tn.x, y: tn.y, w: TREE_NODE_W, h: TREE_NODE_H });
  }

  // Build PlacedLink[] and NULL badges
  const placedLinks: PlacedLink[] = [];
  const nullBadges: LayoutRect[] = [];

  for (const link of links) {
    const srcRect = rectMap.get(link.sourceNodeId);
    if (!srcRect) continue;

    const label = (link.label ?? "").toLowerCase();
    const isLeft = label === "left" || label.includes("left");

    // Anchor point at parent bottom (left-of-center or right-of-center)
    const srcCenterX = srcRect.x + srcRect.w / 2;
    const offsetX = isLeft ? -srcRect.w * 0.2 : srcRect.w * 0.2;
    const sx = srcCenterX + offsetX;
    const sy = srcRect.y + srcRect.h;

    if (link.status === "null" || !link.targetNodeId) {
      // NULL child: small badge below parent
      const nullX = sx - TREE_NULL_W / 2;
      const nullY = sy + TREE_LEVEL_GAP / 2;
      nullBadges.push({ x: nullX, y: nullY, w: TREE_NULL_W, h: TREE_NULL_H });

      const pathD = `M ${sx} ${sy} L ${nullX + TREE_NULL_W / 2} ${nullY}`;
      placedLinks.push({
        link,
        pathD,
        color: "var(--color-fg-muted)",
        dash: "4 3",
        markerId: "arrow-null",
      });
      continue;
    }

    const tgtRect = rectMap.get(link.targetNodeId);
    if (!tgtRect) continue;

    // Target anchor at child top center
    const tx = tgtRect.x + tgtRect.w / 2;
    const ty = tgtRect.y;

    // Smooth bezier curve from parent bottom to child top
    const cpOffsetY = TREE_LEVEL_GAP * 0.45;
    const pathD = `M ${sx} ${sy} C ${sx} ${sy + cpOffsetY}, ${tx} ${ty - cpOffsetY}, ${tx} ${ty}`;

    const color = getFieldColor(link.label, link.status);
    placedLinks.push({
      link,
      pathD,
      color,
      dash: getStatusDash(link.status),
      markerId: getMarkerForColor(color),
    });
  }

  const totalWidth = Math.max(400, maxX + TREE_PAD);
  const totalHeight = maxY + TREE_LEVEL_GAP + TREE_PAD;

  return {
    placedNodes,
    placedLinks,
    nullBadges,
    width: totalWidth,
    height: totalHeight,
  };
}
