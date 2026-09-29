import { describe, it, expect } from "vitest";
import { parseC, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { toExecutionStep } from "../../../src/execution/engine/ExecutionEngine";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";

describe("Phase 6.3: Detect Array Stack/Queue Regardless of Declaration Scope", () => {
  // ==========================================
  // STACK TESTS
  // ==========================================

  it("1. Global array + global top", async () => {
    const code = `
      int stack[5];
      int top = -1;

      int main() {
          stack[0] = 10;
          stack[1] = 20;
          stack[2] = 30;
          top = 2;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.name).toContain("Stack");
    const node = stackItem!.nodes[0];
    expect(node.metadata?.topIndex).toBe(2);
    expect(node.metadata?.adtKind).toBe("stack");
    expect(node.slots[2].value).toEqual({ kind: "scalar", type: "int", value: 30 });
    expect(node.slots[2].activeIndexTags).toContain("top ▾");
  });

  it("2. Local array + local top", async () => {
    const code = `
      int main() {
          int stack[5];
          int top = -1;

          stack[++top] = 10;
          stack[++top] = 20;
          stack[++top] = 30;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.name).toContain("Stack");
    const node = stackItem!.nodes[0];
    expect(node.metadata?.topIndex).toBe(2);
    expect(node.slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(node.slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
    expect(node.slots[2].value).toEqual({ kind: "scalar", type: "int", value: 30 });
    expect(node.slots[2].activeIndexTags).toContain("top ▾");
  });

  it("3. Global array + functions", async () => {
    const code = `
      int stack[5];
      int top = -1;

      void push(int value) {
          top = top + 1;
          stack[top] = value;
      }

      int pop() {
          int value;

          value = stack[top];
          top = top - 1;

          return value;
      }

      int main() {
          push(10);
          push(20);
          push(30);

          pop();

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.name).toContain("Stack");
    const node = stackItem!.nodes[0];
    // After pushing 10, 20, 30 and popping once, top should be 1 with value 20
    expect(node.metadata?.topIndex).toBe(1);
    expect(node.slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
    expect(node.slots[1].activeIndexTags).toContain("top ▾");
  });

  it("4. Local array + functions", async () => {
    const code = `
      int main() {
          int stack[5];
          int top = -1;

          stack[top + 1] = 10;
          top = top + 1;

          stack[top + 1] = 20;
          top = top + 1;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    const node = stackItem!.nodes[0];
    expect(node.metadata?.topIndex).toBe(1);
    expect(node.slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("5. Global stack with push/pop (inspected mid-execution inside function)", async () => {
    const code = `
      int stack[5];
      int top = -1;

      void push(int value) {
          top = top + 1;
          stack[top] = value;
      }

      int main() {
          push(10);
          push(20);
          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);

    // Find a step where we are inside push(20)
    const insidePushStep = history.find(
      (s) => s.functionName === "push" && s.callDepth === 2 && s.variables.value?.value === 20
    );
    expect(insidePushStep).toBeDefined();

    const execStep = toExecutionStep(insidePushStep!);
    const graph = extractStructureGraph(execStep);

    // Global stack must be recognized even when active frame is inside push()
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.name).toContain("Stack");
  });

  it("6. Local stack with push/pop operations", async () => {
    const code = `
      int main() {
          int stack[4];
          int top = -1;

          top = top + 1;
          stack[top] = 100;

          top = top + 1;
          stack[top] = 200;

          top = top - 1;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.nodes[0].metadata?.topIndex).toBe(0);
    expect(stackItem!.nodes[0].slots[0].value).toEqual({ kind: "scalar", type: "int", value: 100 });
  });

  // ==========================================
  // QUEUE TESTS
  // ==========================================

  it("7. Global array + global front/rear", async () => {
    const code = `
      int queue[5];
      int front = 0;
      int rear = -1;

      int main() {
          rear = rear + 1;
          queue[rear] = 10;

          rear = rear + 1;
          queue[rear] = 20;

          rear = rear + 1;
          queue[rear] = 30;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    expect(queueItem!.name).toContain("Queue");
    const node = queueItem!.nodes[0];
    expect(node.metadata?.frontIndex).toBe(0);
    expect(node.metadata?.rearIndex).toBe(2);
    expect(node.metadata?.adtKind).toBe("queue");
    expect(node.slots[0].activeIndexTags).toContain("front ▾");
    expect(node.slots[2].activeIndexTags).toContain("rear ▾");
  });

  it("8. Local array + local front/rear", async () => {
    const code = `
      int main() {
          int queue[5];
          int front = 0;
          int rear = -1;

          rear = rear + 1;
          queue[rear] = 10;

          rear = rear + 1;
          queue[rear] = 20;

          rear = rear + 1;
          queue[rear] = 30;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    const node = queueItem!.nodes[0];
    expect(node.metadata?.frontIndex).toBe(0);
    expect(node.metadata?.rearIndex).toBe(2);
  });

  it("9. Global queue + functions", async () => {
    const code = `
      int queue[5];
      int front = 0;
      int rear = -1;

      void enqueue(int value) {
          rear = rear + 1;
          queue[rear] = value;
      }

      int dequeue() {
          int value;

          value = queue[front];
          front = front + 1;

          return value;
      }

      int main() {
          enqueue(10);
          enqueue(20);
          enqueue(30);

          dequeue();

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    const node = queueItem!.nodes[0];
    // After 3 enqueues and 1 dequeue: front = 1, rear = 2
    expect(node.metadata?.frontIndex).toBe(1);
    expect(node.metadata?.rearIndex).toBe(2);
    expect(node.slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
    expect(node.slots[2].value).toEqual({ kind: "scalar", type: "int", value: 30 });
  });

  it("10. Local queue + direct assignment", async () => {
    const code = `
      int main() {
          int queue[5];
          int front = 0;
          int rear = -1;

          queue[0] = 10;
          queue[1] = 20;
          queue[2] = 30;

          rear = 2;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    const node = queueItem!.nodes[0];
    expect(node.metadata?.frontIndex).toBe(0);
    expect(node.metadata?.rearIndex).toBe(2);
  });

  it("11. Global queue with enqueue/dequeue mid-execution", async () => {
    const code = `
      int queue[5];
      int front = 0;
      int rear = -1;

      void enqueue(int value) {
          rear = rear + 1;
          queue[rear] = value;
      }

      int main() {
          enqueue(50);
          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);

    // Step inside enqueue
    const insideEnqueue = history.find(
      (s) => s.functionName === "enqueue" && s.callDepth === 2
    );
    expect(insideEnqueue).toBeDefined();

    const execStep = toExecutionStep(insideEnqueue!);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    expect(queueItem!.name).toContain("Queue");
  });

  it("12. Local queue with enqueue/dequeue operations", async () => {
    const code = `
      int main() {
          int queue[4];
          int front = 0;
          int rear = -1;

          rear = rear + 1;
          queue[rear] = 11;

          rear = rear + 1;
          queue[rear] = 22;

          front = front + 1;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    expect(queueItem!.nodes[0].metadata?.frontIndex).toBe(1);
    expect(queueItem!.nodes[0].metadata?.rearIndex).toBe(1);
    expect(queueItem!.nodes[0].slots[1].value).toEqual({ kind: "scalar", type: "int", value: 22 });
  });

  // ==========================================
  // STRUCT REGRESSION TESTS
  // ==========================================

  it("13. Local struct Stack", async () => {
    const code = `
      struct Stack {
          int data[5];
          int top;
      };

      int main() {
          struct Stack s;
          s.top = -1;
          s.top++;
          s.data[s.top] = 10;
          s.top++;
          s.data[s.top] = 20;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.nodes[0].metadata?.topIndex).toBe(1);
    expect(stackItem!.nodes[0].slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(stackItem!.nodes[0].slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("14. malloc struct Stack", async () => {
    const code = `
      #include <stdlib.h>

      struct Stack {
          int data[5];
          int top;
      };

      int main() {
          struct Stack *s;
          s = malloc(sizeof(struct Stack));
          s->top = -1;
          s->top++;
          s->data[s->top] = 10;
          s->top++;
          s->data[s->top] = 20;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const returnStep = history.find((s) => s.description.startsWith("return")) ?? history[history.length - 1];
    const execStep = toExecutionStep(returnStep);
    const graph = extractStructureGraph(execStep);

    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.nodes[0].metadata?.topIndex).toBe(1);
    expect(stackItem!.nodes[0].slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(stackItem!.nodes[0].slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("15. Local struct Queue", async () => {
    const code = `
      struct Queue {
          int data[5];
          int front;
          int rear;
      };

      int main() {
          struct Queue q;
          q.front = 0;
          q.rear = -1;
          q.rear++;
          q.data[q.rear] = 10;
          q.rear++;
          q.data[q.rear] = 20;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const lastStep = history[history.length - 1];
    const execStep = toExecutionStep(lastStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    expect(queueItem!.nodes[0].metadata?.frontIndex).toBe(0);
    expect(queueItem!.nodes[0].metadata?.rearIndex).toBe(1);
    expect(queueItem!.nodes[0].slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(queueItem!.nodes[0].slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
  });

  it("16. malloc struct Queue", async () => {
    const code = `
      #include <stdlib.h>

      struct Queue {
          int data[5];
          int front;
          int rear;
      };

      int main() {
          struct Queue *q;
          q = malloc(sizeof(struct Queue));
          q->front = 0;
          q->rear = -1;
          q->rear++;
          q->data[q->rear] = 10;
          q->rear++;
          q->data[q->rear] = 20;

          return 0;
      }
    `;
    const root = await parseC(code);
    const { history } = runCollectingSteps(root);
    const returnStep = history.find((s) => s.description.startsWith("return")) ?? history[history.length - 1];
    const execStep = toExecutionStep(returnStep);
    const graph = extractStructureGraph(execStep);

    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    expect(queueItem!.nodes[0].metadata?.frontIndex).toBe(0);
    expect(queueItem!.nodes[0].metadata?.rearIndex).toBe(1);
    expect(queueItem!.nodes[0].slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(queueItem!.nodes[0].slots[1].value).toEqual({ kind: "scalar", type: "int", value: 20 });
  });
});
