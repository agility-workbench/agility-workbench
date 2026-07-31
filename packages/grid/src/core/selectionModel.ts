import { Column } from "../column/column";
import { ColumnModel } from "../column/columnModel";
import { GridId } from "../interfaces/iGridCore";
import { IRowModel } from "../interfaces/iRowModel";
import { CellPos, CellRef, SelectionRange, SelectionSnapshot } from "../interfaces/selection";

export type NavDir = "up" | "down" | "left" | "right";
/**
 * Step size for navigate():
 *  - "edge"  = hard first/last (Home/End)
 *  - "block" = Excel data jump (Ctrl+Arrow)
 *  - "page"  = one viewport of rows (PageUp/PageDown); the row count is supplied by the renderer
 *              via opts.pageRows since only the renderer knows the viewport height.
 */
export type NavJump = "edge" | "block" | "page";

interface SelectionModelDeps {
  getRowModel: () => IRowModel;
  getColumnModel: () => ColumnModel;
  getRowIdAtViewIndex: (viewIdx: number) => GridId | null;
  getPageStartIdx: () => number;
  // Whether a view-index row can hold a cell selection / be a navigation target (group rows are
  // skipped unless groupRowsSelectable is enabled).
  isRowSelectable: (viewIdx: number) => boolean;
  getPinnedRowCount?: (position: "top" | "bottom") => number;
  getPinnedRowNode?: (
    position: "top" | "bottom",
    rowIndex: number,
  ) => import("../interfaces/iRowNode").IRowNode | null;
}

/**
 * Core-owned selection state + logic. Holds cell/range, row, and column selection and all the
 * navigation / clamping / toggling logic. This class only mutates state — rendering happens in
 * the renderer, which reads these getters and repaints when the core emits selectionChanged /
 * focusChanged.
 *
 * Coordinates are hybrid: range/anchor/active live in view-index space (row = view index,
 * colIdx = global leaf index); row selection is keyed by stable rowId; column selection by colId.
 */
export class SelectionModel {
  private anchor: CellPos | null = null;
  private active: CellPos | null = null;
  private range: SelectionRange | null = null;
  private selectedColumnIds: Set<string> = new Set();
  private selectedRowIds: Set<string> = new Set();
  private rowAnchorViewIdx: number | null = null;

  constructor(private deps: SelectionModelDeps) { }

  // ---------------- Derived helpers ----------------
  private leafColumns(): Column[] {
    return this.deps.getColumnModel().getLeaves();
  }

  private firstSelectableColIdx(): number {
    return this.deps.getColumnModel().getLeadingLeaves().length;
  }

  private lastColIdx(): number {
    return this.leafColumns().length - 1;
  }

  private maxRow(): number {
    return this.deps.getRowModel().getViewCount() - 1;
  }

  private firstRowPosition(): CellPos | null {
    if ((this.deps.getPinnedRowCount?.("top") ?? 0) > 0) return { row: 0, colIdx: 0, rowPinned: "top" };
    if (this.maxRow() >= 0) return { row: this.nearestSelectableRow(0, 1), colIdx: 0 };
    if ((this.deps.getPinnedRowCount?.("bottom") ?? 0) > 0) return { row: 0, colIdx: 0, rowPinned: "bottom" };
    return null;
  }

  private lastRowPosition(): CellPos | null {
    const bottomCount = this.deps.getPinnedRowCount?.("bottom") ?? 0;
    if (bottomCount > 0) return { row: bottomCount - 1, colIdx: 0, rowPinned: "bottom" };
    if (this.maxRow() >= 0) return { row: this.nearestSelectableRow(this.maxRow(), -1), colIdx: 0 };
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    if (topCount > 0) return { row: topCount - 1, colIdx: 0, rowPinned: "top" };
    return null;
  }

  private stepVertical(from: CellPos, direction: 1 | -1): CellPos {
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    const bottomCount = this.deps.getPinnedRowCount?.("bottom") ?? 0;
    const bodyCount = this.maxRow() + 1;
    if (direction < 0) {
      if (from.rowPinned === "bottom") {
        if (from.row > 0) return { ...from, row: from.row - 1 };
        if (bodyCount > 0) return { row: this.nearestSelectableRow(bodyCount - 1, -1), colIdx: from.colIdx };
        if (topCount > 0) return { row: topCount - 1, colIdx: from.colIdx, rowPinned: "top" };
        return from;
      }
      if (!from.rowPinned) {
        const previous = this.nearestSelectableRow(from.row - 1, -1);
        if (from.row > 0 && previous < from.row) return { row: previous, colIdx: from.colIdx };
        if (topCount > 0) return { row: topCount - 1, colIdx: from.colIdx, rowPinned: "top" };
        return from;
      }
      return from.row > 0 ? { ...from, row: from.row - 1 } : from;
    }

    if (from.rowPinned === "top") {
      if (from.row + 1 < topCount) return { ...from, row: from.row + 1 };
      if (bodyCount > 0) return { row: this.nearestSelectableRow(0, 1), colIdx: from.colIdx };
      if (bottomCount > 0) return { row: 0, colIdx: from.colIdx, rowPinned: "bottom" };
      return from;
    }
    if (!from.rowPinned) {
      const next = this.nearestSelectableRow(from.row + 1, 1);
      if (from.row + 1 < bodyCount && next > from.row) return { row: next, colIdx: from.colIdx };
      if (bottomCount > 0) return { row: 0, colIdx: from.colIdx, rowPinned: "bottom" };
      return from;
    }
    return from.row + 1 < bottomCount ? { ...from, row: from.row + 1 } : from;
  }

  private moveVertical(from: CellPos, delta: number): CellPos {
    let next = from;
    const direction: 1 | -1 = delta < 0 ? -1 : 1;
    for (let i = 0; i < Math.abs(delta); i++) {
      const stepped = this.stepVertical(next, direction);
      if (stepped.row === next.row && stepped.rowPinned === next.rowPinned) break;
      next = stepped;
    }
    return next;
  }

  // ---------------- Reads ----------------
  getSelectionRange(): SelectionRange | null {
    if (!this.range) return null;
    if (this.range.pageStartIdx !== this.deps.getPageStartIdx()) return null;
    return this.range;
  }

  getAnchor(): CellPos | null {
    return this.anchor;
  }

  getActiveCell(): CellPos | null {
    return this.active;
  }

  getSelectedColumnIds(): Set<string> {
    return this.selectedColumnIds;
  }

  getSelectedRowIds(): Set<string> {
    return this.selectedRowIds;
  }

  isCellInActiveSelection(viewIdx: number, colIdx: number, rowId: string, colId: string): boolean {
    const r = this.range;
    if (r && r.pageStartIdx === this.deps.getPageStartIdx()) {
      if (viewIdx >= r.rowStart && viewIdx <= r.rowEnd && colIdx >= r.colStart && colIdx <= r.colEnd) return true;
    }
    if (this.selectedRowIds.has(rowId)) return true;
    if (this.selectedColumnIds.has(colId)) return true;
    return false;
  }

  getSnapshot(resolveIds = false): SelectionSnapshot {
    const range = this.getSelectionRange();
    const snapshot: SelectionSnapshot = {
      kind: this.currentKind(range),
      range,
      anchor: this.anchor ? { ...this.anchor } : null,
      active: this.active ? { ...this.active } : null,
      selectedRowIds: Array.from(this.selectedRowIds),
      selectedColumnIds: Array.from(this.selectedColumnIds),
    };

    if (resolveIds) {
      snapshot.rangeCells = range ? this.resolveRangeCells(range) : null;
    }

    return snapshot;
  }

  private currentKind(range: SelectionRange | null): SelectionSnapshot["kind"] {
    if (this.selectedRowIds.size > 0) return "row";
    if (this.selectedColumnIds.size > 0) return "column";
    if (range) {
      const single = range.rowStart === range.rowEnd && range.colStart === range.colEnd;
      return single ? "cell" : "range";
    }
    if (this.active?.rowPinned) return "cell";
    return "none";
  }

  // Flatten the range rectangle to a row-major list of CellRefs. Rows not currently loaded
  // (server-side sparse data) have no rowId and are omitted, so this yields loaded cells only.
  private resolveRangeCells(range: SelectionRange): CellRef[] {
    const leaves = this.leafColumns();
    const colIds: string[] = [];
    for (let c = range.colStart; c <= range.colEnd; c++) {
      const col = leaves[c];
      if (col) colIds.push(col.instanceID);
    }
    const cells: CellRef[] = [];
    for (let r = range.rowStart; r <= range.rowEnd; r++) {
      const rowId = this.deps.getRowIdAtViewIndex(r);
      if (!rowId) continue;
      for (const colId of colIds) {
        cells.push({ rowId, colId });
      }
    }
    return cells;
  }

  // ---------------- Cell range selection ----------------
  startFromCell(location: {
    viewIdx: number;
    colIdx: number;
    rowPinned?: "top" | "bottom";
  }): boolean {
    const rowCount = location.rowPinned
      ? this.deps.getPinnedRowCount?.(location.rowPinned) ?? 0
      : this.deps.getRowModel().getViewCount();
    if (location.viewIdx < 0 || location.viewIdx >= rowCount) return false;
    if (location.colIdx < 0 || location.colIdx >= this.leafColumns().length) return false;
    this.clearRows();
    this.clearColumns();
    this.anchor = { row: location.viewIdx, colIdx: location.colIdx, rowPinned: location.rowPinned };
    this.active = { row: location.viewIdx, colIdx: location.colIdx, rowPinned: location.rowPinned };
    if (location.rowPinned) {
      // The existing rectangular range remains body-view-index based. A pinned cell still owns
      // focus/active styling, while range extension begins once both endpoints are in the body.
      this.range = null;
      return true;
    }
    this.range = {
      rowStart: location.viewIdx,
      rowEnd: location.viewIdx,
      colStart: location.colIdx,
      colEnd: location.colIdx,
      pageStartIdx: this.deps.getPageStartIdx(),
    };
    return true;
  }

  updateRange(endRow: number, endCol: number, rowPinned?: "top" | "bottom"): boolean {
    if (!this.anchor) return false;
    if (rowPinned || this.anchor.rowPinned) {
      return this.startFromCell({ viewIdx: endRow, colIdx: endCol, rowPinned });
    }
    const viewCount = this.deps.getRowModel().getViewCount();
    const leafCount = this.leafColumns().length;
    if (viewCount === 0 || leafCount === 0) {
      this.clearRange();
      return true;
    }

    const maxRow = viewCount - 1;
    const maxCol = leafCount - 1;
    const nextRow = Math.min(Math.max(endRow, 0), maxRow);
    const nextCol = Math.min(Math.max(endCol, 0), maxCol);

    this.active = { row: nextRow, colIdx: nextCol };
    this.range = {
      rowStart: Math.min(this.anchor.row, nextRow),
      rowEnd: Math.max(this.anchor.row, nextRow),
      colStart: Math.min(this.anchor.colIdx, nextCol),
      colEnd: Math.max(this.anchor.colIdx, nextCol),
      pageStartIdx: this.deps.getPageStartIdx(),
    };
    return true;
  }

  selectSingleCell(viewIdx: number, colIdx: number, rowPinned?: "top" | "bottom"): boolean {
    this.clearRows();
    this.clearColumns();
    return this.startFromCell({ viewIdx, colIdx, rowPinned });
  }

  clearRange() {
    this.anchor = null;
    this.active = null;
    this.range = null;
  }

  /** Remove selected columns that no longer exist after a column-definition update. */
  retainSelectedColumns(validIds: Set<string>): boolean {
    let changed = false;
    for (const id of this.selectedColumnIds) {
      if (validIds.has(id)) continue;
      this.selectedColumnIds.delete(id);
      changed = true;
    }
    return changed;
  }

  private rowNodeAtPosition(position: CellPos) {
    return position.rowPinned
      ? this.deps.getPinnedRowNode?.(position.rowPinned, position.row) ?? null
      : this.deps.getRowModel().getRowNodeAtViewIndex(position.row);
  }

  private isEmptyPosition(position: CellPos): boolean {
    const node = this.rowNodeAtPosition(position);
    if (!node) return true;
    const col = this.leafColumns()[position.colIdx];
    if (!col) return true;
    const value = col.getValue(node);
    return value == null || value === "";
  }

  /** Excel-style Ctrl+Arrow scan across pinned row and column section boundaries. */
  private blockJumpPosition(
    from: CellPos,
    dRow: number,
    dCol: number,
  ): CellPos {
    const minCol = this.firstSelectableColIdx();
    const maxCol = this.lastColIdx();
    const advance = (position: CellPos): CellPos | null => {
      if (dCol !== 0) {
        const colIdx = position.colIdx + dCol;
        return colIdx >= minCol && colIdx <= maxCol ? { ...position, colIdx } : null;
      }
      const next = this.stepVertical(position, dRow < 0 ? -1 : 1);
      if (next.row === position.row && next.rowPinned === position.rowPinned) return null;
      return this.rowNodeAtPosition(next) ? next : null;
    };

    const first = advance(from);
    if (!first) return from;
    const startEmpty = this.isEmptyPosition(from);
    const neighborEmpty = this.isEmptyPosition(first);

    if (!startEmpty && !neighborEmpty) {
      let current = from;
      while (true) {
        const ahead = advance(current);
        if (!ahead || this.isEmptyPosition(ahead)) break;
        current = ahead;
      }
      return current;
    }

    let current = from;
    let lastReachable = from;
    while (true) {
      const ahead = advance(current);
      if (!ahead) break;
      current = ahead;
      lastReachable = ahead;
      if (!this.isEmptyPosition(ahead)) return ahead;
    }
    return lastReachable;
  }

  /**
   * Arrow-key navigation. Returns the new active cell, or null if nothing changed.
   * `jump` controls the step size:
   *  - undefined → move one cell (plain Arrow).
   *  - "edge"    → hard edge, ignoring cell contents (Home/End): first/last column or top/bottom row.
   *  - "block"   → Excel-style data-block jump (Ctrl+Arrow), see blockJump.
   *  - "page"    → move by opts.pageRows rows (PageUp/PageDown); horizontal dirs fall back to
   *                a single-cell step. Column is unchanged.
   */
  navigate(dir: NavDir, opts: { extend: boolean; jump?: NavJump; pageRows?: number }): CellPos | null {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const firstPosition = this.firstRowPosition();
    if (lastCol < firstCol || !firstPosition) return null;

    // Nothing selected yet: select the first selectable data cell.
    if (!this.active) {
      this.selectSingleCell(firstPosition.row, firstCol, firstPosition.rowPinned);
      return this.active;
    }

    const from = this.active;
    let nextPosition = { ...from };
    let nextCol = from.colIdx;

    if (opts.jump === "block") {
      // Excel-style Ctrl+Arrow: jump across data blocks based on cell contents.
      const delta = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
      nextPosition = this.blockJumpPosition(from, delta[0], delta[1]);
      nextCol = nextPosition.colIdx;
    } else if (opts.jump === "edge") {
      // Home/End: hard edge, regardless of cell contents.
      switch (dir) {
        case "left": nextCol = firstCol; break;
        case "right": nextCol = lastCol; break;
        case "up": nextPosition = this.firstRowPosition() ?? nextPosition; break;
        case "down": nextPosition = this.lastRowPosition() ?? nextPosition; break;
      }
    } else if (opts.jump === "page") {
      // PageUp/PageDown: move by one viewport of rows (supplied by the renderer). Horizontal
      // directions have no natural "page", so fall back to a single-cell step.
      const pageRows = Math.max(1, opts.pageRows ?? 1);
      switch (dir) {
        case "up": nextPosition = this.moveVertical(from, -pageRows); break;
        case "down": nextPosition = this.moveVertical(from, pageRows); break;
        case "left": nextCol = Math.max(firstCol, from.colIdx - 1); break;
        case "right": nextCol = Math.min(lastCol, from.colIdx + 1); break;
      }
    } else {
      switch (dir) {
        case "left": nextCol = Math.max(firstCol, from.colIdx - 1); break;
        case "right": nextCol = Math.min(lastCol, from.colIdx + 1); break;
        case "up": nextPosition = this.stepVertical(from, -1); break;
        case "down": nextPosition = this.stepVertical(from, 1); break;
      }
    }

    return this.moveActiveToPosition(
      { row: nextPosition.row, colIdx: nextCol, rowPinned: nextPosition.rowPinned },
      opts.extend,
    );
  }

  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). Returns the new active cell. */
  navigateToCorner(corner: "topLeft" | "bottomRight", extend: boolean): CellPos | null {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const position = corner === "topLeft" ? this.firstRowPosition() : this.lastRowPosition();
    if (lastCol < firstCol || !position) return null;
    const nextCol = corner === "topLeft" ? firstCol : lastCol;
    return this.moveActiveToPosition({ ...position, colIdx: nextCol }, extend);
  }

  /** Select the entire grid (all data cells). Anchor at top-left, active at bottom-right. */
  selectAll(): CellPos | null {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const maxRow = this.maxRow();
    if (lastCol < firstCol || maxRow < 0) return null;

    this.clearRows();
    this.clearColumns();
    this.anchor = { row: 0, colIdx: firstCol };
    this.active = { row: maxRow, colIdx: lastCol };
    this.range = {
      rowStart: 0,
      rowEnd: maxRow,
      colStart: firstCol,
      colEnd: lastCol,
      pageStartIdx: this.deps.getPageStartIdx(),
    };
    return this.active;
  }

  // Resolve a target row to the nearest selectable row, skipping non-selectable (e.g. group) rows.
  // Scans in `preferDir` first (+1 down / -1 up), then the opposite direction as a fallback, so a
  // move never lands on a skipped row and never gets stuck. Returns the original row if nothing is
  // selectable (degenerate — all rows skipped).
  private nearestSelectableRow(target: number, preferDir: 1 | -1): number {
    const maxRow = this.maxRow();
    if (maxRow < 0) return target;
    const clamped = Math.min(Math.max(target, 0), maxRow);
    if (this.deps.isRowSelectable(clamped)) return clamped;
    for (const dir of [preferDir, -preferDir as 1 | -1]) {
      for (let r = clamped + dir; r >= 0 && r <= maxRow; r += dir) {
        if (this.deps.isRowSelectable(r)) return r;
      }
    }
    return clamped;
  }

  // Move the active cell to (row, col): extend the range from the existing anchor, or collapse
  // to a single cell. Shared by navigate() and navigateToCorner().
  private moveActiveTo(row: number, col: number, extend: boolean): CellPos | null {
    return this.moveActiveToPosition({ row, colIdx: col }, extend);
  }

  private moveActiveToPosition(position: CellPos, extend: boolean): CellPos | null {
    if (extend) {
      if (!this.anchor) {
        this.anchor = this.active ? { ...this.active } : { ...position };
      }
      this.updateRange(position.row, position.colIdx, position.rowPinned);
    } else {
      this.selectSingleCell(position.row, position.colIdx, position.rowPinned);
    }
    return this.active;
  }

  clampToView() {
    if (this.active?.rowPinned) {
      if (this.active.row >= (this.deps.getPinnedRowCount?.(this.active.rowPinned) ?? 0)) this.clearRange();
      return;
    }
    if (!this.range) return;
    if (this.range.pageStartIdx !== this.deps.getPageStartIdx()) return;
    const viewCount = this.deps.getRowModel().getViewCount();
    const leafCount = this.leafColumns().length;
    if (viewCount === 0 || leafCount === 0) {
      this.clearRange();
      return;
    }

    const maxRow = viewCount - 1;
    const maxCol = leafCount - 1;
    const rowStart = Math.min(this.range.rowStart, maxRow);
    const rowEnd = Math.min(this.range.rowEnd, maxRow);
    const colStart = Math.min(this.range.colStart, maxCol);
    const colEnd = Math.min(this.range.colEnd, maxCol);

    this.range = {
      rowStart: Math.min(rowStart, rowEnd),
      rowEnd: Math.max(rowStart, rowEnd),
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
      pageStartIdx: this.range.pageStartIdx,
    };

    if (this.anchor) {
      this.anchor = {
        row: Math.min(Math.max(this.anchor.row, 0), maxRow),
        colIdx: Math.min(Math.max(this.anchor.colIdx, 0), maxCol),
      };
    }
    if (this.active) {
      this.active = {
        row: Math.min(Math.max(this.active.row, 0), maxRow),
        colIdx: Math.min(Math.max(this.active.colIdx, 0), maxCol),
      };
    }
  }

  // ---------------- Column selection ----------------
  toggleColumn(colId: string, mode: "replace" | "toggle" = "toggle") {
    this.clearRange();
    this.clearRows();
    const columnModel = this.deps.getColumnModel();
    const col = columnModel.getById(colId);
    if (!col || col.isInternal()) return;

    const leaves = col.getVisibleLeaves();
    const hasChildren = col.children.length > 0;
    const targetIds = hasChildren
      ? leaves.map(l => l.instanceID)
      : [col.instanceID];

    if (mode === "replace") {
      const allSelected = targetIds.every(id => this.selectedColumnIds.has(id))
        && this.selectedColumnIds.size === targetIds.length;
      this.selectedColumnIds.clear();
      if (!allSelected) {
        targetIds.forEach(id => this.selectedColumnIds.add(id));
      }
    } else {
      const allSelected = targetIds.every(id => this.selectedColumnIds.has(id));
      if (allSelected) {
        targetIds.forEach(id => this.selectedColumnIds.delete(id));
      } else {
        targetIds.forEach(id => this.selectedColumnIds.add(id));
      }
    }

    this.reconcileParentSelection();
  }

  clearColumns() {
    this.selectedColumnIds.clear();
  }

  pruneColumns() {
    const keep = new Set<string>();
    const visit = (cols: Column[]) => {
      for (const col of cols) {
        if (this.selectedColumnIds.has(col.instanceID)) keep.add(col.instanceID);
        if (col.children) visit(col.children);
      }
    };
    visit(this.deps.getColumnModel().getColumns());
    this.selectedColumnIds = keep;
  }

  private reconcileParentSelection() {
    const columnModel = this.deps.getColumnModel();
    const parents = new Map<string, Column>();
    for (const selectedColId of this.selectedColumnIds) {
      const col = columnModel.getById(selectedColId);
      if (!col) continue;
      if (col.children.length > 0) {
        parents.set(col.instanceID, col);
      } else {
        const tree = columnModel.getAncestors(selectedColId);
        if (tree.length > 1) {
          tree.slice(0, -1).forEach(p => parents.set(p.instanceID, p));
        }
      }
    }

    for (const parent of parents.values()) {
      const leaves = parent.getVisibleLeaves();
      const allSelected = leaves.length > 0
        && leaves.every(l => this.selectedColumnIds.has(l.instanceID));
      if (allSelected) {
        this.selectedColumnIds.add(parent.instanceID);
      } else {
        this.selectedColumnIds.delete(parent.instanceID);
      }
    }
  }

  // ---------------- Row selection ----------------
  toggleRow(viewIdx: number, mode: "replace" | "toggle" | "range") {
    const rowId = this.deps.getRowIdAtViewIndex(viewIdx);
    if (!rowId) return;

    if (mode === "range" && this.rowAnchorViewIdx != null) {
      const anchorIdx = this.rowAnchorViewIdx;
      const start = Math.min(anchorIdx, viewIdx);
      const end = Math.max(anchorIdx, viewIdx);
      this.selectedRowIds.clear();
      for (let i = start; i <= end; i++) {
        const id = this.deps.getRowIdAtViewIndex(i);
        if (id) this.selectedRowIds.add(id);
      }
      this.clearRange();
      this.clearColumns();
      return;
    }

    if (mode === "toggle") {
      if (this.selectedRowIds.has(rowId)) {
        this.selectedRowIds.delete(rowId);
      } else {
        this.selectedRowIds.add(rowId);
      }
      this.rowAnchorViewIdx = viewIdx;
      this.clearRange();
      this.clearColumns();
      return;
    }

    this.replaceRow(rowId, viewIdx);
  }

  // Select every selectable data row in the current view (group rows are skipped unless
  // groupRowsSelectable is enabled). Clears any cell-range / column selection first.
  selectAllRows() {
    this.clearRange();
    this.clearColumns();
    this.selectedRowIds.clear();
    const viewCount = this.deps.getRowModel().getViewCount();
    for (let i = 0; i < viewCount; i++) {
      if (!this.deps.isRowSelectable(i)) continue;
      const id = this.deps.getRowIdAtViewIndex(i);
      if (id) this.selectedRowIds.add(id);
    }
    this.rowAnchorViewIdx = null;
  }

  // Whether every selectable data row in the current view is selected. False when there are no
  // selectable rows. Used to decide the toggle direction for row-number header-click select-all.
  areAllRowsSelected(): boolean {
    const viewCount = this.deps.getRowModel().getViewCount();
    let selectable = 0;
    for (let i = 0; i < viewCount; i++) {
      if (!this.deps.isRowSelectable(i)) continue;
      selectable++;
      const id = this.deps.getRowIdAtViewIndex(i);
      if (!id || !this.selectedRowIds.has(id)) return false;
    }
    return selectable > 0;
  }

  private replaceRow(rowId: string, viewIdx: number) {
    const wasOnlySelected = this.selectedRowIds.size === 1 && this.selectedRowIds.has(rowId);
    this.selectedRowIds.clear();
    if (!wasOnlySelected) {
      this.selectedRowIds.add(rowId);
      this.rowAnchorViewIdx = viewIdx;
    } else {
      this.rowAnchorViewIdx = null;
    }
    this.clearRange();
    this.clearColumns();
  }

  clearRows() {
    if (this.selectedRowIds.size === 0 && this.rowAnchorViewIdx == null) return;
    this.selectedRowIds.clear();
    this.rowAnchorViewIdx = null;
  }

  clearAll() {
    this.clearRange();
    this.clearRows();
    this.clearColumns();
  }
}
