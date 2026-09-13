import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

/**
 * Phase 6 — All 15 spec-mandated pointer test scenarios, plus array
 * integration tests. Covers the full pointer/memory story end-to-end.
 */
afterEach(cleanupParsedTrees);

// ---- Test 1: Basic pointer (address-of and dereference) ----
describe("P6-01: basic pointer", () => {
  it("address-of and dereference round-trip", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 42;
          int *p = &x;
          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 42 });
  });
});

// ---- Test 2: Dereference read ----
describe("P6-02: dereference read", () => {
  it("reading through a pointer returns the pointed-to value", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 100;
          int *ptr = &value;
          int result = *ptr;
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 100 });
  });
});

// ---- Test 3: Modify through pointer ----
describe("P6-03: modify through pointer", () => {
  it("writing through a pointer changes the original variable", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          *ptr = 25;
          return value;
      }
    `);
    const { result } = run(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 25 });
  });
});

// ---- Test 4: NULL pointer ----
describe("P6-04: NULL pointer", () => {
  it("a pointer initialized to NULL has a null target", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = NULL;
          if (ptr == NULL) { return 1; }
          return 0;
      }
    `);
    const { result } = run(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });
});

// ---- Test 5: NULL dereference error ----
describe("P6-05: NULL dereference", () => {
  it("dereferencing NULL raises a clear error", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = NULL;
          return *ptr;
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/null pointer dereference/i);
  });
});

// ---- Test 6: Pointer-to-pointer ----
describe("P6-06: pointer-to-pointer", () => {
  it("double dereference reads through both levels", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          int **pptr = &ptr;
          return **pptr;
      }
    `);
    const { result } = run(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });
});

// ---- Test 7: Array pointer ----
describe("P6-07: array pointer", () => {
  it("array with initializer and pointer traversal", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = arr;
          int sum = *p + *(p + 1) + *(p + 2);
          return sum;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 60 });
  });
});

// ---- Test 8: Pointer increment on array ----
describe("P6-08: pointer increment on array", () => {
  it("ptr++ advances through array elements", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = arr;
          p++;
          return *p;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });
});

// ---- Test 9: Heap pointer (malloc) ----
describe("P6-09: heap pointer", () => {
  it("malloc + dereference round-trip", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 99;
          int val = *p;
          free(p);
          return val;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 99 });
  });
});

// ---- Test 10: Use-after-free error ----
describe("P6-10: use-after-free", () => {
  it("dereferencing a freed pointer raises a clear error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 42;
          free(p);
          return *p;
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/freed|use.after.free/i);
  });
});

// ---- Test 11: Pointer reassignment ----
describe("P6-11: pointer reassignment", () => {
  it("reassigning a pointer changes what it points to", async () => {
    const root = await parseC(`
      int main(void) {
          int a = 10;
          int b = 20;
          int *p = &a;
          p = &b;
          return *p;
      }
    `);
    const { result } = run(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });
});

// ---- Test 12: Aliasing ----
describe("P6-12: aliasing", () => {
  it("two pointers to same variable are aliases", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 10;
          int *p = &x;
          int *q = &x;
          *p = 20;
          return *q;
      }
    `);
    const { result } = run(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });
});

// ---- Test 13: calloc with pointers ----
describe("P6-13: calloc with pointers", () => {
  it("calloc initializes to zero and pointer access works", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = calloc(3, sizeof(int));
          int sum = *p + *(p + 1) + *(p + 2);
          *(p + 2) = 30;
          int result = sum + *(p + 2);
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    // sum = 0+0+0 = 0, result = 0 + 30 = 30
    expect(result).toEqual({ kind: "scalar", type: "int", value: 30 });
  });
});

// ---- Test 14: realloc with pointers ----
describe("P6-14: realloc with pointers", () => {
  it("realloc preserves existing values and extends the block", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          *p = 42;
          p = realloc(p, 2 * sizeof(int));
          *(p + 1) = 100;
          int result = *p + *(p + 1);
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 142 });
  });
});

// ---- Test 15: Invalid pointer access ----
describe("P6-15: invalid pointer access", () => {
  it("out-of-bounds pointer arithmetic raises a clear error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *bad = p + 5;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/outside the bounds/i);
  });
});

// ---- Phase 6 Fixes & Improvements Spec Tests ----
describe("Test 6.1: Pointer Printing with %p", () => {
  it("prints simulated address with %p without error", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 10;
          int *p = &x;
          printf("%d\\n", x);
          printf("%p\\n", p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const output = history
      .filter((s) => s.kind === "output")
      .map((s) => s.output)
      .join("");
    expect(output).toBe("10\nS001\n");
  });

  it("prints NULL for null pointers", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          printf("%p\\n", p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const output = history
      .filter((s) => s.kind === "output")
      .map((s) => s.output)
      .join("");
    expect(output).toBe("NULL\n");
  });
});

describe("Test 6.12: Array Initialization and Address-of Array Elements", () => {
  it("takes address of array element &arr[2] and performs pointer arithmetic p--", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = &arr[2];
          printf("%d\\n", *p);
          p--;
          printf("%d\\n", *p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const output = history
      .filter((s) => s.kind === "output")
      .map((s) => s.output)
      .join("");
    expect(output).toBe("30\n20\n");
  });
});

describe("Test 6.13: Pointer Difference", () => {
  it("calculates pointer difference q - p on stack array and prints with %ld", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[5] = {10, 20, 30, 40, 50};
          int *p = &arr[1];
          int *q = &arr[4];
          printf("%ld\\n", q - p);
          return 0;
      }
    `);
    const { history, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    const output = history
      .filter((s) => s.kind === "output")
      .map((s) => s.output)
      .join("");
    expect(output).toBe("3\n");
  });
});
