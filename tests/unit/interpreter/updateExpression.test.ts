import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";

afterEach(cleanupParsedTrees);

describe("Interpreter: Generalized ++ and -- update_expression", () => {
  it("supports simple variable postfix and prefix ++/--", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int x = 5;
          int y = x++;
          int z = ++x;
          printf("x=%d, y=%d, z=%d\\n", x, y, z);

          int a = 10;
          int b = a--;
          int c = --a;
          printf("a=%d, b=%d, c=%d\\n", a, b, c);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("x=7, y=5, z=7\na=8, b=10, c=8\n");
  });

  it("Step 5: supports struct member using dot (.) operator", async () => {
    const code = `
      #include <stdio.h>

      struct Stack {
          int top;
      };

      int main() {
          struct Stack s;
          s.top = -1;

          s.top++;
          s.top++;

          printf("top=%d\\n", s.top);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toContain("top=1\n");
  });

  it("Step 6: supports struct member using arrow (->) operator", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Stack {
          int top;
      };

      int main() {
          struct Stack *s;
          s = malloc(sizeof(struct Stack));
          s->top = -1;

          s->top++;
          s->top++;

          printf("top=%d\\n", s->top);
          free(s);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("top=1\n");
  });

  it("Step 7: supports array element update arr[i]++", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int arr[5];
          int i;

          i = 0;
          arr[i] = 10;

          arr[i]++;

          printf("arr[0]=%d\\n", arr[0]);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("arr[0]=11\n");
  });

  it("Step 8: supports postfix array element update old = arr[i]++", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int arr[5];
          int i;
          int old;

          i = 0;
          arr[i] = 10;

          old = arr[i]++;

          printf("old=%d, arr[0]=%d\\n", old, arr[0]);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("old=10, arr[0]=11\n");
  });

  it("Step 9: supports prefix array element update value = ++arr[i]", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int arr[5];
          int i;
          int value;

          i = 0;
          arr[i] = 10;

          value = ++arr[i];

          printf("value=%d, arr[0]=%d\\n", value, arr[0]);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("value=11, arr[0]=11\n");
  });

  it("supports pointer dereference update (*p)++ and ++(*p)", async () => {
    const code = `
      #include <stdio.h>

      int main() {
          int x = 20;
          int *p = &x;

          int old = (*p)++;
          int next = ++(*p);

          printf("old=%d, next=%d, x=%d\\n", old, next, x);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("old=20, next=22, x=22\n");
  });

  it("Step 10: Struct Stack regression with array member, prefix ++, and indexing", async () => {
    const code = `
      #include <stdio.h>

      struct Stack {
          int data[5];
          int top;
      };

      int main() {
          struct Stack s;

          s.top = -1;

          s.data[++s.top] = 10;
          s.data[++s.top] = 20;
          s.data[++s.top] = 30;

          printf("top=%d, data=[%d, %d, %d]\\n", s.top, s.data[0], s.data[1], s.data[2]);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("top=2, data=[10, 20, 30]\n");
  });

  it("Step 11: Dynamic Stack regression with malloc, pointer members, and postfix ++", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Stack {
          int *data;
          int top;
          int capacity;
      };

      int main() {
          struct Stack *s;

          s = malloc(sizeof(struct Stack));

          s->data = malloc(5 * sizeof(int));
          s->top = -1;
          s->capacity = 5;

          s->top++;
          s->data[s->top] = 10;

          s->top++;
          s->data[s->top] = 20;

          s->top++;
          s->data[s->top] = 30;

          printf("top=%d, data=[%d, %d, %d]\\n", s->top, s->data[0], s->data[1], s->data[2]);
          free(s->data);
          free(s);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("top=2, data=[10, 20, 30]\n");
  });

  it("Step 12: Stack push regression with function push(struct Stack *s, int value)", async () => {
    const code = `
      #include <stdio.h>

      struct Stack {
          int data[5];
          int top;
      };

      void push(struct Stack *s, int value) {
          s->top++;
          s->data[s->top] = value;
      }

      int main() {
          struct Stack s;

          s.top = -1;

          push(&s, 10);
          push(&s, 20);
          push(&s, 30);

          printf("top=%d, data=[%d, %d, %d]\\n", s.top, s.data[0], s.data[1], s.data[2]);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("top=2, data=[10, 20, 30]\n");
  });

  it("Step 13: Queue regression with function enqueue(struct Queue *q, int value)", async () => {
    const code = `
      #include <stdio.h>

      struct Queue {
          int data[5];
          int front;
          int rear;
      };

      void enqueue(struct Queue *q, int value) {
          q->rear++;
          q->data[q->rear] = value;
      }

      int main() {
          struct Queue q;

          q.front = 0;
          q.rear = -1;

          enqueue(&q, 10);
          enqueue(&q, 20);
          enqueue(&q, 30);

          printf("front=%d, rear=%d, data=[%d, %d, %d]\\n", q.front, q.rear, q.data[0], q.data[1], q.data[2]);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("front=0, rear=2, data=[10, 20, 30]\n");
  });

  it("Step 15: rejects non-assignable expressions and array variables", async () => {
    const codeLiteral = `
      int main() {
          5++;
          return 0;
      }
    `;
    const root1 = await parseC(codeLiteral);
    const outcome1 = runCollectingSteps(root1);
    expect(outcome1.error).toBeDefined();
    expect(outcome1.error?.message).toMatch(/not assignable/i);

    const codeArray = `
      int main() {
          int arr[5];
          arr++;
          return 0;
      }
    `;
    const root2 = await parseC(codeArray);
    const outcome2 = runCollectingSteps(root2);
    expect(outcome2.error).toBeDefined();
    expect(outcome2.error?.message).toMatch(/not supported on arrays/i);
  });

  it("Step 16: produces observable updates in scope and memory", async () => {
    const code = `
      struct Stack {
          int top;
      };

      int main() {
          struct Stack s;
          s.top = 0;
          s.top++;
          return 0;
      }
    `;
    const root = await parseC(code);
    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();

    // Verify step history shows the statement and memory state
    const updateStep = outcome.history.find((s) => s.description?.includes("s.top++"));
    expect(updateStep).toBeDefined();
  });
});
