import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

/**
 * Phase 6 — Array-specific tests. Covers array declarations,
 * initializers, array-to-pointer decay, subscript syntax, bounds
 * checking, and arrays in the execution step data.
 */
afterEach(cleanupParsedTrees);

describe("Phase 6: array declaration with initializer", () => {
  it("declares a fixed-size array and reads values back", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = arr;
          return *(p + 2);
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 30 });
  });

  it("partial initializer zero-fills remaining elements", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10};
          int *p = arr;
          return *(p + 1) + *(p + 2);
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    // arr[1] and arr[2] are initialized to 0 by default
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });
});

describe("Phase 6: uninitialized array", () => {
  it("uninitialized array is zero-filled", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3];
          int *p = arr;
          return *p + *(p + 1) + *(p + 2);
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });
});

describe("Phase 6: array-to-pointer decay", () => {
  it("assigning an array name to a pointer gives a pointer to element 0", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = arr;
          return *p;
      }
    `);
    const { result } = run(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });

  it("array name in an expression decays to pointer", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[2] = {5, 15};
          int *p = arr + 1;
          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 15 });
  });
});

describe("Phase 6: subscript expression (arr[i])", () => {
  it("arr[0] reads the first element", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          return arr[0];
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });

  it("arr[2] reads the third element", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          return arr[2];
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 30 });
  });

  it("arr[i] with a variable index works", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int i = 1;
          return arr[i];
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("subscript on a heap pointer works", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          *p = 100;
          *(p + 1) = 200;
          *(p + 2) = 300;
          int result = p[0] + p[1] + p[2];
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 600 });
  });
});

describe("Phase 6: pointer arithmetic on stack arrays", () => {
  it("ptr++ and ptr-- work on stack array pointers", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = arr;
          p++;
          int a = *p;
          p++;
          int b = *p;
          p--;
          p--;
          int c = *p;
          return a + b + c;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    // a=20, b=30, c=10 → 60
    expect(result).toEqual({ kind: "scalar", type: "int", value: 60 });
  });
});

describe("Phase 6: array bounds checking", () => {
  it("pointer arithmetic past the end of a stack array raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[2] = {10, 20};
          int *p = arr;
          int *bad = p + 5;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/outside the bounds|bounds/i);
  });
});

describe("Phase 6: array in step data", () => {
  it("array values appear in the interpreter step variables", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          return 0;
      }
    `);
    const { history } = runCollectingSteps(root);
    // Find a step where 'arr' exists in variables
    const step = history.find((s) => "arr" in s.variables);
    expect(step).toBeDefined();
    const arrVal = step!.variables.arr;
    expect(arrVal.kind).toBe("array");
    if (arrVal.kind === "array") {
      const slotVals = step!.memory.stackArraySlotValues(arrVal.baseAddress);
      expect(slotVals).toEqual([
        { kind: "scalar", type: "int", value: 10 },
        { kind: "scalar", type: "int", value: 20 },
        { kind: "scalar", type: "int", value: 30 },
      ]);
    }
  });
});
