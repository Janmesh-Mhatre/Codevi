import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";

// See pointersBasics.test.ts's top comment for why this is split across
// four files.
afterEach(cleanupParsedTrees);

describe("Phase 5 required scenarios: dynamic memory allocation", () => {
  it("malloc + write + read + free (the brief's exact flow)", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          *ptr = 25;
          int result = *ptr;
          free(ptr);
          return result;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 25 });
  });

  it("a freed heap block is reported no longer active in the step data", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          *ptr = 25;
          free(ptr);
          return 0;
      }
    `);
    const { history } = runCollectingSteps(root);
    const last = history[history.length - 1];
    const allocations = last.memory.allAllocations();
    expect(allocations.length).toBe(1);
    expect(allocations[0].active).toBe(false);
  });

  it("malloc failing (invalid size) is a controlled error, not a crash", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(-5);
          return 0;
      }
    `);
    const { error } = runCollectingSteps(root);
    expect(error).toBeDefined();
  });

  it("calloc zero-initializes its elements", async () => {
    const root = await parseC(`
      int main(void) {
          int *arr = calloc(5, sizeof(int));
          int first = *arr;
          return first;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });

  it("realloc preserves existing contents when growing", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          *ptr = 42;
          ptr = realloc(ptr, 5 * sizeof(int));
          return *ptr;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 42 });
  });
});

describe("Phase 5 required scenarios: memory leak detection (optional/best-effort)", () => {
  it("an unfreed heap block is reported at program end without being a fatal error", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          *ptr = 100;
          return 0;
      }
    `);
    const { result, error, history } = runCollectingSteps(root);
    expect(error).toBeUndefined(); // a leak must not be treated as a crash
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
    const leakOutput = history.find((s) => s.kind === "output" && s.output?.includes("never freed"));
    expect(leakOutput).toBeDefined();
  });

  it("no leak is reported when everything allocated is freed", async () => {
    const root = await parseC(`
      int main(void) {
          int *ptr = malloc(sizeof(int));
          free(ptr);
          return 0;
      }
    `);
    const { history } = runCollectingSteps(root);
    const leakOutput = history.find((s) => s.kind === "output" && s.output?.includes("never freed"));
    expect(leakOutput).toBeUndefined();
  });
});
