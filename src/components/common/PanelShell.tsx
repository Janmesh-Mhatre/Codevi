import type { ComponentType, ReactNode } from "react";

interface PanelShellProps {
  title: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  children: ReactNode;
  className?: string;
}

/** Shared chrome for the boxed panels (Visualization, Variable, Memory).
 * Console and Explanation have their own shape and don't use this — see
 * README.md → "Component hierarchy". */
export function PanelShell({ title, icon: Icon, children, className = "" }: PanelShellProps) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <Icon size={14} className="text-fg-muted" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface">{children}</div>
    </div>
  );
}

/** Consistent "not built yet" body for panels with no real data source
 * until a later phase. */
export function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-sm font-medium text-fg-muted">{children}</p>
    </div>
  );
}
