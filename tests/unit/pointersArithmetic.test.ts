import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "./helpers/interpreterTestHelpers";
import { InterpreterError } from "../../src/languages/c/interpreter/types";

// See pointersBasics.test.ts's top comment for why pointer coverage is
// split across several small files.
afterEach(cleanupParsedTrees);

describe("Phase 5 required scenarios: pointer arithmetic", () => {
  it("advancing a pointer across a malloc'd multi-element block moves between real elements", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = malloc(3 * sizeof(int));
          *arr = 10;
          int *second = arr + 1;
          *second = 20;
          int *third = second + 1;
          *third = 30;
          int sum = *arr + *(arr + 1) + *third;
          free(arr);
          return sum;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 60 });
  });

  it("ptr++ advances to the next real element and back is symmetric", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = malloc(2 * sizeof(int));
          int *p = arr;
          *p = 1;
          p++;
          *p = 2;
          p--;
          int result = *arr + *p;
          free(arr);
          return result;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    // arr[0]=1, then p moves to slot 1 and sets it to 2, then p moves
    // back to slot 0 — so *arr and *p both read slot 0 (=1): 1+1=2.
    expect(result).toEqual({ kind: "scalar", type: "int", value: 2 });
  });

  it("pointer arithmetic is bounds-checked against the real allocation size", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          int *out = ptr + 5;
          return 0;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/outside the bounds/i);
  });

  it("pointer arithmetic on a pointer to a single stack variable is explicitly unsupported (no arrays), not silently wrong", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          int *moved = ptr + 1;
          return 0;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/arrays/i);
  });
});
