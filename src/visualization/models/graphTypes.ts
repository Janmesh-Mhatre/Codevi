import type { Address } from "../../memory/memory";
import type { ExecutionValue } from "../../execution/models/executionTypes";
import type { StructureItem, StructureNode, StructureLink } from "./structureTypes";

/** Supported graph representation sources */
export type GraphRepresentation =
  | "pointer-based"
  | "adjacency-matrix"
  | "adjacency-list";

/** A normalized node in the graph */
export interface GraphNode {
  id: string; // e.g. "H001", "V0", "node:A"
  label: string; // Display label e.g. "Node A", "V0", "H001"
  address?: Address; // Simulated memory address if heap or stack backed
  value?: ExecutionValue | unknown; // Primary payload value (e.g. data: 10)
  type?: string; // C type e.g. "struct Node*", "int"
  metadata?: Record<string, unknown>;
}

/** A directed or undirected relationship between two nodes */
export interface GraphEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  directed: boolean;
  label?: string; // e.g. "next", "weight: 5", "edge"
  metadata?: Record<string, unknown>;
}

/** The unified internal graph model */
export interface GraphModel {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  directed: boolean;
  representation: GraphRepresentation;
  metadata?: {
    representationBadge?: string;
    hasCycles?: boolean;
    hasSelfLoops?: boolean;
    componentCount?: number;
    density?: number;
    [key: string]: unknown;
  };
}

/**
 * Converts a normalized GraphModel into a Codevi StructureItem
 * for integration into StructureGraph diffing, filtering, and rendering.
 */
export function graphModelToStructureItem(model: GraphModel): StructureItem {
  const nodes: StructureNode[] = model.nodes.map((n) => {
    const addr: Address = n.address ?? { space: "heap", id: 0, slot: 0 };
    return {
      id: `graph:node:${n.id}`,
      kind: "graph",
      label: n.label,
      address: addr,
      type: n.type ?? "struct Node",
      slots: [
        {
          index: 0,
          name: "data",
          value:
            n.value && typeof n.value === "object" && "kind" in (n.value as any)
              ? (n.value as ExecutionValue)
              : {
                  kind: "scalar",
                  type: "int",
                  value: typeof n.value === "number" ? n.value : 0,
                },
          address: addr,
          highlight: "none",
        },
      ],
      highlight: "none",
      metadata: {
        ...n.metadata,
        graphId: model.id,
        representation: model.representation,
      },
    };
  });

  const links: StructureLink[] = model.edges.map((e) => {
    return {
      id: `graph:edge:${e.id}`,
      sourceNodeId: `graph:node:${e.source}`,
      sourceSlotIndex: 0,
      targetNodeId: `graph:node:${e.target}`,
      targetSlotIndex: 0,
      targetAddress: null,
      label: e.label,
      status: "valid",
      routingStyle: e.source === e.target ? "self-loop" : "bezier",
    };
  });

  return {
    id: `graph:${model.id}`,
    kind: "graph",
    name: model.name,
    nodes,
    links,
  };
}
