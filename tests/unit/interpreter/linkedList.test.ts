import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";

afterEach(cleanupParsedTrees);

describe("Phase 6.2: Interpreter Struct & Linked List Support", () => {
  it("defines struct and evaluates sizeof(struct Node)", async () => {
    const code = `
      #include <stdio.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          int sz = sizeof(struct Node);
          printf("size=%d\\n", sz);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("size=8\n");
  });

  it("supports stack struct declaration and dot (.) operator", async () => {
    const code = `
      #include <stdio.h>

      struct Point {
          int x;
          int y;
      };

      int main() {
          struct Point p;
          p.x = 10;
          p.y = 20;
          printf("x=%d, y=%d\\n", p.x, p.y);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("x=10, y=20\n");
  });

  it("allocates dynamic node with malloc and arrow (->) operator", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *node = malloc(sizeof(struct Node));
          node->data = 42;
          node->next = NULL;
          printf("data=%d\\n", node->data);
          free(node);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("data=42\n");
  });

  it("builds a 3-node linked list, traverses it, and calculates sum", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *head = malloc(sizeof(struct Node));
          head->data = 10;

          struct Node *second = malloc(sizeof(struct Node));
          second->data = 20;
          head->next = second;

          struct Node *third = malloc(sizeof(struct Node));
          third->data = 30;
          third->next = NULL;
          second->next = third;

          int sum = 0;
          struct Node *curr = head;
          while (curr != NULL) {
              sum += curr->data;
              curr = curr->next;
          }

          printf("sum=%d\\n", sum);
          free(head);
          free(second);
          free(third);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("sum=60\n");
  });

  it("throws clear error on NULL pointer dereference with arrow (->)", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *ptr = NULL;
          ptr->data = 5;
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeDefined();
    expect(outcome.error?.message).toContain("Null pointer dereference");
  });

  it("supports inserting at head and deleting a node", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *head = malloc(sizeof(struct Node));
          head->data = 20;
          head->next = NULL;

          // Insert 10 at head
          struct Node *newNode = malloc(sizeof(struct Node));
          newNode->data = 10;
          newNode->next = head;
          head = newNode;

          printf("first=%d, second=%d\\n", head->data, head->next->data);

          // Delete head
          struct Node *temp = head;
          head = head->next;
          free(temp);

          printf("new_first=%d\\n", head->data);
          free(head);
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeUndefined();
    const output = outcome.history.filter((s) => s.kind === "output").map((s) => s.output).join("");
    expect(output).toBe("first=10, second=20\nnew_first=20\n");
  });

  it("throws clear error when accessing nonexistent struct field", async () => {
    const code = `
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *node = malloc(sizeof(struct Node));
          node->val = 10;
          return 0;
      }
    `;
    const root = await parseC(code);
    expect(root.hasError).toBe(false);

    const outcome = runCollectingSteps(root);
    expect(outcome.error).toBeDefined();
    expect(outcome.error?.message).toContain('no field named "val"');
  });
});

