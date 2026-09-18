import { useState } from "react";
import { Crosshair, MousePointerClick } from "lucide-react";
import { useExecutionStore } from "../../state/executionStore";
import { formatAddress } from "../../memory/memory";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import { routeBezier, routeOutwardLoop } from "../../visualization/connectors/connectorRouting";
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

  // NULL target (if any pointers are NULL)
  const hasNull = relationships.some((r) => r.status === "null");
  const nullNodeX = PAD + NODE_W + COL_GAP / 2 - NULL_NODE_W / 2;
  const nullNodeY = stackY + 8;

  // Heap column: one node per block
  const heapX = PAD + NODE_W + COL_GAP;
  const heapNodes: { x: number; y: number; w: number; h: number; b: HeapBlock }[] = [];
  let heapY = PAD + 20;
  for (const b of heapBlocks) {
    heapNodes.push({ x: heapX, y: heapY, w: HEAP_NODE_W, h: HEAP_NODE_H, b });
    heapY += HEAP_NODE_H + ROW_GAP;
  }

  // SVG dimensions
  const svgW = heapX + HEAP_NODE_W + PAD;
  const svgH = Math.max(stackY, heapY, hasNull ? nullNodeY + NULL_NODE_H + PAD : 0) + PAD + 30;

  // ------ ARROW COMPUTATION ------
  type Arrow = {
    kind: "stack-to-stack" | "stack-to-heap" | "null";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    dash?: string;
    label: string;
    stackIndex?: number;
  };
  const arrows: Arrow[] = [];
  let stackArrowCount = 0;

  for (const rel of relationships) {
    // Find source node (the pointer variable in the stack column)
    const srcNode = stackNodes.find((n) => n.v.name === rel.pointerName);
    if (!srcNode) continue;

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
            <marker id="arrow-null" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-fg-muted)" />
            </marker>
            <marker id="arrow-danger" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-danger)" />
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
          {heapNodes.map(({ x, y, w, h, b }) => {
            const addrStr = formatAddress(b.address);
            const borderColor = b.active ? "var(--color-active)" : "var(--color-danger)";
            return (
              <g key={addrStr}>
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
              </g>
            );
          })}

          {/* Arrows */}
          {arrows.map((a, i) => {
            const markerId = a.color.includes("accent") ? "arrow-valid" : a.color.includes("danger") ? "arrow-danger" : "arrow-null";

            let pathD: string;
            if (a.kind === "stack-to-stack") {
              const idx = a.stackIndex ?? 0;
              pathD = routeOutwardLoop(a.x1, a.y1, a.x2, a.y2, idx);
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
