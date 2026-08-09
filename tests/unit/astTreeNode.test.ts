import { describe, expect, it } from "vitest";
import { decodeUnicodeEscapes } from "../../src/components/panels/AstTreeNode";

describe("decodeUnicodeEscapes", () => {
  it("decodes unicode escape sequences like \\u201C and \\u201D", () => {
    expect(decodeUnicodeEscapes("\\u201Cmain\\u201D")).toBe("“main”");
    expect(decodeUnicodeEscapes("\\u201C<stdio.h>\\u201D")).toBe("“<stdio.h>”");
  });

  it("decodes unicode escapes for other characters", () => {
    expect(decodeUnicodeEscapes("\\u00A9 2026")).toBe("© 2026");
    expect(decodeUnicodeEscapes("\\u03B1 + \\u03B2")).toBe("α + β");
  });

  it("preserves normal identifiers, punctuation, and text without escapes", () => {
    expect(decodeUnicodeEscapes("main")).toBe("main");
    expect(decodeUnicodeEscapes("int a = 10;")).toBe("int a = 10;");
    expect(decodeUnicodeEscapes('printf("Hello, World!\\n");')).toBe('printf("Hello, World!\\n");');
    expect(decodeUnicodeEscapes("system_lib_string")).toBe("system_lib_string");
  });

  it("handles empty strings", () => {
    expect(decodeUnicodeEscapes("")).toBe("");
  });
});
