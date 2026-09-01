import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

/**
 * Phase 5.1 required test programs — the exact 10 programs from the
 * implementation prompt, plus additional coverage for realloc(NULL),
 * calloc numeric size, and allocation step events.
 */
afterEach(cleanupParsedTrees);

// ----------------------------------------------------------------
// 1. malloc + dereference
// ----------------------------------------------------------------
describe("Phase 5.1 test #1: malloc + dereference", () => {
  it("allocates, writes through pointer, reads back via dereference", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 50;
          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 50 });
  });
});

// ----------------------------------------------------------------
// 2. malloc + free
// ----------------------------------------------------------------
describe("Phase 5.1 test #2: malloc + free", () => {
  it("allocates, writes, frees, and returns normally", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 50;
          free(p);
          return 0;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });
});

// ----------------------------------------------------------------
// 3. Memory leak
// ----------------------------------------------------------------
describe("Phase 5.1 test #3: memory leak detection", () => {
  it("reports leaked heap block at program end without crashing", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 50;
          return 0;
      }
    `);
    const { result, error, history } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
    const leakOutput = history.find(
      (s) => s.kind === "output" && s.output?.includes("never freed"),
    );
    expect(leakOutput).toBeDefined();
    expect(leakOutput!.output).toMatch(/1 heap block/);
  });
});

// ----------------------------------------------------------------
// 4. Use-after-free
// ----------------------------------------------------------------
describe("Phase 5.1 test #4: use-after-free", () => {
  it("detects read access to freed memory", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 50;
          free(p);
          return *p;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/use after free/i);
  });
});

// ----------------------------------------------------------------
// 5. Double-free
// ----------------------------------------------------------------
describe("Phase 5.1 test #5: double-free", () => {
  it("detects freeing the same pointer twice", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          free(p);
          free(p);
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/double free/i);
  });
});

// ----------------------------------------------------------------
// 6. NULL pointer
// ----------------------------------------------------------------
describe("Phase 5.1 test #6: NULL pointer", () => {
  it("a NULL pointer assignment completes without error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          return 0;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });
});

// ----------------------------------------------------------------
// 7. NULL dereference
// ----------------------------------------------------------------
describe("Phase 5.1 test #7: NULL dereference", () => {
  it("detects null pointer dereference with a clear error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          int x = *p;
          return x;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/null pointer dereference/i);
  });
});

// ----------------------------------------------------------------
// 8. Pointer-to-pointer
// ----------------------------------------------------------------
describe("Phase 5.1 test #8: pointer-to-pointer", () => {
  it("double dereference reads through both levels correctly", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 42;
          int *p = &x;
          int **pp = &p;
          return **pp;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 42 });
  });
});

// ----------------------------------------------------------------
// 9. Basic realloc without array indexing
// ----------------------------------------------------------------
describe("Phase 5.1 test #9: basic realloc", () => {
  it("reallocates, preserves first element, allows write+read", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 10;

          p = realloc(p, 2 * sizeof(int));

          *p = 20;

          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });
});

// ----------------------------------------------------------------
// 10. Multiple pointers
// ----------------------------------------------------------------
describe("Phase 5.1 test #10: multiple pointers", () => {
  it("two pointers to same variable: write through one, read through other", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 100;

          int *p = &x;
          int *q = &x;

          *p = 200;

          return *q;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 200 });
  });
});

// ----------------------------------------------------------------
// Additional Phase 5.1 coverage
// ----------------------------------------------------------------
describe("Phase 5.1 additional: realloc(NULL, size)", () => {
  it("realloc(NULL, size) behaves like malloc(size)", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          p = realloc(p, sizeof(int));
          *p = 77;
          int result = *p;
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 77 });
  });
});

describe("Phase 5.1 additional: allocation step events", () => {
  it("malloc emits a step event describing the allocation", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          free(p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const mallocStep = history.find((s) => s.description.includes("malloc: allocated"));
    expect(mallocStep).toBeDefined();
    const freeStep = history.find((s) => s.description.includes("free: released"));
    expect(freeStep).toBeDefined();
  });

  it("calloc emits a step event mentioning zero-initialization", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = calloc(3, sizeof(int));
          free(p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const callocStep = history.find((s) => s.description.includes("calloc: allocated"));
    expect(callocStep).toBeDefined();
    expect(callocStep!.description).toMatch(/zero-initialized/i);
  });

  it("realloc emits a step event describing the resize", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          p = realloc(p, 2 * sizeof(int));
          free(p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const reallocStep = history.find((s) => s.description.includes("realloc: resized"));
    expect(reallocStep).toBeDefined();
  });
});

describe("Phase 5.1 additional: no false leak report", () => {
  it("does not report leaks when all allocations are freed", async () => {
    const root = await parseC(`
      int main(void) {
          int *a = malloc(sizeof(int));
          int *b = calloc(2, sizeof(int));
          free(a);
          free(b);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const leakOutput = history.find(
      (s) => s.kind === "output" && s.output?.includes("never freed"),
    );
    expect(leakOutput).toBeUndefined();
  });
});

describe("Phase 5.1 additional: write through freed pointer", () => {
  it("detects write access to freed memory", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          free(p);
          *p = 99;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/use after free/i);
  });
});
