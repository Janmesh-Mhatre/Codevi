import { vi, describe, expect, it, beforeAll, afterEach } from "vitest";
import type { Parser } from "web-tree-sitter";
import type { ExecutionState } from "../../../src/execution/models/executionTypes";
import { getParser } from "../helpers/interpreterTestHelpers";

// ExecutionEngine depends on parserService only through getCurrentTree()/
// getLastDiagnostics() (see docs/PHASE_3_EXECUTION.md -> "Clean layering").
// parserService's own WASM loading uses Vite's `?url` asset import, which
// resolves to a dev-server-relative URL rather than a real filesystem path
// when driven through Vitest's Node test context specifically — a testing-
// environment gap, not an application bug (the real `vite build` output
// was already verified to bundle and serve these files correctly, see
// docs/PHASE_2_PARSER.md). Mocking parserService at the module boundary
// tests ExecutionEngine's own scheduling/status logic for real while
// sidestepping that gap.
let mockTree: import("web-tree-sitter").Tree | null = null;
vi.mock("../../../src/parser/parserService", () => ({
  getCurrentTree: () => mockTree,
  getLastDiagnostics: () => [],
}));

const { ExecutionEngine } = await import("../../../src/execution/engine/ExecutionEngine");

async function waitFor(getState: () => ExecutionState, predicate: (state: ExecutionState) => boolean, timeoutMs = 2000): Promise<ExecutionState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`waitFor timed out; last state: ${JSON.stringify(getState())}`);
}

let parser: InstanceType<typeof Parser>;

beforeAll(async () => {
  // Reuses interpreterTestHelpers.ts's shared singleton rather than
  // calling Parser.init()/Language.load() again — see
  // docs/PHASE_5_POINTERS.md -> "A test-infrastructure crash, not an
  // application bug" for why a second independent instantiation matters.
  parser = await getParser();
});

afterEach(() => {
  mockTree?.delete();
  mockTree = null;
});

function setSource(source: string): void {
  mockTree = parser.parse(source);
}

describe("ExecutionEngine + stdio (Phase 4.1)", () => {
  it("Run produces printf output and completes, through the real async scheduler", async () => {
    setSource(`
      int main(void) {
          printf("x = %d\\n", 42);
          return 0;
      }
    `);
    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed" || s.status === "error");
    expect(finalState.status).toBe("completed");
    expect(finalState.output).toBe("x = 42\n");
  });

  it("Run pauses at scanf, exposes pendingInput, and resumes after provideInput", async () => {
    setSource(`
      int main(void) {
          int age;
          printf("Enter age: ");
          scanf("%d", &age);
          printf("Your age is %d\\n", age);
          return 0;
      }
    `);
    const engine = new ExecutionEngine();
    engine.run();

    const waiting = await waitFor(() => engine.getState(), (s) => s.status === "waiting-for-input");
    expect(waiting.output).toBe("Enter age: ");
    expect(waiting.pendingInput?.specifier).toBe("d");

    engine.provideInput("30");

    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed" || s.status === "error");
    expect(finalState.status).toBe("completed");
    expect(finalState.output).toBe("Enter age: Your age is 30\n");
    expect(finalState.currentStep?.variables.age).toEqual({ kind: "scalar", type: "int", value: 30 });
  });

  it("invalid scanf input is rejected without corrupting state, and a retry succeeds", async () => {
    setSource(`
      int main(void) {
          int value;
          scanf("%d", &value);
          return value;
      }
    `);
    const engine = new ExecutionEngine();
    engine.run();
    await waitFor(() => engine.getState(), (s) => s.status === "waiting-for-input");

    engine.provideInput("hello");
    const afterBadInput = engine.getState();
    expect(afterBadInput.status).toBe("waiting-for-input");
    expect(afterBadInput.inputError).toMatch(/whole number/);

    engine.provideInput("21");
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed" || s.status === "error");
    expect(finalState.status).toBe("completed");
    expect(finalState.returnValue).toEqual({ kind: "scalar", type: "int", value: 21 });
  });

  it("Reset clears pending input state cleanly", async () => {
    setSource(`
      int main(void) {
          int value;
          scanf("%d", &value);
          return value;
      }
    `);
    const engine = new ExecutionEngine();
    engine.run();
    await waitFor(() => engine.getState(), (s) => s.status === "waiting-for-input");

    engine.reset();
    const state = engine.getState();
    expect(state.status).toBe("idle");
    expect(state.pendingInput).toBeNull();
    expect(state.output).toBe("");

    engine.run();
    const waitingAgain = await waitFor(() => engine.getState(), (s) => s.status === "waiting-for-input");
    expect(waitingAgain.pendingInput?.specifier).toBe("d");
    engine.provideInput("5");
    const completed = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(completed.returnValue).toEqual({ kind: "scalar", type: "int", value: 5 });
  });

  it("Step Forward cannot skip a pending input request", async () => {
    setSource(`
      int main(void) {
          int value;
          scanf("%d", &value);
          return value;
      }
    `);
    const engine = new ExecutionEngine();
    engine.run();
    await waitFor(() => engine.getState(), (s) => s.status === "waiting-for-input");

    const before = engine.getState();
    engine.step();
    const after = engine.getState();
    expect(after.status).toBe("waiting-for-input");
    expect(after.stepCount).toBe(before.stepCount);
  });
});
