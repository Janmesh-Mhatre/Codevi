import React from "react";
import { Info, X, Zap, ArrowRight, Eye, Pencil } from "lucide-react";
import { formatAddress } from "../../memory/memory";
import { formatExecutionValue } from "../../execution/utils/formatValue";
import type { StepMemoryAccess } from "../../execution/models/executionTypes";
import type {
  StructureNode,
  StructureLink,
  StructuralChange,
} from "../models/structureTypes";

interface StructureDetailSidebarProps {
  selectedNode: StructureNode | null;
  selectedSlotIndex: number | null;
  links?: StructureLink[];
  recentChanges?: StructuralChange[];
  /** Phase 6.1: per-step memory accesses from ExecutionStep. */
  stepAccesses?: StepMemoryAccess[];
  onClose: () => void;
}

export const StructureDetailSidebar: React.FC<StructureDetailSidebarProps> = ({
  selectedNode,
  selectedSlotIndex,
  links = [],
  recentChanges = [],
  stepAccesses = [],
  onClose,
}) => {
  if (!selectedNode) return null;

  const addrStr = formatAddress(selectedNode.address);
  const isHeap = selectedNode.address.space === "heap";
  const selectedSlot =
    selectedSlotIndex !== null ? selectedNode.slots[selectedSlotIndex] : null;

  const nodeLinks = links.filter(
    (l) => l.sourceNodeId === selectedNode.id || l.targetNodeId === selectedNode.id
  );

  const nodeChanges = recentChanges.filter(
    (c) => c.targetNodeId === selectedNode.id
  );

  return (
    <div className="w-[240px] shrink-0 border-l border-border bg-surface p-3 overflow-auto flex flex-col gap-3.5 text-xs text-fg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-accent text-[11px]">
          <Info size={14} />
          <span>Structure Details</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg transition-colors"
          title="Close details"
        >
          <X size={13} />
        </button>
      </div>

      {/* Node Meta */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase font-bold text-fg-muted tracking-wide">
          Selected Node
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-fg font-mono text-[13px]">
            {selectedNode.label}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
              isHeap
                ? "bg-active/15 text-active border border-active/30"
                : "bg-accent/15 text-accent border border-accent/30"
            }`}
          >
            @{addrStr}
          </span>
        </div>
        <div className="flex items-center justify-between text-fg-muted">
          <span>Type</span>
          <span className="font-mono text-fg">{selectedNode.type}</span>
        </div>
        <div className="flex items-center justify-between text-fg-muted">
          <span>Region</span>
          <span className="capitalize text-fg">{selectedNode.address.space}</span>
        </div>
        <div className="flex items-center justify-between text-fg-muted">
          <span>Kind</span>
          <span className="capitalize text-fg">{selectedNode.kind}</span>
        </div>
      </div>

      {/* Selected Slot Information */}
      {selectedSlot && (
        <div className="space-y-1.5 border-t border-border/50 pt-2.5">
          <div className="text-[10px] uppercase font-bold text-fg-muted tracking-wide">
            Slot Information
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Index</span>
            <span className="font-mono font-semibold text-fg">
              [{selectedSlot.index}]
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Address</span>
            <span className="font-mono text-fg-muted">
              @{formatAddress(selectedSlot.address)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Value</span>
            <span className="font-mono font-bold text-active">
              {formatExecutionValue(selectedSlot.value)}
            </span>
          </div>
          {/* Phase 6.1: Active index tags referencing this slot */}
          {selectedSlot.activeIndexTags && selectedSlot.activeIndexTags.length > 0 && (
            <div className="mt-1">
              <span className="text-fg-muted text-[10px]">Active indices: </span>
              <span className="inline-flex gap-1 flex-wrap">
                {selectedSlot.activeIndexTags.map((tag, ti) => (
                  <span
                    key={ti}
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
                    style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}
                  >
                    {tag}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Links & Pointers */}
      {nodeLinks.length > 0 && (
        <div className="space-y-2 border-t border-border/50 pt-2.5">
          <div className="text-[10px] uppercase font-bold text-fg-muted tracking-wide">
            Connections
          </div>
          {nodeLinks.map((link) => (
            <div
              key={link.id}
              className="rounded border border-border/60 bg-surface-raised p-2 text-[11px] space-y-1"
            >
              <div className="flex items-center gap-1 font-mono font-semibold text-accent">
                <span>{link.label ?? link.sourceNodeId}</span>
                <ArrowRight size={11} className="text-fg-muted" />
                <span>
                  {link.status === "null"
                    ? "NULL"
                    : link.targetAddress
                    ? `@${formatAddress(link.targetAddress)}`
                    : "target"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-fg-muted">
                <span>Status:</span>
                <span
                  className={`font-semibold capitalize ${
                    link.status === "valid"
                      ? "text-accent"
                      : link.status === "null"
                      ? "text-fg-muted"
                      : "text-danger"
                  }`}
                >
                  {link.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Structural Mutations / History */}
      {nodeChanges.length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-2.5">
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-fg-muted tracking-wide">
            <Zap size={11} className="text-active" />
            <span>Recent Mutations</span>
          </div>
          <div className="space-y-1">
            {nodeChanges.map((change, i) => (
              <div
                key={i}
                className="rounded bg-surface-raised/70 border border-border/40 p-1.5 text-[10px] text-fg-muted"
              >
                <div className="font-semibold text-fg capitalize">{change.type}</div>
                <div>{change.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 6.1: Step Access Log */}
      {stepAccesses.length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-2.5">
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-fg-muted tracking-wide">
            <Eye size={11} className="text-accent" />
            <span>Step Access Log</span>
          </div>
          <div className="space-y-0.5">
            {stepAccesses.map((access, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] font-mono"
                style={{
                  background:
                    access.kind === "write"
                      ? "rgba(245,158,11,0.1)"
                      : "rgba(34,211,238,0.08)",
                }}
              >
                {access.kind === "write" ? (
                  <Pencil size={9} style={{ color: "#f59e0b" }} />
                ) : (
                  <Eye size={9} style={{ color: "#22d3ee" }} />
                )}
                <span
                  style={{
                    color: access.kind === "write" ? "#fbbf24" : "#67e8f9",
                  }}
                  className="font-semibold uppercase text-[9px]"
                >
                  {access.kind}
                </span>
                <span className="text-fg-muted">
                  {access.variableName ?? formatAddress(access.address)}
                  {access.slotIndex !== undefined && access.slotIndex > 0
                    ? `[${access.slotIndex}]`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
