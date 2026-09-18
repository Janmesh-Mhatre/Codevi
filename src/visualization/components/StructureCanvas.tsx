import React from "react";
import type { PlacedLink } from "../models/structureTypes";

interface StructureCanvasProps {
  width: number;
  height: number;
  placedLinks?: PlacedLink[];
  children?: React.ReactNode;
}

export const StructureCanvas: React.FC<StructureCanvasProps> = ({
  width,
  height,
  placedLinks = [],
  children,
}) => {
  const canvasW = Math.max(width, 400);
  const canvasH = Math.max(height, 300);

  return (
    <div className="relative h-full w-full overflow-auto bg-canvas/50">
      <svg
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="structure-canvas-svg min-h-full min-w-full"
      >
        <defs>
          {/* Arrow markers for valid, null, and severed/error connections */}
          <marker
            id="arrow-valid"
            viewBox="0 0 10 6"
            refX="9"
            refY="3"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-accent)" />
          </marker>
          <marker
            id="arrow-null"
            viewBox="0 0 10 6"
            refX="9"
            refY="3"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-fg-muted)" />
          </marker>
          <marker
            id="arrow-danger"
            viewBox="0 0 10 6"
            refX="9"
            refY="3"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,3 L0,6 Z" fill="var(--color-danger)" />
          </marker>
        </defs>

        {/* Render Connection Links */}
        <g className="structure-links-layer">
          {placedLinks.map((pl, idx) => (
            <path
              key={pl.link.id || idx}
              d={pl.pathD}
              fill="none"
              stroke={pl.color}
              strokeWidth={1.5}
              strokeDasharray={pl.dash}
              markerEnd={`url(#${pl.markerId})`}
              opacity={0.85}
            >
              <animate
                attributeName="stroke-dashoffset"
                values={pl.dash ? "20;0" : "0;0"}
                dur="1.5s"
                repeatCount="indefinite"
              />
            </path>
          ))}
        </g>

        {/* Render Nodes / Cards Layer */}
        <g className="structure-nodes-layer">{children}</g>
      </svg>
    </div>
  );
};
