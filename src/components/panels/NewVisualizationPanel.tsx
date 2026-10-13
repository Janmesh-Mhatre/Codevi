import { useState, useMemo, Fragment } from "react";
import { Crosshair, MousePointerClick, Table, Layers, ArrowLeftRight, MemoryStick } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatAddress, addressesEqual, type Address } from "../../memory/memory";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import {
  routeBezier,
  routeOutwardLoop,
  routeSelfLoop,
  routeAdjacentHeap,
  routeCircularClosing,
  routeReverseHeap,
  getFieldColor,
  getMarkerForColor,
  orderHeapBlocks,
} from "../../visualization/connectors/connectorRouting";
import { detectPointerViewTrees } from "./pointerViewTreeLayout";
import type {
  PointerRelationship,
  PointerViewVariable,
  HeapBlock,
  ExecutionValue,
  StepMemoryAccess,
} from "../../execution/models/executionTypes";

/** Layout constants for Memory SVG */
const NODE_W = 160;
const EXPANDED_NODE_W = 320;
const NODE_H = 42;
const HEAP_NODE_W = 180;
const HEAP_NODE_H = 56;
const COL_GAP = 200;
const ROW_GAP = 16;
const PAD = 24;
const TOP_PAD = 42;
const NULL_NODE_W = 64;
const NULL_NODE_H = 28;
const STACK_TO_HEAP_COLOR = "#818cf8";

interface ArrayEntry {
  name: string;
  value: ExecutionValue & { kind: "array" };
  address?: Address;
  is2D: boolean;
  rows: number;
  cols: number;
}

interface StackEntry {
  name: string;
  value: ExecutionValue & { kind: "array" };
  address?: Address;
  topIndex: number;
}

interface QueueEntry {
  name: string;
  value: ExecutionValue & { kind: "array" };
  address?: Address;
  frontIndex: number;
  rearIndex: number;
  frontKey: string;
  rearKey: string;
}

/**
 * Direct routing for Stack -> Heap connectors with ONE controlled bend.
 */
function routeStackToHeap(
  x1: number,
  y1: number,
  targetNode: { x: number; y: number; w: number; h: number; b: HeapBlock },
  allHeapNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[],
  stackIdx: number,
): string {
  const x2 = targetNode.x;
  const y2 = targetNode.y + targetNode.h / 2;

  const obstacles = allHeapNodes.filter((n) => {
    if (n.b.address.id === targetNode.b.address.id) return false;
    const isToLeft = n.x + n.w <= targetNode.x - 5 && n.x >= x1;
    const cardTop = n.y;
    const cardBottom = n.y + n.h;
    const minPathY = Math.min(y1, y2) - 4;
    const maxPathY = Math.max(y1, y2) + 4;
    return isToLeft && cardTop < maxPathY && cardBottom > minPathY;
  });

  if (obstacles.length === 0) {
    const dx = x2 - x1;
    const cp = Math.max(30, dx * 0.45);
    return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
  }

  const minObsY = Math.min(...obstacles.map((o) => o.y));
  const maxObsY = Math.max(...obstacles.map((o) => o.y + o.h));
  const turnX = Math.max(x1 + 30, x2 - 28);
  const cpBend = Math.min(22, (x2 - turnX) * 0.7);

  if (y1 <= minObsY - 6) {
    return `M ${x1} ${y1} L ${turnX} ${y1} C ${turnX + cpBend} ${y1}, ${x2 - cpBend} ${y2}, ${x2} ${y2}`;
  }

  if (y1 >= maxObsY + 6) {
    return `M ${x1} ${y1} L ${turnX} ${y1} C ${turnX + cpBend} ${y1}, ${x2 - cpBend} ${y2}, ${x2} ${y2}`;
  }

  const distToTop = y1 - minObsY;
  const distToBottom = maxObsY - y1;
  const routeAbove = distToTop <= distToBottom;
  const laneOffset = (stackIdx % 3) * 6;
  const bypassY = routeAbove
    ? minObsY - 14 - laneOffset
    : maxObsY + 14 + laneOffset;

  const laneX = x1 + 24;
  const cpLane = 12;

  return (
    `M ${x1} ${y1} ` +
    `C ${x1 + cpLane} ${y1}, ${laneX - 6} ${bypassY}, ${laneX + cpLane} ${bypassY} ` +
    `L ${turnX} ${bypassY} ` +
    `C ${turnX + cpBend} ${bypassY}, ${x2 - cpBend} ${y2}, ${x2} ${y2}`
  );
}

function ptrLabel(rel: PointerRelationship): string {
  if (rel.status === "null") return "NULL";
  if (rel.status === "freed") return `→ ${rel.targetName ?? "??"} (freed)`;
  return rel.targetName ? `→ ${rel.targetName}` : `→ ${formatAddress(rel.targetAddress!)}`;
}

function statusColor(status: PointerRelationship["status"]): string {
  switch (status) {
    case "valid": return "var(--color-accent)";
    case "null": return "var(--color-fg-muted)";
    case "freed": return "var(--color-danger)";
    case "invalid": return "var(--color-danger)";
  }
}

function statusDash(status: PointerRelationship["status"]): string | undefined {
  return status === "freed" || status === "invalid" ? "6 4" : undefined;
}

function typeLabel(value: ExecutionValue): string {
  if (value.kind === "pointer") return `${value.type} *`;
  if (value.kind === "array") return formatArrayTypeDeclaration(value);
  return value.type;
}

function formatArrayTypeDeclaration(value: ExecutionValue): string {
  if (value.kind !== "array") return value.type;
  if (value.type.includes("[")) return value.type;
  if (value.dimensions && value.dimensions.length > 0) {
    return `${value.type}${value.dimensions.map((d) => `[${d}]`).join("")}`;
  }
  return `${value.type}[${value.length}]`;
}

function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Phase 6.4.2: Complete Unified Visualization Tab
 *
 * Combines:
 * 1. DATA-STRUCTURE VISUALIZATIONS (upper section, arranged vertically):
 *    - Array (1D & 2D)
 *    - Stack (Data Structure)
 *    - Queue (Data Structure)
 * 2. MEMORY / STRUCTURAL VISUALIZATIONS (lower section, arranged side-by-side):
 *    - Stack (Memory)
 *    - Heap / Tree
 */
export function NewVisualizationPanel() {
  const status = useExecutionStore((s) => s.status);
  const currentStep = useExecutionStore((s) => s.currentStep);
  const activeFrame = currentStep?.callStack.find((f) => f.isActive) ?? currentStep?.callStack[currentStep.callStack.length - 1] ?? null;
  const stepAccesses = currentStep?.stepAccesses ?? [];
  const pointerView = currentStep?.pointerView;
  const [selected, setSelected] = useState<string | null>(null);

  // Helper to determine access highlight for an address
  const getAccessHighlight = (targetAddr?: Address): "read" | "write" | null => {
    if (!targetAddr || stepAccesses.length === 0) return null;
    const hit = stepAccesses.find((a: StepMemoryAccess) => addressesEqual(a.address, targetAddr));
    return hit ? hit.kind : null;
  };

  // --- DATA STRUCTURE DETECTION (Array, Stack DS, Queue DS) ---
  const { arrays, stacks, queues } = useMemo(() => {
    if (!currentStep) return { arrays: [], stacks: [], queues: [] };

    const getAddress = (varName: string): Address | undefined => {
      if (activeFrame?.addresses[varName]) return activeFrame.addresses[varName];
      for (const frame of currentStep.callStack) {
        if (frame.addresses[varName]) return frame.addresses[varName];
      }
      if (currentStep.globalAddresses?.[varName]) return currentStep.globalAddresses[varName];
      return undefined;
    };

    // 1. Gather all variables across scopes
    const globalVars: [string, ExecutionValue][] = currentStep.globals
      ? Object.entries(currentStep.globals)
      : [];
    const frameVars: [string, ExecutionValue][] = [];
    for (const frame of currentStep.callStack) {
      frameVars.push(...Object.entries(frame.parameters), ...Object.entries(frame.locals));
    }
    const allVars = [...globalVars, ...frameVars];

    // Collect integer scalar names for heuristic matching (top, front/head, rear/tail)
    const intVars = new Map<string, number>();
    for (const [name, val] of allVars) {
      if (val.kind === "scalar" && (val.type === "int" || val.type === "char")) {
        intVars.set(name.toLowerCase(), val.value);
      }
    }

    const topVal = intVars.get("top");
    const frontVal = intVars.get("front") ?? intVars.get("head");
    const rearVal = intVars.get("rear") ?? intVars.get("tail");
    const frontKey = intVars.has("front") ? "front" : intVars.has("head") ? "head" : "front";
    const rearKey = intVars.has("rear") ? "rear" : intVars.has("tail") ? "tail" : "rear";

    const arraysList: ArrayEntry[] = [];
    const stacksList: StackEntry[] = [];
    const queuesList: QueueEntry[] = [];

    const getScalarVal = (v?: ExecutionValue, fallback: number = -1): number =>
      v && v.kind === "scalar" && typeof v.value === "number" ? v.value : fallback;

    // --- Struct-backed stack/queue detection ---
    for (const [varName, val] of allVars) {
      if (val.kind !== "pointer" || !val.target) continue;
      const lowerType = val.type.toLowerCase();
      const lowerName = varName.toLowerCase();
      const isStructStack = lowerType.includes("struct stack") || (lowerType.startsWith("struct") && (lowerName.includes("stack") || lowerName === "s"));
      const isStructQueue = lowerType.includes("struct queue") || (lowerType.startsWith("struct") && (lowerName.includes("queue") || lowerName === "q"));

      if (isStructStack) {
        if (val.target.space === "heap") {
          const block = currentStep.heap.find((b) => b.active && b.address.id === val.target!.id);
          if (block && block.slotCount >= 2) {
            const dataCount = block.slotCount - 1;
            const sTop = getScalarVal(block.values[dataCount], -1);
            const dataVals: ExecutionValue[] = [];
            for (let i = 0; i < dataCount; i++) {
              dataVals.push(block.values[i] ?? { kind: "scalar", type: "int", value: 0 });
            }
            const dataArrVal: ExecutionValue & { kind: "array" } = {
              kind: "array",
              type: `int[${dataCount}]`,
              address: val.target,
              length: dataCount,
              values: dataVals,
            };
            if (!stacksList.some((s) => s.name === `${varName}.data`)) {
              stacksList.push({
                name: `${varName}.data`,
                value: dataArrVal,
                address: val.target,
                topIndex: sTop,
              });
            }
          }
        } else if (val.target.space === "stack" && val.structValues && val.structValues.length >= 2) {
          const dataCount = val.structValues.length - 1;
          const sTop = getScalarVal(val.structValues[dataCount], -1);
          const dataVals = val.structValues.slice(0, dataCount);
          const dataArrVal: ExecutionValue & { kind: "array" } = {
            kind: "array",
            type: `int[${dataCount}]`,
            address: val.target,
            length: dataCount,
            values: dataVals,
          };
          if (!stacksList.some((s) => s.name === `${varName}.data`)) {
            stacksList.push({
              name: `${varName}.data`,
              value: dataArrVal,
              address: val.target,
              topIndex: sTop,
            });
          }
        }
      }

      if (isStructQueue) {
        if (val.target.space === "heap") {
          const block = currentStep.heap.find((b) => b.active && b.address.id === val.target!.id);
          if (block && block.slotCount >= 3) {
            const dataCount = block.slotCount - 2;
            const sFront = getScalarVal(block.values[dataCount], 0);
            const sRear = getScalarVal(block.values[dataCount + 1], -1);
            const dataVals: ExecutionValue[] = [];
            for (let i = 0; i < dataCount; i++) {
              dataVals.push(block.values[i] ?? { kind: "scalar", type: "int", value: 0 });
            }
            const dataArrVal: ExecutionValue & { kind: "array" } = {
              kind: "array",
              type: `int[${dataCount}]`,
              address: val.target,
              length: dataCount,
              values: dataVals,
            };
            if (!queuesList.some((q) => q.name === `${varName}.data`)) {
              queuesList.push({
                name: `${varName}.data`,
                value: dataArrVal,
                address: val.target,
                frontIndex: sFront,
                rearIndex: sRear,
                frontKey: "front",
                rearKey: "rear",
              });
            }
          }
        } else if (val.target.space === "stack" && val.structValues && val.structValues.length >= 3) {
          const dataCount = val.structValues.length - 2;
          const sFront = getScalarVal(val.structValues[dataCount], 0);
          const sRear = getScalarVal(val.structValues[dataCount + 1], -1);
          const dataVals = val.structValues.slice(0, dataCount);
          const dataArrVal: ExecutionValue & { kind: "array" } = {
            kind: "array",
            type: `int[${dataCount}]`,
            address: val.target,
            length: dataCount,
            values: dataVals,
          };
          if (!queuesList.some((q) => q.name === `${varName}.data`)) {
            queuesList.push({
              name: `${varName}.data`,
              value: dataArrVal,
              address: val.target,
              frontIndex: sFront,
              rearIndex: sRear,
              frontKey: "front",
              rearKey: "rear",
            });
          }
        }
      }
    }

    // Collect array variables across scopes
    const arrayMap = new Map<string, { name: string; val: ExecutionValue & { kind: "array" }; address?: Address }>();
    for (const [name, val] of allVars) {
      if (val.kind === "array" && !arrayMap.has(name)) {
        arrayMap.set(name, { name, val, address: val.address ?? getAddress(name) });
      }
    }

    for (const [name, arr] of arrayMap) {
      const val = arr.val;
      const address = arr.address;
      const labelLower = name.toLowerCase();
      const isNamedStack = labelLower.includes("stack") || labelLower === "s" || labelLower.includes("stk");
      const isNamedQueue = labelLower.includes("queue") || labelLower === "q";

      let shouldPromoteStack = false;
      let shouldPromoteQueue = false;

      const otherHasNamedStack = [...arrayMap.keys()].some((k) => {
        const l = k.toLowerCase();
        return k !== name && (l.includes("stack") || l === "s" || l.includes("stk"));
      });
      const otherHasNamedQueue = [...arrayMap.keys()].some((k) => {
        const l = k.toLowerCase();
        return k !== name && (l.includes("queue") || l === "q");
      });

      if (topVal !== undefined && frontVal !== undefined && rearVal !== undefined) {
        if (isNamedStack) shouldPromoteStack = true;
        else if (isNamedQueue) shouldPromoteQueue = true;
        else if (!otherHasNamedStack && !otherHasNamedQueue) shouldPromoteStack = true;
      } else if (topVal !== undefined) {
        if (isNamedStack) shouldPromoteStack = true;
        else if (!otherHasNamedStack && !isNamedQueue) shouldPromoteStack = true;
      } else if (frontVal !== undefined && rearVal !== undefined) {
        if (isNamedQueue) shouldPromoteQueue = true;
        else if (!otherHasNamedQueue && !isNamedStack) shouldPromoteQueue = true;
      }

      if (shouldPromoteStack && topVal !== undefined) {
        stacksList.push({ name, value: val, address, topIndex: topVal });
      } else if (shouldPromoteQueue && frontVal !== undefined && rearVal !== undefined) {
        queuesList.push({ name, value: val, address, frontIndex: frontVal, rearIndex: rearVal, frontKey, rearKey });
      } else {
        const is2D = Boolean(val.dimensions && val.dimensions.length === 2);
        const rows = is2D ? val.dimensions![0] : 1;
        const cols = is2D ? val.dimensions![1] : val.length;
        arraysList.push({ name, value: val, address, is2D, rows, cols });
      }
    }

    return { arrays: arraysList, stacks: stacksList, queues: queuesList };
  }, [currentStep, activeFrame]);

  const hasDS = arrays.length > 0 || stacks.length > 0 || queues.length > 0;

  // --- MEMORY / STRUCTURAL DATA (Stack Memory & Heap/Tree) ---
  const relationships = pointerView?.relationships ?? [];
  const stackVariables = pointerView?.stackVariables ?? [];
  const heapBlocks = pointerView?.heapBlocks ?? [];

  const hasStack = stackVariables.length > 0;
  const hasHeap = heapBlocks.length > 0;
  const hasMemory = hasStack || hasHeap;

  if (!currentStep || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Crosshair size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">Visualization</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          Data structures (Arrays, Stacks, Queues) and memory allocations will appear here once you run or step through code.
        </p>
      </div>
    );
  }

  if (!hasDS && !hasMemory) {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Crosshair size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">No visualizable structures</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          No active data structures (arrays, stacks, queues) or memory allocations exist in the current scope.
        </p>
      </div>
    );
  }

  // --- MEMORY LAYOUT COMPUTATION ---
  const stackNodeW = hasHeap ? NODE_W : EXPANDED_NODE_W;
  const stackX = PAD;

  const stackNodes: { x: number; y: number; w: number; h: number; v: PointerViewVariable }[] = [];
  let stackY = TOP_PAD + 26;
  if (hasStack) {
    for (const v of stackVariables) {
      const h = NODE_H;
      stackNodes.push({ x: stackX, y: stackY, w: stackNodeW, h, v });
      stackY += h + ROW_GAP;
    }
  }

  const heapX = hasStack ? PAD + stackNodeW + COL_GAP : PAD;
  const orderedBlocks = orderHeapBlocks(heapBlocks, relationships, stackVariables);

  const treeLayout = detectPointerViewTrees(
    heapBlocks,
    relationships,
    stackVariables,
    heapX,
    TOP_PAD + 26,
  );
  const isTree = treeLayout.detectedTrees.length > 0;

  const heapNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[] = [];
  let heapY = TOP_PAD + 26;
  let freedDividerY: number | null = null;

  if (hasHeap) {
    if (isTree) {
      for (const placed of treeLayout.allPlacedTreeNodes) {
        heapNodes.push({
          x: placed.x,
          y: placed.y,
          w: placed.w,
          h: placed.h,
          b: placed.b,
        });
      }

      let extraHeapY = treeLayout.maxY + ROW_GAP + 10;
      const remainingActive = orderedBlocks.filter(
        (b) => b.active && !treeLayout.treeBlockIds.has(b.address.id),
      );
      for (const b of remainingActive) {
        heapNodes.push({ x: heapX, y: extraHeapY, w: HEAP_NODE_W, h: HEAP_NODE_H, b });
        extraHeapY += HEAP_NODE_H + ROW_GAP;
      }

      const freedBlocks = orderedBlocks.filter((b) => !b.active);
      if (freedBlocks.length > 0) {
        extraHeapY += 10;
        freedDividerY = extraHeapY;
        extraHeapY += 26;
        for (const b of freedBlocks) {
          heapNodes.push({ x: heapX, y: extraHeapY, w: HEAP_NODE_W, h: HEAP_NODE_H, b });
          extraHeapY += HEAP_NODE_H + ROW_GAP;
        }
      }
      heapY = extraHeapY;
    } else {
      for (const b of orderedBlocks) {
        if (!b.active && freedDividerY === null && heapNodes.length > 0) {
          heapY += 10;
          freedDividerY = heapY;
          heapY += 26;
        }
        heapNodes.push({ x: heapX, y: heapY, w: HEAP_NODE_W, h: HEAP_NODE_H, b });
        heapY += HEAP_NODE_H + ROW_GAP;
      }
    }
  }

  const heapMaxX = heapNodes.length > 0
    ? Math.max(...heapNodes.map((n) => n.x + n.w))
    : heapX + HEAP_NODE_W;

  const firstTree = treeLayout.detectedTrees[0];
  const treeRootPos = firstTree ? firstTree.placedNodes.get(firstTree.rootId) : undefined;
  const heapCenterX = treeRootPos
    ? Math.round(treeRootPos.x + HEAP_NODE_W / 2)
    : Math.round(heapX + HEAP_NODE_W / 2);

  const hasCentralNull = relationships.some((r) => {
    if (r.status !== "null") return false;
    if (r.pointerAddress?.space === "heap" && treeLayout.treeBlockIds.has(r.pointerAddress.id)) {
      return false;
    }
    if (r.pointerName.startsWith("H")) {
      const match = r.pointerName.match(/^H(\d+)/);
      if (match && treeLayout.treeBlockIds.has(parseInt(match[1], 10))) {
        return false;
      }
    }
    return true;
  });

  const nullNodeX = hasHeap && hasStack
    ? PAD + stackNodeW + COL_GAP / 2 - NULL_NODE_W / 2
    : PAD + stackNodeW / 2 - NULL_NODE_W / 2;
  const nullNodeY = Math.max(stackY, hasHeap ? heapY : 0) + 8;

  const svgW = hasHeap
    ? Math.max(heapMaxX + 160, treeLayout.maxX + 160)
    : Math.max(stackNodeW + PAD * 2 + 60, 360);
  const svgH = Math.max(stackY, hasHeap ? heapY : 0, hasCentralNull ? nullNodeY + NULL_NODE_H + PAD : 0) + PAD + 30;

  // Arrow computation
  type Arrow = {
    kind: "stack-to-stack" | "stack-to-heap" | "heap-to-heap" | "heap-to-null" | "null";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    dash?: string;
    label: string;
    stackIndex?: number;
    heapIndex?: number;
    customPath?: string;
  };
  const arrows: Arrow[] = [];
  let stackArrowCount = 0;
  let heapArrowCount = 0;
  const seenConnectorKeys = new Set<string>();
  const edgePairCounts = new Map<string, number>();

  for (const rel of relationships) {
    const isHeapSource = rel.pointerAddress?.space === "heap";
    const srcStackNode = !isHeapSource ? stackNodes.find((n) => n.v.name === rel.pointerName) : undefined;
    let srcHeapNode = isHeapSource
      ? heapNodes.find((n) => n.b.address.id === rel.pointerAddress!.id)
      : undefined;

    if (!srcStackNode && !srcHeapNode && rel.pointerName.startsWith("H")) {
      const match = rel.pointerName.match(/^H(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        srcHeapNode = heapNodes.find((n) => n.b.address.id === id);
      }
    }

    if (!srcStackNode && !srcHeapNode) continue;

    const fieldName = rel.fieldName ?? (rel.pointerName.includes("->") ? rel.pointerName.split("->")[1] : "next");
    const edgeColor = getFieldColor(fieldName, rel.status);

    if (srcHeapNode) {
      const srcKey = rel.pointerAddress ? formatAddress(rel.pointerAddress) : formatAddress(srcHeapNode.b.address);
      const tgtKey = rel.targetAddress ? formatAddress(rel.targetAddress) : "NULL";
      const connKey = `${srcKey}:${fieldName}:${tgtKey}`;
      if (seenConnectorKeys.has(connKey)) continue;
      seenConnectorKeys.add(connKey);

      if (rel.status === "null") {
        if (treeLayout.treeBlockIds.has(srcHeapNode.b.address.id)) {
          continue;
        }
        arrows.push({
          kind: "heap-to-null",
          x1: srcHeapNode.x,
          y1: srcHeapNode.y + 44,
          x2: nullNodeX + NULL_NODE_W,
          y2: nullNodeY + NULL_NODE_H / 2,
          color: edgeColor,
          dash: undefined,
          label: rel.pointerName,
        });
        continue;
      }

      if (rel.targetRegion === "heap" && rel.targetAddress) {
        const tgtHeapNode = heapNodes.find((n) => n.b.address.id === rel.targetAddress!.id);
        if (
          tgtHeapNode &&
          treeLayout.treeBlockIds.has(srcHeapNode.b.address.id) &&
          treeLayout.treeBlockIds.has(tgtHeapNode.b.address.id)
        ) {
          continue;
        }
        if (tgtHeapNode) {
          const srcIdx = heapNodes.indexOf(srcHeapNode);
          const tgtIdx = heapNodes.indexOf(tgtHeapNode);
          const diff = tgtIdx - srcIdx;

          const pairKey = `${srcHeapNode.b.address.id}->${tgtHeapNode.b.address.id}`;
          const pairCount = edgePairCounts.get(pairKey) ?? 0;
          edgePairCounts.set(pairKey, pairCount + 1);
          const extraOffset = pairCount * 22;

          const y1 = srcHeapNode.y + (fieldName === "prev" ? 34 : 44);
          const y2 = tgtHeapNode.y + (fieldName === "prev" ? 38 : 22);
          const x1 = srcHeapNode.x + srcHeapNode.w;
          const x2 = tgtHeapNode.x + tgtHeapNode.w;

          let customPath: string;
          if (diff === 0) {
            customPath = routeSelfLoop(x1, y1, heapArrowCount);
          } else if (diff === 1) {
            const lane = 30 + extraOffset;
            customPath = routeAdjacentHeap(x1, y1, x2, y2, lane);
          } else if (diff === -1) {
            const lane = 52 + extraOffset;
            customPath = routeReverseHeap(x1, y1, x2, y2, lane);
          } else if (diff < -1) {
            const skipped = Math.abs(diff) - 1;
            const outerOffset = 80 + Math.min(40, skipped * 12) + extraOffset;
            customPath = routeCircularClosing(x1, y1, x2, y2, outerOffset);
          } else {
            const lane = 65 + extraOffset;
            customPath = routeCircularClosing(x1, y1, x2, y2, lane);
          }

          arrows.push({
            kind: "heap-to-heap",
            x1,
            y1,
            x2,
            y2,
            color: edgeColor,
            dash: statusDash(rel.status),
            label: rel.pointerName,
            heapIndex: heapArrowCount++,
            customPath,
          });
          continue;
        }
      }
      continue;
    }

    // Stack-originated pointer
    const srcNode = srcStackNode!;
    const srcKey = rel.pointerAddress ? formatAddress(rel.pointerAddress) : rel.pointerName;
    const tgtKey = rel.targetAddress ? formatAddress(rel.targetAddress) : "NULL";
    const connKey = `${srcKey}->${tgtKey}`;
    if (seenConnectorKeys.has(connKey)) continue;
    seenConnectorKeys.add(connKey);

    const x1 = srcNode.x + srcNode.w;
    const y1 = srcNode.y + srcNode.h / 2;

    if (rel.status === "null") {
      arrows.push({
        kind: "null",
        x1, y1,
        x2: nullNodeX, y2: nullNodeY + NULL_NODE_H / 2,
        color: statusColor(rel.status),
        dash: undefined,
        label: rel.pointerName,
      });
      continue;
    }

    if (rel.targetRegion === "heap" && rel.targetAddress) {
      const heapNode = heapNodes.find((n) => n.b.address.id === rel.targetAddress!.id);
      if (heapNode) {
        const stackIdx = stackArrowCount++;
        const customPath = routeStackToHeap(x1, y1, heapNode, heapNodes, stackIdx);
        arrows.push({
          kind: "stack-to-heap",
          x1, y1,
          x2: heapNode.x, y2: heapNode.y + heapNode.h / 2,
          color: rel.status === "valid" ? STACK_TO_HEAP_COLOR : statusColor(rel.status),
          dash: statusDash(rel.status),
          label: rel.pointerName,
          stackIndex: stackIdx,
          customPath,
        });
        continue;
      }
    }

    if (rel.targetAddress) {
      const targetNode = stackNodes.find((n) => {
        const addr = n.v.address;
        return addr.space === rel.targetAddress!.space && addr.id === rel.targetAddress!.id;
      });
      if (targetNode) {
        const targetY = targetNode.y + targetNode.h / 2;
        arrows.push({
          kind: "stack-to-stack",
          x1, y1,
          x2: targetNode.x + targetNode.w,
          y2: targetY,
          color: statusColor(rel.status),
          dash: statusDash(rel.status),
          label: rel.pointerName,
          stackIndex: stackArrowCount++,
        });
      }
    }
  }

  const selectedRel = selected ? relationships.find((r) => r.pointerName === selected) : null;
  const selectedArray = selected ? arrays.find((a) => a.name === selected) : null;

  return (
    <div className="flex h-full bg-canvas/50 overflow-hidden">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
        {/* 1. DATA-STRUCTURE VISUALIZATIONS SECTION (Strict Order: Array -> Stack DS -> Queue DS) */}
        {hasDS && (
          <div className="flex flex-col gap-6 shrink-0">
            {/* 1A. ARRAY VISUALIZATION */}
            {arrays.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent">
                  <Table size={13} />
                  <span>Arrays (1D & 2D)</span>
                </div>
                <div className="flex flex-col gap-4">
                  {arrays.map((arr) => (
                    <ArrayDSCard
                      key={arr.name}
                      arr={arr}
                      isSelected={selected === arr.name}
                      onSelect={() => setSelected(selected === arr.name ? null : arr.name)}
                      getAccessHighlight={getAccessHighlight}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 1B. STACK DATA STRUCTURE VISUALIZATION */}
            {stacks.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#34d399]">
                  <Layers size={13} />
                  <span>Stack (LIFO)</span>
                </div>
                <div className="flex flex-col gap-4">
                  {stacks.map((stk) => (
                    <StackDSCard key={stk.name} stk={stk} getAccessHighlight={getAccessHighlight} />
                  ))}
                </div>
              </section>
            )}

            {/* 1C. QUEUE DATA STRUCTURE VISUALIZATION */}
            {queues.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#a78bfa]">
                  <ArrowLeftRight size={13} />
                  <span>Queue (FIFO)</span>
                </div>
                <div className="flex flex-col gap-4">
                  {queues.map((q) => (
                    <QueueDSCard key={q.name} q={q} getAccessHighlight={getAccessHighlight} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Divider if both Data Structures and Memory layout exist */}
        {hasDS && hasMemory && (
          <div className="border-t border-border/80 my-1" />
        )}

        {/* 2. MEMORY / STRUCTURAL VISUALIZATIONS SECTION (Side-by-side Stack Memory & Heap/Tree) */}
        {hasMemory && (
          <div className="flex flex-col min-w-0">
            {/* Memory Section Header using Declarations symbols and typography */}
            <div className="flex items-center gap-4 mb-1">
              {hasStack && (
                <div
                  style={{ width: `${stackNodeW}px` }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent"
                >
                  <Layers size={13} />
                  <span>Stack (Memory)</span>
                </div>
              )}
              {hasHeap && (
                <div
                  style={{ marginLeft: hasStack ? `${COL_GAP - 16}px` : "0px" }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-active"
                >
                  <MemoryStick size={13} />
                  <span>{isTree ? "Tree" : "Heap"}</span>
                </div>
              )}
            </div>

            <svg
              width={svgW}
              height={svgH}
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="pointer-view-svg"
            >
              <defs>
                <marker id="arrow-valid" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-accent)" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-active)" />
                </marker>
                <marker id="arrow-null" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-fg-muted)" />
                </marker>
                <marker id="arrow-danger" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-danger)" />
                </marker>
                <marker id="arrow-violet" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="#a78bfa" />
                </marker>
                <marker id="arrow-emerald" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="#34d399" />
                </marker>
                <marker id="arrow-pink" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="#f472b6" />
                </marker>
                <marker id="arrow-sky" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="#38bdf8" />
                </marker>
                <marker id="arrow-amber" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="#f59e0b" />
                </marker>
                <marker id="arrow-stack-heap" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6 Z" fill="#818cf8" />
                </marker>
              </defs>

              {/* Column labels: STACK (Memory) and TREE / HEAP */}
              {hasStack && (
                <text
                  x={stackX + stackNodeW / 2}
                  y={TOP_PAD}
                  fill="var(--color-accent)"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="0.08em"
                  textAnchor="middle"
                >
                  STACK (Memory)
                </text>
              )}

              {hasHeap && (
                <text
                  x={heapCenterX}
                  y={TOP_PAD}
                  fill="var(--color-active)"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="0.08em"
                  textAnchor="middle"
                >
                  {isTree ? "TREE" : "HEAP"}
                </text>
              )}

              {/* Central NULL node */}
              {hasCentralNull && (
                <g>
                  <rect
                    x={nullNodeX} y={nullNodeY} width={NULL_NODE_W} height={NULL_NODE_H}
                    rx={4}
                    fill="var(--color-surface)"
                    stroke="var(--color-fg-muted)"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={nullNodeX + NULL_NODE_W / 2} y={nullNodeY + NULL_NODE_H / 2 + 4}
                    fill="var(--color-fg-muted)" fontSize="12" fontWeight="600"
                    fontFamily="var(--font-mono)" textAnchor="middle"
                  >
                    NULL
                  </text>
                </g>
              )}

              {/* Tree branch connectors */}
              {treeLayout.detectedTrees.map((tree) => (
                <g key={`tree-branches-${tree.rootId}`} className="tree-connectors">
                  {tree.childLinks.map((link) => {
                    const color = link.isLeft ? "var(--color-accent)" : "var(--color-active)";
                    const markerId = link.isLeft ? "arrow-valid" : "arrow-active";
                    return (
                      <path
                        key={`tree-branch-${link.parentId}-${link.childId}-${link.isLeft ? "L" : "R"}`}
                        d={link.pathD}
                        className={`tree-branch ${link.isLeft ? "tree-branch-left" : "tree-branch-right"}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.8}
                        markerEnd={`url(#${markerId})`}
                        opacity={0.85}
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          values="0;0"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      </path>
                    );
                  })}
                </g>
              ))}

              {/* Connectors / Arrows */}
              {arrows.map((a, i) => {
                const markerId =
                  a.kind === "stack-to-heap" && a.color === STACK_TO_HEAP_COLOR
                    ? "arrow-stack-heap"
                    : getMarkerForColor(a.color);

                let pathD: string;
                if (a.customPath) {
                  pathD = a.customPath;
                } else if (a.kind === "stack-to-stack") {
                  const idx = a.stackIndex ?? 0;
                  pathD = routeOutwardLoop(a.x1, a.y1, a.x2, a.y2, idx);
                } else if (a.kind === "heap-to-heap") {
                  const idx = a.heapIndex ?? 0;
                  pathD = routeOutwardLoop(a.x1, a.y1, a.x2, a.y2, idx);
                } else if (a.kind === "heap-to-null") {
                  const dx = Math.abs(a.x1 - a.x2);
                  const cp = Math.max(30, dx * 0.4);
                  pathD = `M ${a.x1} ${a.y1} C ${a.x1 - cp} ${a.y1}, ${a.x2 + cp} ${a.y2}, ${a.x2} ${a.y2}`;
                } else {
                  pathD = routeBezier(a.x1, a.y1, a.x2, a.y2);
                }

                return (
                  <path
                    key={i}
                    d={pathD}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={1.5}
                    strokeDasharray={a.dash}
                    markerEnd={`url(#${markerId})`}
                    opacity={0.85}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      values={a.dash ? "20;0" : "0;0"}
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </path>
                );
              })}

              {/* Tree local NULL indicators */}
              {treeLayout.detectedTrees.map((tree) => (
                <g key={`tree-nulls-${tree.rootId}`} className="tree-null-indicators">
                  {tree.nullMarkers.map((m, mIdx) => (
                    <g key={`tree-null-${m.parentId}-${m.isLeft ? "L" : "R"}-${mIdx}`} className="tree-null-marker">
                      <line
                        x1={m.x}
                        y1={m.y - 6}
                        x2={m.x}
                        y2={m.y + 6}
                        stroke="var(--color-fg-muted)"
                        strokeWidth={1.2}
                        strokeDasharray="2 2"
                      />
                      <rect
                        x={m.x - 14}
                        y={m.y + 6}
                        width={28}
                        height={14}
                        rx={3}
                        fill="var(--color-surface)"
                        stroke="var(--color-fg-muted)"
                        strokeWidth={0.8}
                        strokeDasharray="2 2"
                        opacity={0.85}
                      />
                      <text
                        x={m.x}
                        y={m.y + 16}
                        fill="var(--color-fg-muted)"
                        fontSize={8}
                        fontWeight="600"
                        fontFamily="var(--font-mono)"
                        textAnchor="middle"
                      >
                        NULL
                      </text>
                    </g>
                  ))}
                </g>
              ))}

              {/* Stack variable nodes */}
              {stackNodes.map(({ x, y, w, h, v }) => {
                const isPointer = v.value.kind === "pointer";
                const isArray = v.isArray || v.value.kind === "array";
                const canSelect = isPointer || isArray;
                const isSelected = selected === v.name;
                const rel = relationships.find((r) => r.pointerName === v.name);

                return (
                  <g
                    key={v.name}
                    onClick={() => canSelect && setSelected(isSelected ? null : v.name)}
                    style={{ cursor: canSelect ? "pointer" : "default" }}
                    className={canSelect ? "cursor-pointer" : undefined}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={6}
                      fill={
                        isSelected
                          ? "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface-raised))"
                          : "var(--color-surface-raised)"
                      }
                      stroke={
                        isSelected
                          ? "var(--color-accent)"
                          : isPointer
                          ? statusColor(rel?.status ?? "valid")
                          : isArray
                          ? "color-mix(in srgb, var(--color-accent) 35%, var(--color-border))"
                          : "var(--color-border)"
                      }
                      strokeWidth={isSelected ? 2 : 1}
                      opacity={0.95}
                    />

                    {/* Variable Name */}
                    <text
                      x={x + 8}
                      y={y + 16}
                      fill="var(--color-fg)"
                      fontSize="12"
                      fontWeight="600"
                      fontFamily="var(--font-mono)"
                    >
                      {v.name}
                    </text>

                    {/* Top-Right: ARRAY badge for array, or type label for non-array */}
                    {isArray ? (
                      <g className="array-indicator-badge">
                        <rect
                          x={x + w - 46}
                          y={y + 5}
                          width={40}
                          height={14}
                          rx={3}
                          fill={
                            isSelected
                              ? "var(--color-accent)"
                              : "color-mix(in srgb, var(--color-accent) 15%, transparent)"
                          }
                          stroke="var(--color-accent)"
                          strokeWidth={0.8}
                        />
                        <text
                          x={x + w - 26}
                          y={y + 15}
                          fill={isSelected ? "var(--color-canvas)" : "var(--color-accent)"}
                          fontSize="8.5"
                          fontWeight="700"
                          fontFamily="var(--font-mono)"
                          textAnchor="middle"
                        >
                          ARRAY
                        </text>
                      </g>
                    ) : (
                      <text
                        x={x + w - 6}
                        y={y + 14}
                        fill="var(--color-fg-muted)"
                        fontSize="9"
                        fontFamily="var(--font-mono)"
                        textAnchor="end"
                      >
                        {typeLabel(v.value)}
                      </text>
                    )}

                    {/* Bottom-Left: Type declaration for array, pointer target for pointer, scalar value for scalar */}
                    <text
                      x={x + 8}
                      y={y + 32}
                      fill={
                        isArray
                          ? "var(--color-fg-muted)"
                          : isPointer && rel?.targetRegion === "heap" && rel?.status === "valid"
                          ? STACK_TO_HEAP_COLOR
                          : isPointer
                          ? statusColor(rel?.status ?? "valid")
                          : "var(--color-fg-muted)"
                      }
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                    >
                      {isArray
                        ? formatArrayTypeDeclaration(v.value)
                        : isPointer
                        ? truncateString(ptrLabel(rel!), 18)
                        : truncateString(formatExecutionValue(v.value), 18)}
                    </text>

                    {/* Bottom-Right: simulated address */}
                    {v.address && (
                      <text
                        x={x + w - 8}
                        y={y + 32}
                        fill="var(--color-fg-muted)"
                        fontSize="9"
                        opacity={0.8}
                        fontFamily="var(--font-mono)"
                        textAnchor="end"
                      >
                        @{formatAddress(v.address)}
                      </text>
                    )}

                    {/* Pointer indicator dot */}
                    {isPointer && (
                      <circle
                        cx={x + w}
                        cy={y + h / 2}
                        r={4}
                        fill={
                          rel?.targetRegion === "heap" && rel?.status === "valid"
                            ? STACK_TO_HEAP_COLOR
                            : statusColor(rel?.status ?? "valid")
                        }
                        stroke="var(--color-surface-raised)"
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                );
              })}

              {/* Heap block nodes */}
              {heapNodes.map(({ x, y, w, h, b }, idx) => {
                const addrStr = formatAddress(b.address);
                const borderColor = b.active ? "var(--color-active)" : "var(--color-danger)";
                const isFirstFreed = !b.active && (idx === 0 || heapNodes[idx - 1].b.active);
                const rootTree = treeLayout.detectedTrees.find((t) => t.rootId === b.address.id);
                return (
                  <Fragment key={addrStr}>
                    {isFirstFreed && freedDividerY !== null && (
                      <g key="freed-divider">
                        <line
                          x1={heapX}
                          y1={freedDividerY}
                          x2={heapX + HEAP_NODE_W}
                          y2={freedDividerY}
                          stroke="var(--color-border)"
                          strokeDasharray="4 4"
                          strokeWidth={1}
                        />
                        <text
                          x={heapX}
                          y={freedDividerY + 16}
                          fill="var(--color-danger)"
                          fontSize="10"
                          fontWeight="600"
                          letterSpacing="0.08em"
                          fontFamily="var(--font-mono)"
                        >
                          FREED ALLOCATIONS
                        </text>
                      </g>
                    )}
                    <g>
                      {/* Active pointer tags */}
                      {(() => {
                        const pointingVars = stackVariables
                          .filter(
                            (v) =>
                              v.value.kind === "pointer" &&
                              v.value.target?.space === "heap" &&
                              v.value.target.id === b.address.id,
                          )
                          .map((v) => v.name);
                        if (pointingVars.length === 0) return null;
                        return (
                          <g className="active-pointer-tags">
                            {pointingVars.map((name, pIdx) => {
                              const tagW = Math.max(48, name.length * 7 + 16);
                              const tagX = x + 8 + pIdx * (tagW + 4);
                              const tagY = y - 16;
                              return (
                                <g key={name} className="active-pointer-tag">
                                  <rect
                                    x={tagX}
                                    y={tagY}
                                    width={tagW}
                                    height={13}
                                    rx={3}
                                    fill="var(--color-surface-raised)"
                                    stroke="var(--color-active)"
                                    strokeWidth={1}
                                  />
                                  <text
                                    x={tagX + tagW / 2}
                                    y={tagY + 9.5}
                                    fill="var(--color-active)"
                                    fontSize={8.5}
                                    fontWeight="600"
                                    fontFamily="var(--font-mono)"
                                    textAnchor="middle"
                                  >
                                    {name} ▾
                                  </text>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })()}

                      <rect
                        x={x} y={y} width={w} height={h} rx={6}
                        fill={b.active ? "color-mix(in srgb, var(--color-active) 8%, var(--color-surface-raised))" : "color-mix(in srgb, var(--color-danger) 8%, var(--color-surface-raised))"}
                        stroke={borderColor}
                        strokeWidth={1}
                        strokeDasharray={b.active ? undefined : "6 4"}
                        opacity={0.95}
                      />
                      {/* MemoryStick Icon from Declarations */}
                      <g
                        transform={`translate(${x + 8}, ${y + 5}) scale(0.65)`}
                        stroke={borderColor}
                        strokeWidth={1.8}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 19v-3" />
                        <path d="M10 19v-3" />
                        <path d="M14 19v-3" />
                        <path d="M18 19v-2" />
                        <path d="m2 12 5-5h10l5 5" />
                        <path d="m2 12 5 5h10l5-5" />
                      </g>
                      <text x={x + 24} y={y + 15} fill={borderColor} fontSize="12" fontWeight="600" fontFamily="var(--font-mono)">
                        {addrStr}
                      </text>
                      {rootTree ? (
                        <g className="tree-status-badge">
                          <rect
                            x={x + w - 78}
                            y={y + 5}
                            width={72}
                            height={14}
                            rx={7}
                            fill={rootTree.isBST ? "color-mix(in srgb, #34d399 15%, var(--color-surface-raised))" : "color-mix(in srgb, #f59e0b 15%, var(--color-surface-raised))"}
                            stroke={rootTree.isBST ? "#34d399" : "#f59e0b"}
                            strokeWidth={0.8}
                          />
                          <circle
                            cx={x + w - 71}
                            cy={y + 12}
                            r={2.5}
                            fill={rootTree.isBST ? "#34d399" : "#f59e0b"}
                          />
                          <text
                            x={x + w - 64}
                            y={y + 15}
                            fill={rootTree.isBST ? "#34d399" : "#f59e0b"}
                            fontSize={8.5}
                            fontWeight="600"
                            fontFamily="var(--font-mono)"
                          >
                            {rootTree.isBST ? "Valid BST" : "BST: Invalid"}
                          </text>
                        </g>
                      ) : (
                        <g className="heap-status-badge">
                          <rect
                            x={x + w - 46}
                            y={y + 5}
                            width={40}
                            height={14}
                            rx={7}
                            fill={b.active ? "color-mix(in srgb, var(--color-active) 15%, transparent)" : "color-mix(in srgb, var(--color-danger) 15%, transparent)"}
                            stroke={borderColor}
                            strokeWidth={0.8}
                          />
                          <text
                            x={x + w - 26}
                            y={y + 15}
                            fill={borderColor}
                            fontSize="8.5"
                            fontWeight="500"
                            textAnchor="middle"
                            fontFamily="var(--font-mono)"
                          >
                            {b.active ? "active" : "freed"}
                          </text>
                        </g>
                      )}
                      <text x={x + 8} y={y + 30} fill="var(--color-fg-muted)" fontSize="10" fontFamily="var(--font-mono)">
                        {truncateString(`${b.origin} · ${b.byteSize}B · ${b.slotCount} slot${b.slotCount > 1 ? "s" : ""}`, 24)}
                      </text>
                      <text x={x + 8} y={y + 45} fill={b.active ? "var(--color-fg)" : "var(--color-fg-muted)"} fontSize="10" fontFamily="var(--font-mono)">
                        {truncateString(`[${b.values.map((v) => formatExecutionValue(v)).join(", ")}]`, 22)}
                      </text>

                      {b.values.map((v, slotIdx) => {
                        if (v.kind !== "pointer") return null;
                        const isTreeBlock = treeLayout.treeBlockIds.has(b.address.id);
                        if (isTreeBlock) {
                          const isLeft = slotIdx === 1;
                          const isRight = slotIdx === 2;
                          const dotX = isLeft ? x + w * 0.35 : isRight ? x + w * 0.65 : x + w;
                          const dotY = isLeft || isRight ? y + h : y + 44;
                          const dotColor = isLeft
                            ? v.target === null
                              ? "var(--color-fg-muted)"
                              : "var(--color-accent)"
                            : isRight
                            ? v.target === null
                              ? "var(--color-fg-muted)"
                              : "var(--color-active)"
                            : "var(--color-accent)";
                          return (
                            <circle
                              key={slotIdx}
                              cx={dotX}
                              cy={dotY}
                              r={3.5}
                              fill={dotColor}
                              stroke="var(--color-surface-raised)"
                              strokeWidth={1.5}
                            />
                          );
                        }
                        const dotY = slotIdx === 2 ? y + 34 : y + 44;
                        const field = slotIdx === 1 ? "next" : slotIdx === 2 ? "prev" : `slot${slotIdx}`;
                        const dotColor = getFieldColor(field, v.target === null ? "null" : "valid");
                        return (
                          <circle
                            key={slotIdx}
                            cx={x + w}
                            cy={dotY}
                            r={4}
                            fill={dotColor}
                            stroke="var(--color-surface-raised)"
                            strokeWidth={1.5}
                          />
                        );
                      })}
                    </g>
                  </Fragment>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Detail sidebar */}
      {(selectedRel || selectedArray) && (
        <div className="w-[200px] shrink-0 border-l border-border bg-surface p-3 overflow-auto">
          {selectedRel && (
            <>
              <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-widest text-accent">
                <MousePointerClick size={13} />
                <span>Pointer Details</span>
              </div>
              <div className="flex flex-col gap-2 font-mono text-xs">
                <DetailRow label="Name" value={selectedRel.pointerName} />
                <DetailRow label="Address" value={selectedRel.pointerAddress ? formatAddress(selectedRel.pointerAddress) : "—"} />
                <DetailRow label="Target" value={selectedRel.targetName ?? (selectedRel.targetAddress ? formatAddress(selectedRel.targetAddress) : "NULL")} />
                <DetailRow label="Region" value={selectedRel.targetRegion} />
                <DetailRow
                  label="Status"
                  value={selectedRel.status}
                  valueClass={
                    selectedRel.status === "valid" ? "text-accent" :
                    selectedRel.status === "null" ? "text-fg-muted" :
                    "text-danger"
                  }
                />
                {selectedRel.chainDepth > 0 && (
                  <DetailRow label="Chain" value={`depth ${selectedRel.chainDepth}`} />
                )}
              </div>
            </>
          )}

          {selectedArray && (
            <div className={selectedRel ? "mt-4 pt-4 border-t border-border" : ""}>
              <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-widest text-accent">
                <Table size={13} />
                <span>Array Connection</span>
              </div>
              <div className="flex flex-col gap-2 font-mono text-xs">
                <DetailRow label="Name" value={selectedArray.name} />
                <DetailRow label="Type" value={selectedArray.value.type} />
                <DetailRow
                  label="Shape"
                  value={
                    selectedArray.is2D
                      ? `${selectedArray.rows} × ${selectedArray.cols}`
                      : `${selectedArray.value.length} elem`
                  }
                />
                <DetailRow
                  label="Address"
                  value={selectedArray.address ? formatAddress(selectedArray.address) : "—"}
                  valueClass="text-accent font-medium"
                />
                <div className="mt-2 rounded bg-accent/15 p-1.5 text-[10px] text-accent font-medium leading-tight text-center">
                  ↑ Connected to Array visualization
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className={valueClass ?? "text-fg"}>{value}</span>
    </div>
  );
}

/**
 * Array Card - Preserves the exact visual style from Variable & Array View.
 */
function ArrayDSCard({
  arr,
  isSelected,
  onSelect,
  getAccessHighlight,
}: {
  arr: ArrayEntry;
  isSelected?: boolean;
  onSelect?: () => void;
  getAccessHighlight: (addr?: Address) => "read" | "write" | null;
}) {
  const baseAddr = arr.address;

  return (
    <div
      onClick={onSelect}
      className={`rounded-md border p-3 shadow-sm transition-all duration-200 cursor-pointer ${
        isSelected
          ? "border-accent ring-2 ring-accent/60 bg-accent/[0.07]"
          : "border-border bg-surface-raised hover:border-border/80"
      }`}
    >
      {/* Array Card Header */}
      <div className="flex items-center justify-between border-b border-border/80 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Table size={13} className={isSelected ? "text-accent" : "text-fg-muted"} />
          <span className="font-mono text-sm font-bold text-fg">
            {arr.name}
          </span>
          <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
            {arr.value.type}
          </span>
          {isSelected && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent uppercase tracking-wide flex items-center gap-1">
              <span>Selected from Stack Memory</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-fg-muted text-[10px]">
            {arr.is2D ? `${arr.rows} × ${arr.cols} matrix (${arr.value.length} elements)` : `${arr.value.length} elements`}
          </span>
          {baseAddr && (
            <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-accent font-medium">
              @{formatAddress(baseAddr)}
            </span>
          )}
        </div>
      </div>

      {/* Array Body: 1D or 2D */}
      {!arr.is2D ? (
        <div className="flex flex-wrap gap-2">
          {arr.value.values.map((elem, i) => {
            const slotAddr: Address | undefined = baseAddr
              ? { space: baseAddr.space, id: baseAddr.id, slot: i }
              : undefined;
            const highlight = getAccessHighlight(slotAddr);

            let slotBorder = "border-border";
            let slotBg = "bg-surface";
            let valColor = "text-fg";

            if (highlight === "write") {
              slotBorder = "border-[#f59e0b]";
              slotBg = "bg-[#f59e0b]/15";
              valColor = "text-[#fbbf24]";
            } else if (highlight === "read") {
              slotBorder = "border-[#22d3ee]";
              slotBg = "bg-[#22d3ee]/15";
              valColor = "text-[#67e8f9]";
            }

            return (
              <div
                key={i}
                className={`flex flex-col items-center justify-between rounded border px-2.5 py-1.5 font-mono min-w-[72px] transition-colors ${slotBorder} ${slotBg}`}
              >
                <div className="flex w-full items-center justify-between gap-2 text-[9px] text-fg-muted">
                  <span>[{i}]</span>
                  {slotAddr && (
                    <span className="opacity-70">
                      @{slotAddr.id}:{slotAddr.slot}
                    </span>
                  )}
                </div>
                <div className="my-0.5 text-xs font-semibold">
                  <span className="text-fg-muted text-[10px] mr-1">[{i}] =</span>
                  <span className={valColor}>{formatExecutionValue(elem)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 overflow-x-auto">
          {Array.from({ length: arr.rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
                Row {r}
              </span>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: arr.cols }).map((_, c) => {
                  const slotIndex = r * arr.cols + c;
                  const elem = arr.value.values[slotIndex] ?? { kind: "scalar", type: "int", value: 0 };
                  const slotAddr: Address | undefined = baseAddr
                    ? { space: baseAddr.space, id: baseAddr.id, slot: slotIndex }
                    : undefined;
                  const highlight = getAccessHighlight(slotAddr);

                  let slotBorder = "border-border";
                  let slotBg = "bg-surface";
                  let valColor = "text-fg";

                  if (highlight === "write") {
                    slotBorder = "border-[#f59e0b]";
                    slotBg = "bg-[#f59e0b]/15";
                    valColor = "text-[#fbbf24]";
                  } else if (highlight === "read") {
                    slotBorder = "border-[#22d3ee]";
                    slotBg = "bg-[#22d3ee]/15";
                    valColor = "text-[#67e8f9]";
                  }

                  return (
                    <div
                      key={c}
                      className={`flex flex-col items-center justify-between rounded border px-2.5 py-1.5 font-mono min-w-[68px] transition-colors ${slotBorder} ${slotBg}`}
                    >
                      <div className="flex w-full items-center justify-between gap-1.5 text-[9px] text-fg-muted">
                        <span>[{r}][{c}]</span>
                        {slotAddr && (
                          <span className="opacity-70">
                            @{slotAddr.id}:{slotAddr.slot}
                          </span>
                        )}
                      </div>
                      <div className="my-0.5 text-xs font-semibold">
                        <span className={valColor}>{formatExecutionValue(elem)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Stack DS Card - Preserves the exact visual style from Variable & Array View.
 */
function StackDSCard({
  stk,
  getAccessHighlight,
}: {
  stk: StackEntry;
  getAccessHighlight: (addr?: Address) => "read" | "write" | null;
}) {
  const baseAddr = stk.address;
  const topIdx = stk.topIndex;
  const isEmpty = topIdx < 0;

  return (
    <div className="rounded-md border border-[#34d399]/30 bg-[#34d399]/5 p-3 shadow-sm">
      {/* Stack Card Header */}
      <div className="flex items-center justify-between border-b border-[#34d399]/20 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#34d399]" />
          <span className="font-mono text-sm font-bold text-fg">
            {stk.name}
          </span>
          <span className="rounded bg-[#34d399]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#34d399] font-semibold">
            STACK
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-fg-muted text-[10px]">
            top = {topIdx}{isEmpty ? " (empty)" : ""}
          </span>
          <span className="text-fg-muted text-[10px]">
            · {stk.value.length} capacity
          </span>
          {baseAddr && (
            <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-[#34d399] font-medium">
              @{formatAddress(baseAddr)}
            </span>
          )}
        </div>
      </div>

      {/* Stack Body: Vertical, top element at the top */}
      <div className="flex flex-col-reverse gap-1.5">
        {stk.value.values.map((elem, i) => {
          const slotAddr: Address | undefined = baseAddr
            ? { space: baseAddr.space, id: baseAddr.id, slot: i }
            : undefined;
          const highlight = getAccessHighlight(slotAddr);
          const isTop = i === topIdx;
          const isAboveTop = i > topIdx;

          let slotBorder = "border-border/60";
          let slotBg = "bg-surface";
          let valColor = "text-fg";

          if (isTop) {
            slotBorder = "border-[#34d399]";
            slotBg = "bg-[#34d399]/15";
            valColor = "text-[#34d399]";
          } else if (isAboveTop) {
            slotBorder = "border-border/30";
            slotBg = "bg-surface/40";
            valColor = "text-fg-muted/40";
          }

          if (highlight === "write") {
            slotBorder = "border-[#f59e0b]";
            slotBg = "bg-[#f59e0b]/15";
            valColor = "text-[#fbbf24]";
          } else if (highlight === "read") {
            slotBorder = "border-[#22d3ee]";
            slotBg = "bg-[#22d3ee]/15";
            valColor = "text-[#67e8f9]";
          }

          return (
            <div
              key={i}
              className={`flex items-center justify-between rounded border px-3 py-1.5 font-mono transition-colors ${slotBorder} ${slotBg}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-fg-muted w-6">[{i}]</span>
                <span className={`text-xs font-semibold ${valColor}`}>
                  {formatExecutionValue(elem)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isTop && (
                  <span className="rounded-full bg-[#34d399]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#34d399] animate-pulse">
                    ← TOP
                  </span>
                )}
                {slotAddr && (
                  <span className="text-[9px] text-fg-muted/60">
                    @{slotAddr.id}:{slotAddr.slot}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Push/Pop direction indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-[#34d399]/15">
        <span className="text-[9px] text-fg-muted/60 uppercase tracking-widest">
          push ↑ · pop ↓
        </span>
      </div>
    </div>
  );
}

/**
 * Queue DS Card - Preserves the exact visual style from Variable & Array View.
 */
function QueueDSCard({
  q,
  getAccessHighlight,
}: {
  q: QueueEntry;
  getAccessHighlight: (addr?: Address) => "read" | "write" | null;
}) {
  const baseAddr = q.address;
  const fIdx = q.frontIndex;
  const rIdx = q.rearIndex;
  const isEmpty = fIdx > rIdx;

  return (
    <div className="rounded-md border border-[#a78bfa]/30 bg-[#a78bfa]/5 p-3 shadow-sm">
      {/* Queue Card Header */}
      <div className="flex items-center justify-between border-b border-[#a78bfa]/20 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-[#a78bfa]" />
          <span className="font-mono text-sm font-bold text-fg">
            {q.name}
          </span>
          <span className="rounded bg-[#a78bfa]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#a78bfa] font-semibold">
            QUEUE
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-fg-muted text-[10px]">
            {q.frontKey} = {fIdx} · {q.rearKey} = {rIdx}{isEmpty ? " (empty)" : ""}
          </span>
          <span className="text-fg-muted text-[10px]">
            · {q.value.length} capacity
          </span>
          {baseAddr && (
            <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-[#a78bfa] font-medium">
              @{formatAddress(baseAddr)}
            </span>
          )}
        </div>
      </div>

      {/* Queue Body: Horizontal pipe layout */}
      <div className="flex items-stretch gap-0 overflow-x-auto">
        {q.value.values.map((elem, i) => {
          const slotAddr: Address | undefined = baseAddr
            ? { space: baseAddr.space, id: baseAddr.id, slot: i }
            : undefined;
          const highlight = getAccessHighlight(slotAddr);
          const isFront = i === fIdx;
          const isRear = i === rIdx;
          const isInRange = i >= fIdx && i <= rIdx;
          const isOutside = !isInRange;

          let slotBorder = "border-border/60";
          let slotBg = "bg-surface";
          let valColor = "text-fg";

          if (isFront) {
            slotBorder = "border-[#22d3ee]";
            slotBg = "bg-[#22d3ee]/15";
            valColor = "text-[#22d3ee]";
          } else if (isRear) {
            slotBorder = "border-[#a78bfa]";
            slotBg = "bg-[#a78bfa]/15";
            valColor = "text-[#a78bfa]";
          } else if (isOutside) {
            slotBorder = "border-border/30";
            slotBg = "bg-surface/40";
            valColor = "text-fg-muted/40";
          }

          if (highlight === "write") {
            slotBorder = "border-[#f59e0b]";
            slotBg = "bg-[#f59e0b]/15";
            valColor = "text-[#fbbf24]";
          } else if (highlight === "read") {
            slotBorder = "border-[#22d3ee]";
            slotBg = "bg-[#22d3ee]/15";
            valColor = "text-[#67e8f9]";
          }

          return (
            <div
              key={i}
              className={`flex flex-col items-center justify-between border px-3 py-1.5 font-mono min-w-[72px] transition-colors ${slotBorder} ${slotBg} ${i === 0 ? "rounded-l" : ""} ${i === q.value.length - 1 ? "rounded-r" : ""}`}
            >
              {/* Top label: front / rear badges */}
              <div className="flex flex-col items-center gap-0.5 mb-1 min-h-[16px]">
                {isFront && (
                  <span className="rounded-full bg-[#22d3ee]/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#22d3ee]">
                    {q.frontKey} ↓
                  </span>
                )}
                {isRear && (
                  <span className="rounded-full bg-[#a78bfa]/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#a78bfa]">
                    {q.rearKey} ↓
                  </span>
                )}
              </div>

              <div className="text-[9px] text-fg-muted">[{i}]</div>
              <div className={`text-xs font-semibold ${valColor}`}>
                {formatExecutionValue(elem)}
              </div>

              {slotAddr && (
                <div className="text-[8px] text-fg-muted/50 mt-0.5">
                  @{slotAddr.id}:{slotAddr.slot}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dequeue/Enqueue direction indicator */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#a78bfa]/15 text-[9px] text-fg-muted/60 uppercase tracking-widest">
        <span>← dequeue ({q.frontKey})</span>
        <span>enqueue ({q.rearKey}) →</span>
      </div>
    </div>
  );
}
