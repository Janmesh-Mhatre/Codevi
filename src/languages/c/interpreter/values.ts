import type { Address } from "./memory";
import { addressesEqual, formatAddress } from "./memory";

/**
 * Runtime value representation for the interpreter.
 *
 * As of Phase 5, a value is either a scalar (int/float/double/char, as
 * in Phase 3) or a pointer (new). Structs, unions, and arrays still
 * aren't modeled — see docs/PHASE_5_POINTERS.md → "Supported C
 * constructs" for exactly what pointer usage is covered.
 */
export type CType = "int" | "float" | "double" | "char";

/** A pointer's static type — what it points *to*. Recursive so
 * pointer-to-pointer (int**) is representable, though only depth 1–2 is
 * verified/tested; see docs/PHASE_5_POINTERS.md → "Supported pointer
 * depth". */
export interface CPointerType {
  kind: "pointer";
  pointee: CType | CPointerType;
}

export interface CScalarValue {
  kind: "scalar";
  type: CType;
  /** All arithmetic happens in JS's double-precision numbers regardless
   * of C type — this means genuine C integer-width/overflow behavior
   * isn't modeled. Documented as a known limitation rather than silently
   * pretended away. */
  value: number;
}

export interface CPointerValue {
  kind: "pointer";
  pointerType: CPointerType;
  /** null = this pointer is NULL. Never a raw number — always a real
   * Address into the current run's MemoryModel, or null. */
  target: Address | null;
}

export type CValue = CScalarValue | CPointerValue;

export function isPointer(value: CValue): value is CPointerValue {
  return value.kind === "pointer";
}

export function scalar(type: CType, value: number): CScalarValue {
  return { kind: "scalar", type, value };
}

export function pointerValue(pointee: CType | CPointerType, target: Address | null): CPointerValue {
  return { kind: "pointer", pointerType: { kind: "pointer", pointee }, target };
}

export class CRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CRuntimeError";
  }
}

export function isTruthy(value: CValue): boolean {
  return value.kind === "pointer" ? value.target !== null : value.value !== 0;
}

export function cBool(condition: boolean): CScalarValue {
  // C has no boolean type in the classic sense — comparisons and logical
  // operators produce a plain int 0/1.
  return scalar("int", condition ? 1 : 0);
}

/** Simplified "usual arithmetic conversion": double beats float beats
 * int/char. Real C's promotion rules also account for signedness and
 * integer width, which this interpreter doesn't model. Scalar-only —
 * see pointerArithmetic()/comparePointers() in interpreter.ts for
 * pointer-involving operators, which never reach this function. */
function resultType(a: CType, b: CType): CType {
  if (a === "double" || b === "double") return "double";
  if (a === "float" || b === "float") return "float";
  return "int";
}

function isIntegral(type: CType): boolean {
  return type === "int" || type === "char";
}

export function applyBinaryOp(operator: string, left: CScalarValue, right: CScalarValue): CScalarValue {
  const type = resultType(left.type, right.type);
  const bothIntegral = isIntegral(left.type) && isIntegral(right.type);

  switch (operator) {
    case "+":
      return scalar(type, left.value + right.value);
    case "-":
      return scalar(type, left.value - right.value);
    case "*":
      return scalar(type, left.value * right.value);
    case "/":
      if (right.value === 0) {
        if (bothIntegral) {
          throw new CRuntimeError("Division by zero");
        }
        // Floating-point division by zero is well-defined in C (IEEE 754
        // infinity/NaN) — unlike integer division by zero, so this is
        // allowed to produce Infinity/-Infinity/NaN rather than erroring.
        return scalar(type, left.value / right.value);
      }
      // C integer division truncates toward zero; JS's `/` doesn't.
      return scalar(type, bothIntegral ? Math.trunc(left.value / right.value) : left.value / right.value);
    case "%":
      if (right.value === 0) throw new CRuntimeError("Division by zero (modulo)");
      // JS's `%` is already a truncating-division remainder, matching C99+.
      return scalar("int", left.value % right.value);
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
      return scalar("int", (left.value | 0) & (right.value | 0));
    case "|":
      return scalar("int", (left.value | 0) | (right.value | 0));
    case "^":
      return scalar("int", (left.value | 0) ^ (right.value | 0));
    case "<<":
      return scalar("int", (left.value | 0) << (right.value | 0));
    case ">>":
      return scalar("int", (left.value | 0) >> (right.value | 0));
    default:
      throw new CRuntimeError(`Unsupported operator "${operator}"`);
  }
}

export function applyUnaryOp(operator: string, operand: CScalarValue): CScalarValue {
  switch (operator) {
    case "-":
      return scalar(operand.type, -operand.value);
    case "+":
      return operand;
    case "!":
      return cBool(!isTruthy(operand));
    case "~":
      return scalar("int", ~(operand.value | 0));
    default:
      throw new CRuntimeError(`Unsupported unary operator "${operator}"`);
  }
}

/** Pointer comparison (==, != only — <, > etc. on pointers aren't
 * supported, matching the Phase 5 brief's explicit scope). Two pointers
 * are equal exactly when they hold the same address (or both NULL). */
export function comparePointers(operator: string, left: CPointerValue, right: CPointerValue): CScalarValue {
  const equal = addressesEqual(left.target, right.target);
  if (operator === "==") return cBool(equal);
  if (operator === "!=") return cBool(!equal);
  throw new CRuntimeError(`"${operator}" is not supported between pointers — only == and != are`);
}

export function formatPointerType(type: CType | CPointerType): string {
  if (typeof type === "string") return `${type}*`;
  return `${formatPointerType(type.pointee)}*`;
}

/** Parses a Tree-sitter `number_literal` token's text into a CValue.
 * Handles integer suffixes (u/l/ll in any case) and float/double
 * suffixes (f) by stripping them — this interpreter doesn't model
 * distinct integer widths or signedness, so the suffix only matters for
 * choosing int vs float vs double. */
export function parseNumberLiteral(text: string): CScalarValue {
  const isFloatingPoint = /[.eE]/.test(text) || /f$/i.test(text);
  if (isFloatingPoint) {
    const isFloat = /f$/i.test(text);
    const numeric = parseFloat(text.replace(/[fFlL]+$/, ""));
    return scalar(isFloat ? "float" : "double", numeric);
  }
  const cleaned = text.replace(/^0[xX]/, "0x").replace(/[uUlL]+$/, "");
  const numeric = cleaned.startsWith("0x") ? parseInt(cleaned, 16) : parseInt(cleaned, 10);
  return scalar("int", numeric);
}

/** Parses a Tree-sitter `char_literal` token's text (including the
 * surrounding quotes, e.g. `'a'` or `'\n'`) into its numeric char code. */
export function parseCharLiteral(text: string): CScalarValue {
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
    return scalar("char", escapes[inner] ?? inner.charCodeAt(1));
  }
  return scalar("char", inner.charCodeAt(0));
}

export function defaultValueForType(type: CType): CScalarValue {
  return scalar(type, 0);
}

/** An uninitialized/default pointer is NULL — a deliberate safety choice,
 * not what real C does (real C leaves it as garbage, which is genuinely
 * dangerous). Documented in docs/PHASE_5_POINTERS.md → "Known
 * limitations": dereferencing a default-initialized pointer in Codevi
 * always gives a clear null-dereference error rather than reading
 * whatever garbage a real uninitialized pointer would contain. */
export function defaultPointerValue(pointee: CType | CPointerType): CPointerValue {
  return pointerValue(pointee, null);
}

export { formatAddress };
