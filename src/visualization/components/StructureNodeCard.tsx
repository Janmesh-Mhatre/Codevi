import React from "react";
import { formatAddress } from "../../memory/memory";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import type { StructureNode } from "../models/structureTypes";

interface StructureNodeCardProps {
  node: StructureNode;
  x: number;
  y: number;
  w: number;
  h: number;
  isSelected?: boolean;
  selectedSlotIndex?: number | null;
  onSelectNode?: (node: StructureNode) => void;
  onSelectSlot?: (node: StructureNode, slotIndex: number) => void;
}

export const StructureNodeCard: React.FC<StructureNodeCardProps> = ({
  node,
  x,
  y,
  w,
  h,
  isSelected = false,
  selectedSlotIndex = null,
  onSelectNode,
  onSelectSlot,
}) => {
  const addrStr = formatAddress(node.address);
  const isArray = node.kind === "array";
  const slotCount = node.slots.length;
  const isHeap = node.address.space === "heap";

  // Outline color based on highlight or status
  let borderColor = "var(--color-border)";
  if (isSelected) {
    borderColor = "var(--color-accent)";
  } else if (node.highlight === "write") {
    borderColor = "var(--color-active)";
  } else if (node.highlight === "read") {
    borderColor = "var(--color-accent)";
  } else if (isHeap) {
    borderColor = "var(--color-active)";
  }

  const slotW = 48;
  const slotH = 40;

  return (
    <g
      className="structure-node-card select-none"
      onClick={() => onSelectNode?.(node)}
      style={{ cursor: "pointer" }}
    >
      {/* Outer Card Rectangle */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill={
          isSelected
            ? "color-mix(in srgb, var(--color-accent) 15%, var(--color-surface-raised))"
            : "var(--color-surface-raised)"
        }
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
        opacity={0.95}
      />

      {/* Node Header: Label */}
      <text
        x={x + 10}
        y={y + 16}
        fill="var(--color-fg)"
        fontSize="12"
        fontWeight="600"
        fontFamily="var(--font-mono)"
      >
        {node.label}
      </text>

      {/* Address & Type Badge */}
      <text
        x={x + w - 10}
        y={y + 16}
        fill={isHeap ? "var(--color-active)" : "var(--color-fg-muted)"}
        fontSize="10"
        fontFamily="var(--font-mono)"
        textAnchor="end"
      >
        @{addrStr} · {node.type}
      </text>

      {/* Array or Struct Slots */}
      {isArray && slotCount > 0 && (
        <g transform={`translate(${x + 10}, ${y + 24})`}>
          {node.slots.map((slot, i) => {
            const isSlotSelected = isSelected && selectedSlotIndex === i;
            const is2D = typeof node.metadata?.rows === "number" && typeof node.metadata?.cols === "number";
            const cols = is2D ? (node.metadata!.cols as number) : slotCount;
            const colIndex = is2D ? i % cols : i;
            const rowIndex = is2D ? Math.floor(i / cols) : 0;
            const slotX = colIndex * (slotW + 4);
            const slotY = rowIndex * (slotH + 6);
            const isSlotWrite = slot.highlight === "write";
            const isSlotRead = slot.highlight === "read";
            const tags = slot.activeIndexTags ?? [];
            const hasBoundsCue = slot.boundsCue === "start" || slot.boundsCue === "end";

            // Phase 6.1: distinct read (cyan) vs write (amber) styling
            let slotBg = "var(--color-surface)";
            let slotBorder = "var(--color-border)";
            let valueFill = "var(--color-fg)";

            if (isSlotSelected) {
              slotBorder = "var(--color-accent)";
              slotBg = "color-mix(in srgb, var(--color-accent) 20%, var(--color-surface))";
            } else if (isSlotWrite) {
              slotBorder = "#f59e0b"; // amber
              slotBg = "rgba(245, 158, 11, 0.18)";
              valueFill = "#fbbf24";
            } else if (isSlotRead) {
              slotBorder = "#22d3ee"; // cyan
              slotBg = "rgba(34, 211, 238, 0.12)";
              valueFill = "#67e8f9";
            }

            return (
              <g
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot?.(node, i);
                }}
              >
                {/* Phase 6.1: Active index tags above the slot */}
                {tags.map((tag, ti) => (
                  <g key={`tag-${ti}`}>
                    <rect
                      x={slotX + 2}
                      y={slotY - 12 - ti * 14}
                      width={Math.max(tag.length * 6.5 + 6, 24)}
                      height={12}
                      rx={3}
                      fill="rgba(139, 92, 246, 0.25)"
                      stroke="rgba(139, 92, 246, 0.5)"
                      strokeWidth={0.5}
                    />
                    <text
                      x={slotX + 5}
                      y={slotY - 3 - ti * 14}
                      fill="#c4b5fd"
                      fontSize="8"
                      fontFamily="var(--font-mono)"
                      fontWeight="600"
                    >
                      {tag}
                    </text>
                  </g>
                ))}

                {/* Slot Cell */}
                <rect
                  x={slotX}
                  y={slotY + 4}
                  width={slotW}
                  height={slotH}
                  rx={4}
                  fill={slotBg}
                  stroke={slotBorder}
                  strokeWidth={isSlotSelected ? 1.5 : 1}
                />
                {/* Slot Index */}
                <text
                  x={slotX + slotW / 2}
                  y={slotY + 16}
                  fill="var(--color-fg-muted)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  textAnchor="middle"
                >
                  {slot.name ?? `[${i}]`}
                </text>
                {/* Slot Value */}
                <text
                  x={slotX + slotW / 2}
                  y={slotY + 32}
                  fill={valueFill}
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  textAnchor="middle"
                >
                  {formatExecutionValue(slot.value)}
                </text>

                {/* Phase 6.1: Bounds cue indicator dot */}
                {hasBoundsCue && (
                  <circle
                    cx={slotX + (slot.boundsCue === "start" ? 4 : slotW - 4)}
                    cy={slotY + slotH + 7}
                    r={2}
                    fill="var(--color-fg-muted)"
                    opacity={0.6}
                  />
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Scalar Slot for Single Values */}
      {!isArray && slotCount === 1 && (
        <g transform={`translate(${x + 10}, ${y + 22})`}>
          <text
            x={0}
            y={12}
            fill="var(--color-fg-muted)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            =
          </text>
          <text
            x={16}
            y={12}
            fill="var(--color-fg)"
            fontSize="11"
            fontWeight="600"
            fontFamily="var(--font-mono)"
          >
            {formatExecutionValue(node.slots[0].value)}
          </text>
        </g>
      )}
    </g>
  );
};
