import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "./helpers/interpreterTestHelpers";
import { CRuntimeError } from "../../src/languages/c/interpreter/values";
import { InterpreterError } from "../../src/languages/c/interpreter/types";

afterEach(cleanupParsedTrees);

// The six scenarios explicitly required by the Phase 3 prompt.
describe("Phase 3 required scenarios", () => {
  it("basic execution", async () => {
    const root = await parseC(`
      int main() {
          int a = 10;
          return a;
      }
    `);
    const outcome = run(root);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });

  it("sequential statements", async () => {
    const root = await parseC(`
      int main() {
          int a = 10;
          int b = 20;
          int c = a + b;
          return c;
      }
    `);
    const outcome = run(root);
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 30 });
  });

  it("conditional execution", async () => {
    const root = await parseC(`
      int main() {
          int a = 10;
          if (a > 5) {
              a = 20;
          }
          return a;
      }
    `);
    const outcome = run(root);
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("loop execution", async () => {
    const root = await parseC(`
      int main() {
          int sum = 0;
          for (int i = 0; i < 5; i++) {
              sum += i;
          }
          return sum;
      }
    `);
    const outcome = run(root);
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 10 }); // 0+1+2+3+4
  });

  it("invalid code fails gracefully at the parser, before the interpreter ever runs", async () => {
    const root = await parseC(`int main( {`);
    expect(root.hasError).toBe(true);
    // The real engine (src/execution/engine/ExecutionEngine.ts) checks
    // this and refuses to start rather than handing broken syntax to
    // the interpreter — see docs/PHASE_3_EXECUTION.md → "Error handling".
  });

  it("infinite loop is stopped by the step limit instead of hanging", async () => {
    const root = await parseC(`
      int main() {
          while (1) {
          }
      }
    `);
    const outcome = run(root, 10_000);
    expect(outcome.timedOut).toBe(true);
    expect(outcome.steps).toBeGreaterThan(9_999);
  });
});

// Additional coverage found useful while building this phase.
describe("additional interpreter coverage", () => {
  it("calls user-defined functions with parameters and a return value", async () => {
    const root = await parseC(`
      int square(int n) { return n * n; }
      int main() { return square(4); }
    `);
    expect(run(root).result).toEqual({ kind: "scalar", type: "int", value: 16 });
  });

  it("supports recursion", async () => {
    const root = await parseC(`
      int factorial(int n) {
          if (n <= 1) { return 1; }
          return n * factorial(n - 1);
      }
      int main() { return factorial(5); }
    `);
    expect(run(root).result).toEqual({ kind: "scalar", type: "int", value: 120 });
  });

  it("supports else-if chains", async () => {
    const root = await parseC(`
      int main() {
          int a = 7;
          int result;
          if (a > 10) { result = 1; }
          else if (a > 5) { result = 2; }
          else { result = 3; }
          return result;
      }
    `);
    expect(run(root).result).toEqual({ kind: "scalar", type: "int", value: 2 });
  });

  it("supports break and continue", async () => {
    // Traced by hand: i reaches 1,2,4,5 added to sum (3 is skipped by
    // continue, loop stops via break once i hits 5) -> 1+2+4+5 = 12.
    const root = await parseC(`
      int main() {
          int i = 0;
          int sum = 0;
          while (1) {
              if (i == 5) break;
              i++;
              if (i == 3) continue;
              sum += i;
          }
          return sum;
      }
    `);
    expect(run(root).result).toEqual({ kind: "scalar", type: "int", value: 12 });
  });

  it("supports do-while (body runs at least once)", async () => {
    const root = await parseC(`
      int main() {
          int i = 0;
          do { i++; } while (i < 5);
          return i;
      }
    `);
    expect(run(root).result).toEqual({ kind: "scalar", type: "int", value: 5 });
  });

  it("truncates integer division toward zero like C, not like JS", async () => {
    const root = await parseC(`
      int main() { return 7 / 2; }
    `);
    expect(run(root).result).toEqual({ kind: "scalar", type: "int", value: 3 });
  });

  it("raises a clean runtime error on integer division by zero instead of producing Infinity", async () => {
    const root = await parseC(`
      int main() { int a = 10; int b = 0; return a / b; }
    `);
    const outcome = run(root);
    expect(outcome.error).toBeInstanceOf(CRuntimeError);
  });

  it("raises a clean error on use of an undeclared variable instead of returning NaN/undefined", async () => {
    const root = await parseC(`int main() { return x; }`);
    const outcome = run(root);
    expect(outcome.error).toBeInstanceOf(InterpreterError);
  });

  it("reports source position on unsupported constructs (arrays) instead of crashing", async () => {
    // Pointers themselves are now supported as of Phase 5 — see
    // tests/unit/pointers.test.ts. Arrays remain unimplemented, which is
    // exactly what this test is checking the error path for.
    const root = await parseC(`
      int main() {
          int arr[5];
          return 0;
      }
    `);
    const outcome = run(root);
    expect(outcome.error).toBeInstanceOf(InterpreterError);
  });

  it("gives a specific message for unsupported library calls like strlen, not a generic failure", async () => {
    // printf (Phase 4.1) and malloc/calloc/realloc/free (Phase 5) are
    // now supported — see tests/unit/stdio.test.ts and
    // tests/unit/pointers.test.ts. strlen remains a recognized-but-
    // unimplemented library function (it needs real string support,
    // which Codevi still doesn't have), which is exactly what this test
    // is checking the error path for.
    const root = await parseC(`
      int main() {
          strlen("hi");
          return 0;
      }
    `);
    const outcome = run(root);
    expect(outcome.error?.message).toContain("strlen");
  });

  it("yields one step per statement/loop-check, not per sub-expression", async () => {
    const root = await parseC(`
      int main() {
          int a = 1 + 2 + 3;
          return a;
      }
    `);
    // A single declaration statement with a multi-operator expression
    // should still be exactly one step, not one per '+'.
    const { history } = runCollectingSteps(root);
    const statementSteps = history.filter((step) => step.kind === "statement");
    expect(statementSteps.length).toBe(2); // the declaration, then the return
  });

  it("tracks call depth across nested calls", async () => {
    const root = await parseC(`
      int inner() { return 1; }
      int outer() { return inner(); }
      int main() { return outer(); }
    `);
    const { history } = runCollectingSteps(root);
    const enters = history.filter((step) => step.kind === "call-enter");
    expect(enters.map((step) => step.functionName)).toEqual(["main", "outer", "inner"]);
    expect(enters.map((step) => step.callDepth)).toEqual([1, 2, 3]);
  });
});
