import { useEffect, useRef, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { useUIStore } from "../../state/uiStore";
import { THEME_IDS, THEME_LABELS, type ThemeId } from "../../themes/themeTypes";
import { THEMES } from "../../themes/themes";

/**
 * Compact theme selector dropdown for the Codevi toolbar.
 *
 * Shows: `[ Palette icon  Dark Modern  ▼ ]`
 *
 * Opens a positioned overlay listing all 9 themes, each with a 4-dot
 * color swatch (canvas, accent, active, fg) and a radio indicator.
 * Click-outside, Escape, or selecting a theme closes the dropdown.
 */
export function ThemeDropdown() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleSelect = (id: ThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Select theme"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-surface-raised hover:text-fg transition-colors"
      >
        <Palette size={14} />
        <span className="hidden sm:inline max-w-[120px] truncate">{THEME_LABELS[theme]}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Theme selector"
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-surface shadow-lg overflow-hidden"
        >
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-fg-muted border-b border-border">
            Theme
          </div>
          <div className="max-h-80 overflow-auto py-1">
            {THEME_IDS.map((id) => {
              const def = THEMES[id];
              const isActive = id === theme;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-accent/15 text-accent"
                      : "text-fg hover:bg-surface-raised"
                  }`}
                >
                  {/* Color swatches */}
                  <span className="flex shrink-0 gap-0.5">
                    <span
                      className="block h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: def.css.canvas }}
                    />
                    <span
                      className="block h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: def.css.accent }}
                    />
                    <span
                      className="block h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: def.css.active }}
                    />
                    <span
                      className="block h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: def.css.fg }}
                    />
                  </span>
                  <span className="flex-1 truncate">{THEME_LABELS[id]}</span>
                  {/* Radio indicator */}
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      isActive ? "border-accent" : "border-fg-muted/40"
                    }`}
                  >
                    {isActive && <span className="block h-2 w-2 rounded-full bg-accent" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
