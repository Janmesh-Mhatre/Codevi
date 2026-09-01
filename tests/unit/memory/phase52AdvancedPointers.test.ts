import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

/**
 * Phase 5.2 tests — advanced pointer behavior and edge cases.
 * Covers: pointer +=/-=, relational comparison, pointer subtraction,
 * reassignment consistency, multiple pointers, pointer invalidation.
 */
afterEach(cleanupParsedTrees);

// ----------------------------------------------------------------
// Pointer compound assignment: += and -=
// ----------------------------------------------------------------
describe("Phase 5.2: pointer += / -=", () => {
  it("p += n advances the pointer forward within a heap block", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          *p = 10;
          p += 1;
          *p = 20;
          p += 1;
          *p = 30;
          p -= 2;
          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });

  it("p -= n moves the pointer backward", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          *p = 100;
          p += 2;
          *p = 300;
          p -= 2;
          int result = *p;
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 100 });
  });

  it("p += n out of bounds raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          p += 5;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/outside the bounds/i);
  });
});

// ----------------------------------------------------------------
// Pointer relational comparison: <, >, <=, >=
// ----------------------------------------------------------------
describe("Phase 5.2: pointer relational comparison", () => {
  it("p < q within same block compares slot positions", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = malloc(3 * sizeof(int));
          int *p = arr;
          int *q = arr + 2;
          int result = 0;
          if (p < q) { result = 1; }
          free(arr);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });

  it("p > q works correctly", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = malloc(3 * sizeof(int));
          int *p = arr + 2;
          int *q = arr;
          int result = 0;
          if (p > q) { result = 1; }
          free(arr);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });

  it("p <= q and p >= q work at the same position", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = malloc(2 * sizeof(int));
          int *p = arr;
          int *q = arr;
          int result = 0;
          if (p <= q) { result = result + 1; }
          if (p >= q) { result = result + 1; }
          free(arr);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 2 });
  });

  it("relational comparison between different blocks raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int *a = malloc(sizeof(int));
          int *b = malloc(sizeof(int));
          int result = 0;
          if (a < b) { result = 1; }
          return result;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/same allocation/i);
  });
});

// ----------------------------------------------------------------
// Pointer subtraction: p - q
// ----------------------------------------------------------------
describe("Phase 5.2: pointer subtraction", () => {
  it("p - q returns the element distance within same block", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = malloc(5 * sizeof(int));
          int *start = arr;
          int *end = arr + 4;
          int dist = end - start;
          free(arr);
          return dist;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 4 });
  });

  it("subtraction between different blocks raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int *a = malloc(sizeof(int));
          int *b = malloc(sizeof(int));
          int dist = a - b;
          return dist;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/same allocation/i);
  });

  it("subtraction involving NULL raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *q = NULL;
          int dist = p - q;
          return dist;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/null/i);
  });
});

// ----------------------------------------------------------------
// Pointer reassignment
// ----------------------------------------------------------------
describe("Phase 5.2: pointer reassignment", () => {
  it("reassigning a pointer updates its target correctly", async () => {
    const root = await parseC(`
      int main(void) {
          int a = 10;
          int b = 20;
          int *p = &a;
          p = &b;
          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("reassigning a pointer from stack to heap works", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 5;
          int *p = &x;
          p = malloc(sizeof(int));
          *p = 99;
          int result = *p;
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 99 });
  });
});

// ----------------------------------------------------------------
// Pointer becoming invalid after free
// ----------------------------------------------------------------
describe("Phase 5.2: pointer invalidation after free", () => {
  it("a pointer still holding a freed address cannot be dereferenced", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 42;
          int *q = p;
          free(p);
          return *q;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/use after free/i);
  });
});

// ----------------------------------------------------------------
// Multiple pointers to same heap block
// ----------------------------------------------------------------
describe("Phase 5.2: multiple pointers to same heap allocation", () => {
  it("multiple pointers to same malloc'd block: write through one, read through other", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *q = p;
          *p = 42;
          int result = *q;
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 42 });
  });
});

// ----------------------------------------------------------------
// Pointer-to-pointer edge cases
// ----------------------------------------------------------------
describe("Phase 5.2: pointer-to-pointer edge cases", () => {
  it("writing through **pp reaches the original variable", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 10;
          int *p = &x;
          int **pp = &p;
          **pp = 99;
          return x;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 99 });
  });

  it("pp → p → heap: pointer-to-pointer to a malloc'd block", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int **pp = &p;
          **pp = 55;
          int result = *p;
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 55 });
  });
});

// ----------------------------------------------------------------
// Invalid pointer operations
// ----------------------------------------------------------------
describe("Phase 5.2: invalid pointer operations", () => {
  it("dereferencing NULL is caught", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          return *p;
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/null pointer dereference/i);
  });

  it("pointer arithmetic on NULL raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          int *q = p + 1;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/null/i);
  });

  it("pointer arithmetic on a stack pointer raises an error", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 10;
          int *p = &x;
          int *q = p + 1;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
  });
});
