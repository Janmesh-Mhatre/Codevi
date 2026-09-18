import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";

afterEach(cleanupParsedTrees);

describe("User code switch analysis & execution verification", () => {
  it("runs user switch code with x = 2 (matches case 2, falls through to case 3, breaks before default)", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int x = 2, y = 0;
          switch (x) {
              case 1: y += 1;
              case 2: y += 2;
              case 3: y += 3; break;
              default: y += 100;
          }
          printf("switch_result=%d\\n", y);
          return 0;
      }
    `;

    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 0 });

    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("switch_result=5\n");

    const descriptions = outcome.history.map((s) => s.description);
    expect(descriptions).toContain("int x = 2, y = 0;");
    expect(descriptions).toContain("switch (x)");
    expect(descriptions).toContain("case 2:");
    expect(descriptions).toContain("y += 2;");
    expect(descriptions).toContain("case 3:");
    expect(descriptions).toContain("y += 3;");
    expect(descriptions).toContain("break;");
    expect(descriptions).not.toContain("default:");
  });

  it("runs user switch code with x = 1 (falls through case 1 -> case 2 -> case 3, breaks)", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int x = 1, y = 0;
          switch (x) {
              case 1: y += 1;
              case 2: y += 2;
              case 3: y += 3; break;
              default: y += 100;
          }
          printf("switch_result=%d\\n", y);
          return 0;
      }
    `;

    const root = await parseC(code);
    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 0 });

    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    // 1 + 2 + 3 = 6
    expect(output).toBe("switch_result=6\n");
  });

  it("runs user switch code with x = 3 (matches case 3, breaks)", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int x = 3, y = 0;
          switch (x) {
              case 1: y += 1;
              case 2: y += 2;
              case 3: y += 3; break;
              default: y += 100;
          }
          printf("switch_result=%d\\n", y);
          return 0;
      }
    `;

    const root = await parseC(code);
    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 0 });

    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("switch_result=3\n");
  });

  it("runs user switch code with x = 42 (matches default)", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int x = 42, y = 0;
          switch (x) {
              case 1: y += 1;
              case 2: y += 2;
              case 3: y += 3; break;
              default: y += 100;
          }
          printf("switch_result=%d\\n", y);
          return 0;
      }
    `;

    const root = await parseC(code);
    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 0 });

    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("switch_result=100\n");
  });

  it("supports multiple variable declarations of different types in a single statement", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int a = 10, *p = NULL, b = 20;
          p = &a;
          *p += b;
          printf("a=%d\\n", a);
          return 0;
      }
    `;

    const root = await parseC(code);
    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 0 });

    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("a=30\n");
  });
});
