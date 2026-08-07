import { AlertTriangle, X } from "lucide-react";
import { useUIStore } from "../../state/uiStore";

/**
 * Reusable, blocking error dialog. Nothing in Phase 1 triggers this —
 * there's nothing that can fail yet — but it's built and wired to
 * uiStore now so later phases (starting with compile errors in Phase 3)
 * can call `useUIStore.getState().showError(title, message)` from
 * anywhere without building UI for it at that point.
 */
export function ErrorDialog() {
  const error = useUIStore((state) => state.errorDialog);
  const dismissError = useUIStore((state) => state.dismissError);

  if (!error) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={dismissError}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full bg-danger/10 p-2 text-danger">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="error-dialog-title" className="font-medium text-fg">
              {error.title}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{error.message}</p>
          </div>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Dismiss"
            className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={dismissError}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
