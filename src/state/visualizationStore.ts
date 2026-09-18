import { create } from "zustand";
import type { StructureKind } from "../visualization/models/structureTypes";

export interface VisualizationNode {
  id: string;
  kind: "stack-frame" | "heap-block" | "global" | "array" | "list-node" | "tree-node";
  label: string;
}

export interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  kind: "pointer" | "next" | "child";
}

export type StructureFilterType = "all" | StructureKind;

export interface VisualizationState {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  selectedNodeId: string | null;
  selectedSlotIndex: number | null;
  structureFilter: StructureFilterType;
  setSelectedNode: (id: string | null, slotIndex?: number | null) => void;
  setStructureFilter: (filter: StructureFilterType) => void;
  resetVisualization: () => void;
}

/**
 * Shared state for data structure and memory visualization.
 */
export const useVisualizationStore = create<VisualizationState>()((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedSlotIndex: null,
  structureFilter: "all",
  setSelectedNode: (id, slotIndex = null) =>
    set({ selectedNodeId: id, selectedSlotIndex: slotIndex }),
  setStructureFilter: (filter) => set({ structureFilter: filter }),
  resetVisualization: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedSlotIndex: null,
      structureFilter: "all",
    }),
}));
