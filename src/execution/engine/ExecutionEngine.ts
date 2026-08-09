import { interpretProgram } from "../../languages/c/interpreter/interpreter";
import type { CValue } from "../../languages/c/interpreter/values";
import type { InterpreterStep } from "../../languages/c/interpreter/types";
import { getCurrentTree, getLastDiagnostics } from "../../services/parserService";
import { scope } from "../../utils/logger";
import {
  INITIAL_EXECUTION_STATE,
  type ExecutionLogEntry,
  type ExecutionState,
  type ExecutionStep,
} from "../models/executionTypes";

const log = scope("executionEngine");

/** Hard ceiling on total steps in a single run — what actually stops
 * `while (1) {}` rather than letting it run forever. Generous for any
 * realistic (if inefficient) student loop, small enough to resolve in
 * well under a second of wall-clock time. See
 * docs/PHASE_3_EXECUTION.md → "Runaway execution". */
const MAX_EXECUTION_STEPS = 200_000;

/** How long a single synchronous burst of stepping is allowed to run
 * before yielding back to the browser via setTimeout — keeps a Run in
 * progress from ever blocking a frame, independent of the step count
 * above (that one's about eventual termination, this one's about
 * responsiveness). */
const TIME_BUDGET_MS = 12;

const MAX_LOG_ENTRIES = 50;

let logIdCounter = 0;

function toExecutionStep(step: InterpreterStep): ExecutionStep {
  const variables: ExecutionStep["variables"] = {};
  for (const [name, value] of Object.entries(step.variables)) {
    variables[name] = { type: value.type, value: value.value };
  }
  return {
    line: step.node.startPosition.row,
    column: step.node.startPosition.column,
    endLine: step.node.endPosition.row,
    endColumn: step.node.endPosition.column,
    astNodeType: step.node.type,
    functionName: step.functionName,
    callDepth: step.callDepth,
    description: step.description,
    variables,
  };
}

type Listener = (state: ExecutionState) => void;

/**
 * Owns the interpreter's lifecycle: Idle -> Preparing -> Running/Paused
 * -> Completed/Error, plus Run/Pause/Step/Reset. Framework-independent
 * by design (see docs/PHASE_3_EXECUTION.md → "Clean layering") — its
 * only dependency is parserService (also framework-independent), and it
 * exposes state via plain subscribe/getState rather than anything
 * React-shaped. useExecutionEngine.ts is what bridges this to Zustand.
 */
export class ExecutionEngine {
  private state: ExecutionState = INITIAL_EXECUTION_STATE;
  private generator: Generator<InterpreterStep, CValue | undefined, void> | null = null;
  private readonly listeners = new Set<Listener>();
  /** Bumped on every reset/fresh prepare so a setTimeout-chained run
   * loop from a previous run can recognize it's stale and stop, even
   * though it can't be cancelled directly once scheduled. */
  private runToken = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ExecutionState {
    return this.state;
  }

  private setState(patch: Partial<ExecutionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private appendLog(message: string, level: ExecutionLogEntry["level"]): void {
    const entry: ExecutionLogEntry = { id: `log-${++logIdCounter}`, message, level };
    const nextLog = [...this.state.log, entry].slice(-MAX_LOG_ENTRIES);
    this.setState({ log: nextLog });
  }

  /** Run: starts fresh from Idle/Completed/Error, or resumes a free-run
   * from Paused. No-op while already Running/Preparing. */
  run(): void {
    if (this.state.status === "running" || this.state.status === "preparing") return;
    if (this.state.status !== "paused" && !this.prepare()) return;

    this.appendLog(this.state.stepCount > 0 ? "Execution resumed" : "Execution started", "info");
    this.setState({ status: "running" });
    this.runToken++;
    this.scheduleChunk(this.runToken);
  }

  pause(): void {
    if (this.state.status !== "running") return;
    this.setState({ status: "paused" });
    const line = this.state.currentStep ? `, line ${this.state.currentStep.line + 1}` : "";
    this.appendLog(`Execution paused${line}`, "info");
  }

  /** Step Forward: from Idle/Completed/Error this starts execution and
   * takes exactly one step (landing Paused); from Paused it takes one
   * more step. No-op while Running/Preparing — you can't hand-step a
   * free-run in progress, pause it first. */
  step(): void {
    if (this.state.status === "running" || this.state.status === "preparing") return;
    if (this.state.status !== "paused" && !this.prepare()) return;
    this.advanceOne();
  }

  reset(): void {
    this.runToken++;
    this.generator = null;
    this.state = INITIAL_EXECUTION_STATE;
    for (const listener of this.listeners) listener(this.state);
  }

  /** Validates there's something runnable and constructs the
   * interpreter generator. Returns false (and sets an Error state)
   * if source has syntax errors or no `main`, matching "Invalid C
   * source" / "Parser errors" from the error-handling requirements. */
  private prepare(): boolean {
    this.setState({ status: "preparing" });

    const diagnostics = getLastDiagnostics();
    if (diagnostics.length > 0) {
      this.fail("Cannot run: fix the syntax errors shown in the editor first");
      return false;
    }

    const rootNode = getCurrentTree()?.rootNode;
    if (!rootNode) {
      this.fail("Cannot run: no parsed source is available yet");
      return false;
    }

    try {
      this.generator = interpretProgram(rootNode);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return false;
    }

    this.setState({ status: "paused", stepCount: 0, currentStep: null, returnValue: null, errorMessage: null });
    return true;
  }

  /** Advances exactly one interpreter step, updating state accordingly.
   * Caller is responsible for the resulting status (paused for a manual
   * step, left as running for the scheduled loop). */
  private advanceOne(): "stepped" | "finished" {
    if (!this.generator) {
      this.fail("Execution engine has no program prepared");
      return "finished";
    }
    try {
      const next = this.generator.next();
      if (next.done) {
        this.finish(next.value);
        return "finished";
      }
      this.setState({ currentStep: toExecutionStep(next.value), stepCount: this.state.stepCount + 1 });
      if (this.state.status !== "running") {
        this.setState({ status: "paused" });
      }
      return "stepped";
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return "finished";
    }
  }

  private finish(result: CValue | undefined): void {
    this.setState({
      status: "completed",
      returnValue: result ? { type: result.type, value: result.value } : null,
    });
    this.appendLog(result ? `Execution completed — returned ${result.value}` : "Execution completed", "info");
  }

  private fail(message: string): void {
    log.error(message);
    this.setState({ status: "error", errorMessage: message });
    this.appendLog(message, "error");
  }

  /** Runs steps synchronously for up to TIME_BUDGET_MS, then yields back
   * to the browser via setTimeout(0) and reschedules itself — the
   * "don't block the main thread" requirement — until the program
   * finishes, errors, hits the step limit, or is paused/reset out from
   * under it (checked via runToken). */
  private scheduleChunk(token: number): void {
    setTimeout(() => {
      if (token !== this.runToken || this.state.status !== "running") return;

      const chunkStart = performance.now();
      while (performance.now() - chunkStart < TIME_BUDGET_MS) {
        if (this.state.stepCount >= MAX_EXECUTION_STEPS) {
          this.fail(`Execution stopped: exceeded ${MAX_EXECUTION_STEPS.toLocaleString()} steps — likely an infinite loop`);
          return;
        }
        if (this.advanceOne() === "finished") return;
        if (token !== this.runToken || this.state.status !== "running") return;
      }
      this.scheduleChunk(token);
    }, 0);
  }
}
