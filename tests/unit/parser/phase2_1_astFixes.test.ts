import { describe, expect, it } from "vitest";
import { advancePosition } from "../../../src/parser/parserService";
import { formatNodeText } from "../../../src/components/panels/AstTreeNode";

// ---------------------------------------------------------------------------
// Phase 2.1 — AST & Rendering Fixes unit tests
// ---------------------------------------------------------------------------

describe("formatNodeText (escape sequence display)", () => {
  it("replaces LF with visible \\n", () => {
    expect(formatNodeText("hello\nworld")).toBe("hello\\nworld");
  });

  it("replaces CR with visible \\r", () => {
    expect(formatNodeText("hello\rworld")).toBe("hello\\rworld");
  });

  it("replaces TAB with visible \\t", () => {
    expect(formatNodeText("col1\tcol2")).toBe("col1\\tcol2");
  });

  it("replaces NULL with visible \\0", () => {
    expect(formatNodeText("abc\0def")).toBe("abc\\0def");
  });

  it("escapes existing backslashes before replacing control chars", () => {
    // A literal backslash followed by a real newline should become \\\\n
    // (the backslash is escaped first, then the \n is replaced).
    expect(formatNodeText("\\\n")).toBe("\\\\\\n");
  });

  it("handles strings with no special characters unchanged", () => {
    expect(formatNodeText("hello world")).toBe("hello world");
  });

  it("handles an empty string", () => {
    expect(formatNodeText("")).toBe("");
  });

  it("handles mixed escape sequences", () => {
    expect(formatNodeText("a\tb\nc\r\0")).toBe("a\\tb\\nc\\r\\0");
  });
});

describe("advancePosition (CRLF handling)", () => {
  const origin = { row: 0, column: 0 };

  it("advances column for text with no newlines", () => {
    expect(advancePosition(origin, "hello")).toEqual({ row: 0, column: 5 });
  });

  it("preserves start column offset for single-line text", () => {
    expect(advancePosition({ row: 3, column: 10 }, "abc")).toEqual({
      row: 3,
      column: 13,
    });
  });

  it("handles a single LF newline", () => {
    expect(advancePosition(origin, "abc\ndef")).toEqual({ row: 1, column: 3 });
  });

  it("handles multiple LF newlines", () => {
    expect(advancePosition(origin, "a\nb\nc")).toEqual({ row: 2, column: 1 });
  });

  it("handles a single CRLF as one newline", () => {
    expect(advancePosition(origin, "abc\r\ndef")).toEqual({ row: 1, column: 3 });
  });

  it("handles multiple CRLF newlines", () => {
    expect(advancePosition(origin, "a\r\nb\r\nc")).toEqual({ row: 2, column: 1 });
  });

  it("handles lone CR as a newline", () => {
    expect(advancePosition(origin, "abc\rdef")).toEqual({ row: 1, column: 3 });
  });

  it("handles mixed CRLF, LF, and CR in one string", () => {
    // "a\r\nb\nc\rd" → after normalisation: "a\nb\nc\rd" → 3 newlines, last segment "d"
    expect(advancePosition(origin, "a\r\nb\nc\rd")).toEqual({ row: 3, column: 1 });
  });

  it("handles trailing newline (LF)", () => {
    expect(advancePosition(origin, "abc\n")).toEqual({ row: 1, column: 0 });
  });

  it("handles trailing newline (CRLF)", () => {
    expect(advancePosition(origin, "abc\r\n")).toEqual({ row: 1, column: 0 });
  });

  it("handles empty string", () => {
    expect(advancePosition({ row: 5, column: 8 }, "")).toEqual({
      row: 5,
      column: 8,
    });
  });
});
