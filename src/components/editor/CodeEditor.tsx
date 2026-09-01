import { useCallback, useEffect, useRef } from "react";
import Editor, { loader, type OnMount, type OnChange } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useCParser } from "../../hooks/useCParser";
import { useParserStore } from "../../state/parserStore";
import { useExecutionStore } from "../../state/executionStore";
import type { TextChange } from "../../parser/parserService";
// Vite's `?worker` suffix bundles each worker as a local asset. This is
// what keeps Monaco fully offline — without it, @monaco-editor/react
// falls back to fetching Monaco from a CDN at runtime, which breaks the
// project's "must work offline" requirement (Phase 0 blueprint, Objective).
// NOTE: monaco-editor's package.json "exports" map already prepends
// esm/vs/ for any subpath import, so the path here is shorter than in
// older Monaco docs/tutorials (monaco-editor/esm/vs/editor/editor.worker
// no longer resolves against monaco-editor@0.56 — verified against the
// installed version's package.json before writing this).
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEditorStore } from "../../state/editorStore";
import { useUIStore } from "../../state/uiStore";
import { scope } from "../../utils/logger";

const log = scope("editor");

// Point @monaco-editor/react at the monaco-editor package that ships in
// node_modules instead of letting it fetch a copy from jsdelivr.
loader.config({ monaco });

self.MonacoEnvironment = {
  // C only needs the base editor worker (bracket matching, folding, etc.)
  // — the language-specific workers this map usually branches on (TS,
  // JSON, CSS, HTML) don't apply here, so every label resolves to the
  // same worker.
  getWorker: () => new EditorWorker(),
};

let themesDefined = false;

/** Registers two Monaco themes that pick up the app's own design tokens,
 * so the editor reads as part of the same system instead of a bolted-on
 * default. Colors are duplicated from src/index.css because Monaco themes
 * take literal hex values, not CSS variables. */
function defineEditorThemes() {
  if (themesDefined) return;
  monaco.editor.defineTheme("cv-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a93a6", fontStyle: "italic" },
      { token: "keyword", foreground: "4fa3d1" },
      { token: "number", foreground: "e3a23c" },
      { token: "string", foreground: "9fd18a" },
    ],
    colors: {
      "editor.background": "#161b24",
      "editor.lineHighlightBackground": "#1d2330",
      "editorLineNumber.foreground": "#5c6577",
      "editorLineNumber.activeForeground": "#e7eaf0",
      "editorCursor.foreground": "#e3a23c",
    },
  });
  monaco.editor.defineTheme("cv-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5c6577", fontStyle: "italic" },
      { token: "keyword", foreground: "2e7cb8" },
      { token: "number", foreground: "c9821f" },
      { token: "string", foreground: "3f7d3f" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.lineHighlightBackground": "#f5f7fa",
      "editorLineNumber.foreground": "#8a93a6",
      "editorLineNumber.activeForeground": "#1b2230",
      "editorCursor.foreground": "#c9821f",
    },
  });
  themesDefined = true;
}

const MARKER_OWNER = "codevi-parser";

/** Monaco reports each change with 1-based line/column ranges; Tree-sitter
 * works in 0-based rows/columns. This is the only place that conversion
 * happens — everything past notifyChange() deals purely in Tree-sitter's
 * coordinates. */
function toTextChanges(event: Parameters<OnChange>[1]): TextChange[] {
  return event.changes.map((change) => ({
    rangeOffset: change.rangeOffset,
    rangeLength: change.rangeLength,
    text: change.text,
    startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
    oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
  }));
}

export function CodeEditor() {
  const code = useEditorStore((state) => state.code);
  const setCode = useEditorStore((state) => state.setCode);
  const theme = useUIStore((state) => state.theme);
  const diagnostics = useParserStore((state) => state.diagnostics);
  const executionStatus = useExecutionStore((state) => state.status);
  const currentStep = useExecutionStore((state) => state.currentStep);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const decorationsRef = useRef<ReturnType<Parameters<OnMount>[0]["createDecorationsCollection"]> | null>(null);
  const { notifyChange } = useCParser();

  // Editable except while a program is actually mid-execution — the
  // interpreter is running against a specific parsed snapshot of the
  // source (see docs/PHASE_3_EXECUTION.md → "Tree lifetime during a
  // run"), so letting the text change underneath it would desync the
  // highlighted line from what's actually executing. Completed/Error/
  // Idle all allow editing again.
  const isReadOnly =
    executionStatus === "preparing" || executionStatus === "running" || executionStatus === "paused" || executionStatus === "waiting-for-input";

  const handleMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      defineEditorThemes();
      monacoInstance.editor.setTheme(theme === "dark" ? "cv-dark" : "cv-light");
      editorRef.current = editorInstance;
      decorationsRef.current = editorInstance.createDecorationsCollection([]);
      log.info("Monaco mounted");
    },
    [theme],
  );

  const handleChange: OnChange = useCallback(
    (value, event) => {
      const nextValue = value ?? "";
      setCode(nextValue);
      notifyChange(nextValue, toTextChanges(event));
    },
    [setCode, notifyChange],
  );

  // Mirrors parserStore's diagnostics onto the editor as inline markers
  // (the squiggly red underline under a syntax error), independent of
  // when/how those diagnostics were produced.
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      diagnostics.map((diagnostic) => ({
        severity: monaco.MarkerSeverity.Error,
        message: diagnostic.message,
        startLineNumber: diagnostic.startPosition.row + 1,
        startColumn: diagnostic.startPosition.column + 1,
        endLineNumber: diagnostic.endPosition.row + 1,
        // Tree-sitter can report a zero-width range for a missing token;
        // Monaco won't render a marker with equal start/end columns, so
        // widen it by one so the missing-token marker is still visible.
        endColumn: Math.max(diagnostic.endPosition.column + 1, diagnostic.startPosition.column + 2),
      })),
    );
  }, [diagnostics]);

  // The current-execution-line highlight (Phase 3). Cleared on
  // idle/completed/error/reset, not just on an explicit reset click —
  // see the ExecutionStatus values this checks against.
  useEffect(() => {
    const collection = decorationsRef.current;
    if (!collection) return;
    const showHighlight =
      currentStep && (executionStatus === "running" || executionStatus === "paused" || executionStatus === "waiting-for-input");
    if (!showHighlight) {
      collection.set([]);
      return;
    }
    collection.set([
      {
        range: new monaco.Range(currentStep.line + 1, 1, currentStep.line + 1, 1),
        options: {
          isWholeLine: true,
          className: "codevi-execution-line",
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);
    editorRef.current?.revealLineInCenterIfOutsideViewport(currentStep.line + 1);
  }, [currentStep, executionStatus]);

  return (
    <Editor
      height="100%"
      language="c"
      value={code}
      onChange={handleChange}
      onMount={handleMount}
      theme={theme === "dark" ? "cv-dark" : "cv-light"}
      beforeMount={defineEditorThemes}
      options={{
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 14,
        lineNumbers: "on",
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        readOnly: isReadOnly,
        // Execution (Phase 3) is a real tree-walking interpreter, not a
        // simulation — see docs/PHASE_3_EXECUTION.md.
      }}
    />
  );
}
