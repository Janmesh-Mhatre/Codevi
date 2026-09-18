import React, { useMemo, useRef, useEffect } from "react";
import { Layers, Network } from "lucide-react";
import { useExecutionStore, stepExecution } from "../../state/executionStore";
import { useVisualizationStore } from "../../state/visualizationStore";
import { extractStructureGraph } from "../detectors/structureDetector";
import { diffExecutionSteps } from "../diff/structureDiff";
import { layoutArrayStructures } from "../layout/arrayLayout";
import { layoutPointerGraph } from "../layout/pointerGraphLayout";
import { StructureControls } from "./StructureControls";
import { StructureCanvas } from "./StructureCanvas";
import { StructureNodeCard } from "./StructureNodeCard";
import { StructureDetailSidebar } from "./StructureDetailSidebar";
import type {
  StructureNode,
  PlacedNode,
  PlacedLink,
  StructuralChange,
} from "../models/structureTypes";
import type { ExecutionStep } from "../../execution/models/executionTypes";

export const StructureVisualizationPanel: React.FC = () => {
  const status = useExecutionStore((s) => s.status);
  const currentStep = useExecutionStore((s) => s.currentStep);

  const selectedNodeId = useVisualizationStore((s) => s.selectedNodeId);
  const selectedSlotIndex = useVisualizationStore((s) => s.selectedSlotIndex);
  const structureFilter = useVisualizationStore((s) => s.structureFilter);
  const setSelectedNode = useVisualizationStore((s) => s.setSelectedNode);
  const setStructureFilter = useVisualizationStore((s) => s.setStructureFilter);

  const prevStepRef = useRef<ExecutionStep | null>(null);
  const recentChangesRef = useRef<StructuralChange[]>([]);

  // 1. Extract structure graph and compute step-to-step diff
  const { graph, changes } = useMemo(() => {
    if (!currentStep) {
      return { graph: null, changes: [] };
    }

    const g = extractStructureGraph(currentStep);
    const c = diffExecutionSteps(prevStepRef.current, currentStep, g);
    return { graph: g, changes: c };
  }, [currentStep]);

  // Update previous step and accumulated changes
  useEffect(() => {
    if (changes.length > 0) {
      recentChangesRef.current = [...changes, ...recentChangesRef.current].slice(0, 20);
    }
    prevStepRef.current = currentStep;
  }, [currentStep, changes]);

  // 2. Select active structures based on filter
  const arrayStructures = useMemo(() => {
    if (!graph) return [];
    return graph.structures.filter((s) => s.kind === "array");
  }, [graph]);

  const pointerStructure = useMemo(() => {
    if (!graph) return null;
    return graph.structures.find((s) => s.kind === "pointer-graph") ?? null;
  }, [graph]);

  // 3. Compute layout positions
  const { placedArrayNodes, arrayDimensions } = useMemo(() => {
    if (!arrayStructures.length) {
      return { placedArrayNodes: [], arrayDimensions: { width: 0, height: 0 } };
    }
    const allArrayNodes = arrayStructures.flatMap((s) => s.nodes);
    const res = layoutArrayStructures(allArrayNodes, 20, 20);
    return { placedArrayNodes: res.placedNodes, arrayDimensions: { width: res.width, height: res.height } };
  }, [arrayStructures]);

  const pointerGraphLayout = useMemo(() => {
    if (!pointerStructure) return null;
    return layoutPointerGraph(pointerStructure.nodes, pointerStructure.links);
  }, [pointerStructure]);

  // Combine placed nodes and links depending on filter
  const { allPlacedNodes, allPlacedLinks, canvasW, canvasH } = useMemo(() => {
    const nodes: PlacedNode[] = [];
    const links: PlacedLink[] = [];

    let startY = 20;

    // Show arrays if filter is "all" or "array"
    if ((structureFilter === "all" || structureFilter === "array") && placedArrayNodes.length > 0) {
      for (const an of placedArrayNodes) {
        nodes.push({ ...an, y: an.y + startY });
      }
      startY += arrayDimensions.height + 20;
    }

    // Show pointer graph if filter is "all" or "pointer-graph"
    if ((structureFilter === "all" || structureFilter === "pointer-graph") && pointerGraphLayout) {
      for (const sn of pointerGraphLayout.stackNodes) {
        nodes.push({ ...sn, y: sn.y + startY });
      }
      for (const hn of pointerGraphLayout.heapNodes) {
        nodes.push({ ...hn, y: hn.y + startY });
      }
      for (const pl of pointerGraphLayout.placedLinks) {
        links.push({
          ...pl,
          pathD: pl.pathD.replace(/([0-9.]+)\s+([0-9.]+)/g, (_m, x, y) => `${x} ${parseFloat(y) + startY}`),
        });
      }
    }

    const maxW = Math.max(
      400,
      arrayDimensions.width,
      pointerGraphLayout ? pointerGraphLayout.width : 0
    );
    const maxH = Math.max(300, startY + (pointerGraphLayout ? pointerGraphLayout.height : 0) + 40);

    return {
      allPlacedNodes: nodes,
      allPlacedLinks: links,
      canvasW: maxW,
      canvasH: maxH,
    };
  }, [structureFilter, placedArrayNodes, arrayDimensions, pointerGraphLayout]);

  // Handler for stepping to the next structural mutation
  const handleStepStructure = () => {
    if (status !== "running" && status !== "paused") return;
    // Advance one execution step
    stepExecution();
  };

  // Find currently selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graph) return null;
    for (const s of graph.structures) {
      const match = s.nodes.find((n) => n.id === selectedNodeId);
      if (match) return match;
    }
    return null;
  }, [selectedNodeId, graph]);

  // All links from current graph
  const allLinks = useMemo(() => {
    if (!graph) return [];
    return graph.structures.flatMap((s) => s.links);
  }, [graph]);

  // Empty states
  if (!currentStep || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-fg">
        <Layers size={28} className="text-accent/50 mb-1" />
        <p className="text-sm font-semibold text-fg">Data Structure Visualizer</p>
        <p className="max-w-xs text-xs text-fg-muted">
          Step into code containing arrays, pointers, or dynamic memory to explore interactive structure graphs and memory layouts.
        </p>
      </div>
    );
  }

  if (allPlacedNodes.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <StructureControls
          filter={structureFilter}
          onFilterChange={setStructureFilter}
          canStep={status === "running" || status === "paused"}
          onStepStructure={handleStepStructure}
          latestChange={changes[0] ?? null}
        />
        <div className="bg-blueprint-grid flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-fg">
          <Network size={28} className="text-accent/50 mb-1" />
          <p className="text-sm font-semibold text-fg">No Active Data Structures</p>
          <p className="max-w-xs text-xs text-fg-muted">
            Declare an array (e.g. <code className="font-mono text-accent">int arr[5];</code>) or pointers to see structural representations here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      {/* Educational Controls Bar */}
      <StructureControls
        filter={structureFilter}
        onFilterChange={setStructureFilter}
        canStep={status === "running" || status === "paused"}
        onStepStructure={handleStepStructure}
        latestChange={changes[0] ?? recentChangesRef.current[0] ?? null}
      />

      {/* Main Canvas and Detail Inspector */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <StructureCanvas
          width={canvasW}
          height={canvasH}
          placedLinks={allPlacedLinks}
        >
          {allPlacedNodes.map((pn) => (
            <StructureNodeCard
              key={pn.node.id}
              node={pn.node}
              x={pn.x}
              y={pn.y}
              w={pn.w}
              h={pn.h}
              isSelected={selectedNodeId === pn.node.id}
              selectedSlotIndex={selectedNodeId === pn.node.id ? selectedSlotIndex : null}
              onSelectNode={(node: StructureNode) => setSelectedNode(node.id, null)}
              onSelectSlot={(node: StructureNode, slotIndex: number) =>
                setSelectedNode(node.id, slotIndex)
              }
            />
          ))}
        </StructureCanvas>

        {/* Generalized Detail Sidebar */}
        {selectedNode && (
          <StructureDetailSidebar
            selectedNode={selectedNode}
            selectedSlotIndex={selectedSlotIndex}
            links={allLinks}
            recentChanges={recentChangesRef.current}
            stepAccesses={currentStep?.stepAccesses ?? []}
            onClose={() => setSelectedNode(null, null)}
          />
        )}
      </div>
    </div>
  );
};
