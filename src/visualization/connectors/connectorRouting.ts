import type { LinkStatus, RoutingStyle } from "../models/structureTypes";
import type { HeapBlock, PointerRelationship, PointerViewVariable } from "../../execution/models/executionTypes";

/**
 * Standard colors for link statuses across all data structure diagrams.
 */
export function getStatusColor(status: LinkStatus): string {
  switch (status) {
    case "valid":
      return "var(--color-accent)";
    case "null":
      return "var(--color-fg-muted)";
    case "freed":
    case "invalid":
      return "var(--color-danger)";
  }
}

/**
 * SVG dash pattern for severed or freed pointer links.
 */
export function getStatusDash(status: LinkStatus): string | undefined {
  return status === "freed" || status === "invalid" ? "6 4" : undefined;
}

/**
 * Marker ID matching the SVG <defs> markers.
 */
export function getMarkerId(status: LinkStatus): string {
  switch (status) {
    case "valid":
      return "arrow-valid";
    case "null":
      return "arrow-null";
    case "freed":
    case "invalid":
      return "arrow-danger";
  }
}

/**
 * Stable theme-aligned colors for pointer fields.
 * The same field name always receives the same color.
 */
export function getFieldColor(fieldName?: string, status?: PointerRelationship["status"]): string {
  if (status === "null") return "var(--color-fg-muted)";
  if (status === "freed" || status === "invalid") return "var(--color-danger)";
  if (!fieldName) return "var(--color-accent)";

  const normalized = fieldName.toLowerCase();
  switch (normalized) {
    case "next":
    case "left":
    case "child":
      return "var(--color-accent)"; // Cyan / blue from theme
    case "prev":
    case "right":
      return "var(--color-active)"; // Amber / orange from theme
    case "parent":
    case "up":
      return "#a78bfa"; // Soft violet
    default: {
      const PALETTE = [
        "var(--color-accent)",
        "var(--color-active)",
        "#a78bfa",
        "#34d399",
        "#f472b6",
        "#38bdf8",
      ];
      let hash = 0;
      for (let i = 0; i < normalized.length; i++) {
        hash = (hash * 31 + normalized.charCodeAt(i)) & 0xffffffff;
      }
      return PALETTE[Math.abs(hash) % PALETTE.length];
    }
  }
}

/**
 * Maps a stroke color to its corresponding SVG marker ID in <defs>.
 */
export function getMarkerForColor(color: string): string {
  if (color.includes("danger")) return "arrow-danger";
  if (color.includes("muted")) return "arrow-null";
  if (color.includes("active")) return "arrow-active";
  if (color.includes("accent")) return "arrow-valid";
  if (color.includes("a78bfa")) return "arrow-violet";
  if (color.includes("34d399")) return "arrow-emerald";
  if (color.includes("f472b6")) return "arrow-pink";
  return "arrow-valid";
}

/**
 * Orders heap blocks for Pointer View according to actual linked-list pointer relationships:
 * - Priority 1: Linked-list traversal from head (or candidate root)
 * - Priority 2: Other active heap blocks in simulated address order
 * - Priority 3: Freed heap blocks in simulated address order at the bottom
 */
export function orderHeapBlocks(
  heapBlocks: HeapBlock[],
  relationships: PointerRelationship[],
  stackVariables: PointerViewVariable[],
): HeapBlock[] {
  if (heapBlocks.length === 0) return [];

  const blockMap = new Map<number, HeapBlock>();
  for (const b of heapBlocks) {
    blockMap.set(b.address.id, b);
  }

  const activeBlocks = heapBlocks.filter((b) => b.active);
  const freedBlocks = heapBlocks.filter((b) => !b.active);

  // Sort freed blocks by simulated address id ascending
  freedBlocks.sort((a, b) => a.address.id - b.address.id);

  if (activeBlocks.length === 0) {
    return freedBlocks;
  }

  const activeIdSet = new Set(activeBlocks.map((b) => b.address.id));

  // Build forward pointer map for active blocks:
  // srcId -> (fieldName -> tgtId)
  const forwardLinks = new Map<number, Map<string, number>>();
  const inDegree = new Map<number, number>();
  for (const b of activeBlocks) {
    inDegree.set(b.address.id, 0);
  }

  for (const rel of relationships) {
    if (rel.pointerAddress?.space === "heap" && rel.targetAddress?.space === "heap") {
      const srcId = rel.pointerAddress.id;
      const tgtId = rel.targetAddress.id;
      if (activeIdSet.has(srcId) && activeIdSet.has(tgtId)) {
        if (!forwardLinks.has(srcId)) {
          forwardLinks.set(srcId, new Map());
        }
        const field = rel.fieldName ?? (rel.pointerName.includes("->") ? rel.pointerName.split("->")[1] : "next");
        forwardLinks.get(srcId)!.set(field, tgtId);

        if (field === "next" || field === "right" || field === "child") {
          inDegree.set(tgtId, (inDegree.get(tgtId) ?? 0) + 1);
        }
      }
    }
  }

  // Find head ID starting point:
  let headId: number | null = null;
  const preferredNames = ["head", "list", "first", "root"];

  for (const v of stackVariables) {
    const val = v.value;
    if (val.kind === "pointer" && val.target?.space === "heap" && activeIdSet.has(val.target.id)) {
      if (preferredNames.includes(v.name.toLowerCase())) {
        headId = val.target.id;
        break;
      }
    }
  }

  if (headId === null) {
    for (const v of stackVariables) {
      const val = v.value;
      if (val.kind === "pointer" && val.target?.space === "heap" && activeIdSet.has(val.target.id)) {
        if (inDegree.get(val.target.id) === 0) {
          headId = val.target.id;
          break;
        }
      }
    }
  }

  if (headId === null) {
    for (const v of stackVariables) {
      const val = v.value;
      if (val.kind === "pointer" && val.target?.space === "heap" && activeIdSet.has(val.target.id)) {
        headId = val.target.id;
        break;
      }
    }
  }

  if (headId === null) {
    for (const b of activeBlocks) {
      if (inDegree.get(b.address.id) === 0 && forwardLinks.has(b.address.id)) {
        headId = b.address.id;
        break;
      }
    }
  }

  if (headId === null) {
    for (const b of activeBlocks) {
      if (forwardLinks.has(b.address.id)) {
        headId = b.address.id;
        break;
      }
    }
  }

  const orderedActive: HeapBlock[] = [];
  const visited = new Set<number>();

  if (headId !== null && blockMap.has(headId)) {
    let currId: number | null = headId;
    while (currId !== null && blockMap.has(currId) && !visited.has(currId)) {
      visited.add(currId);
      orderedActive.push(blockMap.get(currId)!);

      const fields = forwardLinks.get(currId);
      if (fields) {
        currId = fields.get("next") ?? fields.get("right") ?? fields.get("child") ?? null;
      } else {
        currId = null;
      }
    }
  }

  // Priority 2: Other active heap blocks in simulated address order
  const remainingActive = activeBlocks.filter((b) => !visited.has(b.address.id));
  remainingActive.sort((a, b) => a.address.id - b.address.id);

  // Priority 3: Freed blocks at the bottom
  return [...orderedActive, ...remainingActive, ...freedBlocks];
}

/**
 * Equal-length curve for vertically adjacent forward heap cards (e.g. H001 -> H002).
 */
export function routeAdjacentHeap(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  laneOffset: number = 32,
): string {
  return `M ${x1} ${y1} C ${x1 + laneOffset} ${y1}, ${x2 + laneOffset} ${y2}, ${x2} ${y2}`;
}

/**
 * Large outer route for circular closing edge looping back to the head/ancestor node (e.g. H005 -> H003).
 * Arches outside all intermediate cards and connectors to completely avoid crossing card bodies.
 */
export function routeCircularClosing(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  outerOffset: number = 85,
): string {
  return `M ${x1} ${y1} C ${x1 + outerOffset} ${y1}, ${x2 + outerOffset} ${y2}, ${x2} ${y2}`;
}

/**
 * Reverse lane route for reverse relationships (e.g. H002.prev -> H001).
 * Uses a distinct lane so forward and backward edges never overlap.
 */
export function routeReverseHeap(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  laneOffset: number = 54,
): string {
  return `M ${x1} ${y1} C ${x1 + laneOffset} ${y1}, ${x2 + laneOffset} ${y2}, ${x2} ${y2}`;
}

/**
 * Standard cubic bezier path between two points across columns (e.g. Stack to Heap).
 * Exits horizontally to the right from (x1, y1) and approaches (x2, y2) from the left.
 */
export function routeBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cpOffset?: number,
): string {
  const dx = x2 - x1;
  const cp = cpOffset ?? Math.max(40, Math.abs(dx) * 0.4);
  return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
}

/**
 * Outward curved loop for connections within the same column (e.g. Stack-to-Stack pointers
 * or Linked List pointer cycles). Exits rightward, arches through the inter-column gap,
 * and enters the target card from the right, preventing edge-crossing over card bodies.
 */
export function routeOutwardLoop(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tierIndex: number = 0,
): string {
  const dy = Math.abs(y2 - y1);
  if (dy < 4) {
    return routeSelfLoop(x1, y1, tierIndex);
  }
  const outwardOffset = 45 + tierIndex * 30 + Math.min(50, dy * 0.2);
  return `M ${x1} ${y1} C ${x1 + outwardOffset} ${y1}, ${x2 + outwardOffset} ${y2}, ${x2} ${y2}`;
}

/**
 * Self-loop path for a node pointing directly to itself.
 * Exits near top-right and re-enters near bottom-right.
 */
export function routeSelfLoop(
  x: number,
  y: number,
  tierIndex: number = 0,
): string {
  const outwardOffset = 45 + tierIndex * 30;
  const r = outwardOffset * 0.6;
  return `M ${x} ${y - 6} C ${x + r} ${y - 25}, ${x + r} ${y + 25}, ${x} ${y + 6}`;
}

/**
 * Direct straight line path, ideal for tree branches or graph edges.
 */
export function routeDirect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/**
 * High-level connector router selecting the appropriate path generator based on style.
 */
export function routeConnector(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: RoutingStyle,
  tierIndex: number = 0,
): string {
  switch (style) {
    case "bezier":
      return routeBezier(x1, y1, x2, y2);
    case "outward-loop":
      return routeOutwardLoop(x1, y1, x2, y2, tierIndex);
    case "self-loop":
      return routeSelfLoop(x1, y1, tierIndex);
    case "direct":
      return routeDirect(x1, y1, x2, y2);
  }
}
