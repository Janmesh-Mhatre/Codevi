import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";

afterEach(cleanupParsedTrees);

describe("switch, case, default, break, and continue support", () => {
  // =========================================================================
  // 1. BASIC SWITCH MATCHING & BREAK
  // =========================================================================
  describe("Basic switch matching and break", () => {
    it("executes the matching case and exits upon break", async () => {
      const root = await parseC(`
        int main() {
            int x = 2;
            int result = 0;
            switch (x) {
                case 1:
                    result = 10;
                    break;
                case 2:
                    result = 20;
                    break;
                case 3:
                    result = 30;
                    break;
            }
            return result;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 20 });
    });

    it("does nothing if no case matches and no default is provided", async () => {
      const root = await parseC(`
        int main() {
            int x = 99;
            int result = 5;
            switch (x) {
                case 1:
                    result = 10;
                    break;
                case 2:
                    result = 20;
                    break;
            }
            return result;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 5 });
    });

    it("handles character literal cases matching ASCII values", async () => {
      const root = await parseC(`
        int main() {
            char op = '+';
            int result = 0;
            switch (op) {
                case '+':
                    result = 1;
                    break;
                case '-':
                    result = 2;
                    break;
            }
            return result;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 1 });
    });
  });

  // =========================================================================
  // 2. FALLTHROUGH BEHAVIOR
  // =========================================================================
  describe("Fallthrough behavior", () => {
    it("falls through multiple cases sequentially when no break is present", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            int sum = 0;
            switch (x) {
                case 1:
                    sum += 1;
                case 2:
                    sum += 2;
                case 3:
                    sum += 4;
                    break;
                case 4:
                    sum += 8;
            }
            return sum;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // 1 + 2 + 4 = 7; stops before case 4 due to break in case 3
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 7 });
    });

    it("supports grouped empty case labels sharing an execution block", async () => {
      const root = await parseC(`
        int main() {
            int x = 2;
            int category = 0;
            switch (x) {
                case 1:
                case 2:
                case 3:
                    category = 100;
                    break;
                case 4:
                case 5:
                    category = 200;
                    break;
            }
            return category;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 100 });
    });

    it("falls through all the way to the end of the switch block if no break exists", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            int a = 0;
            switch (x) {
                case 1:
                    a += 10;
                case 2:
                    a += 20;
            }
            return a;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 30 });
    });
  });

  // =========================================================================
  // 3. DEFAULT LABEL HANDLING & POSITIONING
  // =========================================================================
  describe("Default label handling and positioning", () => {
    it("executes default when no case matches", async () => {
      const root = await parseC(`
        int main() {
            int x = 50;
            int result = 0;
            switch (x) {
                case 1:
                    result = 1;
                    break;
                case 2:
                    result = 2;
                    break;
                default:
                    result = 999;
                    break;
            }
            return result;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 999 });
    });

    it("default positioned before other cases executes when no case matches and falls through", async () => {
      const root = await parseC(`
        int main() {
            int x = 99;
            int val = 0;
            switch (x) {
                default:
                    val += 10;
                case 1:
                    val += 5;
                    break;
                case 2:
                    val += 1;
                    break;
            }
            return val;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // No case matches 99 -> enters default (val=10) -> falls through to case 1 (val=15) -> break
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 15 });
    });

    it("default positioned before other cases is completely skipped if a case matches", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            int val = 0;
            switch (x) {
                default:
                    val += 100;
                    break;
                case 1:
                    val += 25;
                    break;
                case 2:
                    val += 50;
                    break;
            }
            return val;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // Case 1 matches -> default (at top) is bypassed!
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 25 });
    });

    it("default in the middle of cases executes and falls through when no case matches", async () => {
      const root = await parseC(`
        int main() {
            int x = 42;
            int val = 0;
            switch (x) {
                case 1:
                    val = 1;
                    break;
                default:
                    val += 10;
                case 2:
                    val += 20;
                    break;
                case 3:
                    val += 30;
                    break;
            }
            return val;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // Jumps to default (val=10) -> falls through to case 2 (val=30) -> break
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 30 });
    });
  });

  // =========================================================================
  // 4. BREAK SCOPING & NESTED CONSTRUCTS
  // =========================================================================
  describe("Break scoping in nested constructs", () => {
    it("break inside a loop nested in a switch only exits the loop", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            int y = 0;
            switch (x) {
                case 1:
                    while (1) {
                        y++;
                        if (y == 3) break; // exits while loop, NOT switch
                    }
                    y += 10; // executes after while loop breaks
                    break;   // exits switch
                case 2:
                    y += 100;
                    break;
            }
            return y;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 13 });
    });

    it("break inside a switch nested in a loop only exits the switch", async () => {
      const root = await parseC(`
        int main() {
            int sum = 0;
            for (int i = 0; i < 3; i++) {
                switch (i) {
                    case 0:
                        sum += 1;
                        break; // exits switch, loop continues
                    case 1:
                        sum += 10;
                        break; // exits switch, loop continues
                    default:
                        sum += 100;
                        break; // exits switch, loop continues
                }
                sum += 1000; // executed on each loop iteration
            }
            return sum;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // i=0: 1 + 1000 = 1001
      // i=1: 1001 + 10 + 1000 = 2011
      // i=2: 2011 + 100 + 1000 = 3111
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 3111 });
    });

    it("break inside nested switches exits only the innermost switch", async () => {
      const root = await parseC(`
        int main() {
            int a = 1;
            int b = 2;
            int res = 0;
            switch (a) {
                case 1:
                    switch (b) {
                        case 2:
                            res += 20;
                            break; // exits inner switch
                    }
                    res += 50; // executes in outer switch
                    break;     // exits outer switch
            }
            return res;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 70 });
    });
  });

  // =========================================================================
  // 5. CONTINUE IN LOOPS AND SWITCHES
  // =========================================================================
  describe("Continue behavior in loops and switches", () => {
    it("continue in a for loop correctly re-runs update and condition", async () => {
      const root = await parseC(`
        int main() {
            int count = 0;
            for (int i = 0; i < 5; i++) {
                if (i == 2) continue; // skips count increment, runs i++
                count++;
            }
            return count;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 4 });
    });

    it("continue inside a switch nested in a loop skips remaining loop body and triggers next iteration", async () => {
      const root = await parseC(`
        int main() {
            int sum = 0;
            for (int i = 0; i < 4; i++) {
                switch (i) {
                    case 1:
                        continue; // continues the FOR loop, skipping sum += 10
                    case 2:
                        break;    // breaks switch, executes sum += 10
                }
                sum += 10;
            }
            return sum;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // i=0: switch misses, sum += 10 (sum=10)
      // i=1: continue skips sum += 10, triggers i++
      // i=2: break exits switch, sum += 10 (sum=20)
      // i=3: switch misses, sum += 10 (sum=30)
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 30 });
    });

    it("continue inside a switch nested in a while loop continues the while loop", async () => {
      const root = await parseC(`
        int main() {
            int i = 0;
            int sum = 0;
            while (i < 4) {
                i++;
                switch (i) {
                    case 2:
                        continue; // skips sum += i
                }
                sum += i;
            }
            return sum;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      // i=1: sum += 1 (sum=1)
      // i=2: continue skips sum += 2
      // i=3: sum += 3 (sum=4)
      // i=4: sum += 4 (sum=8)
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 8 });
    });
  });

  // =========================================================================
  // 6. SCOPING & DECLARATIONS IN SWITCH
  // =========================================================================
  describe("Scoping and declarations in switch", () => {
    it("allows variable declarations inside compound blocks within cases", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            int out = 0;
            switch (x) {
                case 1: {
                    int temp = 42;
                    out = temp;
                    break;
                }
                case 2: {
                    int temp = 84;
                    out = temp;
                    break;
                }
            }
            return out;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 42 });
    });

    it("allows variable declaration directly inside switch body before cases", async () => {
      const root = await parseC(`
        int main() {
            int x = 2;
            int out = 0;
            switch (x) {
                int shared = 100;
                case 1:
                    out = shared;
                    break;
                case 2:
                    out = shared + 5;
                    break;
            }
            return out;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toEqual({ kind: "scalar", type: "int", value: 105 });
    });
  });

  // =========================================================================
  // 7. STEP RECORDING & SOURCE HIGHLIGHTING
  // =========================================================================
  describe("Step recording and source highlighting", () => {
    it("yields steps on switch and matched case labels for Monaco line highlighting", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            switch (x) {
                case 1:
                    x = 10;
                    break;
            }
            return x;
        }
      `);
      const { history } = runCollectingSteps(root);
      const descriptions = history.map((s) => s.description);

      expect(descriptions.some((d) => d.startsWith("switch"))).toBe(true);
      expect(descriptions.some((d) => d.includes("case 1:"))).toBe(true);
      expect(descriptions.some((d) => d.includes("break;"))).toBe(true);
    });
  });

  // =========================================================================
  // 8. ERROR CASES & GUARDS
  // =========================================================================
  describe("Semantic error handling and guards", () => {
    it("raises an error on duplicate case values", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            switch (x) {
                case 1:
                    break;
                case 1:
                    break;
            }
            return 0;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeInstanceOf(InterpreterError);
      expect(outcome.error?.message).toContain("duplicate case value");
    });

    it("raises an error on multiple default labels", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            switch (x) {
                default:
                    break;
                default:
                    break;
            }
            return 0;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeInstanceOf(InterpreterError);
      expect(outcome.error?.message).toContain("multiple default labels");
    });

    it("raises an error on break outside of loop or switch", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            break;
            return x;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeInstanceOf(InterpreterError);
      expect(outcome.error?.message).toContain("break statement not within a loop or switch");
    });

    it("raises an error on continue outside of loop", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            continue;
            return x;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeInstanceOf(InterpreterError);
      expect(outcome.error?.message).toContain("continue statement not within a loop");
    });

    it("raises an error on continue inside switch that is not inside any loop", async () => {
      const root = await parseC(`
        int main() {
            int x = 1;
            switch (x) {
                case 1:
                    continue; // invalid because there is no enclosing loop
            }
            return 0;
        }
      `);
      const outcome = run(root);
      expect(outcome.error).toBeInstanceOf(InterpreterError);
      expect(outcome.error?.message).toContain("continue statement not within a loop");
    });
  });
});
