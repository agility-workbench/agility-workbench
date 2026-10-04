import { Column } from "../../column/column";
import { parseTextByType } from "../../column/parsers";
import { ColumnType } from "../../interfaces/column";
import {
  REJECT,
  resolveFillHandleOptions,
  type FillHandleMode,
  type FillTrigger,
  type ResolvedFillHandleOptions,
} from "../../interfaces/gridOptions";
import type { IGridCore } from "../../interfaces/iGridCore";
import type { IRowNode } from "../../interfaces/iRowNode";
import type { CellRef } from "../../interfaces/selection";
import type { Unsubscribe } from "../../events/events";
import { isBlankValue, valuesAreSame } from "../../misc";
import type { RowPoolDef } from "../types";
import {
  adjacentBlockEnd,
  computeFillTarget,
  fillValueAt,
  resolveLineMode,
  seriesKind,
  unionRect,
  type FillAxis,
  type FillLineMode,
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
 * The last handle gesture's fill, kept while its result still stands so the body menu can offer
 * to redo it the other way (the spreadsheet's "Copy Cells" / "Fill Series" choice).
 */
interface LastFill {
  source: FillRect;
  target: FillTarget;
  flip: boolean;
  /** The line mode a menu redo forced, or null while the result is the gesture's own. */
  force: FillLineMode | null;
  /** What sat under source ∪ target when the fill ran — rects are view indices, and a sort,
   * filter, or column move would silently re-aim them. */
  rowIds: (string | null)[];
  colIds: (string | undefined)[];
}

/**
 * The fill handle: the drag grip on the bottom-right cell of the selection, the dashed preview of
 * the cells a drag will write, and the write itself — plus the double-click that fills down to the
 * end of the data beside the selection, and the keyboard forms, `Ctrl/Cmd+D` (fill down) and
 * `Ctrl/Cmd+R` (fill right).
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
  private lastFill: LastFill | null = null;
  private refilling = false;
  private readonly stopWatchingWrites: Unsubscribe;

  constructor(private readonly params: FillHandleControllerParams) {
    this.handleEl = document.createElement("div");
    this.handleEl.className = "pte-fill-handle";
    // Pointer-only affordance; the keyboard route is Ctrl/Cmd+D / Ctrl/Cmd+R on the body cursor.
    this.handleEl.setAttribute("aria-hidden", "true");
    // Any write the controller did not make itself — an edit, a paste, an undo, a keyboard fill —
    // retires the last fill's alternatives: its cells may no longer hold what it left there.
    this.stopWatchingWrites = params.core.on("cellValueChanged", () => {
      if (!this.refilling) this.lastFill = null;
    });
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
    if (drag.target) this.commit(drag.source, drag.target, e.ctrlKey || e.metaKey, "drag");
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

  // ---------------- Double-click ----------------

  /**
   * Double-click on the handle: fill the selection down to the end of the data beside it, as a
   * spreadsheet does, so a column is completed without dragging to the bottom. The nearest usable
   * column left of the selection is the guide — or the nearest to its right when the left one is
   * blank in the row below the selection — and the fill covers the guide's unbroken run of rows
   * holding a value. A group row, or a row not yet loaded, ends the run, so a fill inside one group
   * stays in it. Copy or series as a drag would decide, with Ctrl/Cmd flipping it the same way.
   * The two presses the double-click is made of each begin and end an empty drag beforehand;
   * neither writes.
   */
  fillToAdjacentBlock(e: MouseEvent): void {
    const opts = this.options();
    if (!opts || opts.direction === "x") return;
    const source = this.handleSource();
    if (!source) return;
    const core = this.params.core;
    const leaves = this.params.leafColumns();
    const rowModel = core.getRowModel();
    const hasData = (viewIdx: number, colIdx: number): boolean => {
      const rowId = core.getRowIdAtViewIndex(viewIdx);
      const node = rowId ? rowModel.getRowNode(rowId) : undefined;
      return !!node && !node.isGroup && !isBlankValue(leaves[colIdx].getValue(node));
    };
    const end = adjacentBlockEnd(source, this.guideColumns(source), rowModel.getViewCount(), hasData);
    if (end === null) {
      this.params.announce("Nothing to fill: no data beside the selection");
      return;
    }
    const target: FillTarget = { axis: "down", rect: { ...source, rowStart: source.rowEnd + 1, rowEnd: end } };
    this.commit(source, target, e.ctrlKey || e.metaKey, "doubleClick");
  }

  /** The nearest usable column on each side of `rect`, the left one first. */
  private guideColumns(rect: FillRect): number[] {
    const leaves = this.params.leafColumns();
    const guides: number[] = [];
    for (let c = rect.colStart - 1; c >= 0; c--) {
      if (leaves[c] && usable(leaves[c])) { guides.push(c); break; }
    }
    for (let c = rect.colEnd + 1; c < leaves.length; c++) {
      if (leaves[c] && usable(leaves[c])) { guides.push(c); break; }
    }
    return guides;
  }

  // ---------------- Keyboard / menu commands ----------------

  canFillDown(): boolean {
    const plan = this.planFillDown();
    return !!plan && this.buildEdits(plan.source, plan.target, "copy", false, null, "command").length > 0;
  }

  canFillRight(): boolean {
    const plan = this.planFillRight();
    return !!plan && this.buildEdits(plan.source, plan.target, "copy", false, null, "command").length > 0;
  }

  /**
   * `Ctrl/Cmd+D` and `api.fillDown()`: copy the selection's first row into the rows below it; a
   * single row takes the row above. Always a copy, never a series, and the selection stays where
   * it is. Returns the number of cells written (what the fill announces), 0 when nothing applied.
   */
  fillDown(): number {
    const plan = this.planFillDown();
    if (!plan) return 0;
    return this.write(plan.source, plan.target, "copy", false, null, "command");
  }

  /** `Ctrl/Cmd+R` and `api.fillRight()`: copy the selection's first column into the columns to
   * its right; a single column takes the column to its left. Returns as {@link fillDown}. */
  fillRight(): number {
    const plan = this.planFillRight();
    if (!plan) return 0;
    return this.write(plan.source, plan.target, "copy", false, null, "command");
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

  /**
   * A gesture's commit: select source and target together so the result is visible, then write.
   * The selection goes first because the live region keeps only the latest of the messages that
   * arrive together, and the fill's own count is the one worth hearing.
   */
  private commit(source: FillRect, target: FillTarget, flip: boolean, trigger: FillTrigger): void {
    const opts = this.options();
    if (!opts) return;
    this.selectUnion(source, target);
    const written = this.write(source, target, opts.mode, flip, null, trigger);
    // Recorded after the write: the fill's own change events run inside it and would clear this.
    this.lastFill = written > 0
      ? { source, target, flip, force: null, ...this.idsUnder(unionRect(source, target.rect)) }
      : null;
  }

  /** Write the fill and announce it; returns how many cells it wrote. */
  private write(
    source: FillRect,
    target: FillTarget,
    mode: FillHandleMode,
    flip: boolean,
    force: FillLineMode | null,
    trigger: FillTrigger,
  ): number {
    const edits = this.buildEdits(source, target, mode, flip, force, trigger);
    if (edits.length > 0) {
      this.params.core.dispatch({ type: "cellsCommit", edits, reason: "fill" });
    }
    const how = force === "copy" ? " as copies" : force === "series" ? " as a series" : "";
    this.params.announce(edits.length > 0
      ? `Filled ${edits.length} ${edits.length === 1 ? "cell" : "cells"}${how}`
      : "Nothing to fill: no editable cells");
    return edits.length;
  }

  // ---------------- Redoing the last fill the other way ----------------

  /**
   * How the last handle fill could be redone from the cell at `at`, for the body menu: `"copy"`
   * repeats the source where the fill stepped a series, `"series"` steps every line that can where
   * it copied (never under `mode: "copy"`). Offered only on a cell the fill covered, and only when
   * the redo would change something — a plain-text copy has no series to offer.
   */
  fillAlternatives(at: { rowId: string; colId: string; rowPinned?: "top" | "bottom" }): FillLineMode[] {
    const last = this.recallFill();
    const opts = this.options();
    if (!last || !opts || at.rowPinned) return [];
    const col = this.params.leafColumns().find(c => c.instanceID === at.colId || c.colId === at.colId);
    if (!col || !last.rowIds.includes(at.rowId) || !last.colIds.includes(col.instanceID)) return [];
    const current = this.buildEdits(last.source, last.target, opts.mode, last.flip, last.force, "command");
    const out: FillLineMode[] = [];
    for (const force of ["copy", "series"] as const) {
      if (force === last.force || (force === "series" && opts.mode === "copy")) continue;
      const other = this.buildEdits(last.source, last.target, opts.mode, last.flip, force, "command");
      if (!sameEdits(current, other)) out.push(force);
    }
    return out;
  }

  /**
   * Redo the last handle fill with every line copied or stepped. A fresh write over the same
   * target — its own undo step, the selection left alone — rather than an undo and a refill, so it
   * neither depends on the fill still topping the history nor replays undo events to the app.
   */
  refill(force: FillLineMode): void {
    const last = this.recallFill();
    const opts = this.options();
    if (!last || !opts) return;
    this.refilling = true;
    try {
      this.write(last.source, last.target, opts.mode, last.flip, force, "command");
    } finally {
      this.refilling = false;
    }
    last.force = force;
  }

  // The last fill, if the rows and columns it covered still sit at the same indices.
  private recallFill(): LastFill | null {
    const last = this.lastFill;
    if (!last) return null;
    const now = this.idsUnder(unionRect(last.source, last.target.rect));
    const same = now.rowIds.every((id, i) => id === last.rowIds[i])
      && now.colIds.every((id, i) => id === last.colIds[i]);
    if (!same) this.lastFill = null;
    return same ? last : null;
  }

  private idsUnder(rect: FillRect): { rowIds: (string | null)[]; colIds: (string | undefined)[] } {
    const leaves = this.params.leafColumns();
    const rowIds: (string | null)[] = [];
    for (let r = rect.rowStart; r <= rect.rowEnd; r++) rowIds.push(this.params.core.getRowIdAtViewIndex(r));
    const colIds: (string | undefined)[] = [];
    for (let c = rect.colStart; c <= rect.colEnd; c++) colIds.push(leaves[c]?.instanceID);
    return { rowIds, colIds };
  }

  /**
   * The edits a fill produces. Filling vertically, every column of the source is one line and its
   * rows are the pattern; horizontally, every row is a line and its columns are the pattern. Each
   * line decides copy-or-series on its own values, unless `force` settles it for every line (a menu
   * redo). Non-editable cells, group rows, and unloaded rows are skipped but keep their place in
   * the pattern, so alignment survives a locked row.
   */
  private buildEdits(
    source: FillRect,
    target: FillTarget,
    mode: FillHandleMode,
    flip: boolean,
    force: FillLineMode | null,
    trigger: FillTrigger,
  ): FillEdit[] {
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
        const lineMode = lineModeFor(values, mode, flip, force);
        for (let r = target.rect.rowStart; r <= target.rect.rowEnd; r++) {
          const node = nodeAt(r);
          if (!node || !col.isCellEditable(node, core.resolveRowPresentation(node, r))) continue;
          const edit = this.editFor({ values, index: r - source.rowStart, lineMode, axis: target.axis, trigger }, node, col, col);
          if (edit) edits.push(edit);
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
      const lineMode = lineModeFor(values, mode, flip, force);
      targetCols.forEach((col, k) => {
        if (!col.isCellEditable(node, presentation)) return;
        // Rightward the targets continue past the pattern's end; leftward the nearest target is
        // index -1, so the pattern continues backward from its start.
        const index = target.axis === "right" ? sourceCols.length + k : k - targetCols.length;
        const n = sourceCols.length;
        const from = lineMode === "copy" ? sourceCols[((index % n) + n) % n] : sourceCols[0];
        const edit = this.editFor({ values, index, lineMode, axis: target.axis, trigger }, node, from, col);
        if (edit) edits.push(edit);
      });
    }
    return edits;
  }

  /**
   * One target cell's edit: the grid's own value (copy or series), offered to the application's
   * `fillOperation` first — which may replace it, skip the cell, or decline — and then put into the
   * shape its column stores. A value from the application is stored as given.
   */
  private editFor(
    line: { values: readonly unknown[]; index: number; lineMode: FillLineMode; axis: FillAxis; trigger: FillTrigger },
    node: IRowNode,
    from: Column,
    to: Column,
  ): FillEdit | null {
    const value = fillValueAt(line.values, line.index, line.lineMode);
    const cell: CellRef = { rowId: node.id, colId: to.instanceID };
    const operation = this.params.core.getOptions().fillOperation;
    if (operation) {
      const result = operation({
        values: line.values,
        index: line.index,
        direction: line.axis,
        lineMode: line.lineMode,
        defaultValue: value,
        oldValue: to.getValue(node),
        rowId: node.id,
        colId: to.colId,
        colInstanceId: to.instanceID,
        node,
        trigger: line.trigger,
      });
      if (result && result.skipCell) return null;
      if (result && "value" in result) return { cell, value: result.value, parsed: true };
    }
    const edit = writeForm(value, from, to, node);
    return edit ? { cell, ...edit } : null;
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
    this.stopWatchingWrites();
    this.lastFill = null;
  }
}

// The gesture's own rule, or the mode a menu redo forces: `"series"` only where a line can step.
function lineModeFor(values: readonly unknown[], mode: FillHandleMode, flip: boolean, force: FillLineMode | null): FillLineMode {
  if (force === "copy") return "copy";
  if (force === "series") return seriesKind(values) ? "series" : "copy";
  return resolveLineMode(values, mode, flip);
}

function sameEdits(a: readonly FillEdit[], b: readonly FillEdit[]): boolean {
  return a.length === b.length && a.every((edit, i) =>
    edit.cell.rowId === b[i].cell.rowId
    && edit.cell.colId === b[i].cell.colId
    && valuesAreSame(edit.value, b[i].value));
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
 * How a value reaches its target column, or null when it cannot. Between columns of one `type` —
 * always the case filling down or up — the stored value moves as it is, parser untouched. Into a
 * differently typed column the value's text goes through that column's parser, exactly as a paste
 * would, except that a computed number or date already in the target's own kind is stored
 * directly. Text the target's built-in parser would refuse ("abc" into a number column) is
 * dropped here rather than in the commit, so the fill reports only cells it can write; a custom
 * `valueParser` is left to the commit path, which skips its refusals the same way.
 */
function writeForm(value: unknown, from: Column, to: Column, row: IRowNode): { value: unknown; parsed: boolean } | null {
  if (from.type === to.type) return { value, parsed: true };
  if (typeof value === "number" && to.isNumericType()) return { value, parsed: true };
  if (value instanceof Date && to.type === ColumnType.DATE) return { value, parsed: true };
  const text = from.formatValue(value, row);
  if (!to.valueParser && parseTextByType(to.type, text, to.getValue(row)) === REJECT) return null;
  return { value: text, parsed: false };
}

function sameTarget(a: FillTarget | null, b: FillTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.axis === b.axis
    && a.rect.rowStart === b.rect.rowStart && a.rect.rowEnd === b.rect.rowEnd
    && a.rect.colStart === b.rect.colStart && a.rect.colEnd === b.rect.colEnd;
}
