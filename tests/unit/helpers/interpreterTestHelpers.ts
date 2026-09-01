import { Parser, Language } from "web-tree-sitter";
import path from "node:path";
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import { interpretProgram } from "../../../src/languages/c/interpreter/interpreter";
import type { CValue } from "../../../src/languages/c/interpreter/values";
import type { InterpreterStep } from "../../../src/languages/c/interpreter/types";

let parserPromise: Promise<InstanceType<typeof Parser>> | null = null;

/** Lazily initializes one shared parser instance for all tests in a run
 * — re-loading the WASM runtime per test would be needlessly slow, and
 * (see docs/PHASE_5_POINTERS.md -> "A test-infrastructure crash, not an
 * application bug") web-tree-sitter's WASM bindings turned out not to
 * tolerate multiple independent instantiations within one process well.
 * Exported so every test file shares this exact instance rather than
 * each one initializing its own — see vitest.config.ts's `isolate:
 * false`, which is what makes a module-level singleton like this one
 * actually stay shared across test files instead of being reset per
 * file. */
export function getParser(): Promise<InstanceType<typeof Parser>> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init({
        locateFile: () => path.resolve(__dirname, "../../../node_modules/web-tree-sitter/web-tree-sitter.wasm"),
      });
      const C = await Language.load(path.resolve(__dirname, "../../../node_modules/tree-sitter-c/tree-sitter-c.wasm"));
      const parser = new Parser();
      parser.setLanguage(C);
      return parser;
    })();
  }
  return parserPromise;
}

/** Every tree parseC() has produced since the last cleanupParsedTrees()
 * call. Each Tree wraps WASM memory that (as in parserService.ts —
 * see docs/PHASE_2_PARSER.md) isn't reclaimed by JS's own garbage
 * collector; without tracking + deleting them, a test file with many
 * `it()` blocks accumulates one leaked tree per test, which eventually
 * makes Vitest's own worker/IPC message serialization fail with a stack
 * overflow — a real issue this suite ran into directly while building
 * Phase 5's tests. Call cleanupParsedTrees() in an afterEach. */
const activeTrees: Tree[] = [];

export async function parseC(source: string): Promise<SyntaxNode> {
  const parser = await getParser();
  const tree = parser.parse(source);
  if (!tree) throw new Error("parse() returned null");
  activeTrees.push(tree);
  return tree.rootNode;
}

export function cleanupParsedTrees(): void {
  while (activeTrees.length > 0) {
    activeTrees.pop()?.delete();
  }
}

export interface RunOutcome {
  steps: number;
  result?: CValue;
  error?: Error;
  timedOut: boolean;
}

/** Drives interpretProgram to completion (or to a step limit, mirroring
 * the real engine's runaway-execution guard — see
 * src/execution/engine/ExecutionEngine.ts) and reports what happened,
 * without throwing, so tests can assert on errors as data. */
export function run(rootNode: SyntaxNode, maxSteps = 100_000): RunOutcome {
  const generator = interpretProgram(rootNode);
  let steps = 0;
  try {
    let next = generator.next();
    while (!next.done) {
      steps++;
      if (steps > maxSteps) return { steps, timedOut: true };
      next = generator.next();
    }
    return { steps, result: next.value, timedOut: false };
  } catch (error) {
    return { steps, error: error as Error, timedOut: false };
  }
}

/** Same as run(), but also collects every yielded step — for tests that
 * care about *how* execution got there, not just the final value. */
export function runCollectingSteps(
  rootNode: SyntaxNode,
  maxSteps = 100_000,
): RunOutcome & { history: InterpreterStep[] } {
  const generator = interpretProgram(rootNode);
  const history: InterpreterStep[] = [];
  let steps = 0;
  try {
    let next = generator.next();
    while (!next.done) {
      steps++;
      history.push(next.value);
      if (steps > maxSteps) return { steps, timedOut: true, history };
      next = generator.next();
    }
    return { steps, result: next.value, timedOut: false, history };
  } catch (error) {
    return { steps, error: error as Error, timedOut: false, history };
  }
}
