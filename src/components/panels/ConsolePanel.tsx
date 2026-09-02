import { useEffect, useRef, useState } from "react";
import { Minus, Plus, SquareTerminal } from "lucide-react";
import { useParserStore } from "../../state/parserStore";
import { cancelInput, provideInput, useExecutionStore } from "../../state/executionStore";
import { useUIStore } from "../../state/uiStore";

/**
 * Program stdout (Phase 4.1: printf/puts/putchar), syntax diagnostics
 * (Phase 2), and the execution engine's lifecycle log (Phase 3) — all in
 * this one panel rather than a separate output/diagnostics area, per
 * every phase's brief so far. When execution is waiting on scanf()/
 * getchar(), an input field appears at the bottom — this is the *only*
 * way to satisfy a pending request; Step Forward and Run are disabled
 * for exactly this reason (see Toolbar.tsx).
 *
 * Can be independently hidden/shown via the toggle button in the header.
 */
export function ConsolePanel({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const parserStatus = useParserStore((state) => state.status);
  const diagnostics = useParserStore((state) => state.diagnostics);
  const executionLog = useExecutionStore((state) => state.log);
  const executionStatus = useExecutionStore((state) => state.status);
  const output = useExecutionStore((state) => state.output);
  const pendingInput = useExecutionStore((state) => state.pendingInput);
  const inputError = useExecutionStore((state) => state.inputError);
  const consoleHeight = useUIStore((state) => state.consoleHeight);
  const isConsoleVisible = useUIStore((state) => state.isConsoleVisible);
  const toggleConsole = useUIStore((state) => state.toggleConsole);

  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isWaiting = executionStatus === "waiting-for-input";

  useEffect(() => {
    if (isWaiting) {
      setDraft("");
      inputRef.current?.focus();
    }
  }, [isWaiting, pendingInput]);

  const submit = () => {
    if (draft === "") return;
    provideInput(draft);
    setDraft("");
  };

  if (!isConsoleVisible) {
    return (
      <div className={`flex h-[26px] shrink-0 items-center justify-between border-t border-border bg-surface-raised px-3 ${className}`}>
        <button
          type="button"
          onClick={toggleConsole}
          title="Show Console"
          aria-label="Show Console"
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
        >
          <SquareTerminal size={13} className="text-fg-muted" />
          <span className="font-mono text-[11px]">Console</span>
          {output !== "" && (
            <span className="rounded bg-accent/15 px-1 py-0.2 text-[10px] text-accent font-medium">output</span>
          )}
          <Plus size={12} className="ml-1 text-fg-muted" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ height: `${consoleHeight}px`, ...style }}
      className={`flex shrink-0 flex-col border-t border-border bg-surface ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-raised px-3 py-1.5">
        <div className="flex items-center gap-2">
          <SquareTerminal size={14} className="text-fg-muted" />
          <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Console</h2>
        </div>
        <button
          type="button"
          onClick={toggleConsole}
          title="Hide Console"
          aria-label="Hide Console"
          className="flex h-5 w-5 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg transition-colors"
        >
          <Minus size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-sm text-fg-muted">
        {parserStatus === "initializing" && <p>Loading parser…</p>}
        {parserStatus === "error" && <p className="text-danger">Parser failed to load — see the AST tab for details.</p>}
        {parserStatus === "ready" && diagnostics.length === 0 && executionLog.length === 0 && output === "" && <p>Ready.</p>}
        {parserStatus === "ready" &&
          diagnostics.map((diagnostic) => (
            <p key={diagnostic.id} className="text-danger">
              Line {diagnostic.startPosition.row + 1}, Col {diagnostic.startPosition.column + 1} — {diagnostic.message}
            </p>
          ))}
        {executionLog.map((entry) => (
          <p key={entry.id} className={entry.level === "error" ? "text-danger" : "text-fg-muted"}>
            {entry.message}
          </p>
        ))}
        {output !== "" && <pre className="whitespace-pre-wrap break-words text-fg">{output}</pre>}
      </div>

      {isWaiting && pendingInput && (
        <div className="shrink-0 border-t border-border bg-surface-raised px-3 py-2">
          <div className="mb-1 font-mono text-xs text-fg-muted">{pendingInput.source} — waiting for input</div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                if (event.key === "Escape") cancelInput();
              }}
              placeholder={
                pendingInput.specifier === "f" ? "e.g. 3.14" : pendingInput.specifier === "c" ? "a single character" : "e.g. 42"
              }
              className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 font-mono text-sm text-fg outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={submit}
              className="shrink-0 rounded bg-accent px-3 py-1 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Submit
            </button>
          </div>
          {inputError && <p className="mt-1 text-xs text-danger">{inputError}</p>}
        </div>
      )}
    </div>
  );
}
