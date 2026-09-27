import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Columns2, Eye, EyeOff } from "lucide-react";
import { useUIStore } from "../../state/uiStore";

/**
 * Dropdown menu for granularly displaying/hiding workspace panels:
 * 1. Execution Views (AST, Stack, Visualization, Variable & Array View, Pointer View)
 * 2. Variables
 * 3. Memory
 */
export function PanelsDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isMainViewsVisible = useUIStore((state) => state.isMainViewsVisible);
  const toggleMainViews = useUIStore((state) => state.toggleMainViews);

  const isVariablesVisible = useUIStore((state) => state.isVariablesVisible);
  const toggleVariables = useUIStore((state) => state.toggleVariables);

  const isMemoryVisible = useUIStore((state) => state.isMemoryVisible);
  const toggleMemory = useUIStore((state) => state.toggleMemory);

  const isRightPanelVisible = useUIStore((state) => state.isRightPanelVisible);
  const setRightPanelVisible = useUIStore((state) => state.setRightPanelVisible);
  const setMainViewsVisible = useUIStore((state) => state.setMainViewsVisible);
  const setVariablesVisible = useUIStore((state) => state.setVariablesVisible);
  const setMemoryVisible = useUIStore((state) => state.setMemoryVisible);

  const isAnyVisible =
    isRightPanelVisible &&
    (isMainViewsVisible || isVariablesVisible || isMemoryVisible);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleToggleMainViews = () => {
    if (!isRightPanelVisible) setRightPanelVisible(true);
    toggleMainViews();
  };

  const handleToggleVariables = () => {
    if (!isRightPanelVisible) setRightPanelVisible(true);
    toggleVariables();
  };

  const handleToggleMemory = () => {
    if (!isRightPanelVisible) setRightPanelVisible(true);
    toggleMemory();
  };

  const handleShowAll = () => {
    setRightPanelVisible(true);
    setMainViewsVisible(true);
    setVariablesVisible(true);
    setMemoryVisible(true);
  };

  const handleHideAll = () => {
    setRightPanelVisible(false);
  };

  const panelItems = [
    {
      id: "main-views",
      label: "Execution Views",
      description: "AST, Stack, Visualization, Array & Pointer Views",
      checked: isRightPanelVisible && isMainViewsVisible,
      onToggle: handleToggleMainViews,
    },
    {
      id: "variables",
      label: "Variables",
      description: "Variable inspector & scopes",
      checked: isRightPanelVisible && isVariablesVisible,
      onToggle: handleToggleVariables,
    },
    {
      id: "memory",
      label: "Memory",
      description: "Simulated memory & heap bytes",
      checked: isRightPanelVisible && isMemoryVisible,
      onToggle: handleToggleMemory,
    },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Toggle workspace panels dropdown"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
          isAnyVisible
            ? "bg-accent/10 text-accent font-medium"
            : "text-fg-muted hover:bg-surface-raised hover:text-fg"
        }`}
        title="Workspace Display Panels"
      >
        <Columns2 size={15} />
        <span className="hidden md:inline text-xs">Panels</span>
        <ChevronDown size={12} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Workspace Display Panels"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-surface shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-raised/40">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              Display Panels
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleShowAll}
                className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                title="Show all panels"
              >
                <Eye size={10} />
                All
              </button>
              <span className="text-border text-xs">•</span>
              <button
                type="button"
                onClick={handleHideAll}
                className="text-[10px] text-fg-muted hover:text-danger hover:underline flex items-center gap-0.5"
                title="Hide all panels"
              >
                <EyeOff size={10} />
                None
              </button>
            </div>
          </div>

          <div className="py-1">
            {panelItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.checked}
                onClick={item.onToggle}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-raised transition-colors group"
              >
                {/* Custom Styled Tick Checkbox */}
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    item.checked
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-surface group-hover:border-fg-muted"
                  }`}
                >
                  {item.checked && <Check size={11} strokeWidth={3} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-medium leading-none ${item.checked ? "text-fg" : "text-fg-muted"}`}>
                    {item.label}
                  </div>
                  <div className="text-[10px] text-fg-muted mt-1 leading-tight truncate">
                    {item.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
