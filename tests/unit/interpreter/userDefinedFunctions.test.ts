import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";

afterEach(cleanupParsedTrees);

describe("User-Defined Functions & Global Scope in Interpreter", () => {
  it("executes basic scalar function with return value", async () => {
    const code = `
      #include <stdio.h>

      int add(int a, int b) {
          return a + b;
      }

      int main() {
          int result = add(15, 27);
          printf("result=%d\\n", result);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("result=42\n");
  });

  it("executes zero-argument function", async () => {
    const code = `
      #include <stdio.h>

      int getMagicNumber() {
          return 42;
      }

      int main() {
          int val = getMagicNumber();
          printf("val=%d\\n", val);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("val=42\n");
  });

  it("executes void function with return;", async () => {
    const code = `
      #include <stdio.h>

      void greet(int early) {
          if (early) {
              printf("early\\n");
              return;
          }
          printf("late\\n");
      }

      int main() {
          greet(1);
          greet(0);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("early\nlate\n");
  });

  it("handles struct pointer return type and heap survival (createnode)", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      struct Node *createnode(int value) {
          struct Node *newnode;
          newnode = (struct Node *)malloc(sizeof(struct Node));
          newnode->data = value;
          newnode->next = NULL;
          return newnode;
      }

      int main() {
          struct Node *n = createnode(100);
          printf("data=%d, nextIsNull=%d\\n", n->data, n->next == NULL);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toContain("data=100, nextIsNull=1\n");
  });

  it("passes struct pointer as parameter (memfail)", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int memfail(struct Node *newnode) {
          return (newnode == NULL);
      }

      int main() {
          struct Node *nullNode = NULL;
          struct Node *validNode = (struct Node *)malloc(sizeof(struct Node));
          printf("nullFail=%d, validFail=%d\\n", memfail(nullNode), memfail(validNode));
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toContain("nullFail=1, validFail=0\n");
  });

  it("supports global variable access across functions (head, isEmpty, insertbeg)", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      struct Node *head = NULL;

      int isEmpty() {
          return (head == NULL);
      }

      void insertbeg(int value) {
          struct Node *newnode = (struct Node *)malloc(sizeof(struct Node));
          newnode->data = value;
          newnode->next = head;
          head = newnode;
      }

      int main() {
          printf("emptyBefore=%d\\n", isEmpty());
          insertbeg(10);
          insertbeg(20);
          printf("emptyAfter=%d, headData=%d, nextData=%d\\n", isEmpty(), head->data, head->next->data);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toContain("emptyBefore=1\nemptyAfter=0, headData=20, nextData=10\n");
  });

  it("supports nested function calls: foo(bar(x))", async () => {
    const code = `
      #include <stdio.h>

      int doubleVal(int x) {
          return x * 2;
      }

      int addTen(int x) {
          return x + 10;
      }

      int main() {
          int val = addTen(doubleVal(5));
          printf("val=%d\\n", val);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("val=20\n");
  });

  it("validates argument count mismatch", async () => {
    const code = `
      #include <stdio.h>

      int add(int a, int b) {
          return a + b;
      }

      int main() {
          int x = add(1);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeDefined();
    expect(outcome.error?.message).toContain('Function "add" expects 2 argument(s) but got 1');
  });

  it("throws clear diagnostic for undefined function call", async () => {
    const code = `
      int main() {
          nonexistentFunc(1, 2);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeDefined();
    expect(outcome.error?.message).toContain('Undefined function: no function named "nonexistentFunc" is defined');
  });

  it("executes full user linked-list program without error", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node{
          int data;
          struct Node *next;
      };

      struct Node *head = NULL;

      struct Node *createnode(int value) {
          struct Node *newnode;
          newnode = (struct Node *)malloc(sizeof(struct Node));
          newnode->data = value;
          newnode->next = NULL;
          return newnode;
      }

      int memfail(struct Node *newnode){
          return(newnode == NULL);
      }

      int isEmpty(){
          return(head == NULL);
      }

      void insertbeg(int value){
          struct Node *newnode = createnode(value);

          if(memfail(newnode)){
              printf("\\nMemory Allocation Failed.");
              return;
          }

          newnode->next = head;
          head = newnode;
          printf("\\nInserted %d successfully.", value);
      }

      int main() {
          printf("Initial isEmpty: %d", isEmpty());
          insertbeg(10);
          insertbeg(20);
          printf("\\nFinal isEmpty: %d, head: %d", isEmpty(), head->data);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toContain("Initial isEmpty: 1");
    expect(output).toContain("Inserted 10 successfully.");
    expect(output).toContain("Inserted 20 successfully.");
    expect(output).toContain("Final isEmpty: 0, head: 20");
  });
});
