import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";

// See pointersBasics.test.ts's top comment for why this is split across
// four files.
afterEach(cleanupParsedTrees);

describe("Phase 5 required scenarios: pointer comparison", () => {
  it("two pointers to the same variable compare equal", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr1 = &value;
          int *ptr2 = &value;
          if (ptr1 == ptr2) { return 1; }
          return 0;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });

  it("pointers to different variables compare unequal", async () => {
    const root = await parseC(`
      int main(void) {
          int a = 10;
          int b = 10;
          int *ptr1 = &a;
          int *ptr2 = &b;
          if (ptr1 != ptr2) { return 1; }
          return 0;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 1 });
  });
});

describe("additional Phase 5 coverage", () => {
  it("sizeof(TYPE) returns Codevi's simulated unit sizes", async () => {
    const root = await parseC(`
      int main(void) {
          int a = sizeof(int);
          int b = sizeof(char);
          int c = sizeof(double);
          return a + b + c;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 4 + 1 + 8 });
  });

  it("sizeof(variable) reflects the variable's own type", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          return sizeof(value);
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 4 });
  });

  it("!ptr treats a non-NULL pointer as truthy and NULL as falsy, matching the common if(!ptr) idiom", async () => {
    const root = await parseC(`
      int main(void) {
          int value = 10;
          int *ptr = &value;
          int *nil = NULL;
          if (!nil) {
              if (!ptr) { return 1; }
              return 2;
          }
          return 3;
      }
    `);
    const { result } = runCollectingSteps(root);
    expect(result).toEqual({ kind: "scalar", type: "int", value: 2 });
  });

  it("a pointer parameter to a function works, and writes through it are visible to the caller", async () => {
    const root = await parseC(`
      void setToFortyTwo(int *target) {
          *target = 42;
      }
      int main(void) {
          int value = 0;
          setToFortyTwo(&value);
          return value;
      }
    `);
    const { result, error } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 42 });
  });
});
