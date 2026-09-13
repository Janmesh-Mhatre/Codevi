import type { CValue } from "../interpreter/values";
import { CRuntimeError } from "../interpreter/values";

/**
 * Codevi's simulated address space (Phase 5).
 *
 * These are NOT real machine addresses — Codevi runs in a browser and
 * has no access to (and no business simulating) actual RAM layout. Every
 * address here is a small, deterministic, Codevi-assigned identifier,
 * always rendered with an explicit S/H prefix (see formatAddress) so it
 * can never be mistaken for a real pointer value. See
 * docs/PHASE_5_POINTERS.md → "Simulated address model".
 *
 * `slot` distinguishes elements within one multi-element heap block
 * (e.g. calloc(5, ...) — five cells sharing one heap id, slots 0..4) so
 * pointer arithmetic has somewhere real to move between. It's always 0
 * for stack cells and single-element heap blocks.
 */
export interface Address {
  space: "stack" | "heap";
  id: number;
  slot: number;
}

export function formatAddress(address: Address): string {
  const prefix = address.space === "stack" ? "S" : "H";
  const base = `${prefix}${String(address.id).padStart(3, "0")}`;
  return address.slot === 0 ? base : `${base}[${address.slot}]`;
}

export function addressesEqual(a: Address | null, b: Address | null): boolean {
  if (a === null || b === null) return a === b;
  return a.space === b.space && a.id === b.id && a.slot === b.slot;
}

/** Codevi's own conceptual size model, in "units" — not real byte sizes
 * for any actual platform. Used only for sizeof() and for pointer-
 * arithmetic stride (moving a pointer by N means moving N element slots,
 * never N bytes of anything real). See docs/PHASE_5_POINTERS.md →
 * "Simulated sizeof model". */
export function sizeOfType(type: string): number {
  switch (type) {
    case "char":
      return 1;
    case "int":
    case "float":
      return 4;
    case "double":
      return 8;
    default:
      return 4; // pointers and anything unrecognized default to 4 units
  }
}

/** One storage location — either a stack variable's slot or a single
 * element within a heap block. This is what pointers actually point
 * *at*; `Scope` (see scope.ts) only ever stores addresses, never values
 * directly, which is what makes "write through a pointer, read through
 * the original variable" work correctly — both go through the same
 * cell. */
export interface MemoryCell {
  address: Address;
  value: CValue;
  /** For display/error messages — a variable name for stack cells, or a
   * description like "heap block H002[1]" for a heap element. */
  label: string;
}

export interface HeapAllocation {
  address: Address;
  /** Number of element slots (malloc(sizeof(int)) -> 1; calloc(5, ...) -> 5). */
  slotCount: number;
  /** Codevi's simulated size for the whole block (slotCount * element size). */
  byteSize: number;
  active: boolean;
  origin: "malloc" | "calloc" | "realloc";
}

/** Phase 6: metadata for a stack-allocated array — the stack analog of
 * HeapAllocation. Pointer arithmetic bounds-checks against slotCount
 * the same way it does for heap blocks. */
export interface StackArrayAllocation {
  baseAddress: Address;
  slotCount: number;
}

export type MemoryEvent =
  | { kind: "allocate"; address: Address; byteSize: number; origin: HeapAllocation["origin"] }
  | { kind: "deallocate"; address: Address }
  | { kind: "pointer-assign"; variable: string; target: Address | null }
  | { kind: "dereference"; address: Address }
  | { kind: "write"; address: Address }
  | { kind: "read"; address: Address };

const MAX_HEAP_BLOCKS = 500;
const MAX_EVENT_LOG = 200;

/**
 * The single source of truth for every piece of storage in a program
 * run — both stack variable slots and heap allocations, addressed
 * uniformly. One instance is created per run by interpretProgram() and
 * threaded through every Scope (see scope.ts's constructor). See
 * docs/PHASE_5_POINTERS.md → "Memory model decisions" for why stack and
 * heap share one address→cell registry instead of two separate systems.
 */
export class MemoryModel {
  private readonly cells = new Map<string, MemoryCell>();
  private readonly allocations = new Map<string, HeapAllocation>();
  /** Phase 6: tracks stack arrays so pointer arithmetic can bounds-check
   * them — keyed by base address key (slot 0). */
  private readonly stackArrays = new Map<string, StackArrayAllocation>();
  private nextStackId = 1;
  private nextHeapId = 1;
  readonly events: MemoryEvent[] = [];

  private key(address: Address): string {
    return `${address.space}:${address.id}:${address.slot}`;
  }

  private recordEvent(event: MemoryEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENT_LOG) this.events.shift();
  }

  // ---- Stack cells ----------------------------------------------------

  allocateStackCell(label: string, initialValue: CValue): Address {
    const address: Address = { space: "stack", id: this.nextStackId++, slot: 0 };
    this.cells.set(this.key(address), { address, value: initialValue, label });
    return address;
  }

  /** Phase 6: allocates a contiguous array of stack slots sharing one
   * base id — exactly the same slot model the heap uses, so pointer
   * arithmetic works identically on both. */
  allocateStackArray(label: string, slotCount: number, fill: CValue): Address {
    const baseId = this.nextStackId++;
    const baseAddress: Address = { space: "stack", id: baseId, slot: 0 };
    this.stackArrays.set(this.key(baseAddress), { baseAddress, slotCount });
    for (let i = 0; i < slotCount; i++) {
      const slot: Address = { space: "stack", id: baseId, slot: i };
      this.cells.set(this.key(slot), { address: slot, value: fill, label: `${label}[${i}]` });
    }
    return baseAddress;
  }

  /** Phase 6: returns the stack array allocation a given address belongs
   * to (any slot resolves to the base), or undefined for non-array
   * stack cells. */
  getStackArray(address: Address): StackArrayAllocation | undefined {
    if (address.space !== "stack") return undefined;
    return this.stackArrays.get(this.key({ space: "stack", id: address.id, slot: 0 }));
  }

  /** Phase 6: reads all slot values of a stack array — mirrors
   * slotValues() for heap allocations. */
  stackArraySlotValues(baseAddress: Address): CValue[] {
    const arr = this.getStackArray(baseAddress);
    if (!arr) return [];
    const values: CValue[] = [];
    for (let i = 0; i < arr.slotCount; i++) {
      const cell = this.cells.get(this.key({ space: "stack", id: baseAddress.id, slot: i }));
      if (cell) values.push(cell.value);
    }
    return values;
  }

  // ---- Heap allocations -------------------------------------------------

  allocateHeap(slotCount: number, elementSize: number, origin: HeapAllocation["origin"], fill: CValue): Address {
    if (this.allocations.size >= MAX_HEAP_BLOCKS) {
      throw new CRuntimeError(`Allocation failed: simulated heap limit (${MAX_HEAP_BLOCKS} blocks) reached`);
    }
    if (slotCount <= 0) {
      throw new CRuntimeError(`Allocation failed: requested size must be positive`);
    }
    const address: Address = { space: "heap", id: this.nextHeapId++, slot: 0 };
    const byteSize = slotCount * elementSize;
    this.allocations.set(this.key(address), { address, slotCount, byteSize, active: true, origin });
    for (let i = 0; i < slotCount; i++) {
      const slot: Address = { space: "heap", id: address.id, slot: i };
      this.cells.set(this.key(slot), { address: slot, value: fill, label: `heap block ${formatAddress(slot)}` });
    }
    this.recordEvent({ kind: "allocate", address, byteSize, origin });
    return address;
  }

  read(address: Address): CValue {
    const cell = this.cells.get(this.key(address));
    if (!cell) {
      throw new CRuntimeError(`Invalid memory access at ${formatAddress(address)} — this location doesn't exist`);
    }
    this.recordEvent({ kind: "read", address });
    return cell.value;
  }

  write(address: Address, value: CValue): void {
    const cell = this.cells.get(this.key(address));
    if (!cell) {
      throw new CRuntimeError(`Invalid memory access at ${formatAddress(address)} — this location doesn't exist`);
    }
    cell.value = value;
    this.recordEvent({ kind: "write", address });
  }

  labelOf(address: Address): string {
    return this.cells.get(this.key(address))?.label ?? formatAddress(address);
  }

  /** Looks up the allocation a given address belongs to (any slot of it
   * resolves to the same block-level allocation record). */
  getAllocation(address: Address): HeapAllocation | undefined {
    return this.allocations.get(this.key({ space: "heap", id: address.id, slot: 0 }));
  }

  isActiveHeapBlock(address: Address): boolean {
    return this.getAllocation(address)?.active ?? false;
  }

  free(address: Address): void {
    if (address.space !== "heap") {
      throw new CRuntimeError(`free(): ${formatAddress(address)} is not a heap address`);
    }
    const allocation = this.getAllocation(address);
    if (!allocation) {
      throw new CRuntimeError(`free(): ${formatAddress(address)} was never allocated by malloc/calloc/realloc`);
    }
    if (!allocation.active) {
      throw new CRuntimeError(`Double free: ${formatAddress(allocation.address)} was already freed`);
    }
    if (address.slot !== 0) {
      throw new CRuntimeError(`free(): must be called with the original pointer returned by malloc/calloc/realloc, not an offset into the block`);
    }
    allocation.active = false;
    this.recordEvent({ kind: "deallocate", address: allocation.address });
  }

  recordPointerAssign(variable: string, target: Address | null): void {
    this.recordEvent({ kind: "pointer-assign", variable, target });
  }

  recordDereference(address: Address): void {
    this.recordEvent({ kind: "dereference", address });
  }

  /** Every active heap allocation, for the Visualization tab's heap
   * column — see docs/PHASE_5_POINTERS.md → "Heap visualization". */
  activeAllocations(): HeapAllocation[] {
    return [...this.allocations.values()].filter((a) => a.active);
  }

  /** Every allocation ever made, active or not — used for the
   * end-of-program leak check in interpreter.ts. */
  allAllocations(): HeapAllocation[] {
    return [...this.allocations.values()];
  }

  slotValues(blockAddress: Address): CValue[] {
    const allocation = this.getAllocation(blockAddress);
    if (!allocation) return [];
    const values: CValue[] = [];
    for (let i = 0; i < allocation.slotCount; i++) {
      const cell = this.cells.get(this.key({ space: "heap", id: allocation.address.id, slot: i }));
      if (cell) values.push(cell.value);
    }
    return values;
  }
}
