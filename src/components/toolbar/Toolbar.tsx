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
  Columns2,
} from "lucide-react";
import { useUIStore } from "../../state/uiStore";
import { pauseExecution, resetExecution, runExecution, stepExecution, useExecutionStore } from "../../state/executionStore";
import { ThemeDropdown } from "./ThemeDropdown";

interface ToolbarButtonProps {
  label: string;
  icon: ComponentType<{ size?: number | string }>;
  onClick: () => void;
  variant?: "default" | "primary";
  disabled?: boolean;
  active?: boolean;
}

function ToolbarButton({ label, icon: Icon, onClick, variant = "default", disabled = false, active = false }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={
        variant === "primary"
          ? "flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
          : active
            ? "flex items-center gap-1.5 rounded-md bg-surface-raised px-2.5 py-1.5 text-sm text-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            : "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted hover:bg-surface-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
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
 * Run/Pause/Step Forward/Reset are live as of Phase 3, wired to
 * executionStore's action functions and disabled when the current
 * execution status makes them meaningless (see
 * docs/PHASE_3_EXECUTION.md → "Toolbar wiring" for the exact rules).
 * As of Phase 4.1, Run/Step Forward are also disabled while
 * "waiting-for-input" — a pending scanf()/getchar() can only be
 * resolved through the Console's input field, not skipped past (see
 * docs/PHASE_4_1_STDIO.md → "Execution control during input").
 * Step Back stays a placeholder deliberately — true reverse-stepping
 * wasn't in the Phase 3 brief and isn't implemented; it still shows the
 * "not implemented" toast. Open/Save/Settings remain out of scope too.
 */
export function Toolbar() {
  const showToast = useUIStore((state) => state.showToast);
  const isRightPanelVisible = useUIStore((state) => state.isRightPanelVisible);
  const toggleRightPanel = useUIStore((state) => state.toggleRightPanel);
  const status = useExecutionStore((state) => state.status);

  const notImplemented = () => showToast("Feature not implemented yet.");
  const isBusy = status === "preparing" || status === "running" || status === "waiting-for-input";

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-3">
      <span className="mr-2 text-sm font-semibold tracking-tight text-fg">Codevi</span>
      <Divider />

      <ToolbarButton label="Open File" icon={FolderOpen} onClick={notImplemented} />
      <ToolbarButton label="Save File" icon={Save} onClick={notImplemented} />
      <Divider />

      <ToolbarButton
        label={status === "paused" ? "Resume" : "Run"}
        icon={Play}
        onClick={runExecution}
        variant="primary"
        disabled={isBusy}
      />
      <ToolbarButton label="Pause" icon={Pause} onClick={pauseExecution} disabled={status !== "running"} />
      <ToolbarButton label="Step Back (not implemented)" icon={StepBack} onClick={notImplemented} />
      <ToolbarButton label="Step Forward" icon={StepForward} onClick={stepExecution} disabled={isBusy} />
      <ToolbarButton label="Reset" icon={RotateCcw} onClick={resetExecution} />

      <div className="flex-1" />

      <ToolbarButton
        label={isRightPanelVisible ? "Hide workspace panels" : "Show workspace panels"}
        icon={Columns2}
        onClick={toggleRightPanel}
        active={isRightPanelVisible}
      />
      <Divider />
      <ThemeDropdown />
      <ToolbarButton label="Settings" icon={Settings} onClick={notImplemented} />
    </div>
  );
}
