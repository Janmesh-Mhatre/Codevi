import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC } from "../helpers/interpreterTestHelpers";
import { interpretProgram } from "../../../src/interpreter/interpreter";
import type { InterpreterStep } from "../../../src/interpreter/types";

afterEach(cleanupParsedTrees);

function runProgram(rootNode: Parameters<typeof interpretProgram>[0], maxSteps = 20_000) {
  const generator = interpretProgram(rootNode);
  const steps: InterpreterStep[] = [];
  let output = "";
  let count = 0;
  try {
    let next = generator.next();
    while (!next.done) {
      count++;
      if (count > maxSteps) return { steps, output, timedOut: true as const };
      const step = next.value;
      steps.push(step);
      if (step.kind === "output") {
        output += step.output ?? "";
      }
      next = generator.next();
    }
    return { steps, output, result: next.value, timedOut: false as const };
  } catch (error) {
    return { steps, output, error: error as Error, timedOut: false as const };
  }
}

describe("Phase 6: Display Pointer Variable Locations Through printf()", () => {
  it("prints pointer target address vs pointer's own address with %p", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 25;
          int *p = &x;
          printf("target=%p, own=%p\\n", p, &p);
          return 0;
      }
    `);
    const { output, error } = runProgram(root);
    expect(error).toBeUndefined();
    expect(output).toBe("target=S001, own=S002\n");
  });

  it("handles pointer-to-pointer addresses consistently", async () => {
    const root = await parseC(`
      int main(void) {
          int x = 25;
          int *p = &x;
          int **pp = &p;
          printf("p=%p, &p=%p, pp=%p, *pp=%p\\n", p, &p, pp, *pp);
          return 0;
      }
    `);
    const { output, error } = runProgram(root);
    expect(error).toBeUndefined();
    // p = S001 (address of x)
    // &p = S002 (address of p)
    // pp = S002 (address of p stored in pp)
    // *pp = S001 (value stored in p, which is address of x)
    expect(output).toBe("p=S001, &p=S002, pp=S002, *pp=S001\n");
  });

  it("prints heap target address and pointer's own stack address for malloc pointers", async () => {
    const root = await parseC(`
      int main(void) {
          int *p = malloc(sizeof(int));
          printf("p=%p, &p=%p\\n", p, &p);
          free(p);
          return 0;
      }
    `);
    const { output, error } = runProgram(root);
    expect(error).toBeUndefined();
    // p points to heap block H001, p's own stack cell is S001
    expect(output).toBe("p=H001, &p=S001\n");
  });

  it("prints array element address and pointer's own stack address", async () => {
    const root = await parseC(`
      int main(void) {
          int arr[3] = {10, 20, 30};
          int *p = &arr[1];
          printf("p=%p, &p=%p\\n", p, &p);
          return 0;
      }
    `);
    const { output, error } = runProgram(root);
    expect(error).toBeUndefined();
    // arr is S001, p is S002, p points to S001[1]
    expect(output).toBe("p=S001[1], &p=S002\n");
  });

  it("prints direct address-of scalar variable with %p matching pointer target", async () => {
    const root = await parseC(`
      int main(void) {
          int a = 100;
          int *ptr = &a;
          printf("&a=%p, ptr=%p, &ptr=%p\\n", &a, ptr, &ptr);
          return 0;
      }
    `);
    const { output, error } = runProgram(root);
    expect(error).toBeUndefined();
    expect(output).toBe("&a=S001, ptr=S001, &ptr=S002\n");
  });
});
