import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "../types";
import { scope } from "../utils/logger";

const log = scope("uiStore");

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface ErrorDialogState {
  title: string;
  message: string;
}

interface ToastState {
  id: number;
  message: string;
}

interface UIState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  toast: ToastState | null;
  showToast: (message: string) => void;
  dismissToast: () => void;

  errorDialog: ErrorDialogState | null;
  showError: (title: string, message: string) => void;
  dismissError: () => void;
}

let toastId = 0;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: prefersDark() ? "dark" : "light",
      setTheme: (theme) => {
        log.info("theme set", theme);
        set({ theme });
      },
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === "dark" ? "light" : "dark";
          log.info("theme toggled", next);
          return { theme: next };
        }),

      toast: null,
      showToast: (message) => {
        const id = ++toastId;
        set({ toast: { id, message } });
      },
      dismissToast: () => set({ toast: null }),

      errorDialog: null,
      showError: (title, message) => {
        log.error(title, message);
        set({ errorDialog: { title, message } });
      },
      dismissError: () => set({ errorDialog: null }),
    }),
    {
      name: "codevi.ui",
      // Only the theme preference survives a reload — toasts and error
      // dialogs are transient by nature.
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
