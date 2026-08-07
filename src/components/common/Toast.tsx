import { useEffect } from "react";
import { useUIStore } from "../../state/uiStore";

const AUTO_DISMISS_MS = 2600;

/** Transient, bottom-of-screen notice — used today for the Toolbar's
 * "not implemented yet" messages, and reusable by any future feature that
 * needs to say something briefly without blocking interaction (that's
 * what ErrorDialog is for). Driven by uiStore so any component can
 * trigger one via `useUIStore.getState().showToast(...)`. */
export function Toast() {
  const toast = useUIStore((state) => state.toast);
  const dismissToast = useUIStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto rounded-md border border-border bg-surface-raised px-4 py-2 text-sm text-fg shadow-lg">
        {toast.message}
      </div>
    </div>
  );
}
