import type { HeapBlock, PointerRelationship, PointerViewVariable } from "../../execution/models/executionTypes";

const HEAP_NODE_W = 180;
const HEAP_NODE_H = 56;
const H_GAP = 32;
const LEVEL_V_GAP = 58;

export interface TreeNodeItem {
  id: number;
  block: HeapBlock;
  left: TreeNodeItem | null;
  right: TreeNodeItem | null;
  hasNullLeft: boolean;
  hasNullRight: boolean;
  subtreeWidth: number;
  x: number;
  y: number;
  level: number;
}

export interface DetectedTree {
  rootId: number;
  rootBlock: HeapBlock;
  isBST: boolean;
  headerX: number;
  headerY: number;
  placedNodes: Map<number, { x: number; y: number; level: number; b: HeapBlock }>;
  childLinks: {
    parentId: number;
    childId: number;
    isLeft: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    pathD: string;
  }[];
  nullMarkers: {
    parentId: number;
    isLeft: boolean;
    x: number;
    y: number;
  }[];
  activePointers: Map<number, string[]>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface TreeLayoutDetectionResult {
  detectedTrees: DetectedTree[];
  treeBlockIds: Set<number>;
  allPlacedTreeNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[];
  maxX: number;
  maxY: number;
}

/** Check if a heap block has the structural shape of a binary tree node */
export function isTreeNodeCandidate(b: HeapBlock): boolean {
  if (!b.active || b.slotCount < 3 || b.values.length < 3) return false;
  const s1 = b.values[1];
  const s2 = b.values[2];
  return (
    s1 !== undefined &&
    s1.kind === "pointer" &&
    s2 !== undefined &&
    s2.kind === "pointer"
  );
}

/** Validates binary search tree ordering recursively */
function validateBST(item: TreeNodeItem, minVal = -Infinity, maxVal = Infinity): boolean {
  const v = item.block.values[0];
  if (!v || v.kind !== "scalar" || typeof v.value !== "number") return false;
  const num = v.value;
  if (num <= minVal || num >= maxVal) return false;
  const leftOk = !item.left || validateBST(item.left, minVal, num);
  const rightOk = !item.right || validateBST(item.right, num, maxVal);
  return leftOk && rightOk;
}

/** Measure subtree width bottom-up so subtrees never overlap */
function measureTreeWidth(item: TreeNodeItem): number {
  if (!item.left && !item.right) {
    item.subtreeWidth = HEAP_NODE_W + H_GAP;
    return item.subtreeWidth;
  }
  const leftW = item.left ? measureTreeWidth(item.left) : HEAP_NODE_W * 0.45;
  const rightW = item.right ? measureTreeWidth(item.right) : HEAP_NODE_W * 0.45;
  item.subtreeWidth = Math.max(HEAP_NODE_W + H_GAP, leftW + rightW);
  return item.subtreeWidth;
}

/** Route smooth bezier curve from parent to child */
export function routeTreeBranch(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  const cp = Math.max(20, dy * 0.45);
  return `M ${x1} ${y1} C ${x1} ${y1 + cp}, ${x2} ${y2 - cp}, ${x2} ${y2}`;
}

/** Assign 2D positions top-down */
function assignTreePositions(
  item: TreeNodeItem,
  centerX: number,
  y: number,
  placedMap: Map<number, { x: number; y: number; level: number; b: HeapBlock }>,
  childLinks: DetectedTree["childLinks"],
  nullMarkers: DetectedTree["nullMarkers"],
) {
  const nextY = y + HEAP_NODE_H + LEVEL_V_GAP;
  let leftCenter = centerX;
  let rightCenter = centerX;

  if (item.left && item.right) {
    leftCenter = centerX - item.subtreeWidth / 2 + item.left.subtreeWidth / 2;
    rightCenter = centerX + item.subtreeWidth / 2 - item.right.subtreeWidth / 2;
    item.x = (leftCenter + rightCenter) / 2 - HEAP_NODE_W / 2;
  } else if (item.left) {
    leftCenter = centerX - (HEAP_NODE_W + H_GAP) / 2;
    item.x = centerX - HEAP_NODE_W / 4;
  } else if (item.right) {
    rightCenter = centerX + (HEAP_NODE_W + H_GAP) / 2;
    item.x = centerX - (HEAP_NODE_W * 3) / 4;
  } else {
    item.x = centerX - HEAP_NODE_W / 2;
  }

  item.y = y;
  placedMap.set(item.id, { x: item.x, y: item.y, level: item.level, b: item.block });

  if (item.left) {
    assignTreePositions(item.left, leftCenter, nextY, placedMap, childLinks, nullMarkers);
    const x1 = item.x + HEAP_NODE_W * 0.35;
    const y1 = item.y + HEAP_NODE_H;
    const x2 = item.left.x + HEAP_NODE_W / 2;
    const y2 = item.left.y;
    childLinks.push({
      parentId: item.id,
      childId: item.left.id,
      isLeft: true,
      x1,
      y1,
      x2,
      y2,
      pathD: routeTreeBranch(x1, y1, x2, y2),
    });
  } else if (item.hasNullLeft) {
    nullMarkers.push({
      parentId: item.id,
      isLeft: true,
      x: item.x + HEAP_NODE_W * 0.35,
      y: item.y + HEAP_NODE_H + 6,
    });
  }

  if (item.right) {
    assignTreePositions(item.right, rightCenter, nextY, placedMap, childLinks, nullMarkers);
    const x1 = item.x + HEAP_NODE_W * 0.65;
    const y1 = item.y + HEAP_NODE_H;
    const x2 = item.right.x + HEAP_NODE_W / 2;
    const y2 = item.right.y;
    childLinks.push({
      parentId: item.id,
      childId: item.right.id,
      isLeft: false,
      x1,
      y1,
      x2,
      y2,
      pathD: routeTreeBranch(x1, y1, x2, y2),
    });
  } else if (item.hasNullRight) {
    nullMarkers.push({
      parentId: item.id,
      isLeft: false,
      x: item.x + HEAP_NODE_W * 0.65,
      y: item.y + HEAP_NODE_H + 6,
    });
  }
}

/**
 * Main detection and layout entrypoint for Pointer View trees.
 * Detects binary tree structures, determines roots, checks BST properties,
 * and calculates hierarchical 2D non-overlapping coordinates.
 */
export function detectPointerViewTrees(
  heapBlocks: HeapBlock[],
  _relationships: PointerRelationship[],
  stackVariables: PointerViewVariable[],
  heapStartX: number,
  heapStartY: number,
): TreeLayoutDetectionResult {
  const treeCandidates = new Map<number, HeapBlock>();
  for (const b of heapBlocks) {
    if (isTreeNodeCandidate(b)) {
      treeCandidates.set(b.address.id, b);
    }
  }

  if (treeCandidates.size === 0) {
    return {
      detectedTrees: [],
      treeBlockIds: new Set(),
      allPlacedTreeNodes: [],
      maxX: heapStartX,
      maxY: heapStartY,
    };
  }

  // Active stack pointers targeting heap nodes
  const activePointers = new Map<number, string[]>();
  for (const v of stackVariables) {
    if (v.value.kind === "pointer" && v.value.target?.space === "heap") {
      const id = v.value.target.id;
      if (treeCandidates.has(id)) {
        const list = activePointers.get(id) ?? [];
        list.push(v.name);
        activePointers.set(id, list);
      }
    }
  }

  // Calculate in-degree from tree child links
  const inDegree = new Map<number, number>();
  for (const id of treeCandidates.keys()) inDegree.set(id, 0);

  for (const b of treeCandidates.values()) {
    const s1 = b.values[1];
    const s2 = b.values[2];
    const leftId = s1?.kind === "pointer" && s1.target?.space === "heap" ? s1.target.id : null;
    const rightId = s2?.kind === "pointer" && s2.target?.space === "heap" ? s2.target.id : null;

    if (leftId !== null && inDegree.has(leftId)) {
      inDegree.set(leftId, inDegree.get(leftId)! + 1);
    }
    if (rightId !== null && inDegree.has(rightId)) {
      inDegree.set(rightId, inDegree.get(rightId)! + 1);
    }
  }

  // A binary tree cannot have nodes with multiple parents (in-degree > 1)
  const hasMultipleParents = Array.from(inDegree.values()).some((deg) => deg > 1);
  if (hasMultipleParents) {
    return {
      detectedTrees: [],
      treeBlockIds: new Set(),
      allPlacedTreeNodes: [],
      maxX: heapStartX,
      maxY: heapStartY,
    };
  }

  // Candidate roots: nodes with in-degree === 0
  const candidateRoots: number[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) candidateRoots.push(id);
  }

  // Sort candidate roots by stack pointer priority
  candidateRoots.sort((a, b) => {
    const aPtrs = activePointers.get(a) ?? [];
    const bPtrs = activePointers.get(b) ?? [];
    const aHasRootName = aPtrs.some((n) => /root|tree|bst|^t$/i.test(n));
    const bHasRootName = bPtrs.some((n) => /root|tree|bst|^t$/i.test(n));
    if (aHasRootName && !bHasRootName) return -1;
    if (!aHasRootName && bHasRootName) return 1;
    if (aPtrs.length > 0 && bPtrs.length === 0) return -1;
    if (aPtrs.length === 0 && bPtrs.length > 0) return 1;
    return a - b;
  });

  // Fallback if there are cycles and no in-degree 0 node
  if (candidateRoots.length === 0 && treeCandidates.size > 0) {
    for (const id of treeCandidates.keys()) {
      if (activePointers.has(id)) {
        candidateRoots.push(id);
        break;
      }
    }
    if (candidateRoots.length === 0) {
      candidateRoots.push(treeCandidates.keys().next().value!);
    }
  }

  const globalVisited = new Set<number>();
  const detectedTrees: DetectedTree[] = [];
  const treeBlockIds = new Set<number>();
  let currentY = heapStartY + 20; // Room for active pointer tag (root ▾) above the root card
  let globalMaxX = heapStartX + HEAP_NODE_W;
  let globalMaxY = currentY;

  for (const rootId of candidateRoots) {
    if (globalVisited.has(rootId)) continue;

    // Build hierarchy with cycle prevention
    const localVisited = new Set<number>();
    function buildItem(id: number, level: number): TreeNodeItem | null {
      if (localVisited.has(id) || globalVisited.has(id)) return null;
      localVisited.add(id);
      globalVisited.add(id);
      treeBlockIds.add(id);

      const block = treeCandidates.get(id);
      if (!block) return null;

      const s1 = block.values[1];
      const s2 = block.values[2];
      const leftId =
        s1?.kind === "pointer" && s1.target?.space === "heap" && treeCandidates.has(s1.target.id)
          ? s1.target.id
          : null;
      const rightId =
        s2?.kind === "pointer" && s2.target?.space === "heap" && treeCandidates.has(s2.target.id)
          ? s2.target.id
          : null;

      return {
        id,
        block,
        left: leftId !== null ? buildItem(leftId, level + 1) : null,
        right: rightId !== null ? buildItem(rightId, level + 1) : null,
        hasNullLeft: s1?.kind === "pointer" && s1.target === null,
        hasNullRight: s2?.kind === "pointer" && s2.target === null,
        subtreeWidth: 0,
        x: 0,
        y: 0,
        level,
      };
    }

    const rootItem = buildItem(rootId, 0);
    if (!rootItem) continue;

    const isBST = validateBST(rootItem);
    measureTreeWidth(rootItem);

    const placedMap = new Map<number, { x: number; y: number; level: number; b: HeapBlock }>();
    const childLinks: DetectedTree["childLinks"] = [];
    const nullMarkers: DetectedTree["nullMarkers"] = [];

    // Center root relative to its measured subtree width
    const rootCenterX = heapStartX + rootItem.subtreeWidth / 2;
    assignTreePositions(rootItem, rootCenterX, currentY, placedMap, childLinks, nullMarkers);

    // Coordinate normalization: shift so minX is at least heapStartX + 20
    let treeMinX = Infinity;
    let treeMaxX = -Infinity;
    let treeMinY = Infinity;
    let treeMaxY = -Infinity;

    for (const p of placedMap.values()) {
      if (p.x < treeMinX) treeMinX = p.x;
      if (p.x + HEAP_NODE_W > treeMaxX) treeMaxX = p.x + HEAP_NODE_W;
      if (p.y < treeMinY) treeMinY = p.y;
      if (p.y + HEAP_NODE_H > treeMaxY) treeMaxY = p.y + HEAP_NODE_H;
    }

    for (const m of nullMarkers) {
      if (m.y + 16 > treeMaxY) treeMaxY = m.y + 16;
    }

    const shiftX = treeMinX < heapStartX + 20 ? heapStartX + 20 - treeMinX : 0;
    if (shiftX !== 0) {
      for (const p of placedMap.values()) p.x += shiftX;
      for (const l of childLinks) {
        l.x1 += shiftX;
        l.x2 += shiftX;
        l.pathD = routeTreeBranch(l.x1, l.y1, l.x2, l.y2);
      }
      for (const m of nullMarkers) m.x += shiftX;
      treeMinX += shiftX;
      treeMaxX += shiftX;
    }

    const rootPos = placedMap.get(rootId)!;
    const headerX = Math.round(rootPos.x + (HEAP_NODE_W - 160) / 2);
    const headerY = rootPos.y - 34;

    detectedTrees.push({
      rootId,
      rootBlock: rootItem.block,
      isBST,
      headerX,
      headerY,
      placedNodes: placedMap,
      childLinks,
      nullMarkers,
      activePointers,
      minX: treeMinX,
      maxX: treeMaxX,
      minY: headerY,
      maxY: treeMaxY,
    });

    if (treeMaxX > globalMaxX) globalMaxX = treeMaxX;
    if (treeMaxY > globalMaxY) globalMaxY = treeMaxY;
    currentY = treeMaxY + 50;
  }

  const allPlacedTreeNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[] = [];
  for (const tree of detectedTrees) {
    for (const p of tree.placedNodes.values()) {
      allPlacedTreeNodes.push({
        x: p.x,
        y: p.y,
        w: HEAP_NODE_W,
        h: HEAP_NODE_H,
        b: p.b,
      });
    }
  }

  return {
    detectedTrees,
    treeBlockIds,
    allPlacedTreeNodes,
    maxX: globalMaxX,
    maxY: globalMaxY,
  };
}
