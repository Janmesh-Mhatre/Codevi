import { describe, expect, it } from "vitest";
import { parseC } from "./helpers/interpreterTestHelpers";
import { interpretProgram } from "../../src/languages/c/interpreter/interpreter";
import type { InputResumeValue, InterpreterStep } from "../../src/languages/c/interpreter/types";
import type { CValue } from "../../src/languages/c/interpreter/values";

/** Drives interpretProgram to completion, feeding `inputs` (in order)
 * into every input-request it hits and accumulating everything it
 * prints — a real end-to-end run through the pause/resume machinery,
 * not a mock of it. */
function runProgram(rootNode: Parameters<typeof interpretProgram>[0], inputs: CValue[] = [], maxSteps = 20_000) {
  const generator = interpretProgram(rootNode);
  const steps: InterpreterStep[] = [];
  let output = "";
  let inputIndex = 0;
  let resume: InputResumeValue | undefined;
  let count = 0;
  try {
    let next = generator.next(resume);
    while (!next.done) {
      count++;
      if (count > maxSteps) return { steps, output, timedOut: true as const };
      const step = next.value;
      steps.push(step);
      if (step.kind === "output") {
        output += step.output ?? "";
        resume = undefined;
      } else if (step.kind === "input-request") {
        const value = inputs[inputIndex];
        inputIndex++;
        resume = value ? { cancelled: false, value } : { cancelled: true };
      } else {
        resume = undefined;
      }
      next = generator.next(resume);
    }
    return { steps, output, result: next.value, timedOut: false as const };
  } catch (error) {
    return { steps, output, error: error as Error, timedOut: false as const };
  }
}

describe("Phase 4.1 required scenarios", () => {
  it("printf with %d specifiers (brief's exact example)", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 10;
          int y = 20;
          printf("x = %d, y = %d\\n", x, y);
          return 0;
      }
    `);
    const { output, result } = runProgram(root);
    expect(output).toBe("x = 10, y = 20\n");
    expect(result).toEqual({ type: "int", value: 0 });
  });

  it("multiple printf calls accumulate in order", async () => {
    const root = await parseC(`
      int main(void) {
          printf("Hello ");
          printf("Codevi!");
          return 0;
      }
    `);
    const { output } = runProgram(root);
    expect(output).toBe("Hello Codevi!");
  });

  it("puts prints the string plus a trailing newline", async () => {
    const root = await parseC(`
      int main(void) {
          puts("Hello Codevi");
          return 0;
      }
    `);
    const { output } = runProgram(root);
    expect(output).toBe("Hello Codevi\n");
  });

  it("putchar outputs individual characters", async () => {
    const root = await parseC(`
      int main(void) {
          putchar('A');
          putchar('\\n');
          return 0;
      }
    `);
    const { output } = runProgram(root);
    expect(output).toBe("A\n");
  });

  it("scanf pauses for input, updates the variable, and resumes", async () => {
    const root = await parseC(`
      int main(void) {
          int age;
          scanf("%d", &age);
          return age;
      }
    `);
    const { steps, result, error } = runProgram(root, [{ type: "int", value: 21 }]);
    expect(error).toBeUndefined();
    expect(result).toEqual({ type: "int", value: 21 });

    const inputStep = steps.find((s) => s.kind === "input-request");
    expect(inputStep).toBeDefined();
    expect(inputStep!.inputRequest?.specifier).toBe("d");
    expect(inputStep!.inputRequest?.source).toContain("age");
  });

  it("mixed I/O: printf, then scanf, then printf again with the scanned value (brief's exact flow)", async () => {
    const root = await parseC(`
      int main(void) {
          int age;
          printf("Enter age: ");
          scanf("%d", &age);
          printf("Your age is %d\\n", age);
          return 0;
      }
    `);
    const { output, result } = runProgram(root, [{ type: "int", value: 30 }]);
    expect(output).toBe("Enter age: Your age is 30\n");
    expect(result).toEqual({ type: "int", value: 0 });
  });

  it("cancelling a pending input produces a clean error, not a corrupted state", async () => {
    const root = await parseC(`
      int main(void) {
          int value;
          scanf("%d", &value);
          return value;
      }
    `);
    const { error, result } = runProgram(root, []); // no inputs queued -> resumes as cancelled
    expect(result).toBeUndefined();
    expect(error?.message).toMatch(/cancelled/i);
  });
});

describe("additional stdio interpreter coverage", () => {
  it("getchar pauses, returns the character code as an int", async () => {
    const root = await parseC(`
      int main(void) {
          int ch;
          ch = getchar();
          return ch;
      }
    `);
    const { result } = runProgram(root, [{ type: "char", value: 65 }]);
    expect(result).toEqual({ type: "int", value: 65 }); // 'A'
  });

  it("scanf with multiple specifiers requests each value in order", async () => {
    const root = await parseC(`
      int main(void) {
          int a;
          int b;
          scanf("%d %d", &a, &b);
          return a + b;
      }
    `);
    const { steps, result } = runProgram(root, [
      { type: "int", value: 3 },
      { type: "int", value: 4 },
    ]);
    expect(result).toEqual({ type: "int", value: 7 });
    expect(steps.filter((s) => s.kind === "input-request")).toHaveLength(2);
  });

  it("printf %s works with a string literal argument", async () => {
    const root = await parseC(`
      int main(void) {
          printf("Name: %s", "Bob");
          return 0;
      }
    `);
    const { output } = runProgram(root);
    expect(output).toBe("Name: Bob");
  });

  it("scanf %s is explicitly rejected rather than silently mishandled", async () => {
    const root = await parseC(`
      int main(void) {
          char name;
          scanf("%s", &name);
          return 0;
      }
    `);
    const { error } = runProgram(root, []);
    expect(error?.message).toMatch(/no string\/char-array variable type/);
  });

  it("printf with too few arguments fails clearly instead of printing garbage", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 5;
          printf("%d %d", x);
          return 0;
      }
    `);
    const { error } = runProgram(root);
    expect(error?.message).toMatch(/expects more arguments/);
  });

  it("an output event does not count as a pausable step boundary — Run wouldn't stop mid-statement for it", async () => {
    const root = await parseC(`
      int main(void) {
          printf("hi");
          return 0;
      }
    `);
    const { steps } = runProgram(root);
    const kinds = steps.map((s) => s.kind);
    expect(kinds).toContain("statement");
    expect(kinds).toContain("output");
  });
});
