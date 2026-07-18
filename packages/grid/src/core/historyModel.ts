import { CellRef } from "../interfaces/selection";

/** A single cell mutation, keyed by stable rowId + colId so it survives sort/filter/scroll. */
export interface CellEdit {
  cell: CellRef;
  oldValue: unknown;
  newValue: unknown;
}

/** One undoable step. A single edit records a 1-edit entry; a paste/cut batch records many. */
export interface HistoryEntry {
  edits: CellEdit[];
  label: "edit" | "paste" | "cut" | "clear";
}

/**
 * Undo/redo stacks for cell mutations. Holds no grid state — the core records committed edits here
 * (capturing old + new stored values) and asks it for the next entry to undo/redo. Applying the
 * entry (writing values, emitting events) is the core's job; this model is pure bookkeeping.
 *
 * Granularity is per commit action: one editCommit or one cellsCommit batch = one entry. Any new
 * commit clears the redo stack.
 */
export class HistoryModel {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  // Bounds memory; oldest entries are dropped past this.
  private limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  /**
   * Record a committed step and clear the redo stack. No-op for empty edit lists, and a no-op
   * entirely when the limit is 0 (history disabled).
   */
  push(entry: HistoryEntry): void {
    if (this.limit <= 0 || entry.edits.length === 0) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Pop the next entry to undo, moving it onto the redo stack. Returns null when nothing to undo. */
  popUndo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return entry;
  }

  /** Pop the next entry to redo, moving it back onto the undo stack. Returns null when nothing to redo. */
  popRedo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return entry;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
