import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

// See pointersBasics.test.ts's top comment for why pointer coverage is
// split across several small files.
afterEach(cleanupParsedTrees);

describe("Phase 5 required scenarios: use-after-free and double-free", () => {
  it("dereferencing a freed pointer raises a clear use-after-free error, not silent success", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          free(ptr);
          return *ptr;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/use after free/i);
  });

  it("writing through a freed pointer is also caught", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          free(ptr);
          *ptr = 10;
          return 0;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error?.message).toMatch(/use after free/i);
  });

  it("freeing the same pointer twice raises a clear double-free error", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          free(ptr);
          free(ptr);
          return 0;
      }
    `);
    const { error } = runCollectingSteps(root);
    // memory.ts's free() raises a plain CRuntimeError; callFree (see
    // interpreter.ts) wraps it as an InterpreterError so the failure
    // carries a source position — see docs/PHASE_5_POINTERS.md for the
    // full story of how this test originally had the wrong expectation
    // here (CRuntimeError) and what that actually surfaced.
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/double free/i);
  });

  it("free(NULL) is a documented no-op, not an error", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = NULL;
          free(ptr);
          return 0;
      }
    `);
    const { error, result } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });
});
