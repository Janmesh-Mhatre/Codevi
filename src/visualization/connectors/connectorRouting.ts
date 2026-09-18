import type { LinkStatus, RoutingStyle } from "../models/structureTypes";

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
