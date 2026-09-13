import type { Address } from "../memory/memory";
import type { MemoryModel } from "../memory/memory";
import type { CArrayValue, CValue } from "./values";
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
  /** Phase 6: names that are arrays rather than scalars/pointers. The
   * interpreter uses this to apply array-to-pointer decay when an array
   * identifier appears in an expression. */
  private readonly arrayNames = new Set<string>();
  /** Phase 6: stores array metadata directly so lookups and snapshots
   * resolve array values without allocating extraneous dummy stack cells. */
  private readonly arrayValues = new Map<string, CArrayValue>();
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

  /** Phase 6: declares a fixed-length stack array — registers its
   * contiguous baseAddress in bindings and stores the CArrayValue directly. */
  declareArray(name: string, arrayVal: CValue): Address {
    if (this.bindings.has(name)) {
      throw new CRuntimeError(`Redeclaration of "${name}" in the same scope`);
    }
    if (arrayVal.kind !== "array") {
      throw new CRuntimeError(`declareArray called with non-array value for "${name}"`);
    }
    this.bindings.set(name, arrayVal.baseAddress);
    this.arrayValues.set(name, arrayVal);
    this.arrayNames.add(name);
    return arrayVal.baseAddress;
  }

  /** Phase 6: returns true if `name` was declared as an array. Searches
   * parent scopes, matching C's scoping rules. */
  isArrayName(name: string): boolean {
    return this.arrayNames.has(name) || (this.parent?.isArrayName(name) ?? false);
  }

  lookupAddress(name: string): Address | undefined {
    return this.bindings.get(name) ?? this.parent?.lookupAddress(name);
  }

  lookup(name: string): CValue | undefined {
    if (this.arrayValues.has(name)) {
      return this.arrayValues.get(name);
    }
    if (this.parent?.isArrayName(name)) {
      return this.parent.lookup(name);
    }
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
      if (this.arrayValues.has(name)) {
        result[name] = this.arrayValues.get(name)!;
      } else {
        result[name] = this.memory.read(address);
      }
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
