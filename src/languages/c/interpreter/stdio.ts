import type { Node as SyntaxNode } from "web-tree-sitter";
import type { CType, CValue } from "./values";

/**
 * Everything format-string/format-specifier related for printf/scanf/
 * puts/putchar/getchar. Deliberately pure (no web-tree-sitter Node
 * dependency beyond the one text-extraction helper, no interpreter
 * state) so it can be unit tested directly — see
 * tests/unit/stdio.test.ts — and so interpreter.ts stays focused on
 * control flow rather than format-string parsing.
 */

const ESCAPES: Record<string, string> = {
  "\\n": "\n",
  "\\t": "\t",
  "\\r": "\r",
  "\\0": "\0",
  "\\\\": "\\",
  "\\'": "'",
  '\\"': '"',
};

/** Extracts a string literal's real text (escape sequences resolved,
 * quotes removed) by walking its string_content/escape_sequence
 * children — NOT by slicing node.text, which would include the quotes
 * and leave escapes as literal backslash-n pairs rather than real
 * characters. See docs/PHASE_4_1_STDIO.md → "String literal handling"
 * for why this two-level structure matters. */
export function extractStringLiteralText(node: SyntaxNode): string {
  let result = "";
  for (const child of node.namedChildren) {
    if (!child) continue;
    if (child.type === "string_content") {
      result += child.text;
    } else if (child.type === "escape_sequence") {
      result += ESCAPES[child.text] ?? child.text;
    }
  }
  return result;
}

export type PrintfSpecifier = "d" | "i" | "u" | "f" | "c" | "s";
const PRINTF_SPECIFIERS = new Set(["d", "i", "u", "f", "c", "s"]);

export type FormatToken = { kind: "text"; text: string } | { kind: "specifier"; specifier: PrintfSpecifier };

/** Tokenizes a printf format string into literal-text and specifier
 * pieces, in order. `%%` becomes a literal `%`. Throws on an
 * unrecognized specifier rather than printing it literally, since
 * silently passing through `%z` would look like a supported feature
 * that happens to do nothing. */
export function parseFormatString(text: string): FormatToken[] {
  const tokens: FormatToken[] = [];
  let buffer = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "%") {
      buffer += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === "%") {
      buffer += "%";
      i++;
      continue;
    }
    if (next && PRINTF_SPECIFIERS.has(next)) {
      if (buffer) {
        tokens.push({ kind: "text", text: buffer });
        buffer = "";
      }
      tokens.push({ kind: "specifier", specifier: next as PrintfSpecifier });
      i++;
      continue;
    }
    throw new Error(`Unsupported format specifier "%${next ?? ""}" — supported: %d %i %u %f %c %s %%`);
  }
  if (buffer) tokens.push({ kind: "text", text: buffer });
  return tokens;
}

export type PrintfArgument = { kind: "value"; value: CValue } | { kind: "string"; text: string };

function formatPrintfValue(value: CValue, specifier: PrintfSpecifier): string {
  switch (specifier) {
    case "d":
    case "i":
    case "u":
      return String(Math.trunc(value.value));
    case "f":
      return value.value.toFixed(6);
    case "c":
      return String.fromCharCode(value.value);
    default:
      throw new Error(`"%${specifier}" cannot format a numeric value`);
  }
}

/** Renders a printf call's output given its already-evaluated
 * arguments. Arguments are pre-evaluated (rather than taking AST nodes)
 * so this stays independent of the interpreter's generator machinery —
 * see interpreter.ts's printf case for how arguments are evaluated
 * (string literals specially, everything else through evaluate()). */
export function renderPrintf(formatText: string, args: PrintfArgument[]): string {
  const tokens = parseFormatString(formatText);
  let argIndex = 0;
  let output = "";
  for (const token of tokens) {
    if (token.kind === "text") {
      output += token.text;
      continue;
    }
    const arg = args[argIndex];
    if (!arg) throw new Error(`printf format string expects more arguments than were provided (missing one for "%${token.specifier}")`);
    argIndex++;
    if (token.specifier === "s") {
      if (arg.kind !== "string") {
        throw new Error('%s only supports a string literal written directly in the printf() call — Codevi has no string variable type yet');
      }
      output += arg.text;
    } else {
      if (arg.kind !== "value") {
        throw new Error(`"%${token.specifier}" expects a number, not a string literal`);
      }
      output += formatPrintfValue(arg.value, token.specifier);
    }
  }
  return output;
}

export type ScanfSpecifier = "d" | "i" | "u" | "f" | "c";
const SCANF_SPECIFIERS = new Set(["d", "i", "u", "f", "c"]);

/** Extracts scanf's format specifiers in order. `%s` is deliberately
 * rejected here (not just unimplemented) with a specific message —
 * Codevi has no char-array/string variable type to scan into, so this
 * isn't a gap to silently work around later, it needs a real value-model
 * change first. See docs/PHASE_4_1_STDIO.md → "Known limitations". */
export function parseScanfFormat(text: string): ScanfSpecifier[] {
  const specifiers: ScanfSpecifier[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "%") continue;
    const next = text[i + 1];
    if (next === "s") {
      throw new Error('scanf("%s", ...) is not supported — Codevi has no string/char-array variable type to store the result in yet');
    }
    if (next && SCANF_SPECIFIERS.has(next)) {
      specifiers.push(next as ScanfSpecifier);
      i++;
      continue;
    }
    throw new Error(`Unsupported scanf format specifier "%${next ?? ""}" — supported: %d %i %u %f %c`);
  }
  return specifiers;
}

function scanfTypeFor(specifier: ScanfSpecifier): CType {
  return specifier === "f" ? "float" : specifier === "c" ? "char" : "int";
}

/** Parses and validates one raw input string against a scanf specifier.
 * Returns null on anything that isn't a valid value for that specifier
 * — the caller (ExecutionEngine) is responsible for re-prompting rather
 * than ever passing an invalid value into the interpreter, so the
 * interpreter's own code never has to handle malformed scanf input. */
export function parseScanfValue(raw: string, specifier: ScanfSpecifier): CValue | null {
  if (specifier === "c") {
    if (raw.length === 0) return null;
    return { type: "char", value: raw.charCodeAt(0) };
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (specifier === "f") {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
    return { type: "float", value: parseFloat(trimmed) };
  }
  // d / i / u
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  return { type: "int", value: parseInt(trimmed, 10) };
}

/** Same validation getchar() needs — a single character, nothing more
 * to parse. Kept separate from parseScanfValue's "c" case only because
 * getchar isn't format-string-driven at all; the underlying rule is
 * identical. */
export function parseGetcharValue(raw: string): CValue | null {
  if (raw.length === 0) return null;
  return { type: "int", value: raw.charCodeAt(0) };
}

export function describeScanfSpecifier(specifier: ScanfSpecifier): string {
  const type = scanfTypeFor(specifier);
  return type === "float" ? "a decimal number" : type === "char" ? "a single character" : "a whole number";
}
