import { Column } from "../../column/column";
import { ColumnType } from "../../interfaces/column";
import {
  resolveFillHandleOptions,
  type FillHandleMode,
  type ResolvedFillHandleOptions,
} from "../../interfaces/gridOptions";
import type { IGridCore } from "../../interfaces/iGridCore";
import type { IRowNode } from "../../interfaces/iRowNode";
import type { CellRef } from "../../interfaces/selection";
import type { RowPoolDef } from "../types";
import {
  computeFillTarget,
  fillValueAt,
  resolveLineMode,
  unionRect,
  type FillRect,
  type FillTarget,
} from "./fillModel";

interface FillHandleControllerParams {
  core: IGridCore;
  root: HTMLElement;
  leafColumns: () => Column[];
  /** Repaint the body selection layer — the handle and the drag preview ride on it. */
  refreshSelection: () => void;
  announce: (message: string) => void;
}

interface FillEdit {
  cell: CellRef;
  value: unknown;
  parsed: boolean;
}

/** A cell location the selection renderer resolved from a pointer event. */
interface CellLocation {
  viewIdx: number;
  colIdx: number;
  rowPinned?: "top" | "bottom";
}

/**
 * The fill handle: the drag grip on the bottom-right cell of the selection, the dashed preview of
 * the cells a drag will write, and the write itself — plus the keyboard forms, `Ctrl/Cmd+D` (fill
 * down) and `Ctrl/Cmd+R` (fill right).
 *
 * Holds no selection state. The handle's position is re-derived from the core's selection on every
 * selection paint: the selection renderer calls {@link paintCell} for each cell it paints, and the
 * controller moves its one handle element into the corner cell (or out of a cell that stopped being
 * the corner). The handle therefore scrolls, recycles, and clips with the cell it sits in, and the
 * only state here is the transient drag gesture.
 *
 * Writes go through the core's `cellsCommit` action with `reason: "fill"`, so every cell runs the
 * column parser (where the write needs one), `onBeforeCellCommit`, the no-op-write check, and one
 * undo step covers the whole fill.
 */
export class FillHandleController {
  private readonly handleEl: HTMLDivElement;
  /** The cell currently hosting the handle, and its pool slot. */
  private hostCell: HTMLDivElement | null = null;
  private hostSlot: RowPoolDef | null = null;
  /** Per slot-paint bookkeeping: the handle source for this pass, and whether a cell claimed it. */
  private paintSource: FillRect | null = null;
  private claimedInPass = false;
  private drag: { source: FillRect; target: FillTarget | null } | null = null;

  constructor(private readonly params: FillHandleControllerParams) {
    this.handleEl = document.createElement("div");
    this.handleEl.className = "pte-fill-handle";
    // Pointer-only affordance; the keyboard route is Ctrl/Cmd+D / Ctrl/Cmd+R on the body cursor.
    this.handleEl.setAttribute("aria-hidden", "true");
  }

  /** The resolved options, or null while the handle is off or has nothing to ride on. */
  options(): ResolvedFillHandleOptions | null {
    const opts = this.params.core.getOptions();
    // The handle is the corner of a range: without range selection there is no range to drag from,
    // and without the body cursor there is no selection at all.
    if (opts.cellSelection !== true || opts.rangeSelection === false) return null;
    return resolveFillHandleOptions(opts.fillHandle);
  }

  isEnabled(): boolean {
    return this.options() !== null;
  }

  isDragging(): boolean {
    return this.drag !== null;
  }

  isHandleTarget(target: EventTarget | null): boolean {
    return target instanceof Node && this.handleEl.contains(target);
  }

  /**
   * The rectangle whose bottom-right corner carries the handle, or null when there is none: the
   * body part of the cell selection (a selection reaching into a pinned band has no handle, nor
   * does one with no body rows), while an editor is closed, and only when the selection covers at
   * least one editable column — a read-only grid never shows a grip that could do nothing.
   */
  handleSource(): FillRect | null {
    if (!this.isEnabled() || this.params.core.getEditingCell()) return null;
    const rect = this.selectionRect();
    if (!rect || rect.pinned) return null;
    const leaves = this.params.leafColumns();
    for (let c = rect.colStart; c <= rect.colEnd; c++) {
      const col = leaves[c];
      if (col && usable(col) && col.editable) return rect;
    }
    return null;
  }

  // ---------------- Paint hooks (driven by the selection renderer) ----------------

  beginSlotPaint(): void {
    this.paintSource = this.handleSource();
    this.claimedInPass = false;
  }

  /**
   * Place the handle and the drag preview on one painted cell. `colIdx..colEnd` is the leaf
   * interval the cell covers (a spanning cell covers several).
   */
  paintCell(cell: HTMLDivElement, slot: RowPoolDef, viewIndex: number | null, colIdx: number, colEnd: number): void {
    const src = this.paintSource;
    const corner = !!src && viewIndex === src.rowEnd && colIdx <= src.colEnd && src.colEnd <= colEnd;
    if (corner) {
      if (this.handleEl.parentElement !== cell) cell.appendChild(this.handleEl);
      this.hostCell = cell;
      this.hostSlot = slot;
      this.claimedInPass = true;
    } else if (cell === this.hostCell) {
      this.detach();
    }
    cell.classList.toggle("pte-fill-corner", corner);

    const target = this.drag?.target?.rect ?? null;
    const inTarget = !!target && viewIndex != null
      && viewIndex >= target.rowStart && viewIndex <= target.rowEnd
      && colIdx <= target.colEnd && colEnd >= target.colStart;
    const cls = cell.classList;
    cls.toggle("pte-fill-preview", inTarget);
    cls.toggle("pte-fill-preview-top", inTarget && viewIndex === target!.rowStart);
    cls.toggle("pte-fill-preview-bottom", inTarget && viewIndex === target!.rowEnd);
    cls.toggle("pte-fill-preview-left", inTarget && colIdx <= target!.colStart && target!.colStart <= colEnd);
    cls.toggle("pte-fill-preview-right", inTarget && colIdx <= target!.colEnd && target!.colEnd <= colEnd);
  }

  /** A slot that hosted the handle and painted no corner (a span hid the cell, or the slot went
   * full-width) releases it. */
  endSlotPaint(slot: RowPoolDef): void {
    if (this.hostSlot === slot && !this.claimedInPass) this.detach();
    this.paintSource = null;
  }

  /**
   * A cell repaint rewrites the cell's children, taking the handle with it. Called after any
   * targeted repaint so the host cell gets its handle back without a selection repaint.
   */
  restoreHandle(): void {
    if (this.hostCell && this.handleEl.parentElement !== this.hostCell) {
      this.hostCell.appendChild(this.handleEl);
    }
  }

  private detach(): void {
    this.hostCell?.classList.remove("pte-fill-corner");
    this.handleEl.remove();
    this.hostCell = null;
    this.hostSlot = null;
  }

  // ---------------- The drag gesture ----------------

  /** Mousedown on the handle. Returns whether a drag began. */
  beginDrag(): boolean {
    const source = this.handleSource();
    if (!source) return false;
    this.drag = { source, target: null };
    this.params.root.classList.add("pte-fill-dragging");
    document.addEventListener("keydown", this.onDocumentKeyDown, true);
    return true;
  }

  /** The pointer moved over `location` (null when it is not over a body cell). */
  updateDrag(location: CellLocation | null): void {
    const opts = this.options();
    if (!this.drag || !opts) return;
    // Pinned band rows are outside the fill's row space; keep the last target while over them.
    if (!location || location.rowPinned) return;
    const target = computeFillTarget(
      this.drag.source,
      { row: location.viewIdx, col: location.colIdx },
      opts.direction,
    );
    if (sameTarget(target, this.drag.target)) return;
    this.drag.target = target;
    this.params.refreshSelection();
  }

  /** Mouseup anywhere: write the previewed cells. Ctrl/Cmd at release flips copy and series. */
  endDrag(e: MouseEvent): void {
    const drag = this.drag;
    this.finishDrag();
    if (!drag) return;
    if (drag.target) this.commit(drag.source, drag.target, e.ctrlKey || e.metaKey);
    else this.params.refreshSelection();
  }

  cancelDrag(): void {
    if (!this.drag) return;
    this.finishDrag();
    this.params.refreshSelection();
  }

  private finishDrag(): void {
    this.drag = null;
    this.params.root.classList.remove("pte-fill-dragging");
    document.removeEventListener("keydown", this.onDocumentKeyDown, true);
  }

  private readonly onDocumentKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    this.cancelDrag();
  };

  // ---------------- Keyboard / menu commands ----------------

  canFillDown(): boolean {
    const plan = this.planFillDown();
    return !!plan && this.buildEdits(plan.source, plan.target, "copy", false).length > 0;
  }

  canFillRight(): boolean {
    const plan = this.planFillRight();
    return !!plan && this.buildEdits(plan.source, plan.target, "copy", false).length > 0;
  }

  /**
   * `Ctrl/Cmd+D`: copy the selection's first row into the rows below it; a single row takes the
   * row above. Always a copy, never a series, and the selection stays where it is.
   */
  fillDown(): void {
    const plan = this.planFillDown();
    if (!plan) return;
    this.write(plan.source, plan.target, "copy", false);
  }

  /** `Ctrl/Cmd+R`: copy the selection's first column into the columns to its right; a single
   * column takes the column to its left. */
  fillRight(): void {
    const plan = this.planFillRight();
    if (!plan) return;
    this.write(plan.source, plan.target, "copy", false);
  }

  private planFillDown(): { source: FillRect; target: FillTarget } | null {
    const opts = this.options();
    if (!opts || opts.direction === "x") return null;
    const sel = this.selectionRect();
    if (!sel || sel.pinned) return null;
    if (sel.rowEnd > sel.rowStart) {
      return {
        source: { ...sel, rowEnd: sel.rowStart },
        target: { axis: "down", rect: { ...sel, rowStart: sel.rowStart + 1 } },
      };
    }
    if (sel.rowStart === 0) return null;
    return {
      source: { ...sel, rowStart: sel.rowStart - 1, rowEnd: sel.rowStart - 1 },
      target: { axis: "down", rect: sel },
    };
  }

  private planFillRight(): { source: FillRect; target: FillTarget } | null {
    const opts = this.options();
    if (!opts || opts.direction === "y") return null;
    const sel = this.selectionRect();
    if (!sel || sel.pinned) return null;
    const leaves = this.params.leafColumns();
    if (sel.colEnd > sel.colStart) {
      return {
        source: { ...sel, colEnd: sel.colStart },
        target: { axis: "right", rect: { ...sel, colStart: sel.colStart + 1 } },
      };
    }
    // The nearest usable column to the left is the source — hidden and utility columns are not
    // part of the row's pattern.
    for (let c = sel.colStart - 1; c >= 0; c--) {
      const col = leaves[c];
      if (!col || !usable(col)) continue;
      return {
        source: { ...sel, colStart: c, colEnd: c },
        target: { axis: "right", rect: sel },
      };
    }
    return null;
  }

  // ---------------- Writing ----------------

  /** A drag's commit: write, then select source and target together so the result is visible. */
  private commit(source: FillRect, target: FillTarget, flip: boolean): void {
    const opts = this.options();
    if (!opts) return;
    this.write(source, target, opts.mode, flip);
    this.selectUnion(source, target);
  }

  private write(source: FillRect, target: FillTarget, mode: FillHandleMode, flip: boolean): void {
    const edits = this.buildEdits(source, target, mode, flip);
    if (edits.length > 0) {
      this.params.core.dispatch({ type: "cellsCommit", edits, reason: "fill" });
    }
    this.params.announce(edits.length > 0
      ? `Filled ${edits.length} ${edits.length === 1 ? "cell" : "cells"}`
      : "Nothing to fill: no editable cells");
  }

  /**
   * The edits a fill produces. Filling vertically, every column of the source is one line and its
   * rows are the pattern; horizontally, every row is a line and its columns are the pattern. Each
   * line decides copy-or-series on its own values. Non-editable cells, group rows, and unloaded
   * rows are skipped but keep their place in the pattern, so alignment survives a locked row.
   */
  private buildEdits(source: FillRect, target: FillTarget, mode: FillHandleMode, flip: boolean): FillEdit[] {
    const core = this.params.core;
    const leaves = this.params.leafColumns();
    const rowModel = core.getRowModel();
    const nodeAt = (viewIdx: number): IRowNode | null => {
      const rowId = core.getRowIdAtViewIndex(viewIdx);
      return rowId ? rowModel.getRowNode(rowId) ?? null : null;
    };
    const edits: FillEdit[] = [];

    if (target.axis === "down" || target.axis === "up") {
      const sourceNodes: (IRowNode | null)[] = [];
      for (let r = source.rowStart; r <= source.rowEnd; r++) sourceNodes.push(nodeAt(r));
      for (let c = source.colStart; c <= source.colEnd; c++) {
        const col = leaves[c];
        if (!col || !usable(col)) continue;
        const values = sourceNodes.map(node => node ? col.getValue(node) : undefined);
        const lineMode = resolveLineMode(values, mode, flip);
        for (let r = target.rect.rowStart; r <= target.rect.rowEnd; r++) {
          const node = nodeAt(r);
          if (!node || !col.isCellEditable(node, core.resolveRowPresentation(node, r))) continue;
          const value = fillValueAt(values, r - source.rowStart, lineMode);
          edits.push({ cell: { rowId: node.id, colId: col.instanceID }, ...writeForm(value, col, col, node) });
        }
      }
      return edits;
    }

    const sourceCols = columnsIn(leaves, source.colStart, source.colEnd);
    const targetCols = columnsIn(leaves, target.rect.colStart, target.rect.colEnd);
    if (sourceCols.length === 0) return edits;
    for (let r = source.rowStart; r <= source.rowEnd; r++) {
      const node = nodeAt(r);
      if (!node) continue;
      const presentation = core.resolveRowPresentation(node, r);
      const values = sourceCols.map(col => col.getValue(node));
      const lineMode = resolveLineMode(values, mode, flip);
      targetCols.forEach((col, k) => {
        if (!col.isCellEditable(node, presentation)) return;
        // Rightward the targets continue past the pattern's end; leftward the nearest target is
        // index -1, so the pattern continues backward from its start.
        const index = target.axis === "right" ? sourceCols.length + k : k - targetCols.length;
        const value = fillValueAt(values, index, lineMode);
        const n = sourceCols.length;
        const from = lineMode === "copy" ? sourceCols[((index % n) + n) % n] : sourceCols[0];
        edits.push({ cell: { rowId: node.id, colId: col.instanceID }, ...writeForm(value, from, col, node) });
      });
    }
    return edits;
  }

  /**
   * Select source and target as one range, with the active cell still on a source cell — the
   * corner of the union the fill did not create, nearest to where the cursor was — so the cursor
   * is on a cell the user chose, not one the fill wrote. Extending a range moves the active cell
   * to the extension point, so the range starts at the far corner and extends back onto that one.
   */
  private selectUnion(source: FillRect, target: FillTarget): void {
    const core = this.params.core;
    const union = unionRect(source, target.rect);
    const active = core.getActiveCell();
    const nearest = (lo: number, hi: number, at: number | undefined) =>
      at != null && Math.abs(at - hi) < Math.abs(at - lo) ? hi : lo;
    const activeRow = target.axis === "down" ? union.rowStart
      : target.axis === "up" ? union.rowEnd
        : nearest(union.rowStart, union.rowEnd, active?.rowPinned ? undefined : active?.row);
    const activeCol = target.axis === "right" ? union.colStart
      : target.axis === "left" ? union.colEnd
        : nearest(union.colStart, union.colEnd, active?.colIdx);
    const farRow = activeRow === union.rowStart ? union.rowEnd : union.rowStart;
    const farCol = activeCol === union.colStart ? union.colEnd : union.colStart;
    core.dispatch({ type: "rangeSelectSet", viewIdx: farRow, colIdx: farCol, mode: "start" });
    if (farRow !== activeRow || farCol !== activeCol) {
      core.dispatch({ type: "rangeSelectSet", viewIdx: activeRow, colIdx: activeCol, mode: "extend" });
    }
  }

  /** The body part of the current cell selection, normalized; `pinned` when it reaches a band. */
  private selectionRect(): (FillRect & { pinned: boolean }) | null {
    const core = this.params.core;
    const range = core.getSelectionRange();
    if (range) {
      if (range.rowEnd < range.rowStart) return null;
      return {
        rowStart: range.rowStart,
        rowEnd: range.rowEnd,
        colStart: Math.min(range.colStart, range.colEnd),
        colEnd: Math.max(range.colStart, range.colEnd),
        pinned: !!range.pinnedTop || !!range.pinnedBottom,
      };
    }
    const active = core.getActiveCell();
    if (!active || active.rowPinned) return null;
    return { rowStart: active.row, rowEnd: active.row, colStart: active.colIdx, colEnd: active.colIdx, pinned: false };
  }

  destroy(): void {
    this.finishDrag();
    this.detach();
  }
}

// A column that takes part in a fill: visible, and not one of the grid's own (row numbers,
// checkboxes, generated pivot and group columns).
function usable(col: Column): boolean {
  return !col.hidden && !col.isInternal();
}

function columnsIn(leaves: Column[], colStart: number, colEnd: number): Column[] {
  const out: Column[] = [];
  for (let c = colStart; c <= colEnd; c++) {
    const col = leaves[c];
    if (col && usable(col)) out.push(col);
  }
  return out;
}

/**
 * How a value reaches its target column. Between columns of one `type` — always the case filling
 * down or up — the stored value moves as it is, parser untouched. Into a differently typed column
 * the value's text goes through that column's parser, exactly as a paste would, except that a
 * computed number or date already in the target's own kind is stored directly.
 */
function writeForm(value: unknown, from: Column, to: Column, row: IRowNode): { value: unknown; parsed: boolean } {
  if (from.type === to.type) return { value, parsed: true };
  if (typeof value === "number" && to.isNumericType()) return { value, parsed: true };
  if (value instanceof Date && to.type === ColumnType.DATE) return { value, parsed: true };
  return { value: from.formatValue(value, row), parsed: false };
}

function sameTarget(a: FillTarget | null, b: FillTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.axis === b.axis
    && a.rect.rowStart === b.rect.rowStart && a.rect.rowEnd === b.rect.rowEnd
    && a.rect.colStart === b.rect.colStart && a.rect.colEnd === b.rect.colEnd;
}
