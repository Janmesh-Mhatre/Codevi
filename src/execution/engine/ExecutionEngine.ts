import { interpretProgram } from "../../languages/c/interpreter/interpreter";
import type { CValue } from "../../languages/c/interpreter/values";
import type { InputRequest, InputResumeValue, InterpreterStep, StackFrameSnapshot } from "../../languages/c/interpreter/types";
import { parseScanfValue, describeScanfSpecifier } from "../../languages/c/interpreter/stdio";
import { getCurrentTree, getLastDiagnostics } from "../../services/parserService";
import { scope } from "../../utils/logger";
import {
  INITIAL_EXECUTION_STATE,
  type ExecutionLogEntry,
  type ExecutionState,
  type ExecutionStep,
  type ExecutionValue,
  type StackFrame,
} from "../models/executionTypes";

const log = scope("executionEngine");

/** Hard ceiling on total steps in a single run — what actually stops
 * `while (1) {}` rather than letting it run forever. Generous for any
 * realistic (if inefficient) student loop, small enough to resolve in
 * well under a second of wall-clock time. See
 * docs/PHASE_3_EXECUTION.md → "Runaway execution". Output events count
 * toward this too (Phase 4.1) — see "Output vs input events" in
 * docs/PHASE_4_1_STDIO.md. */
const MAX_EXECUTION_STEPS = 200_000;

/** How long a single synchronous burst of stepping is allowed to run
 * before yielding back to the browser via setTimeout — keeps a Run in
 * progress from ever blocking a frame, independent of the step count
 * above (that one's about eventual termination, this one's about
 * responsiveness). */
const TIME_BUDGET_MS = 12;

const MAX_LOG_ENTRIES = 50;

let logIdCounter = 0;

function toPlainValues(values: Record<string, CValue>): Record<string, ExecutionValue> {
  const result: Record<string, ExecutionValue> = {};
  for (const [name, value] of Object.entries(values)) {
    result[name] = { type: value.type, value: value.value };
  }
  return result;
}

function toStackFrame(frame: StackFrameSnapshot, isActive: boolean): StackFrame {
  return {
    functionName: frame.functionName,
    callDepth: frame.callDepth,
    line: frame.line,
    parameters: toPlainValues(frame.parameters),
    locals: toPlainValues(frame.locals),
    isActive,
  };
}

function toExecutionStep(step: InterpreterStep): ExecutionStep {
  const callStack = step.callStack.map((frame, index) => toStackFrame(frame, index === step.callStack.length - 1));
  return {
    line: step.node.startPosition.row,
    column: step.node.startPosition.column,
    endLine: step.node.endPosition.row,
    endColumn: step.node.endPosition.column,
    astNodeType: step.node.type,
    functionName: step.functionName,
    callDepth: step.callDepth,
    description: step.description,
    variables: toPlainValues(step.variables),
    callStack,
  };
}

type Listener = (state: ExecutionState) => void;
type AdvanceOutcome = "stepped" | "finished" | "waiting";

/**
 * Owns the interpreter's lifecycle: Idle -> Preparing -> Running/Paused/
 * WaitingForInput -> Completed/Error, plus Run/Pause/Step/Reset and
 * (Phase 4.1) provideInput/cancelInput. Framework-independent by design
 * (see docs/PHASE_3_EXECUTION.md → "Clean layering") — its only
 * dependencies are parserService and the pure stdio parsing helpers,
 * never React or Zustand. executionStore.ts is what bridges this to
 * Zustand.
 */
export class ExecutionEngine {
  private state: ExecutionState = INITIAL_EXECUTION_STATE;
  private generator: Generator<InterpreterStep, CValue | undefined, InputResumeValue | undefined> | null = null;
  private readonly listeners = new Set<Listener>();
  /** Bumped on every reset/fresh prepare so a setTimeout-chained run
   * loop from a previous run can recognize it's stale and stop, even
   * though it can't be cancelled directly once scheduled. */
  private runToken = 0;
  private pendingRequest: InputRequest | null = null;
  /** Whether a free-running Run (not a manual Step) was in progress when
   * an input request interrupted it — so providing input can correctly
   * resume running rather than dropping back to merely Paused. */
  private resumeRunningAfterInput = false;

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
   * from Paused. No-op while already Running/Preparing/WaitingForInput —
   * you can't skip past a pending input request by clicking Run. */
  run(): void {
    if (this.state.status === "running" || this.state.status === "preparing" || this.state.status === "waiting-for-input") return;
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
   * more step. No-op while Running/Preparing/WaitingForInput — Step
   * Forward cannot skip a pending input request. */
  step(): void {
    if (this.state.status === "running" || this.state.status === "preparing" || this.state.status === "waiting-for-input") return;
    if (this.state.status !== "paused" && !this.prepare()) return;
    this.advanceOne();
  }

  /**
   * Resolves a pending input request (Phase 4.1). Validates `raw`
   * against the pending request's specifier before ever touching the
   * generator — an invalid value never reaches the interpreter, it just
   * sets `inputError` and stays in "waiting-for-input" for another
   * attempt. See docs/PHASE_4_1_STDIO.md → "Validation happens before
   * resuming, not inside the interpreter".
   */
  provideInput(raw: string): void {
    if (this.state.status !== "waiting-for-input" || !this.pendingRequest) return;
    const parsed = parseScanfValue(raw, this.pendingRequest.specifier);
    if (!parsed) {
      this.setState({ inputError: `"${raw}" isn't ${describeScanfSpecifier(this.pendingRequest.specifier)} — try again.` });
      return;
    }
    const resumeRunning = this.resumeRunningAfterInput;
    this.pendingRequest = null;
    this.resumeRunningAfterInput = false;
    this.setState({ status: resumeRunning ? "running" : "paused", pendingInput: null, inputError: null });
    const outcome = this.advanceOne({ cancelled: false, value: parsed });
    if (resumeRunning && outcome === "stepped") {
      this.runToken++;
      this.scheduleChunk(this.runToken);
    }
  }

  /** Cancels a pending input request — resumes the generator with a
   * cancellation signal, which the interpreter turns into a normal
   * InterpreterError ("Input was cancelled"), reusing the same
   * error-handling path as any other execution error rather than
   * needing its own. */
  cancelInput(): void {
    if (this.state.status !== "waiting-for-input") return;
    this.pendingRequest = null;
    this.resumeRunningAfterInput = false;
    this.setState({ pendingInput: null, inputError: null });
    this.advanceOne({ cancelled: true });
  }

  reset(): void {
    this.runToken++;
    this.generator = null;
    this.pendingRequest = null;
    this.resumeRunningAfterInput = false;
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

    this.setState({
      status: "paused",
      stepCount: 0,
      currentStep: null,
      returnValue: null,
      errorMessage: null,
      output: "",
      pendingInput: null,
      inputError: null,
    });
    return true;
  }

  /**
   * Advances the generator by one *user-visible* unit of work. Output
   * events (printf/puts/putchar) are drained and appended automatically
   * without stopping — from the outside, "one step" still means "one
   * statement", matching Phase 3's contract; producing output along the
   * way is a side effect of that step, not a separate pausable moment.
   * An input-request, by contrast, always stops here and returns
   * "waiting" — that one genuinely can't be skipped past.
   */
  private advanceOne(resume?: InputResumeValue): AdvanceOutcome {
    if (!this.generator) {
      this.fail("Execution engine has no program prepared");
      return "finished";
    }
    try {
      let next = this.generator.next(resume);
      while (!next.done && next.value.kind === "output") {
        this.setState({ output: this.state.output + (next.value.output ?? ""), stepCount: this.state.stepCount + 1 });
        next = this.generator.next();
      }

      if (next.done) {
        this.finish(next.value);
        return "finished";
      }

      const step = next.value;
      if (step.kind === "input-request" && step.inputRequest) {
        this.pendingRequest = step.inputRequest;
        this.resumeRunningAfterInput = this.state.status === "running";
        this.setState({
          status: "waiting-for-input",
          currentStep: toExecutionStep(step),
          stepCount: this.state.stepCount + 1,
          pendingInput: { specifier: step.inputRequest.specifier, source: step.inputRequest.source },
        });
        this.appendLog(`Waiting for input — ${step.inputRequest.source}`, "info");
        return "waiting";
      }

      this.setState({ currentStep: toExecutionStep(step), stepCount: this.state.stepCount + 1 });
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
   * finishes, errors, needs input, hits the step limit, or is
   * paused/reset out from under it (checked via runToken). */
  private scheduleChunk(token: number): void {
    setTimeout(() => {
      if (token !== this.runToken || this.state.status !== "running") return;

      const chunkStart = performance.now();
      while (performance.now() - chunkStart < TIME_BUDGET_MS) {
        if (this.state.stepCount >= MAX_EXECUTION_STEPS) {
          this.fail(`Execution stopped: exceeded ${MAX_EXECUTION_STEPS.toLocaleString()} steps — likely an infinite loop`);
          return;
        }
        const outcome = this.advanceOne();
        if (outcome === "finished" || outcome === "waiting") return;
        if (token !== this.runToken || this.state.status !== "running") return;
      }
      this.scheduleChunk(token);
    }, 0);
  }
}
