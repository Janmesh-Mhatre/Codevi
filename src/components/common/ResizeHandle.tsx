import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface ResizeHandleProps {
  direction: "vertical" | "horizontal";
  onDrag: (delta: number, currentPos: number, event: MouseEvent) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onReset?: () => void;
  onNudge?: (step: -1 | 1) => void;
  title?: string;
  className?: string;
}

/**
 * A subtle, accessible draggable divider between workspace panels.
 *
 * Provides a 1px visual border that smoothly highlights with the accent
 * color on hover/drag, along with a comfortable 8px hit area for easy
 * grabbing without requiring pixel-perfect mouse precision.
 *
 * Double-clicking the divider triggers onReset (if provided) to return to
 * the default panel size.
 */
export function ResizeHandle({
  direction,
  onDrag,
  onDragStart,
  onDragEnd,
  onReset,
  onNudge,
  title,
  className = "",
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startCoordRef = useRef<number>(0);
  const onDragRef = useRef(onDrag);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    onDragRef.current = onDrag;
    onDragEndRef.current = onDragEnd;
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startCoordRef.current = direction === "vertical" ? e.clientX : e.clientY;
      onDragStart?.();

      const cursor = direction === "vertical" ? "col-resize" : "row-resize";
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentCoord = direction === "vertical" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentCoord - startCoordRef.current;
        onDragRef.current(delta, currentCoord, moveEvent);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        onDragEndRef.current?.();
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [direction, onDragStart],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onNudge) return;
    if (direction === "vertical") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNudge(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNudge(1);
      }
    } else {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onNudge(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onNudge(1);
      }
    }
  };

  const isVertical = direction === "vertical";
  const defaultTooltip = isVertical
    ? "Drag to resize panels • Double-click to reset"
    : "Drag to resize panels • Double-click to reset";

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={direction}
      title={title || defaultTooltip}
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={`group relative select-none touch-none focus:outline-none ${
        isVertical
          ? "w-1.5 -mx-[3px] z-10 cursor-col-resize flex justify-center items-stretch"
          : "h-1.5 -my-[3px] z-10 cursor-row-resize flex flex-col justify-center items-stretch"
      } ${className}`}
    >
      {/* Visual divider line: 1px normal border, highlights on hover/drag */}
      <div
        className={`transition-colors duration-150 ${
          isVertical ? "w-px h-full" : "h-px w-full"
        } ${
          isDragging
            ? "bg-accent"
            : "bg-border group-hover:bg-accent/80 group-focus-visible:bg-accent"
        }`}
      />
    </div>
  );
}
