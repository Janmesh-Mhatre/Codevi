import type { Node as SyntaxNode } from "web-tree-sitter";
import { Scope } from "./scope";
import {
  applyBinaryOp,
  applyUnaryOp,
  cBool,
  defaultValueForType,
  isTruthy,
  parseCharLiteral,
  parseNumberLiteral,
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
} from "./stdio";

const MAX_CALL_DEPTH = 200;

type StatementResult = { kind: "normal" } | { kind: "return"; value: CValue | undefined };
const NORMAL: StatementResult = { kind: "normal" };

/** Every generator in this file shares this same yield/return/next
 * shape: it yields InterpreterSteps, eventually returns a CValue (or
 * void for statement-level generators), and — new in Phase 4.1 — can
 * receive an InputResumeValue back from whoever is driving it, for the
 * one case (an input-request yield) that actually needs something sent
 * back. Every other yield in this file ignores the resume value
 * entirely; only requestInput() below reads it. See
 * docs/PHASE_4_1_STDIO.md → "Why generators can pause for real input".
 */
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

function formatValue(value: CValue): string {
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

/** Splits a merged scope snapshot into parameters vs. other locals for
 * one frame, and reads its current line — see RuntimeFrame's doc
 * comment in types.ts for how currentNode/currentScope stay accurate
 * for every frame, not just the topmost one. */
function buildFrameSnapshot(frame: RuntimeFrame, callDepth: number): StackFrameSnapshot {
  const merged = frame.currentScope.snapshot();
  const parameters: Record<string, CValue> = {};
  const locals: Record<string, CValue> = {};
  for (const [name, value] of Object.entries(merged)) {
    if (frame.parameterNames.includes(name)) parameters[name] = value;
    else locals[name] = value;
  }
  return { functionName: frame.functionName, callDepth, line: frame.currentNode.startPosition.row, parameters, locals };
}

/** Records that the topmost frame is currently paused at `node`/`scope`,
 * then builds the full InterpreterStep — including a snapshot of every
 * active frame, not just this one. This one function is the entire
 * mechanism behind Phase 4's scope-correct, multi-frame call stack.
 * `extra` carries the output text or input request for those two step
 * kinds (Phase 4.1) — everything else about building the step is
 * identical regardless of kind. */
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
    ...extra,
  };
}

/** Yields an "output" step and returns immediately — ExecutionEngine
 * appends the text to its output buffer and keeps going without
 * pausing, the same way it treats a normal statement step during a Run.
 * See docs/PHASE_4_1_STDIO.md → "Output vs input events". */
function* emitOutput(node: SyntaxNode, callStack: RuntimeFrame[], scope: Scope, text: string): Step<void> {
  yield makeStep(node, "output", callStack, scope, `Output: ${truncate(text, 40)}`, { output: text });
}

/**
 * Yields an "input-request" step and suspends until the caller resumes
 * with a real value (or cancellation, e.g. from Reset — see
 * ExecutionEngine.reset). This is the one place in the whole
 * interpreter where a yield's result actually matters; every other
 * yield site just calls `yield makeStep(...)` as a bare statement.
 */
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
  const argument = node.childForFieldName("argument");
  if (!argument || argument.type !== "identifier") return null;
  return argument.text;
}

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
      printfArgs.push({ kind: "value", value: yield* evaluate(argNode, scope, functions, callStack) });
    }
  }

  let text: string;
  try {
    text = renderPrintf(formatText, printfArgs);
  } catch (error) {
    throw new InterpreterError(error instanceof Error ? error.message : String(error), node);
  }
  yield* emitOutput(node, callStack, scope, text);
  return { type: "int", value: text.length }; // real printf() returns the character count written
}

function* callPuts(node: SyntaxNode, argNodes: SyntaxNode[], scope: Scope, callStack: RuntimeFrame[]): Step<CValue> {
  if (argNodes.length !== 1) throw new InterpreterError("puts() takes exactly one argument", node);
  const argNode = argNodes[0];
  const text =
    argNode.type === "string_literal"
      ? extractStringLiteralText(argNode)
      : unsupported(argNode, "puts() only supports a string literal written directly in the call — Codevi has no string variable type yet");
  yield* emitOutput(node, callStack, scope, `${text}\n`);
  return { type: "int", value: 0 };
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
  yield* emitOutput(node, callStack, scope, String.fromCharCode(value.value));
  return { type: "int", value: value.value };
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
  return { type: "int", value: matched };
}

function* callGetchar(node: SyntaxNode, scope: Scope, callStack: RuntimeFrame[]): Step<CValue> {
  const value = yield* requestInput(node, callStack, scope, "c", "getchar()");
  // Real getchar() returns int (the character code, or EOF) even though
  // it reads one character — matching that here rather than returning
  // "char", since `int ch = getchar();` is the idiomatic C signature.
  return { type: "int", value: value.value };
}

/**
 * Entry point: finds `main` among the top-level function definitions and
 * runs it. The whole interpreter is one mutually-recursive family of
 * generator functions (this file) so that a `yield*` chain from `main`
 * down through nested calls and nested expressions naturally mirrors the
 * interpreted program's own call stack — see docs/PHASE_3_EXECUTION.md →
 * "Why generators".
 */
export function* interpretProgram(rootNode: SyntaxNode): Step<CValue | undefined> {
  const functions = collectFunctions(rootNode);
  const mainFn = functions.get("main");
  if (!mainFn) {
    throw new InterpreterError('No "main" function found', rootNode);
  }
  return yield* callFunction(mainFn, [], functions, []);
}

function* callFunction(
  fnNode: SyntaxNode,
  args: CValue[],
  functions: Map<string, SyntaxNode>,
  callStack: RuntimeFrame[],
): Step<CValue | undefined> {
  if (callStack.length >= MAX_CALL_DEPTH) {
    throw new InterpreterError(`Maximum call depth (${MAX_CALL_DEPTH}) exceeded — likely unbounded recursion`, fnNode);
  }

  const name = functionNameOf(fnNode) ?? "?";
  const declarator = fnNode.childForFieldName("declarator");
  const paramListNode = declarator?.childForFieldName("parameters");
  const returnType = mapPrimitiveType(fnNode.childForFieldName("type")?.text);

  const scope = new Scope(null); // no closures in C — each call starts fresh
  const paramNodes = paramListNode ? namedChildren(paramListNode).filter((n) => n.type === "parameter_declaration") : [];
  const parameterNames = paramNodes.map((p) => p.childForFieldName("declarator")?.text).filter((n): n is string => !!n);

  const frame: RuntimeFrame = { functionName: name, scope, parameterNames, currentNode: fnNode, currentScope: scope };
  callStack.push(frame);

  paramNodes.forEach((paramNode, index) => {
    const paramName = paramNode.childForFieldName("declarator")?.text;
    const paramType = mapPrimitiveType(paramNode.childForFieldName("type")?.text);
    if (paramName) {
      scope.declare(paramName, args[index] ?? defaultValueForType(paramType));
    }
  });

  yield makeStep(fnNode, "call-enter", callStack, scope, `Entering function "${name}"`);

  const bodyNode = fnNode.childForFieldName("body");
  const result = bodyNode ? yield* executeBlock(bodyNode, scope, functions, callStack) : NORMAL;
  const returnValue = result.kind === "return" ? result.value : undefined;

  // frame.currentScope, not the bare `scope` — the function body is
  // itself a block, so executeBlock gave it its own child scope (see
  // executeBlock below); using `scope` here would show only parameters
  // and silently drop every body-level local, including ones declared
  // directly in the function body rather than in some nested block.
  // Found via a real Phase 4.1 test failure — see
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
  const type = mapPrimitiveType(node.childForFieldName("type")?.text);
  const declarator = node.childForFieldName("declarator");
  if (!declarator) unsupported(node, "declaration has no declarator");

  if (declarator.type === "init_declarator") {
    const nameNode = declarator.childForFieldName("declarator");
    const valueNode = declarator.childForFieldName("value");
    if (!nameNode) unsupported(declarator, "missing variable name");
    if (nameNode.type !== "identifier") {
      unsupported(nameNode, "only simple variable declarations are supported (no arrays/pointers)");
    }
    const value = valueNode ? yield* evaluate(valueNode, scope, functions, callStack) : defaultValueForType(type);
    scope.declare(nameNode.text, value);
  } else if (declarator.type === "identifier") {
    scope.declare(declarator.text, defaultValueForType(type));
  } else {
    unsupported(declarator, "only simple variable declarations are supported (no arrays/pointers)");
  }
}

function* evaluate(node: SyntaxNode, scope: Scope, functions: Map<string, SyntaxNode>, callStack: RuntimeFrame[]): Step<CValue> {
  switch (node.type) {
    case "parenthesized_expression": {
      const inner = namedChildren(node)[0];
      return inner ? yield* evaluate(inner, scope, functions, callStack) : { type: "int", value: 0 };
    }

    case "number_literal":
      return parseNumberLiteral(node.text);

    case "char_literal":
      return parseCharLiteral(node.text);

    case "identifier": {
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
      return applyBinaryOp(operator, left, right);
    }

    case "unary_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "";
      const argumentNode = node.childForFieldName("argument")!;
      const argument = yield* evaluate(argumentNode, scope, functions, callStack);
      return applyUnaryOp(operator, argument);
    }

    case "pointer_expression":
      unsupported(node, "the address-of operator (&) is only supported as a scanf() argument — Codevi has no pointer value type yet");

    case "update_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "++";
      const argumentNode = node.childForFieldName("argument")!;
      const isPrefix = node.child(0)?.type === operator;
      if (argumentNode.type !== "identifier") {
        unsupported(node, "++/-- is only supported on simple variables");
      }
      const current = yield* evaluate(argumentNode, scope, functions, callStack);
      const delta = operator === "++" ? 1 : -1;
      const updated: CValue = { type: current.type, value: current.value + delta };
      scope.assign(argumentNode.text, updated);
      return isPrefix ? updated : current;
    }

    case "assignment_expression": {
      const operator = node.childForFieldName("operator")?.text ?? "=";
      const leftNode = node.childForFieldName("left")!;
      const rightNode = node.childForFieldName("right")!;
      if (leftNode.type !== "identifier") {
        unsupported(leftNode, "only assignment to simple variables is supported (no arrays/pointers)");
      }
      const right = yield* evaluate(rightNode, scope, functions, callStack);
      const newValue = operator === "=" ? right : applyBinaryOp(operator.slice(0, -1), scope.lookup(leftNode.text)!, right);
      scope.assign(leftNode.text, newValue);
      return newValue;
    }

    case "call_expression": {
      const functionNode = node.childForFieldName("function")!;
      const name = functionNode.text;
      const argsNode = node.childForFieldName("arguments");
      const argNodes = argsNode ? namedChildren(argsNode) : [];

      // Standard I/O (Phase 4.1) — handled here, ahead of the
      // user-defined-function lookup, since these aren't in the
      // `functions` map and shouldn't be. See docs/PHASE_4_1_STDIO.md.
      if (name === "printf") return yield* callPrintf(node, argNodes, scope, functions, callStack);
      if (name === "puts") return yield* callPuts(node, argNodes, scope, callStack);
      if (name === "putchar") return yield* callPutchar(node, argNodes, scope, functions, callStack);
      if (name === "scanf") return yield* callScanf(node, argNodes, scope, callStack);
      if (name === "getchar") return yield* callGetchar(node, scope, callStack);

      const fn = functions.get(name);
      if (!fn) {
        if (isKnownLibraryFunction(name)) {
          unsupported(node, `calls to library functions like "${name}" aren't supported yet — Codevi covers user-defined functions, core control flow, and basic stdio only`);
        }
        unsupported(node, `no function named "${name}" is defined`);
      }
      const args: CValue[] = [];
      for (const argNode of argNodes) {
        args.push(yield* evaluate(argNode, scope, functions, callStack));
      }
      const result = yield* callFunction(fn, args, functions, callStack);
      return result ?? { type: "int", value: 0 };
    }

    case "string_literal":
      unsupported(node, "strings aren't supported as general values yet — Codevi doesn't model pointers/arrays (string literals do work as direct arguments to printf/puts)");

    default:
      unsupported(node);
  }
}
