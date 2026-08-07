import { useEffect, useRef, useCallback } from "react";
import { initParser, parseSource, type TextChange } from "../services/parserService";
import { useParserStore } from "../state/parserStore";
import { useEditorStore } from "../state/editorStore";
import { scope } from "../utils/logger";

const log = scope("useCParser");
const DEBOUNCE_MS = 120;

/**
 * Owns the parser's lifecycle for the editor: initializes Tree-sitter
 * once on mount, parses the starter source as soon as it's ready, and
 * returns `notifyChange` for CodeEditor to call from Monaco's onChange.
 *
 * Safe to call from more than one component — parserService.initParser
 * is itself idempotent — but in practice only CodeEditor uses this.
 */
export function useCParser() {
  const applyParseResult = useParserStore((state) => state.applyParseResult);
  const setReady = useParserStore((state) => state.setReady);
  const setInitError = useParserStore((state) => state.setInitError);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    initParser()
      .then(() => {
        if (cancelled) return;
        setReady();
        // Parse the starter/current source immediately so the AST panel
        // has something to show before the user's first keystroke.
        const result = parseSource(useEditorStore.getState().code);
        applyParseResult(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        log.error("Tree-sitter failed to initialize", message);
        setInitError(message);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally empty deps — this bootstraps exactly once per app
    // session; parseSource reads the store directly rather than via a
    // dependency so this effect never needs to rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifyChange = useCallback(
    (text: string, changes: readonly TextChange[]) => {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        try {
          const result = parseSource(text, changes);
          applyParseResult(result);
        } catch (error) {
          // Parser not ready yet (still initializing) — the next
          // successful edit will parse the latest text anyway.
          log.debug("skipped parse", error instanceof Error ? error.message : error);
        }
      }, DEBOUNCE_MS);
    },
    [applyParseResult],
  );

  return { notifyChange };
}
