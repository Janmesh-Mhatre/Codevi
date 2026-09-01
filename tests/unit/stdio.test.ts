import { describe, expect, it } from "vitest";
import {
  parseFormatString,
  renderPrintf,
  parseScanfFormat,
  parseScanfValue,
  parseGetcharValue,
} from "../../src/languages/c/interpreter/stdio";

describe("printf format string parsing and rendering", () => {
  it("tokenizes plain text with no specifiers", () => {
    expect(parseFormatString("Hello")).toEqual([{ kind: "text", text: "Hello" }]);
  });

  it("tokenizes %d/%s mixed with text", () => {
    expect(parseFormatString("x = %d, name = %s!")).toEqual([
      { kind: "text", text: "x = " },
      { kind: "specifier", specifier: "d" },
      { kind: "text", text: ", name = " },
      { kind: "specifier", specifier: "s" },
      { kind: "text", text: "!" },
    ]);
  });

  it("treats %% as a literal percent sign", () => {
    expect(parseFormatString("100%%")).toEqual([{ kind: "text", text: "100%" }]);
  });

  it("rejects an unrecognized specifier instead of passing it through silently", () => {
    expect(() => parseFormatString("%z")).toThrow(/Unsupported format specifier/);
  });

  it("renders x = 10, y = 20 (the Phase 4.1 brief's exact printf example)", () => {
    const output = renderPrintf("x = %d, y = %d\n", [
      { kind: "value", value: { kind: "scalar", type: "int", value: 10 } },
      { kind: "value", value: { kind: "scalar", type: "int", value: 20 } },
    ]);
    expect(output).toBe("x = 10, y = 20\n");
  });

  it("renders %s from a string literal argument", () => {
    const output = renderPrintf("Name: %s", [{ kind: "string", text: "Bob" }]);
    expect(output).toBe("Name: Bob");
  });

  it("renders %f with six decimal places, matching real printf's default", () => {
    const output = renderPrintf("%f", [{ kind: "value", value: { kind: "scalar", type: "float", value: 3.5 } }]);
    expect(output).toBe("3.500000");
  });

  it("renders %c as a character, not its numeric code", () => {
    const output = renderPrintf("%c", [{ kind: "value", value: { kind: "scalar", type: "char", value: 65 } }]);
    expect(output).toBe("A");
  });

  it("throws a clear error when there are fewer arguments than specifiers, instead of printing garbage", () => {
    expect(() => renderPrintf("%d %d", [{ kind: "value", value: { kind: "scalar", type: "int", value: 1 } }])).toThrow(/expects more arguments/);
  });

  it("throws when %s is given a non-string argument", () => {
    expect(() => renderPrintf("%s", [{ kind: "value", value: { kind: "scalar", type: "int", value: 1 } }])).toThrow(/string literal/);
  });
});

describe("scanf format parsing", () => {
  it("extracts specifiers in order", () => {
    expect(parseScanfFormat("%d %d")).toEqual(["d", "d"]);
  });

  it("rejects %s specifically, with a message explaining why", () => {
    expect(() => parseScanfFormat("%s")).toThrow(/no string\/char-array variable type/);
  });

  it("rejects an unrecognized specifier", () => {
    expect(() => parseScanfFormat("%z")).toThrow(/Unsupported scanf format specifier/);
  });
});

describe("scanf value validation", () => {
  it("accepts a plain integer for %d", () => {
    expect(parseScanfValue("21", "d")).toEqual({ kind: "scalar", type: "int", value: 21 });
  });

  it("accepts a negative integer", () => {
    expect(parseScanfValue("-5", "i")).toEqual({ kind: "scalar", type: "int", value: -5 });
  });

  it("rejects non-numeric input for %d instead of coercing it to 0 or NaN", () => {
    expect(parseScanfValue("hello", "d")).toBeNull();
  });

  it("rejects a float string for %d (not a whole number)", () => {
    expect(parseScanfValue("3.5", "d")).toBeNull();
  });

  it("accepts a float for %f", () => {
    expect(parseScanfValue("3.5", "f")).toEqual({ kind: "scalar", type: "float", value: 3.5 });
  });

  it("accepts a bare integer string for %f too", () => {
    expect(parseScanfValue("4", "f")).toEqual({ kind: "scalar", type: "float", value: 4 });
  });

  it("rejects empty input", () => {
    expect(parseScanfValue("", "d")).toBeNull();
    expect(parseScanfValue("   ", "d")).toBeNull();
  });

  it("accepts a single character for %c", () => {
    expect(parseScanfValue("A", "c")).toEqual({ kind: "scalar", type: "char", value: 65 });
  });

  it("takes only the first character for %c given more input", () => {
    expect(parseScanfValue("ABC", "c")).toEqual({ kind: "scalar", type: "char", value: 65 });
  });
});

describe("getchar value validation", () => {
  it("returns the character code of the first character", () => {
    expect(parseGetcharValue("A")).toEqual({ kind: "scalar", type: "int", value: 65 });
  });

  it("rejects empty input", () => {
    expect(parseGetcharValue("")).toBeNull();
  });
});
