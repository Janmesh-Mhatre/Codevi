import { create } from "zustand";
import type { SupportedLanguage } from "../types";

const STARTER_SOURCE = `#include <stdio.h>

int square(int n) {
    return n * n;
}

int main(void) {
    int value = 7;
    printf("%d squared is %d\\n", value, square(value));
    return 0;
}
`;

interface EditorState {
  code: string;
  setCode: (code: string) => void;
  language: SupportedLanguage;
}

/** Holds the source buffer. Phase 1 only reads and writes `code` — parsing,
 * breakpoints, and cursor tracking arrive with the Parser and Execution
 * Engine layers (Phase 0 blueprint, sections 8–9). */
export const useEditorStore = create<EditorState>()((set) => ({
  code: STARTER_SOURCE,
  setCode: (code) => set({ code }),
  language: "c",
}));
