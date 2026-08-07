import { create } from "zustand";
import type { AstNode, ParseResult, SyntaxDiagnostic } from "../languages/c/astTypes";

type ParserStatus = "initializing" | "ready" | "error";

interface ParserState {
  status: ParserStatus;
  ast: AstNode | null;
  diagnostics: SyntaxDiagnostic[];
  parseTimeMs: number | null;
  usedIncrementalParse: boolean;
  nodeCount: number;
  errorMessage: string | null;

  setReady: () => void;
  setInitError: (message: string) => void;
  applyParseResult: (result: ParseResult) => void;
}

/**
 * Live counterpart to Phase 1's placeholder stores: this one is
 * actually written to, by useCParser (see src/hooks/useCParser.ts) each
 * time the C source is reparsed. AstViewerPanel and ConsolePanel both
 * read from here.
 */
export const useParserStore = create<ParserState>()((set) => ({
  status: "initializing",
  ast: null,
  diagnostics: [],
  parseTimeMs: null,
  usedIncrementalParse: false,
  nodeCount: 0,
  errorMessage: null,

  setReady: () => set({ status: "ready", errorMessage: null }),
  setInitError: (message) => set({ status: "error", errorMessage: message }),
  applyParseResult: (result) =>
    set({
      ast: result.ast,
      diagnostics: result.diagnostics,
      parseTimeMs: result.parseTimeMs,
      usedIncrementalParse: result.usedIncrementalParse,
      nodeCount: result.nodeCount,
    }),
}));
