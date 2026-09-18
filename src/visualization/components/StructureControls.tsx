import React from "react";
import { Filter, PlayCircle, Zap } from "lucide-react";
import type { StructuralChange, StructureKind } from "../models/structureTypes";

export type StructureFilterOption = "all" | StructureKind;

interface StructureControlsProps {
  filter: StructureFilterOption;
  onFilterChange: (newFilter: StructureFilterOption) => void;
  onStepStructure?: () => void;
  canStep?: boolean;
  latestChange?: StructuralChange | null;
}

export const StructureControls: React.FC<StructureControlsProps> = ({
  filter,
  onFilterChange,
  onStepStructure,
  canStep = false,
  latestChange = null,
}) => {
  const filterOptions: { id: StructureFilterOption; label: string }[] = [
    { id: "all", label: "All Structures" },
    { id: "array", label: "Arrays" },
    { id: "pointer-graph", label: "Pointers" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs">
      {/* Left side: Structure Filter Buttons */}
      <div className="flex items-center gap-1.5">
        <Filter size={13} className="text-fg-muted" />
        <div className="flex rounded bg-surface-raised p-0.5 border border-border/50">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onFilterChange(opt.id)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                filter === opt.id
                  ? "bg-accent text-accent-fg shadow-xs"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Latest Structural Change Badge */}
      {latestChange && (
        <div className="flex items-center gap-1.5 rounded-full bg-active/10 border border-active/30 px-2.5 py-0.5 text-[11px] text-active max-w-sm truncate">
          <Zap size={12} className="shrink-0 animate-pulse" />
          <span className="truncate">{latestChange.description}</span>
        </div>
      )}

      {/* Right side: Step Structure Button */}
      {onStepStructure && (
        <button
          onClick={onStepStructure}
          disabled={!canStep}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-all ${
            canStep
              ? "bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25 cursor-pointer shadow-xs active:scale-95"
              : "opacity-40 cursor-not-allowed text-fg-muted border border-border/40"
          }`}
          title="Step until the next data structure read, write, allocation, or pointer change"
        >
          <PlayCircle size={13} />
          <span>Step Structure</span>
        </button>
      )}
    </div>
  );
};
