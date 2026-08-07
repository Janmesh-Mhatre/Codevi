import type { ComponentType } from "react";
import {
  FolderOpen,
  Save,
  Play,
  Pause,
  StepForward,
  StepBack,
  RotateCcw,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { useUIStore } from "../../state/uiStore";

interface ToolbarButtonProps {
  label: string;
  icon: ComponentType<{ size?: number | string }>;
  onClick: () => void;
  variant?: "default" | "primary";
}

function ToolbarButton({ label, icon: Icon, onClick, variant = "default" }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        variant === "primary"
          ? "flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          : "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted hover:bg-surface-raised hover:text-fg"
      }
    >
      <Icon size={16} />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

/**
 * Every button here except the theme toggle is a placeholder — clicking
 * it shows a "not implemented yet" toast rather than doing anything, per
 * the Phase 1 spec. Wiring them up to real behavior belongs to later
 * phases (Run/Pause/Step/Reset → Phase 3, Open/Save → Phase 1 follow-up
 * or Phase 11 depending on scope, Settings → not yet scoped).
 */
export function Toolbar() {
  const showToast = useUIStore((state) => state.showToast);
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  const notImplemented = () => showToast("Feature not implemented yet.");

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-3">
      <span className="mr-2 text-sm font-semibold tracking-tight text-fg">Codevi</span>
      <Divider />

      <ToolbarButton label="Open File" icon={FolderOpen} onClick={notImplemented} />
      <ToolbarButton label="Save File" icon={Save} onClick={notImplemented} />
      <Divider />

      <ToolbarButton label="Run" icon={Play} onClick={notImplemented} variant="primary" />
      <ToolbarButton label="Pause" icon={Pause} onClick={notImplemented} />
      <ToolbarButton label="Step Back" icon={StepBack} onClick={notImplemented} />
      <ToolbarButton label="Step Forward" icon={StepForward} onClick={notImplemented} />
      <ToolbarButton label="Reset" icon={RotateCcw} onClick={notImplemented} />

      <div className="flex-1" />

      <ToolbarButton
        label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        icon={theme === "dark" ? Sun : Moon}
        onClick={toggleTheme}
      />
      <ToolbarButton label="Settings" icon={Settings} onClick={notImplemented} />
    </div>
  );
}
