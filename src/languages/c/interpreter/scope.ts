import type { CValue } from "./values";
import { CRuntimeError } from "./values";

/**
 * A block-scoped variable environment, chained to its enclosing scope —
 * matching real C block scoping (a `{ }` introduces a new scope; a
 * function body is the outermost scope for its own locals, with no
 * access to other functions' locals, since C has no closures).
 */
export class Scope {
  private readonly variables = new Map<string, CValue>();

  constructor(private readonly parent: Scope | null = null) {}

  declare(name: string, value: CValue): void {
    if (this.variables.has(name)) {
      throw new CRuntimeError(`Redeclaration of "${name}" in the same scope`);
    }
    this.variables.set(name, value);
  }

  lookup(name: string): CValue | undefined {
    const value = this.variables.get(name);
    if (value !== undefined) return value;
    return this.parent?.lookup(name);
  }

  /** Assigns to an already-declared variable, searching outward through
   * enclosing scopes (but never into a different function's scope — see
   * the constructor note). Throws if the variable was never declared. */
  assign(name: string, value: CValue): void {
    if (this.variables.has(name)) {
      this.variables.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new CRuntimeError(`Assignment to undeclared variable "${name}"`);
  }

  /** Snapshot of every variable visible from this scope (this scope's
   * own variables plus everything inherited from enclosing scopes),
   * innermost declaration winning on a name collision. Used to populate
   * ExecutionStep.variables — see docs/PHASE_3_EXECUTION.md. */
  snapshot(): Record<string, CValue> {
    const result = this.parent?.snapshot() ?? {};
    for (const [name, value] of this.variables) {
      result[name] = value;
    }
    return result;
  }
}
