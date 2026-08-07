import { create } from "zustand";

/** A minimal, library-agnostic node/edge shape. Phase 4 will likely widen
 * this once React Flow's own node/edge types are wired in — this is
 * deliberately loose rather than importing React Flow's types a phase
 * early. */
interface VisualizationNode {
  id: string;
  kind: "stack-frame" | "heap-block" | "global" | "array" | "list-node" | "tree-node";
  label: string;
}

interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  kind: "pointer" | "next" | "child";
}

interface VisualizationState {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
}

/**
 * Placeholder store — intentionally inert in Phase 1.
 *
 * The Visualization Panel currently ignores this and renders its
 * "coming soon" state regardless of contents. Populated starting Phase 4.
 */
export const useVisualizationStore = create<VisualizationState>()(() => ({
  nodes: [],
  edges: [],
}));
