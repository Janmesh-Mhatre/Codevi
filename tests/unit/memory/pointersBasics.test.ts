import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

// Split from a single pointers.test.ts into four files (Basics/Heap/
// Safety/Misc) — see docs/PHASE_5_POINTERS.md -> "A test-infrastructure
// crash, not an application bug" for why: not a correctness concern,
// purely to keep each Vitest file's test count comfortably below where
// this sandbox's test runner became unreliable.
afterEach(cleanupParsedTrees);

describe("Phase 5 required scenarios: basic pointers", () => {
  it("address-of and dereference round-trip to the declared value", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          return *ptr;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });

  it("writing through a pointer is visible when reading the original variable (the brief's own example)", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          *ptr = 25;
          return value;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 25 });
  });

  it("a pointer variable's own value is a distinct simulated address, shown correctly in the step data", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          return 0;
      }
    `);
    const { history } = runCollectingSteps(root);
    const step = history.find((s) => "ptr" in s.variables)!;
    const ptr = step.variables.ptr;
    expect(ptr.kind).toBe("pointer");
    if (ptr.kind === "pointer") {
      expect(ptr.target).not.toBeNull();
      expect(ptr.target!.space).toBe("stack");
    }
  });
});

describe("Phase 5 required scenarios: pointer to pointer", () => {
  it("double dereference reads through both levels", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          int **pptr = &ptr;
          return **pptr;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 10 });
  });

  it("writing through **pptr reaches the original variable", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          int **pptr = &ptr;
          **pptr = 99;
          return value;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 99 });
  });
});

describe("Phase 5 required scenarios: null pointer handling", () => {
  it("dereferencing NULL raises a clean, specific error", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = NULL;
          return *ptr;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/null pointer dereference/i);
  });

  it("a pointer declared without an initializer defaults to NULL rather than garbage", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr;
          return *ptr;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error?.message).toMatch(/null pointer dereference/i);
  });

  it("comparing a pointer against NULL works", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          if (ptr == NULL) { return 1; }
          return 0;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });
});
