import type { Address } from "../memory/memory";
import type { MemoryModel } from "../memory/memory";
import type { CValue } from "./values";
import { CRuntimeError } from "./values";

/**
 * A block-scoped *symbol table* — matching real C block scoping (a `{ }`
 * introduces a new scope; a function body is the outermost scope for its
 * own locals, with no access to other functions' locals, since C has no
 * closures).
 *
 * As of Phase 5, Scope maps names to memory *addresses*, not values —
 * the values themselves live in the shared MemoryModel (see memory.ts).
 * This is what makes `&x` and writes through a pointer work correctly:
 * `&x` returns the address Scope already resolved `x` to, and writing
 * through that address writes the exact same storage `x` reads from.
 * Before Phase 5, Scope held values directly; see
 * docs/PHASE_5_POINTERS.md → "Memory model decisions" for why that
 * stopped being enough.
 */
export class Scope {
  private readonly bindings = new Map<string, Address>();
  readonly memory: MemoryModel;

  /** Child scopes only need a parent — they inherit its MemoryModel
   * automatically. A root scope (one per function call, created in
   * interpreter.ts's callFunction) has no parent and must be given the
   * run's MemoryModel explicitly. */
  constructor(
    private readonly parent: Scope | null,
    memory?: MemoryModel,
  ) {
    const inherited = parent?.memory ?? memory;
    if (!inherited) throw new Error("Scope: a root scope (no parent) requires an explicit MemoryModel");
    this.memory = inherited;
  }

  declare(name: string, value: CValue): Address {
    if (this.bindings.has(name)) {
      throw new CRuntimeError(`Redeclaration of "${name}" in the same scope`);
    }
    const address = this.memory.allocateStackCell(name, value);
    this.bindings.set(name, address);
    return address;
  }

  lookupAddress(name: string): Address | undefined {
    return this.bindings.get(name) ?? this.parent?.lookupAddress(name);
  }

  lookup(name: string): CValue | undefined {
    const address = this.lookupAddress(name);
    return address ? this.memory.read(address) : undefined;
  }

  /** Assigns to an already-declared variable, searching outward through
   * enclosing scopes (but never into a different function's scope — see
   * the constructor note). Throws if the variable was never declared. */
  assign(name: string, value: CValue): void {
    const address = this.lookupAddress(name);
    if (!address) {
      throw new CRuntimeError(`Assignment to undeclared variable "${name}"`);
    }
    this.memory.write(address, value);
  }

  /** Snapshot of every variable visible from this scope (this scope's
   * own variables plus everything inherited from enclosing scopes),
   * innermost declaration winning on a name collision. Used to populate
   * ExecutionStep.variables — see docs/PHASE_3_EXECUTION.md and
   * docs/PHASE_4_VISUALIZATION.md. */
  snapshot(): Record<string, CValue> {
    const result = this.parent?.snapshot() ?? {};
    for (const [name, address] of this.bindings) {
      result[name] = this.memory.read(address);
    }
    return result;
  }

  /** Same shape as snapshot(), but addresses instead of values — kept
   * as its own method rather than folded into snapshot()'s existing
   * Record<string, CValue> return shape, which other code (and tests)
   * already depends on exactly as-is. Powers the Memory panel's stack
   * variable addresses — see docs/PHASE_5_POINTERS.md. */
  snapshotAddresses(): Record<string, Address> {
    const result = this.parent?.snapshotAddresses() ?? {};
    for (const [name, address] of this.bindings) {
      result[name] = address;
    }
    return result;
  }
}
