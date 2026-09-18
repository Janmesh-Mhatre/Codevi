import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run } from "../helpers/interpreterTestHelpers";

/**
 * Phase 5.2 hardening tests — additional pointer edge cases and safety
 * diagnostics added on top of the existing phase52AdvancedPointers.test.ts.
 */
afterEach(cleanupParsedTrees);

// ----------------------------------------------------------------
// Use-after-free in pointer arithmetic
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: use-after-free in pointer arithmetic", () => {
  it("free(p); p++ raises use-after-free", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          free(p);
          p++;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/use after free/i);
  });

  it("free(p); p + 1 raises use-after-free", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          free(p);
          int *q = p + 1;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/use after free/i);
  });

  it("free(p); p += 1 raises use-after-free", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          free(p);
          p += 1;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/use after free/i);
  });
});

// ----------------------------------------------------------------
// Non-integer offset in pointer arithmetic
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: non-integer pointer offset", () => {
  it("p + 1.5 raises integer offset error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          int *q = p + 1.5;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/integer offset/i);
  });

  it("p += 2.5 raises integer offset error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          p += 2.5;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/integer offset/i);
  });
});

// ----------------------------------------------------------------
// Adding two pointers
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: adding two pointers", () => {
  it("p + q raises cannot-add-two-pointers error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *q = malloc(sizeof(int));
          int *r = p + q;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/cannot add two pointers/i);
  });
});

// ----------------------------------------------------------------
// Subtracting pointer from integer
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: integer minus pointer", () => {
  it("10 - p raises clear error", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *r = 10 - p;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/cannot subtract a pointer from an integer/i);
  });
});

// ----------------------------------------------------------------
// Illegal arithmetic and bitwise operators on pointers
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: illegal binary operators on pointers", () => {
  it("p * 2 raises invalid pointer operation", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *r = p * 2;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/operator.*cannot be applied to a pointer/i);
  });

  it("p / 2 raises invalid pointer operation", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *r = p / 2;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/operator.*cannot be applied to a pointer/i);
  });

  it("p % 2 raises invalid pointer operation", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *r = p % 2;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/operator.*cannot be applied to a pointer/i);
  });
});

// ----------------------------------------------------------------
// Illegal unary operators on pointers
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: illegal unary operators on pointers", () => {
  it("-p raises invalid pointer operation", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *r = -p;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/unary.*cannot be applied to a pointer/i);
  });

  it("~p raises invalid pointer operation", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *r = ~p;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/unary.*cannot be applied to a pointer/i);
  });
});

// ----------------------------------------------------------------
// Illegal compound assignment on pointers
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: illegal compound assignment on pointers", () => {
  it("p *= 2 raises invalid pointer assignment", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          p *= 2;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/operator.*cannot be applied to a pointer/i);
  });

  it("p /= 2 raises invalid pointer assignment", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          p /= 2;
          return 0;
      }
    `);
    const { error } = run(root);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/operator.*cannot be applied to a pointer/i);
  });
});

// ----------------------------------------------------------------
// Existing valid behavior preserved
// ----------------------------------------------------------------
describe("Phase 5.2 hardening: valid operations still work", () => {
  it("p + 1 still works on active heap block", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(3 * sizeof(int));
          *p = 10;
          int *q = p + 1;
          *q = 20;
          int result = *(p + 1);
          free(p);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("p == NULL comparison still works", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          int result = 0;
          if (p == NULL) { result = 1; }
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });

  it("p != q comparison still works", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          int *q = malloc(sizeof(int));
          int result = 0;
          if (p != q) { result = 1; }
          free(p);
          free(q);
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });

  it("!p (logical not) on NULL still works", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = NULL;
          int result = 0;
          if (!p) { result = 1; }
          return result;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });
});
