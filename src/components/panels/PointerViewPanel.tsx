import { useState, Fragment } from "react";
import { Crosshair, MousePointerClick } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatAddress } from "../../memory/memory";
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
import type { PointerRelationship, PointerViewVariable, HeapBlock, ExecutionValue } from "../../execution/models/executionTypes";

/** Layout constants */
const NODE_W = 160;
const NODE_H = 38;
const ARRAY_SLOT_W = 38;
const ARRAY_HEADER_H = 24;
const HEAP_NODE_W = 180;
const HEAP_NODE_H = 56;
const COL_GAP = 200;
const ROW_GAP = 16;
const PAD = 24;
const NULL_NODE_W = 64;
const NULL_NODE_H = 28;

/** Derive a short display label for a pointer's value */
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

/** Get the short type label for a value */
function typeLabel(value: ExecutionValue): string {
  if (value.kind === "pointer") return `${value.type} *`;
  return value.type;
}

/**
 * Phase 6: Pointer View — an interactive SVG graph showing "what
 * points to what". Stack variables on the left, heap blocks on the
 * right, animated arrows connecting pointers to their targets.
 *
 * Powered by the same runtime state as every other panel
 * (ExecutionStep.pointerView), computed in ExecutionEngine.
 */
export function PointerViewPanel() {
  const status = useExecutionStore((s) => s.status);
  const currentStep = useExecutionStore((s) => s.currentStep);
  const pointerView = currentStep?.pointerView;
  const [selected, setSelected] = useState<string | null>(null);

  if (!currentStep || !pointerView || status === "idle") {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Crosshair size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">Pointer View</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          Pointer variables and their relationships will appear here once
          you step through code that uses pointers.
        </p>
      </div>
    );
  }

  const { relationships, stackVariables, heapBlocks } = pointerView;

  // If there's nothing to show (no pointers, no heap)
  if (relationships.length === 0 && heapBlocks.length === 0) {
    return (
      <div className="bg-blueprint-grid flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Crosshair size={24} className="text-accent/40 mb-1" />
        <p className="text-sm font-medium text-fg-muted">No pointer relationships</p>
        <p className="max-w-xs text-xs text-fg-muted/80">
          No pointers exist in the current scope yet. Declare a pointer
          variable and step through an assignment to see the graph.
        </p>
      </div>
    );
  }

  // ------ LAYOUT COMPUTATION ------
  // Stack column: one node per variable
  const stackNodes: { x: number; y: number; w: number; h: number; v: PointerViewVariable }[] = [];
  let stackY = PAD + 20; // leave room for column label
  for (const v of stackVariables) {
    const h = v.isArray ? ARRAY_HEADER_H + NODE_H : NODE_H;
    stackNodes.push({ x: PAD, y: stackY, w: NODE_W, h, v });
    stackY += h + ROW_GAP;
  }

  // Heap column: order according to actual next pointers & traversal, followed by remaining active, then freed at bottom
  const orderedBlocks = orderHeapBlocks(heapBlocks, relationships, stackVariables);
  const heapX = PAD + NODE_W + COL_GAP;
  const heapNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[] = [];
  let heapY = PAD + 20;
  let freedDividerY: number | null = null;

  for (const b of orderedBlocks) {
    if (!b.active && freedDividerY === null && heapNodes.length > 0) {
      heapY += 10;
      freedDividerY = heapY;
      heapY += 26;
    }
    heapNodes.push({ x: heapX, y: heapY, w: HEAP_NODE_W, h: HEAP_NODE_H, b });
    heapY += HEAP_NODE_H + ROW_GAP;
  }

  // NULL target (if any pointers are NULL) — positioned at the centre of stack and heap
  const hasNull = relationships.some((r) => r.status === "null");
  const nullNodeX = PAD + NODE_W + COL_GAP / 2 - NULL_NODE_W / 2;
  const nullNodeY = Math.max(stackY, heapY) + 8;

  // SVG dimensions: ensure generous width for outer circular routes and NULL marker
  const svgW = heapX + HEAP_NODE_W + 150;
  const svgH = Math.max(stackY, heapY, hasNull ? nullNodeY + NULL_NODE_H + PAD : 0) + PAD + 30;

  // ------ ARROW COMPUTATION ------
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

    // Fallback: match heap block by pointerName format like "H001->next"
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
      // --- HEAP-ORIGINATED POINTER (e.g. struct Node* next field) ---
      const srcKey = rel.pointerAddress ? formatAddress(rel.pointerAddress) : formatAddress(srcHeapNode.b.address);
      const tgtKey = rel.targetAddress ? formatAddress(rel.targetAddress) : "NULL";
      const connKey = `${srcKey}:${fieldName}:${tgtKey}`;
      if (seenConnectorKeys.has(connKey)) continue;
      seenConnectorKeys.add(connKey);

      if (rel.status === "null") {
        // Arrow from heap node to central NULL node
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

      // Heap-to-heap connection
      if (rel.targetRegion === "heap" && rel.targetAddress) {
        const tgtHeapNode = heapNodes.find((n) => n.b.address.id === rel.targetAddress!.id);
        if (tgtHeapNode) {
          const srcIdx = heapNodes.indexOf(srcHeapNode);
          const tgtIdx = heapNodes.indexOf(tgtHeapNode);
          const diff = tgtIdx - srcIdx;

          // Track multi-edge offset between identical node pairs
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
            // Self-loop
            customPath = routeSelfLoop(x1, y1, heapArrowCount);
          } else if (diff === 1) {
            // Consecutive forward link: equal path length across all consecutive links
            const lane = 30 + extraOffset;
            customPath = routeAdjacentHeap(x1, y1, x2, y2, lane);
          } else if (diff === -1) {
            // Reverse link (e.g. prev): dedicated outer lane so forward and reverse never collide
            const lane = 52 + extraOffset;
            customPath = routeReverseHeap(x1, y1, x2, y2, lane);
          } else if (diff < -1) {
            // Circular closing edge: large outer loop bypassing all intermediate cards
            const skipped = Math.abs(diff) - 1;
            const outerOffset = 80 + Math.min(40, skipped * 12) + extraOffset;
            customPath = routeCircularClosing(x1, y1, x2, y2, outerOffset);
          } else {
            // Forward link skipping intermediate nodes
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

    // --- STACK-ORIGINATED POINTER ---
    const srcNode = srcStackNode!;
    const srcKey = rel.pointerAddress ? formatAddress(rel.pointerAddress) : rel.pointerName;
    const tgtKey = rel.targetAddress ? formatAddress(rel.targetAddress) : "NULL";
    const connKey = `${srcKey}->${tgtKey}`;
    if (seenConnectorKeys.has(connKey)) continue;
    seenConnectorKeys.add(connKey);

    const x1 = srcNode.x + srcNode.w;
    const y1 = srcNode.y + srcNode.h / 2;

    if (rel.status === "null") {
      // Arrow to NULL node
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

    // Try to resolve to a heap node
    if (rel.targetRegion === "heap" && rel.targetAddress) {
      const heapNode = heapNodes.find((n) => n.b.address.id === rel.targetAddress!.id);
      if (heapNode) {
        arrows.push({
          kind: "stack-to-heap",
          x1, y1,
          x2: heapNode.x, y2: heapNode.y + heapNode.h / 2,
          color: statusColor(rel.status),
          dash: statusDash(rel.status),
          label: rel.pointerName,
        });
        continue;
      }
    }

    // Try to resolve to a stack variable
    if (rel.targetAddress) {
      const targetNode = stackNodes.find((n) => {
        const addr = n.v.address;
        return addr.space === rel.targetAddress!.space && addr.id === rel.targetAddress!.id;
      });
      if (targetNode) {
        let targetY = targetNode.y + targetNode.h / 2;
        // If pointing to a specific array element, align to that element's slot row
        if (targetNode.v.isArray && rel.targetAddress.slot > 0) {
          targetY = targetNode.y + NODE_H + ARRAY_HEADER_H / 2;
        }
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

  const selectedRel = relationships.find((r) => r.pointerName === selected);

  return (
    <div className="flex h-full overflow-hidden bg-canvas/50">
      {/* SVG Graph */}
      <div className="flex-1 overflow-auto relative">
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
          </defs>

          {/* Column labels */}
          <text x={PAD} y={PAD + 10} fill="var(--color-accent)" fontSize="11" fontWeight="600" letterSpacing="0.08em">
            STACK
          </text>
          {heapBlocks.length > 0 && (
            <text x={heapX} y={PAD + 10} fill="var(--color-active)" fontSize="11" fontWeight="600" letterSpacing="0.08em">
              HEAP
            </text>
          )}



          {/* Stack variable nodes */}
          {stackNodes.map(({ x, y, w, h, v }) => {
            const isPointer = v.value.kind === "pointer";
            const isSelected = selected === v.name;
            const rel = relationships.find((r) => r.pointerName === v.name);

            return (
              <g
                key={v.name}
                onClick={() => isPointer && setSelected(isSelected ? null : v.name)}
                style={{ cursor: isPointer ? "pointer" : "default" }}
              >
                {/* Node background */}
                <rect
                  x={x} y={y} width={w} height={h} rx={6}
                  fill={isSelected ? "color-mix(in srgb, var(--color-accent) 15%, var(--color-surface-raised))" : "var(--color-surface-raised)"}
                  stroke={isPointer ? statusColor(rel?.status ?? "valid") : "var(--color-border)"}
                  strokeWidth={isSelected ? 2 : 1}
                  opacity={0.95}
                />
                {/* Variable name */}
                <text
                  x={x + 8} y={y + 15}
                  fill="var(--color-fg)" fontSize="12" fontWeight="600"
                  fontFamily="var(--font-mono)"
                >
                  {v.name}
                </text>
                {/* Type badge */}
                <text
                  x={x + w - 6} y={y + 14}
                  fill="var(--color-fg-muted)" fontSize="9" fontFamily="var(--font-mono)"
                  textAnchor="end"
                >
                  {typeLabel(v.value)}
                </text>
                {/* Value */}
                <text
                  x={x + 8} y={y + 30}
                  fill={isPointer ? statusColor(rel?.status ?? "valid") : "var(--color-fg-muted)"}
                  fontSize="10" fontFamily="var(--font-mono)"
                >
                  {isPointer ? ptrLabel(rel!) : formatExecutionValue(v.value)}
                </text>
                {/* Simulated Address */}
                {v.address && (
                  <text
                    x={x + w - 8} y={y + 30}
                    fill="var(--color-fg-muted)" fontSize="9" opacity={0.75} fontFamily="var(--font-mono)"
                    textAnchor="end"
                  >
                    @{formatAddress(v.address)}
                  </text>
                )}

                {/* Array slots */}
                {v.isArray && v.value.kind === "array" && (
                  <g>
                    {v.value.values.map((elem, i) => (
                      <g key={i}>
                        <rect
                          x={x + 4 + i * ARRAY_SLOT_W}
                          y={y + NODE_H}
                          width={ARRAY_SLOT_W - 2}
                          height={ARRAY_HEADER_H}
                          rx={3}
                          fill="var(--color-surface)"
                          stroke="var(--color-border)"
                          strokeWidth={0.5}
                        />
                        <text
                          x={x + 4 + i * ARRAY_SLOT_W + (ARRAY_SLOT_W - 2) / 2}
                          y={y + NODE_H + 9}
                          fill="var(--color-fg-muted)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle"
                        >
                          [{i}]
                        </text>
                        <text
                          x={x + 4 + i * ARRAY_SLOT_W + (ARRAY_SLOT_W - 2) / 2}
                          y={y + NODE_H + 20}
                          fill="var(--color-fg)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle"
                        >
                          {formatExecutionValue(elem)}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* Pointer indicator dot */}
                {isPointer && (
                  <circle
                    cx={x + w} cy={y + h / 2} r={4}
                    fill={statusColor(rel?.status ?? "valid")}
                    stroke="var(--color-surface-raised)"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}

          {/* NULL node */}
          {hasNull && (
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

          {/* Heap block nodes */}
          {heapNodes.map(({ x, y, w, h, b }, idx) => {
            const addrStr = formatAddress(b.address);
            const borderColor = b.active ? "var(--color-active)" : "var(--color-danger)";
            const isFirstFreed = !b.active && (idx === 0 || heapNodes[idx - 1].b.active);
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
                <rect
                  x={x} y={y} width={w} height={h} rx={6}
                  fill={b.active ? "color-mix(in srgb, var(--color-active) 8%, var(--color-surface-raised))" : "color-mix(in srgb, var(--color-danger) 8%, var(--color-surface-raised))"}
                  stroke={borderColor}
                  strokeWidth={1}
                  strokeDasharray={b.active ? undefined : "6 4"}
                  opacity={0.95}
                />
                {/* Address & status */}
                <text x={x + 8} y={y + 15} fill={borderColor} fontSize="12" fontWeight="600" fontFamily="var(--font-mono)">
                  {addrStr}
                </text>
                <text x={x + w - 6} y={y + 14} fill={borderColor} fontSize="9" fontWeight="500" textAnchor="end" fontFamily="var(--font-mono)">
                  {b.active ? "active" : "freed"}
                </text>
                {/* Origin & size */}
                <text x={x + 8} y={y + 30} fill="var(--color-fg-muted)" fontSize="10" fontFamily="var(--font-mono)">
                  {b.origin} · {b.byteSize}B · {b.slotCount} slot{b.slotCount > 1 ? "s" : ""}
                </text>
                {/* Values */}
                <text x={x + 8} y={y + 45} fill={b.active ? "var(--color-fg)" : "var(--color-fg-muted)"} fontSize="10" fontFamily="var(--font-mono)">
                  [{b.values.map((v) => formatExecutionValue(v)).join(", ")}]
                </text>

                {/* Pointer indicator dots on heap cards with pointer fields */}
                {b.values.map((v, slotIdx) => {
                  if (v.kind !== "pointer") return null;
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

          {/* Arrows */}
          {arrows.map((a, i) => {
            const markerId = getMarkerForColor(a.color);

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
              // Existing stack-to-heap and null routing - PRESERVED EXACTLY via centralized routeBezier
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
                opacity={0.8}
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
        </svg>
      </div>

      {/* Detail sidebar */}
      {selectedRel && (
        <div className="w-[200px] shrink-0 border-l border-border bg-surface p-3 overflow-auto">
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
