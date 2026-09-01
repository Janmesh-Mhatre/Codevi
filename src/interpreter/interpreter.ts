import type { Node as SyntaxNode } from "web-tree-sitter";
import { Scope } from "./scope";
import { MemoryModel, formatAddress, sizeOfType, type Address } from "../memory/memory";
import {
  applyBinaryOp,
  applyUnaryOp,
  cBool,
  comparePointers,
  defaultPointerValue,
  defaultValueForType,
  isPointer,
  isTruthy,
  parseCharLiteral,
  parseNumberLiteral,
  pointerValue,
  scalar,
  type CPointerType,
  type CPointerValue,
  type CScalarValue,
  type CType,
  type CValue,
} from "./values";
import {
  BreakSignal,
  ContinueSignal,
  InterpreterError,
  isKnownLibraryFunction,
  unsupported,
  type InputRequest,
  type InputResumeValue,
  type InterpreterStep,
  type RuntimeFrame,
  type StackFrameSnapshot,
} from "./types";
import {
  extractStringLiteralText,
  parseScanfFormat,
  renderPrintf,
  type PrintfArgument,
  type ScanfSpecifier,
} from "../stdlib/stdio";

const MAX_CALL_DEPTH = 200;

type StatementResult = { kind: "normal" } | { kind: "return"; value: CValue | undefined };
const NORMAL: StatementResult = { kind: "normal" };

/** See docs/PHASE_4_1_STDIO.md → "Why generators can pause for real
 * input" for the InputResumeValue half of this; unchanged in Phase 5. */
type Step<T> = Generator<InterpreterStep, T, InputResumeValue | undefined>;

function truncate(text: string, max = 60): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

function mapPrimitiveType(text: string | undefined): CType {
  switch (text) {
    case "float":
      return "float";
    case "double":
      return "double";
    case "char":
      return "char";
    case "int":
    case "short":
    case "long":
    case "unsigned":
    case "signed":
      return "int";
    default:
      return "int";
  }
}

/**
 * Resolves a declarator (the part of a declaration after the base type)
 * into a variable name and its full type, unwrapping any number of
 * `pointer_declarator` layers recursively — `int **pptr` is two layers,
 * each adding one level of pointer-to. Returns null for declarator
 * shapes Codevi doesn't support (arrays, function pointers). Verified
 * against the real grammar (plain int, single-star, and double-star
 * declarators, with and without initializers) before writing this, the
 * same way earlier phases verified field names — see
 * docs/PHASE_5_POINTERS.md → "Declarator resolution".
 */
function resolveDeclarator(node: SyntaxNode, baseType: CType): { name: string; type: CType | CPointerType } | null {
  if (node.type === "identifier") {
    return { name: node.text, type: baseType };
  }
  if (node.type === "pointer_declarator") {
    const inner = node.childForFieldName("declarator");
    if (!inner) return null;
    const resolved = resolveDeclarator(inner, baseType);
    if (!resolved) return null;
    return { name: resolved.name, type: { kind: "pointer", pointee: resolved.type } };
  }
  return null;
}

function defaultForResolvedType(type: CType | CPointerType): CValue {
  return typeof type === "string" ? defaultValueForType(type) : defaultPointerValue(type.pointee);
}

function formatValue(value: CValue): string {
  if (value.kind === "pointer") {
    return value.target ? formatAddress(value.target) : "NULL";
  }
  if (value.type === "char") return `'${String.fromCharCode(value.value)}'`;
  return String(value.value);
}

function namedChildren(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter((child): child is SyntaxNode => child !== null);
}

function functionNameOf(fnNode: SyntaxNode): string | null {
  const declarator = fnNode.childForFieldName("declarator");
  return declarator?.childForFieldName("declarator")?.text ?? null;
}

/** Collects every top-level function_definition into a name→node map.
 * Anything else at the top level (a #include, a comment, a global
 * variable declaration) is silently skipped rather than treated as an
 * error — see docs/PHASE_3_EXECUTION.md → "Supported C constructs" for
 * why globals specifically aren't supported yet. */
function collectFunctions(rootNode: SyntaxNode): Map<string, SyntaxNode> {
  const functions = new Map<string, SyntaxNode>();
  for (const child of namedChildren(rootNode)) {
    if (child.type === "function_definition") {
      const name = functionNameOf(child);
      if (name) functions.set(name, child);
    }
  }
  return functions;
}

function buildFrameSnapshot(frame: RuntimeFrame, callDepth: number): StackFrameSnapshot {
  const merged = frame.currentScope.snapshot();
  const addresses = frame.currentScope.snapshotAddresses();
  const parameters: Record<string, CValue> = {};
  const locals: Record<string, CValue> = {};
  for (const [name, value] of Object.entries(merged)) {
    if (frame.parameterNames.includes(name)) parameters[name] = value;
    else locals[name] = value;
  }
  return { functionName: frame.functionName, callDepth, line: frame.currentNode.startPosition.row, parameters, locals, addresses };
}

function makeStep(
  node: SyntaxNode,
  kind: InterpreterStep["kind"],
  callStack: RuntimeFrame[],
  scope: Scope,
  description: string,
  extra?: { output?: string; inputRequest?: InputRequest },
): InterpreterStep {
  const top = callStack[callStack.length - 1];
  if (top) {
    top.currentNode = node;
    top.currentScope = scope;
  }
  const stack = callStack.map((frame, index) => buildFrameSnapshot(frame, index + 1));
  const topSnapshot = stack[stack.length - 1];
  return {
    node,
    kind,
    functionName: top?.functionName ?? "?",
    callDepth: callStack.length,
    description,
    variables: topSnapshot ? { ...topSnapshot.parameters, ...topSnapshot.locals } : {},
    callStack: stack,
    memory: scope.memory,
    ...extra,
  };
}

function* emitOutput(node: SyntaxNode, callStack: RuntimeFrame[], scope: Scope, text: string): Step<void> {
  yield makeStep(node, "output", callStack, scope, `Output: ${truncate(text, 40)}`, { output: text });
}

function* requestInput(
  node: SyntaxNode,
  callStack: RuntimeFrame[],
  scope: Scope,
  specifier: ScanfSpecifier,
  source: string,
): Step<CValue> {
  const resume = yield makeStep(node, "input-request", callStack, scope, source, { inputRequest: { specifier, source } });
  if (!resume || resume.cancelled) {
    throw new InterpreterError("Input was cancelled", node);
  }
  return resume.value;
}

function extractScanfTargetName(node: SyntaxNode): string | null {
  if (node.type !== "pointer_expression") return null;
  if (node.childForFieldName("operator")?.text !== "&") return null;
  const argument = node.childForFieldName("argument");
  if (!argument || argument.type !== "identifier") return null;
  return argument.text;
}

// ---------------------------------------------------------------------
// Standard I/O (Phase 4.1, unchanged)
// ---------------------------------------------------------------------

function* callPrintf(
  node: SyntaxNode,
  argNodes: SyntaxNode[],
  scope: Scope,
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
): Step<CValue> {
  if (argNodes.length === 0) throw new InterpreterError("printf() requires a format string", node);
  const formatNode = argNodes[0];
  if (formatNode.type !== "string_literal") {
    throw new InterpreterError("printf()'s first argument must be a string literal", node);
  }
  const formatText = extractStringLiteralText(formatNode);

  const printfArgs: PrintfArgument[] = [];
  for (const argNode of argNodes.slice(1)) {
    if (argNode.type === "string_literal") {
      printfArgs.push({ kind: "string", text: extractStringLiteralText(argNode) });
    } else {
      const value = yield* evaluate(argNode, scope, functions, callStack);
      if (isPointer(value)) {
        throw new InterpreterError("printf()'s numeric specifiers (%d/%f/%c/...) don't support pointer arguments yet", argNode);
      }
      printfArgs.push({ kind: "value", value });
    }
  }

  let text: string;
  try {
    text = renderPrintf(formatText, printfArgs);
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }
  yield* emitOutput(node, callStack, scope, text);
  return scalar("int", text.length);
}

function* callPuts(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length !== 1) throw new InterpreterError("puts() takes exactly one argument", node);
  const argNode = argNodes[0];
  const text =
    argNode.type === "string_literal"
      ? extractStringLiteralText(argNode)
      : unsupported(argNode, "puts() only supports a string literal written directly in the call — Codevi has no string variable type yet");
  yield* emitOutput(node, callStack, scope, `${text}\n`);
  return scalar("int", 0);
}

function* callPutchar(
  node: SyntaxNode,
  argNodes: SyntaxNode[],
  scope: Scope,
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
): Step<CValue> {
  if (argNodes.length !== 1) throw new InterpreterError("putchar() takes exactly one argument", node);
  const value = yield* evaluate(argNodes[0], scope, functions, callStack);
  if (isPointer(value)) throw new InterpreterError("putchar() expects a character, not a pointer", argNodes[0]);
  yield* emitOutput(node, callStack, scope, String.fromCharCode(value.value));
  return scalar("int", value.value);
}

function* callScanf(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length === 0) throw new InterpreterError("scanf() requires a format string", node);
  const formatNode = argNodes[0];
  if (formatNode.type !== "string_literal") {
    throw new InterpreterError("scanf()'s first argument must be a string literal", node);
  }
  const formatText = extractStringLiteralText(formatNode);

  let specifiers: ScanfSpecifier[];
  try {
    specifiers = parseScanfFormat(formatText);
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }

  const targetNodes = argNodes.slice(1);
  if (targetNodes.length < specifiers.length) {
    throw new InterpreterError(
      `scanf() format string "${formatText}" expects ${specifiers.length} argument(s) but only ${targetNodes.length} were given`,
      node,
    );
  }

  let matched = 0;
  for (let i = 0; i < specifiers.length; i++) {
    const specifier = specifiers[i];
    const targetNode = targetNodes[i];
    const variableName = extractScanfTargetName(targetNode);
    if (!variableName) {
      unsupported(targetNode, "scanf() arguments must be &variable — the address of a simple, already-declared variable");
    }
    const value = yield* requestInput(node, callStack, scope, specifier, `scanf("${formatText}", &${variableName})`);
    scope.assign(variableName, value);
    matched++;
  }
  return scalar("int", matched);
}

function* callGetchar(node: SyntaxNode, scope: Scope, callStack: RuntimeFrame[]): Step<CValue> {
  const value = yield* requestInput(node, callStack, scope, "c", "getchar()");
  return scalar("int", value.kind === "scalar" ? value.value : 0);
}

// ---------------------------------------------------------------------
// Dynamic memory (Phase 5)
// ---------------------------------------------------------------------

/**
 * Recognizes the `N * sizeof(TYPE)` idiom structurally in the AST,
 * rather than trying to reverse-engineer element size from a raw
 * number after evaluation — see docs/PHASE_5_POINTERS.md → "How malloc
 * infers element size" for why. Falls back to "one opaque block" when
 * the argument doesn't match a recognized shape, which is always safe
 * (dereferencing still works) even though pointer arithmetic across it
 * won't be meaningful.
 */
function inferAllocationShape(sizeNode: SyntaxNode, totalUnits: number): { slotCount: number; elementType: CType } {
  if (sizeNode.type === "sizeof_expression") {
    return { slotCount: 1, elementType: sizeofElementType(sizeNode) };
  }
  if (sizeNode.type === "binary_expression" && sizeNode.childForFieldName("operator")?.text === "*") {
    const left = sizeNode.childForFieldName("left")!;
    const right = sizeNode.childForFieldName("right")!;
    const sizeofSide = left.type === "sizeof_expression" ? left : right.type === "sizeof_expression" ? right : null;
    if (sizeofSide) {
      const elementType = sizeofElementType(sizeofSide);
      const elementSize = sizeOfType(elementType);
      const slotCount = Math.max(1, Math.round(totalUnits / elementSize));
      return { slotCount, elementType };
    }
  }
  return { slotCount: 1, elementType: "int" };
}

function sizeofElementType(sizeofNode: SyntaxNode): CType {
  const typeDescriptor = sizeofNode.childForFieldName("type");
  const typeName = typeDescriptor?.childForFieldName("type")?.text;
  return mapPrimitiveType(typeName);
}

function* evaluateSizeof(node: SyntaxNode, scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  const typeDescriptor = node.childForFieldName("type");
  if (typeDescriptor) {
    return scalar("int", sizeOfType(sizeofElementType(node)));
  }
  const valueNode = node.childForFieldName("value");
  if (!valueNode) throw new InterpreterError("sizeof requires a type or expression", node);
  const inner = valueNode.type === "parenthesized_expression" ? (namedChildren(valueNode)[0] ?? valueNode) : valueNode;
  const evaluated = yield* evaluate(inner, scope, functions, callStack);
  if (evaluated.kind === "pointer") return scalar("int", sizeOfType("int")); // pointer size, simulated
  return scalar("int", sizeOfType(evaluated.type));
}

function* callMalloc(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length !== 1) throw new InterpreterError("malloc() takes exactly one argument (a size in bytes)", node);
  const sizeValue = yield* evaluate(argNodes[0], scope, functions, callStack);
  if (isPointer(sizeValue)) throw new InterpreterError("malloc()'s argument must be a number of bytes", argNodes[0]);
  if (sizeValue.value <= 0) {
    throw new InterpreterError(`malloc() requires a positive size (got ${sizeValue.value})`, argNodes[0]);
  }
  const { slotCount, elementType } = inferAllocationShape(argNodes[0], sizeValue.value);
  let address: Address;
  try {
    address = scope.memory.allocateHeap(slotCount, sizeOfType(elementType), "malloc", defaultValueForType(elementType));
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }
  return pointerValue(elementType, address);
}

function* callCalloc(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length !== 2) throw new InterpreterError("calloc() takes exactly two arguments (count, element size)", node);
  const countValue = yield* evaluate(argNodes[0], scope, functions, callStack);
  const sizeArgNode = argNodes[1];
  if (isPointer(countValue)) throw new InterpreterError("calloc()'s first argument must be a count", argNodes[0]);
  if (countValue.value <= 0) {
    throw new InterpreterError(`calloc() requires a positive element count (got ${countValue.value})`, argNodes[0]);
  }
  const elementType = sizeArgNode.type === "sizeof_expression" ? sizeofElementType(sizeArgNode) : "int";
  let address: Address;
  try {
    // calloc zero-initializes — defaultValueForType already produces 0.
    address = scope.memory.allocateHeap(countValue.value, sizeOfType(elementType), "calloc", defaultValueForType(elementType));
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }
  return pointerValue(elementType, address);
}

function* callRealloc(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length !== 2) throw new InterpreterError("realloc() takes exactly two arguments (pointer, new size)", node);
  const pointerArg = yield* evaluate(argNodes[0], scope, functions, callStack);
  const sizeValue = yield* evaluate(argNodes[1], scope, functions, callStack);
  if (!isPointer(pointerArg)) throw new InterpreterError("realloc()'s first argument must be a pointer", argNodes[0]);
  if (isPointer(sizeValue)) throw new InterpreterError("realloc()'s second argument must be a number of bytes", argNodes[1]);

  const { slotCount, elementType } = inferAllocationShape(argNodes[1], sizeValue.value);
  const oldTarget = pointerArg.target;
  const oldValues = oldTarget ? scope.memory.slotValues(oldTarget) : [];

  let newAddress: Address;
  try {
    if (oldTarget) scope.memory.free(oldTarget);
    newAddress = scope.memory.allocateHeap(slotCount, sizeOfType(elementType), "realloc", defaultValueForType(elementType));
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }
  // Preserve overlapping contents, matching real realloc's copy-on-grow/shrink behavior.
  for (let i = 0; i < Math.min(oldValues.length, slotCount); i++) {
    scope.memory.write({ ...newAddress, slot: i }, oldValues[i]);
  }
  return pointerValue(elementType, newAddress);
}

function* callFree(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length !== 1) throw new InterpreterError("free() takes exactly one argument", node);
  const value = yield* evaluate(argNodes[0], scope, functions, callStack);
  if (!isPointer(value)) throw new InterpreterError("free()'s argument must be a pointer", argNodes[0]);
  if (value.target === null) {
    // free(NULL) is explicitly a documented no-op in real C.
    return scalar("int", 0);
  }
  try {
    scope.memory.free(value.target);
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }
  return scalar("int", 0);
}

/** Reads through a pointer, with the three checks that make dereference
 * safe-to-fail-loudly rather than a silent wrong answer or a crash: not
 * NULL, points at a real (never-invalidated) location, and — for heap
 * targets — not freed. */
function dereference(pointer: CPointerValue, scope: Scope, node: SyntaxNode): CValue {
  if (pointer.target === null) {
    throw new InterpreterError("Null pointer dereference", node);
  }
  if (pointer.target.space === "heap" && !scope.memory.isActiveHeapBlock(pointer.target)) {
    throw new InterpreterError(`Use after free: ${formatAddress(pointer.target)} was already freed`, node);
  }
  scope.memory.recordDereference(pointer.target);
  return scope.memory.read(pointer.target);
}

/** Pointer arithmetic (`ptr + n`, `ptr++`) is only meaningful across a
 * multi-element heap allocation — Codevi has no arrays, so a pointer to
 * a single stack variable has nowhere else to "move" to. Bounds-checked
 * against the allocation's real slot count, turning a buffer overrun
 * into a clear error instead of reading/writing unrelated memory. */
function pointerArithmetic(pointer: CPointerValue, offset: number, scope: Scope, node: SyntaxNode): CPointerValue {
  if (pointer.target === null) {
    throw new InterpreterError("Pointer arithmetic on a NULL pointer", node);
  }
  if (pointer.target.space !== "heap") {
    unsupported(
      node,
      "pointer arithmetic is only supported on a pointer into a malloc()/calloc()'d block — Codevi doesn't support arrays, so a pointer to a single variable has nowhere else to move to",
    );
  }
  const allocation = scope.memory.getAllocation(pointer.target);
  const newSlot = pointer.target.slot + offset;
  if (!allocation || newSlot < 0 || newSlot >= allocation.slotCount) {
    throw new InterpreterError(
      `Pointer arithmetic moved outside the bounds of the allocated block (${allocation?.slotCount ?? 0} element(s))`,
      node,
    );
  }
  return { ...pointer, target: { ...pointer.target, slot: newSlot } };
}

// ---------------------------------------------------------------------
// Core interpreter
// ---------------------------------------------------------------------

export function* interpretProgram(rootNode: SyntaxNode): Step<CValue | undefined> {
  const functions = collectFunctions(rootNode);
  const mainFn = functions.get("main");
  if (!mainFn) {
    throw new InterpreterError('No "main" function found', rootNode);
  }
  const memory = new MemoryModel();
  const result = yield* callFunction(mainFn, [], functions, [], memory);
  // Optional leak report (Phase 5 brief: "Memory leaks... at program
  // end, optional if feasible") — surfaced as part of the final step's
  // description rather than a thrown error, since a leak isn't a crash.
  const leaks = memory.allAllocations().filter((allocation) => allocation.active);
  if (leaks.length > 0) {
    const summary = leaks.map((leak) => formatAddress(leak.address)).join(", ");
    yield makeStep(rootNode, "output", [], new Scope(null, memory), "", {
      output: `\n[${leaks.length} heap block(s) never freed: ${summary}]\n`,
    });
  }
  return result;
}

function* callFunction(
  fnNode: SyntaxNode,
  args: CValue[],
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
  memory: MemoryModel,
): Step<CValue | undefined> {
  if (callStack.length >= MAX_CALL_DEPTH) {
    throw new InterpreterError(`Maximum call depth (${MAX_CALL_DEPTH}) exceeded — likely unbounded recursion`, fnNode);
  }

  const name = functionNameOf(fnNode) ?? "?";
  const declarator = fnNode.childForFieldName("declarator");
  const paramListNode = declarator?.childForFieldName("parameters");
  const returnType = mapPrimitiveType(fnNode.childForFieldName("type")?.text);

  const scope = new Scope(null, memory);
  const paramNodes = paramListNode ? namedChildren(paramListNode).filter((n) => n.type === "parameter_declaration") : [];
  const resolvedParams = paramNodes.map((paramNode) => {
    const baseType = mapPrimitiveType(paramNode.childForFieldName("type")?.text);
    const declaratorNode = paramNode.childForFieldName("declarator");
    return declaratorNode ? resolveDeclarator(declaratorNode, baseType) : null;
  });
  const parameterNames = resolvedParams.map((p) => p?.name).filter((n): n is string => !!n);

  const frame: RuntimeFrame = { functionName: name, scope, parameterNames, currentNode: fnNode, currentScope: scope };
  callStack.push(frame);

  resolvedParams.forEach((resolved, index) => {
    if (!resolved) return;
    scope.declare(resolved.name, args[index] ?? defaultForResolvedType(resolved.type));
  });

  yield makeStep(fnNode, "call-enter", callStack, scope, `Entering function "${name}"`);

  const bodyNode = fnNode.childForFieldName("body");
  const result = bodyNode ? yield* executeBlock(bodyNode, scope, functions, callStack) : NORMAL;
  const returnValue = result.kind === "return" ? result.value : undefined;

  // frame.currentScope, not the bare `scope` — the function body is
  // itself a block, so executeBlock gave it its own child scope; using
  // `scope` here would show only parameters and silently drop every
  // body-level local. Found and fixed in Phase 4.1 — see
  // docs/PHASE_4_1_STDIO.md → "A real bug this phase's tests caught".
  yield makeStep(
    fnNode,
    "call-exit",
    callStack,
    frame.currentScope,
    returnValue !== undefined ? `Returning from "${name}" with ${formatValue(returnValue)}` : `Returning from "${name}"`,
  );

  callStack.pop();
  return returnValue ?? (returnType ? defaultValueForType(returnType) : undefined);
}

function* executeBlock(
  blockNode: SyntaxNode,
  parentScope: Scope,
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
): Step<StatementResult> {
  const scope = new Scope(parentScope);
  for (const statement of namedChildren(blockNode)) {
    const result = yield* executeStatement(statement, scope, functions, callStack);
    if (result.kind === "return") return result;
  }
  return NORMAL;
}

function* executeStatement(
  node: SyntaxNode,
  scope: Scope,
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
): Step<StatementResult> {
  switch (node.type) {
    case "compound_statement":
      return yield* executeBlock(node, scope, functions, callStack);

    case "declaration": {
      yield makeStep(node, "statement", callStack, scope, truncate(node.text));
      yield* executeDeclaration(node, scope, functions, callStack);
      return NORMAL;
    }

    case "expression_statement": {
      yield makeStep(node, "statement", callStack, scope, truncate(node.text));
      const expr = namedChildren(node)[0];
      if (expr) yield* evaluate(expr, scope, functions, callStack);
      return NORMAL;
    }

    case "if_statement": {
      yield makeStep(node, "statement", callStack, scope, `if (${truncate(unwrapParens(node.childForFieldName("condition")!).text, 40)})`);
      const conditionNode = unwrapParens(node.childForFieldName("condition")!);
      const condition = yield* evaluate(conditionNode, scope, functions, callStack);
      if (isTruthy(condition)) {
        const consequence = node.childForFieldName("consequence")!;
        return yield* executeStatement(consequence, scope, functions, callStack);
      }
      const alternative = node.childForFieldName("alternative");
      if (alternative) {
        const branch = namedChildren(alternative)[0];
        if (branch) return yield* executeStatement(branch, scope, functions, callStack);
      }
      return NORMAL;
    }

    case "while_statement": {
      const conditionNode = unwrapParens(node.childForFieldName("condition")!);
      const bodyNode = node.childForFieldName("body")!;
      while (true) {
        yield makeStep(node, "statement", callStack, scope, `while (${truncate(conditionNode.text, 40)})`);
        const condition = yield* evaluate(conditionNode, scope, functions, callStack);
        if (!isTruthy(condition)) break;
        try {
          const result = yield* executeStatement(bodyNode, scope, functions, callStack);
          if (result.kind === "return") return result;
        } catch (signal) {
          if (signal instanceof BreakSignal) break;
          if (!(signal instanceof ContinueSignal)) throw signal;
        }
      }
      return NORMAL;
    }

    case "do_statement": {
      const conditionNode = unwrapParens(node.childForFieldName("condition")!);
      const bodyNode = node.childForFieldName("body")!;
      while (true) {
        try {
          const result = yield* executeStatement(bodyNode, scope, functions, callStack);
          if (result.kind === "return") return result;
        } catch (signal) {
          if (signal instanceof BreakSignal) break;
          if (!(signal instanceof ContinueSignal)) throw signal;
        }
        yield makeStep(node, "statement", callStack, scope, `do ... while (${truncate(conditionNode.text, 40)})`);
        const condition = yield* evaluate(conditionNode, scope, functions, callStack);
        if (!isTruthy(condition)) break;
      }
      return NORMAL;
    }

    case "for_statement": {
      const forScope = new Scope(scope);
      const initNode = node.childForFieldName("initializer");
      const conditionNode = node.childForFieldName("condition");
      const updateNode = node.childForFieldName("update");
      const bodyNode = node.childForFieldName("body")!;

      if (initNode) {
        if (initNode.type === "declaration") yield* executeDeclaration(initNode, forScope, functions, callStack);
        else yield* evaluate(initNode, forScope, functions, callStack);
      }

      while (true) {
        if (conditionNode) {
          yield makeStep(node, "statement", callStack, forScope, `for-condition: ${truncate(conditionNode.text, 40)}`);
          const condition = yield* evaluate(conditionNode, forScope, functions, callStack);
          if (!isTruthy(condition)) break;
        }
        try {
          const result = yield* executeStatement(bodyNode, forScope, functions, callStack);
          if (result.kind === "return") return result;
        } catch (signal) {
          if (signal instanceof BreakSignal) break;
          if (!(signal instanceof ContinueSignal)) throw signal;
        }
        if (updateNode) {
          yield makeStep(node, "statement", callStack, forScope, `for-update: ${truncate(updateNode.text, 40)}`);
          yield* evaluate(updateNode, forScope, functions, callStack);
        }
      }
      return NORMAL;
    }

    case "return_statement": {
      yield makeStep(node, "statement", callStack, scope, truncate(node.text));
      const exprNode = namedChildren(node)[0];
      const value = exprNode ? yield* evaluate(exprNode, scope, functions, callStack) : undefined;
      return { kind: "return", value };
    }

    case "break_statement":
      yield makeStep(node, "statement", callStack, scope, "break;");
      throw new BreakSignal();

    case "continue_statement":
      yield makeStep(node, "statement", callStack, scope, "continue;");
      throw new ContinueSignal();

    case "comment":
    case "preproc_include":
    case "preproc_def":
      return NORMAL;

    default:
      unsupported(node);
  }
}

function unwrapParens(node: SyntaxNode): SyntaxNode {
  if (node.type === "parenthesized_expression") {
    const inner = namedChildren(node)[0];
    return inner ? unwrapParens(inner) : node;
  }
  return node;
}

function* executeDeclaration(
  node: SyntaxNode,
  scope: Scope,
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
): Step<void> {
  const baseType = mapPrimitiveType(node.childForFieldName("type")?.text);
  const declarator = node.childForFieldName("declarator");
  if (!declarator) unsupported(node, "declaration has no declarator");

  if (declarator.type === "init_declarator") {
    const innerDeclarator = declarator.childForFieldName("declarator");
    const valueNode = declarator.childForFieldName("value");
    if (!innerDeclarator) unsupported(declarator, "missing variable name");
    const resolved = resolveDeclarator(innerDeclarator, baseType);
    if (!resolved) {
      unsupported(innerDeclarator, "only simple variables and pointers are supported (no arrays/function pointers)");
    }
    const value = valueNode ? yield* evaluate(valueNode, scope, functions, callStack) : defaultForResolvedType(resolved.type);
    scope.declare(resolved.name, value);
    if (value.kind === "pointer") scope.memory.recordPointerAssign(resolved.name, value.target);
  } else {
    const resolved = resolveDeclarator(declarator, baseType);
    if (!resolved) {
      unsupported(declarator, "only simple variables and pointers are supported (no arrays/function pointers)");
    }
    scope.declare(resolved.name, defaultForResolvedType(resolved.type));
  }
}

function* evaluate(node: SyntaxNode, scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  switch (node.type) {
    case "parenthesized_expression": {
      const inner = namedChildren(node)[0];
      return inner ? yield* evaluate(inner, scope, functions, callStack) : scalar("int", 0);
    }

    case "number_literal":
      return parseNumberLiteral(node.text);

    case "char_literal":
      return parseCharLiteral(node.text);

    case "sizeof_expression":
      return yield* evaluateSizeof(node, scope, functions, callStack);

    case "null":
      // Tree-sitter-c's grammar recognizes the NULL macro name as a
      // dedicated `null` node (it's special-cased in the grammar
      // despite being a macro in real C, not a keyword) — verified
      // directly rather than assumed. See docs/PHASE_5_POINTERS.md.
      return pointerValue("int", null);

    case "identifier": {
      if (node.text === "NULL") return pointerValue("int", null);
      const value = scope.lookup(node.text);
      if (value === undefined) {
        throw new InterpreterError(`Use of undeclared variable "${node.text}"`, node);
      }
      return value;
    }

    case "binary_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "";
      const leftNode = node.childForFieldName("left")!;
      const rightNode = node.childForFieldName("right")!;
      const left = yield* evaluate(leftNode, scope, functions, callStack);

      if (operator === "&&" && !isTruthy(left)) return cBool(false);
      if (operator === "||" && isTruthy(left)) return cBool(true);
      const right = yield* evaluate(rightNode, scope, functions, callStack);

      if (isPointer(left) || isPointer(right)) {
        if (isPointer(left) && isPointer(right)) {
          return comparePointers(operator, left, right);
        }
        // pointer +/- integer (either order) is pointer arithmetic.
        const pointer = isPointer(left) ? left : (right as CPointerValue);
        const offsetValue = isPointer(left) ? right : left;
        if (isPointer(offsetValue)) unsupported(node, "arithmetic between two pointers (other than == / !=) isn't supported");
        if (operator === "+") return pointerArithmetic(pointer, offsetValue.value, scope, node);
        if (operator === "-" && isPointer(left)) return pointerArithmetic(pointer, -offsetValue.value, scope, node);
        unsupported(node, `"${operator}" is not supported between a pointer and a number`);
      }

      return applyBinaryOp(operator, left as CScalarValue, right as CScalarValue);
    }

    case "unary_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "";
      const argumentNode = node.childForFieldName("argument")!;
      const argument = yield* evaluate(argumentNode, scope, functions, callStack);
      if (isPointer(argument)) {
        if (operator === "!") return cBool(!isTruthy(argument));
        unsupported(node, `"${operator}" is not supported on a pointer`);
      }
      return applyUnaryOp(operator, argument);
    }

    case "pointer_expression": {
      const operator = node.childForFieldName("operator")?.text;
      const argumentNode = node.childForFieldName("argument")!;

      if (operator === "&") {
        if (argumentNode.type !== "identifier") {
          unsupported(node, "the address-of operator (&) is only supported on a simple, already-declared variable");
        }
        const address = scope.lookupAddress(argumentNode.text);
        if (!address) throw new InterpreterError(`Use of undeclared variable "${argumentNode.text}"`, argumentNode);
        const existing = scope.lookup(argumentNode.text)!;
        const pointeeType: CType | CPointerType = existing.kind === "pointer" ? existing.pointerType : existing.type;
        return pointerValue(pointeeType, address);
      }

      if (operator === "*") {
        const pointer = yield* evaluate(argumentNode, scope, functions, callStack);
        if (!isPointer(pointer)) throw new InterpreterError("Cannot dereference a non-pointer value", node);
        return dereference(pointer, scope, node);
      }

      unsupported(node, `pointer operator "${operator ?? "?"}" is not supported`);
      break;
    }

    case "update_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "++";
      const argumentNode = node.childForFieldName("argument")!;
      const isPrefix = node.child(0)?.type === operator;
      if (argumentNode.type !== "identifier") {
        unsupported(node, "++/-- is only supported on simple variables");
      }
      const current = yield* evaluate(argumentNode, scope, functions, callStack);
      let updated: CValue;
      if (isPointer(current)) {
        updated = pointerArithmetic(current, operator === "++" ? 1 : -1, scope, node);
      } else {
        const delta = operator === "++" ? 1 : -1;
        updated = scalar(current.type, current.value + delta);
      }
      scope.assign(argumentNode.text, updated);
      if (updated.kind === "pointer") scope.memory.recordPointerAssign(argumentNode.text, updated.target);
      return isPrefix ? updated : current;
    }

    case "assignment_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "=";
      const leftNode = node.childForFieldName("left")!;
      const rightNode = node.childForFieldName("right")!;

      // *ptr = value  (or *ptr += value, etc.) — write through a pointer.
      if (leftNode.type === "pointer_expression" && leftNode.childForFieldName("operator")?.text === "*") {
        const pointerArgNode = leftNode.childForFieldName("argument")!;
        const pointer = yield* evaluate(pointerArgNode, scope, functions, callStack);
        if (!isPointer(pointer)) throw new InterpreterError("Cannot dereference a non-pointer value", leftNode);
        if (pointer.target === null) throw new InterpreterError("Null pointer dereference", leftNode);
        if (pointer.target.space === "heap" && !scope.memory.isActiveHeapBlock(pointer.target)) {
          throw new InterpreterError(`Use after free: ${formatAddress(pointer.target)} was already freed`, leftNode);
        }
        const right = yield* evaluate(rightNode, scope, functions, callStack);
        const newValue =
          operator === "="
            ? right
            : applyBinaryOp(operator.slice(0, -1), scope.memory.read(pointer.target) as CScalarValue, right as CScalarValue);
        scope.memory.write(pointer.target, newValue);
        return newValue;
      }

      if (leftNode.type !== "identifier") {
        unsupported(leftNode, "only assignment to simple variables or *pointer is supported (no arrays)");
      }
      const right = yield* evaluate(rightNode, scope, functions, callStack);
      const newValue =
        operator === "=" ? right : applyBinaryOp(operator.slice(0, -1), scope.lookup(leftNode.text) as CScalarValue, right as CScalarValue);
      scope.assign(leftNode.text, newValue);
      if (newValue.kind === "pointer") scope.memory.recordPointerAssign(leftNode.text, newValue.target);
      return newValue;
    }

    case "call_expression": {
      const functionNode = node.childForFieldName("function")!;
      const name = functionNode.text;
      const argsNode = node.childForFieldName("arguments");
      const argNodes = argsNode ? namedChildren(argsNode) : [];

      if (name === "printf") return yield* callPrintf(node, argNodes, scope, functions, callStack);
      if (name === "puts") return yield* callPuts(node, argNodes, scope, callStack);
      if (name === "putchar") return yield* callPutchar(node, argNodes, scope, functions, callStack);
      if (name === "scanf") return yield* callScanf(node, argNodes, scope, callStack);
      if (name === "getchar") return yield* callGetchar(node, scope, callStack);
      if (name === "malloc") return yield* callMalloc(node, argNodes, scope, functions, callStack);
      if (name === "calloc") return yield* callCalloc(node, argNodes, scope, functions, callStack);
      if (name === "realloc") return yield* callRealloc(node, argNodes, scope, functions, callStack);
      if (name === "free") return yield* callFree(node, argNodes, scope, functions, callStack);

      const fn = functions.get(name);
      if (!fn) {
        if (isKnownLibraryFunction(name)) {
          unsupported(node, `calls to library functions like "${name}" aren't supported yet — Codevi covers user-defined functions, core control flow, basic stdio, and malloc/calloc/realloc/free only`);
        }
        unsupported(node, `no function named "${name}" is defined`);
      }
      const args: CValue[] = [];
      for (const argNode of argNodes) {
        args.push(yield* evaluate(argNode, scope, functions, callStack));
      }
      const result = yield* callFunction(fn, args, functions, callStack, scope.memory);
      return result ?? scalar("int", 0);
    }

    case "string_literal":
      unsupported(node, "strings aren't supported as general values yet — Codevi doesn't model character arrays (string literals do work as direct arguments to printf/puts)");

    default:
      unsupported(node);
  }
}
