import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: readonly Tab[];
  defaultTabId: string;
  children: (activeTabId: string) => ReactNode;
}

/** Small, dependency-free tab switcher — deliberately not a UI-kit
 * import for something this simple. Renders its own children via a
 * render-prop so the caller decides what "active" means for each tab
 * (usually just conditional rendering). */
export function Tabs({ tabs, defaultTabId, children }: TabsProps) {
  const [activeTabId, setActiveTabId] = useState(defaultTabId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="flex shrink-0 border-b border-border bg-surface-raised px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTabId === tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={
              activeTabId === tab.id
                ? "border-b-2 border-accent px-3 py-2 text-xs font-medium uppercase tracking-wide text-fg"
                : "border-b-2 border-transparent px-3 py-2 text-xs font-medium uppercase tracking-wide text-fg-muted hover:text-fg"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface">{children(activeTabId)}</div>
    </div>
  );
}
