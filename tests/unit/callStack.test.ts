import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "./helpers/interpreterTestHelpers";

afterEach(cleanupParsedTrees);

describe("Phase 4: call stack and scope data", () => {
  it("a block-scoped variable only appears in steps while its scope is active", async () => {
    // The prompt's own scope example: b should be visible only inside
    // the if-block, gone again by the time we reach `return a`.
    const root = await parseC(`
      int main(void) {
          int a = 10;
          if (a > 5) {
              int b = 20;
              a = b;
          }
          return a;
      }
    `);
    const { history, result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });

    const stepsWithB = history.filter((s) => "b" in s.variables);
    const stepsWithoutB = history.filter((s) => !("b" in s.variables));
    expect(stepsWithB.length).toBeGreaterThan(0);
    expect(stepsWithoutB.length).toBeGreaterThan(0);

    // Specifically: the final `return a;` step must NOT see b.
    const returnStep = history.find((s) => s.description.startsWith("return"));
    expect(returnStep).toBeDefined();
    expect(returnStep!.variables).not.toHaveProperty("b");
    expect(returnStep!.variables.a).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("reports a single frame (main) for a program with no function calls", async () => {
    const root = await parseC(`
      int main(void) {
          int a = 10;
          int b = 20;
          int c = a + b;
          return c;
      }
    `);
    const { history } = runCollectingSteps(root);
    for (const step of history) {
      expect(step.callStack.map((f) => f.functionName)).toEqual(["main"]);
    }
  });

  it("adds a frame on call and removes it on return (single call)", async () => {
    const root = await parseC(`
      int square(int n) {
          int result = n * n;
          return result;
      }
      int main(void) {
          int value = square(5);
          return value;
      }
    `);
    const { history, result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 25 });

    const depths = history.map((s) => s.callStack.map((f) => f.functionName));
    expect(depths).toContainEqual(["main"]);
    expect(depths).toContainEqual(["main", "square"]);
    // Never more than two frames deep in this program.
    expect(Math.max(...history.map((s) => s.callStack.length))).toBe(2);
    // Back to just main by the very last step.
    expect(history[history.length - 1].callStack.map((f) => f.functionName)).toEqual(["main"]);

    // While inside square, its parameter shows up correctly.
    const insideSquare = history.find((s) => s.callStack.map((f) => f.functionName).join() === "main,square" && "n" in s.variables);
    expect(insideSquare?.variables.n).toEqual({ kind: "scalar", type: "int", value: 5 });
    const squareFrame = insideSquare?.callStack.find((f) => f.functionName === "square");
    expect(squareFrame?.parameters).toEqual({ n: { kind: "scalar", type: "int", value: 5 } });
  });

  it("frames appear and disappear correctly across two independent calls", async () => {
    const root = await parseC(`
      int add(int a, int b) { return a + b; }
      int multiply(int a, int b) { return a * b; }
      int main(void) {
          int x = add(2, 3);
          int y = multiply(x, 4);
          return y;
      }
    `);
    const { history, result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 }); // (2+3) * 4

    const sequenceOfInnerFrames = history
      .map((s) => s.callStack[s.callStack.length - 1]?.functionName)
      .filter((name, i, arr) => name !== arr[i - 1]); // collapse consecutive duplicates
    expect(sequenceOfInnerFrames).toEqual(["main", "add", "main", "multiply", "main"]);
  });

  it("recursion produces one frame per active call, all sharing the same function name", async () => {
    const root = await parseC(`
      int factorial(int n) {
          if (n <= 1) { return 1; }
          return n * factorial(n - 1);
      }
      int main(void) { return factorial(5); }
    `);
    const { history, result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 120 });

    const maxDepth = Math.max(...history.map((s) => s.callStack.length));
    // main + 5 nested factorial calls (5,4,3,2,1) = 6 frames at the deepest point.
    expect(maxDepth).toBe(6);

    const deepestStep = history.find((s) => s.callStack.length === maxDepth)!;
    expect(deepestStep.callStack.map((f) => f.functionName)).toEqual([
      "main",
      "factorial",
      "factorial",
      "factorial",
      "factorial",
      "factorial",
    ]);
    // Each recursive frame has its own independent `n` — not sharing one.
    const nValues = deepestStep.callStack.filter((f) => f.functionName === "factorial").map((f) => f.parameters.n?.value);
    expect(nValues).toEqual([5, 4, 3, 2, 1]);

    // Back down to just main at the very end.
    expect(history[history.length - 1].callStack.map((f) => f.functionName)).toEqual(["main"]);
  });

  it("variables progress 10 -> 20 -> 25 across sequential mutation, matching the prompt's example", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 10;
          x = 20;
          x = x + 5;
          return x;
      }
    `);
    const { history } = runCollectingSteps(root);
    const xValues = history.filter((s) => "x" in s.variables).map((s) => s.variables.x.value);
    // Each declaration/assignment statement is stepped BEFORE it runs (see
    // docs/PHASE_3_EXECUTION.md's "prospective" step convention), so x's
    // value lags one step behind the statement that's about to change it;
    // the sequence of *observed* values should still visibly progress
    // through 10, 20, and 25 in order.
    expect(xValues).toContain(10);
    expect(xValues).toContain(20);
    expect(xValues[xValues.length - 1]).toBe(25);
  });

  it("a loop counter's value is observed progressing 0 -> 1 -> 2 -> 3", async () => {
    const root = await parseC(`
      int main(void) {
          int counter = 0;
          while (counter < 3) {
              counter++;
          }
          return counter;
      }
    `);
    const { history } = runCollectingSteps(root);
    const counterValues = history.filter((s) => "counter" in s.variables).map((s) => s.variables.counter.value);
    expect(Math.max(...counterValues)).toBe(3);
    expect(counterValues).toContain(0);
    expect(counterValues).toContain(1);
    expect(counterValues).toContain(2);
  });
});
