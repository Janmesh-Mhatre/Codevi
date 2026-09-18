import type { Address } from "../../memory/memory";
import type { ExecutionValue } from "../../execution/models/executionTypes";

/** Supported data structure kinds across Phase 6 and future phases */
export type StructureKind =
  | "array"
  | "linked-list"
  | "stack"
  | "queue"
  | "tree"
  | "graph"
  | "pointer-graph";

/** Highlight states for visual cards during step playback */
export type NodeHighlight = "read" | "write" | "active" | "target" | "none";
export type SlotHighlight = "read" | "write" | "selected" | "none";

/** Connection validity statuses */
export type LinkStatus = "valid" | "null" | "freed" | "invalid";

/** SVG connector curve styles */
export type RoutingStyle = "bezier" | "outward-loop" | "self-loop" | "direct";

/** A single value slot inside a structure node (e.g. array element or struct field) */
export interface StructureSlot {
  index: number;
  name?: string;
  value: ExecutionValue;
  address: Address;
  highlight?: SlotHighlight;
  /** Phase 6.1: active index variable tags referencing this slot.
   * Each entry is a label like "i ▾" or "p ➔" shown above the slot. */
  activeIndexTags?: string[];
  /** Phase 6.1: boundary cue — 'start', 'end', or 'out-of-bounds'
   * for slots at the edges of a valid range. */
  boundsCue?: "start" | "end" | "out-of-bounds";
}

/** Atomic visualization node representing a variable, array, struct, or heap block */
export interface StructureNode {
  id: string; // e.g. "stack:arr", "heap:H001", "stack:p"
  kind: StructureKind;
  label: string; // display name, e.g. "arr", "node (head)", "p"
  address: Address;
  type: string; // C type e.g. "int[5]", "int*", "struct Node"
  slots: StructureSlot[];
  highlight?: NodeHighlight;
  metadata?: Record<string, unknown>;
}

/** A directional connection (pointer, next pointer, tree branch, or graph edge) */
export interface StructureLink {
  id: string;
  sourceNodeId: string;
  sourceSlotIndex: number;
  targetNodeId: string | null; // null for NULL pointer
  targetSlotIndex: number;
  targetAddress: Address | null;
  label?: string; // e.g. "next", "left", "right"
  status: LinkStatus;
  routingStyle: RoutingStyle;
}

/** Types of structural mutations detected between consecutive steps */
export type StructuralChangeType =
  | "read"
  | "write"
  | "swap"
  | "declare"
  | "allocate"
  | "deallocate"
  | "link"
  | "unlink";

/** An individual structural operation captured for educational step-stepping */
export interface StructuralChange {
  type: StructuralChangeType;
  targetNodeId: string;
  slotIndex?: number;
  description: string;
}

/** A logical grouping of nodes and links (e.g. "Array arr", "Heap Pointer Graph") */
export interface StructureItem {
  id: string;
  kind: StructureKind;
  name: string;
  nodes: StructureNode[];
  links: StructureLink[];
}

/** The complete structural state of an execution step */
export interface StructureGraph {
  structures: StructureItem[];
  changes: StructuralChange[];
}

/** Active layout position and dimensions for rendering */
export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedNode extends LayoutRect {
  node: StructureNode;
}

export interface PlacedLink {
  link: StructureLink;
  pathD: string;
  markerId: string;
  color: string;
  dash?: string;
}
