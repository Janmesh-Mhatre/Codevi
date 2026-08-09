/**
 * Runtime value representation for the interpreter.
 *
 * Deliberately small: Phase 3 supports scalar arithmetic types only (see
 * docs/PHASE_3_EXECUTION.md → "Supported C constructs"). There is no
 * pointer, array, or struct value — those need real memory/address
 * semantics, which is Phase 4+'s job, not this one's.
 */
export type CType = "int" | "float" | "double" | "char";

export interface CValue {
  type: CType;
  /** All arithmetic happens in JS's double-precision numbers regardless
   * of C type — this means genuine C integer-width/overflow behavior
   * isn't modeled. Documented as a known limitation rather than silently
   * pretended away. */
  value: number;
}

export class CRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CRuntimeError";
  }
}

export function isTruthy(value: CValue): boolean {
  return value.value !== 0;
}

export function cBool(condition: boolean): CValue {
  // C has no boolean type in the classic sense — comparisons and logical
  // operators produce a plain int 0/1.
  return { type: "int", value: condition ? 1 : 0 };
}

/** Simplified "usual arithmetic conversion": double beats float beats
 * int/char. Real C's promotion rules also account for signedness and
 * integer width, which this interpreter doesn't model. */
function resultType(a: CType, b: CType): CType {
  if (a === "double" || b === "double") return "double";
  if (a === "float" || b === "float") return "float";
  return "int";
}

function isIntegral(type: CType): boolean {
  return type === "int" || type === "char";
}

export function applyBinaryOp(operator: string, left: CValue, right: CValue): CValue {
  const type = resultType(left.type, right.type);
  const bothIntegral = isIntegral(left.type) && isIntegral(right.type);

  switch (operator) {
    case "+":
      return { type, value: left.value + right.value };
    case "-":
      return { type, value: left.value - right.value };
    case "*":
      return { type, value: left.value * right.value };
    case "/":
      if (right.value === 0) {
        if (bothIntegral) {
          throw new CRuntimeError("Division by zero");
        }
        // Floating-point division by zero is well-defined in C (IEEE 754
        // infinity/NaN) — unlike integer division by zero, so this is
        // allowed to produce Infinity/-Infinity/NaN rather than erroring.
        return { type, value: left.value / right.value };
      }
      // C integer division truncates toward zero; JS's `/` doesn't.
      return { type, value: bothIntegral ? Math.trunc(left.value / right.value) : left.value / right.value };
    case "%":
      if (right.value === 0) throw new CRuntimeError("Division by zero (modulo)");
      // JS's `%` is already a truncating-division remainder, matching C99+.
      return { type: "int", value: left.value % right.value };
    case "<":
      return cBool(left.value < right.value);
    case ">":
      return cBool(left.value > right.value);
    case "<=":
      return cBool(left.value <= right.value);
    case ">=":
      return cBool(left.value >= right.value);
    case "==":
      return cBool(left.value === right.value);
    case "!=":
      return cBool(left.value !== right.value);
    case "&&":
      return cBool(isTruthy(left) && isTruthy(right));
    case "||":
      return cBool(isTruthy(left) || isTruthy(right));
    case "&":
      return { type: "int", value: (left.value | 0) & (right.value | 0) };
    case "|":
      return { type: "int", value: (left.value | 0) | (right.value | 0) };
    case "^":
      return { type: "int", value: (left.value | 0) ^ (right.value | 0) };
    case "<<":
      return { type: "int", value: (left.value | 0) << (right.value | 0) };
    case ">>":
      return { type: "int", value: (left.value | 0) >> (right.value | 0) };
    default:
      throw new CRuntimeError(`Unsupported operator "${operator}"`);
  }
}

export function applyUnaryOp(operator: string, operand: CValue): CValue {
  switch (operator) {
    case "-":
      return { type: operand.type, value: -operand.value };
    case "+":
      return operand;
    case "!":
      return cBool(!isTruthy(operand));
    case "~":
      return { type: "int", value: ~(operand.value | 0) };
    default:
      throw new CRuntimeError(`Unsupported unary operator "${operator}"`);
  }
}

/** Parses a Tree-sitter `number_literal` token's text into a CValue.
 * Handles integer suffixes (u/l/ll in any case) and float/double
 * suffixes (f) by stripping them — this interpreter doesn't model
 * distinct integer widths or signedness, so the suffix only matters for
 * choosing int vs float vs double. */
export function parseNumberLiteral(text: string): CValue {
  const isFloatingPoint = /[.eE]/.test(text) || /f$/i.test(text);
  if (isFloatingPoint) {
    const isFloat = /f$/i.test(text);
    const numeric = parseFloat(text.replace(/[fFlL]+$/, ""));
    return { type: isFloat ? "float" : "double", value: numeric };
  }
  const cleaned = text.replace(/^0[xX]/, "0x").replace(/[uUlL]+$/, "");
  const numeric = cleaned.startsWith("0x") ? parseInt(cleaned, 16) : parseInt(cleaned, 10);
  return { type: "int", value: numeric };
}

/** Parses a Tree-sitter `char_literal` token's text (including the
 * surrounding quotes, e.g. `'a'` or `'\n'`) into its numeric char code. */
export function parseCharLiteral(text: string): CValue {
  const inner = text.slice(1, -1);
  if (inner.startsWith("\\")) {
    const escapes: Record<string, number> = {
      "\\n": 10,
      "\\t": 9,
      "\\r": 13,
      "\\0": 0,
      "\\\\": 92,
      "\\'": 39,
      '\\"': 34,
    };
    return { type: "char", value: escapes[inner] ?? inner.charCodeAt(1) };
  }
  return { type: "char", value: inner.charCodeAt(0) };
}

export function defaultValueForType(type: CType): CValue {
  return { type, value: 0 };
}
