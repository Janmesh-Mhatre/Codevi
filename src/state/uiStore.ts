import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ThemeId } from "../themes/themeTypes";
import { THEME_IDS } from "../themes/themeTypes";
import { scope } from "../utils/logger";

const log = scope("uiStore");

const safeStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    localStorage.removeItem(name);
  },
};

interface ErrorDialogState {
  title: string;
  message: string;
}

interface ToastState {
  id: number;
  message: string;
}

interface UIState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;

  // Workspace layout (resizable panels & collapsible workspace)
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;
  isRightPanelVisible: boolean;
  setRightPanelVisible: (visible: boolean) => void;
  toggleRightPanel: () => void;

  rightPanelBottomHeight: number;
  setRightPanelBottomHeight: (height: number) => void;

  consoleHeight: number;
  setConsoleHeight: (height: number) => void;
  isConsoleVisible: boolean;
  setConsoleVisible: (visible: boolean) => void;
  toggleConsole: () => void;

  isExplanationVisible: boolean;
  setExplanationVisible: (visible: boolean) => void;
  toggleExplanation: () => void;

  resetLayout: () => void;

  toast: ToastState | null;
  showToast: (message: string) => void;
  dismissToast: () => void;

  errorDialog: ErrorDialogState | null;
  showError: (title: string, message: string) => void;
  dismissError: () => void;
}

const DEFAULT_RIGHT_PANEL_WIDTH = 420;
const DEFAULT_RIGHT_BOTTOM_HEIGHT = 256;
const DEFAULT_CONSOLE_HEIGHT = 160;

let toastId = 0;

/**
 * Migrate legacy `"dark"` / `"light"` theme values from the old binary
 * toggle to the new ThemeId system, and validate that the stored value
 * is a valid ThemeId.
 */
function migrateTheme(raw: unknown): ThemeId {
  if (raw === "dark") return "dark-modern";
  if (raw === "light") return "light-modern";
  if (typeof raw === "string" && (THEME_IDS as readonly string[]).includes(raw)) {
    return raw as ThemeId;
  }
  return "dark-modern";
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark-modern" as ThemeId,
      setTheme: (theme) => {
        log.info("theme set", theme);
        set({ theme });
      },

      rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
      setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(260, Math.round(width)) }),

      isRightPanelVisible: true,
      setRightPanelVisible: (visible) => set({ isRightPanelVisible: visible }),
      toggleRightPanel: () => set((state) => ({ isRightPanelVisible: !state.isRightPanelVisible })),

      rightPanelBottomHeight: DEFAULT_RIGHT_BOTTOM_HEIGHT,
      setRightPanelBottomHeight: (height) => set({ rightPanelBottomHeight: Math.max(100, Math.round(height)) }),

      consoleHeight: DEFAULT_CONSOLE_HEIGHT,
      setConsoleHeight: (height) => set({ consoleHeight: Math.max(70, Math.round(height)) }),
      isConsoleVisible: true,
      setConsoleVisible: (visible) => set({ isConsoleVisible: visible }),
      toggleConsole: () => set((state) => ({ isConsoleVisible: !state.isConsoleVisible })),

      isExplanationVisible: true,
      setExplanationVisible: (visible) => set({ isExplanationVisible: visible }),
      toggleExplanation: () => set((state) => ({ isExplanationVisible: !state.isExplanationVisible })),

      resetLayout: () =>
        set({
          rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
          isRightPanelVisible: true,
          rightPanelBottomHeight: DEFAULT_RIGHT_BOTTOM_HEIGHT,
          consoleHeight: DEFAULT_CONSOLE_HEIGHT,
          isConsoleVisible: true,
          isExplanationVisible: true,
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
      storage: createJSONStorage(() => safeStorage),
      // Persist theme and workspace layout preferences across reloads.
      partialize: (state) => ({
        theme: state.theme,
        rightPanelWidth: state.rightPanelWidth,
        isRightPanelVisible: state.isRightPanelVisible,
        rightPanelBottomHeight: state.rightPanelBottomHeight,
        consoleHeight: state.consoleHeight,
        isConsoleVisible: state.isConsoleVisible,
        isExplanationVisible: state.isExplanationVisible,
      }),
      // Migrate legacy "dark"/"light" values from old persistence
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown> | undefined;
        if (!p) return current;
        return {
          ...current,
          ...p,
          theme: migrateTheme(p.theme),
        };
      },
    },
  ),
);
