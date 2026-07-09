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
  startFromCell(location: { viewIdx: number; colIdx: number }): boolean {
    if (location.viewIdx < 0 || location.viewIdx >= this.deps.getRowModel().getViewCount()) return false;
    if (location.colIdx < 0 || location.colIdx >= this.leafColumns().length) return false;
    this.clearRows();
    this.clearColumns();
    this.anchor = { row: location.viewIdx, colIdx: location.colIdx };
    this.active = { row: location.viewIdx, colIdx: location.colIdx };
    this.range = {
      rowStart: location.viewIdx,
      rowEnd: location.viewIdx,
      colStart: location.colIdx,
      colEnd: location.colIdx,
      pageStartIdx: this.deps.getPageStartIdx(),
    };
    return true;
  }

  updateRange(endRow: number, endCol: number): boolean {
    if (!this.anchor) return false;
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

  selectSingleCell(viewIdx: number, colIdx: number): boolean {
    this.clearRows();
    this.clearColumns();
    return this.startFromCell({ viewIdx, colIdx });
  }

  clearRange() {
    this.anchor = null;
    this.active = null;
    this.range = null;
  }

  // A cell is empty when its value is null/undefined/"". 0 and false are real values.
  // A cell whose row is not currently loaded (server-side sparse data) is treated as empty
  // AND as a hard boundary for block scanning (see blockJump).
  private isEmptyCell(row: number, colIdx: number): boolean {
    const node = this.deps.getRowModel().getRowNodeAtViewIndex(row);
    if (!node) return true;
    const col = this.leafColumns()[colIdx];
    if (!col) return true;
    const v = col.getValue(node);
    return v == null || v === "";
  }

  // Whether a row is loaded — an unloaded row is a hard stop for block scanning so the jump
  // never crosses into (or past) the unloaded region for server-side data.
  private isRowLoaded(row: number): boolean {
    return !!this.deps.getRowModel().getRowNodeAtViewIndex(row);
  }

  /**
   * Excel-style Ctrl+Arrow block jump from (fromRow, fromCol) along (dRow, dCol) — exactly one of
   * the deltas is non-zero. Bounded by [0, maxRow] × [firstCol, lastCol]. Rules, based on the
   * current cell and its immediate neighbor:
   *  - current filled, neighbor filled → last filled cell of the contiguous run.
   *  - current filled, neighbor empty  → next filled cell across the gap (or the edge if none).
   *  - current empty                   → first filled cell ahead (or the edge if none).
   * For server-side data, an unloaded row is a hard boundary: the scan stops at the last loaded
   * cell before it, so the effective edge is the first/last loaded row.
   */
  private blockJump(fromRow: number, fromCol: number, dRow: number, dCol: number): { row: number; col: number } {
    const minCol = this.firstSelectableColIdx();
    const maxCol = this.lastColIdx();
    const maxRow = this.maxRow();
    const inBounds = (r: number, c: number) => r >= 0 && r <= maxRow && c >= minCol && c <= maxCol;

    const next = (r: number, c: number) => ({ r: r + dRow, c: c + dCol });
    // A step is traversable only when its target row is loaded (vertical scans); horizontal
    // scans stay on one row, so loading only needs checking once.
    const loadedAt = (r: number) => (dRow !== 0 ? this.isRowLoaded(r) : true);

    let r = fromRow;
    let c = fromCol;
    const startEmpty = this.isEmptyCell(r, c);

    // First hop must be to a loaded, in-bounds cell; otherwise we're already at the edge.
    let step = next(r, c);
    if (!inBounds(step.r, step.c) || !loadedAt(step.r)) {
      return { row: r, col: c };
    }

    const neighborEmpty = this.isEmptyCell(step.r, step.c);

    if (!startEmpty && !neighborEmpty) {
      // Run: advance while the NEXT cell stays filled and loaded → stop at end of the run.
      while (true) {
        const ahead = next(r, c);
        if (!inBounds(ahead.r, ahead.c) || !loadedAt(ahead.r) || this.isEmptyCell(ahead.r, ahead.c)) break;
        r = ahead.r; c = ahead.c;
      }
      return { row: r, col: c };
    }

    // Gap / start-on-empty: advance to the first filled, loaded cell ahead. If none exists,
    // land on the last in-bounds loaded cell (the edge).
    let lastReachable = { row: r, col: c };
    while (true) {
      const ahead = next(r, c);
      if (!inBounds(ahead.r, ahead.c) || !loadedAt(ahead.r)) break;
      r = ahead.r; c = ahead.c;
      lastReachable = { row: r, col: c };
      if (!this.isEmptyCell(r, c)) return { row: r, col: c };
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
    const maxRow = this.maxRow();
    if (lastCol < firstCol || maxRow < 0) return null;

    // Nothing selected yet: select the first selectable data cell.
    if (!this.active || !this.range) {
      this.selectSingleCell(this.nearestSelectableRow(0, 1), firstCol);
      return this.active;
    }

    const from = this.active;
    let nextRow = from.row;
    let nextCol = from.colIdx;

    if (opts.jump === "block") {
      // Excel-style Ctrl+Arrow: jump across data blocks based on cell contents.
      const delta = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
      const jumped = this.blockJump(from.row, from.colIdx, delta[0], delta[1]);
      nextRow = jumped.row;
      nextCol = jumped.col;
    } else if (opts.jump === "edge") {
      // Home/End: hard edge, regardless of cell contents.
      switch (dir) {
        case "left": nextCol = firstCol; break;
        case "right": nextCol = lastCol; break;
        case "up": nextRow = 0; break;
        case "down": nextRow = maxRow; break;
      }
    } else if (opts.jump === "page") {
      // PageUp/PageDown: move by one viewport of rows (supplied by the renderer). Horizontal
      // directions have no natural "page", so fall back to a single-cell step.
      const pageRows = Math.max(1, opts.pageRows ?? 1);
      switch (dir) {
        case "up": nextRow = Math.max(0, from.row - pageRows); break;
        case "down": nextRow = Math.min(maxRow, from.row + pageRows); break;
        case "left": nextCol = Math.max(firstCol, from.colIdx - 1); break;
        case "right": nextCol = Math.min(lastCol, from.colIdx + 1); break;
      }
    } else {
      switch (dir) {
        case "left": nextCol = Math.max(firstCol, from.colIdx - 1); break;
        case "right": nextCol = Math.min(lastCol, from.colIdx + 1); break;
        case "up": nextRow = Math.max(0, from.row - 1); break;
        case "down": nextRow = Math.min(maxRow, from.row + 1); break;
      }
    }

    // Skip over non-selectable (group) rows. Prefer the direction of travel; for horizontal moves
    // (row unchanged) prefer moving down, then up.
    const preferDir: 1 | -1 = nextRow < from.row ? -1 : 1;
    nextRow = this.nearestSelectableRow(nextRow, preferDir);

    return this.moveActiveTo(nextRow, nextCol, opts.extend);
  }

  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). Returns the new active cell. */
  navigateToCorner(corner: "topLeft" | "bottomRight", extend: boolean): CellPos | null {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const maxRow = this.maxRow();
    if (lastCol < firstCol || maxRow < 0) return null;

    const nextRow = corner === "topLeft"
      ? this.nearestSelectableRow(0, 1)
      : this.nearestSelectableRow(maxRow, -1);
    const nextCol = corner === "topLeft" ? firstCol : lastCol;
    return this.moveActiveTo(nextRow, nextCol, extend);
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
    if (extend) {
      if (!this.anchor) {
        this.anchor = this.active ? { ...this.active } : { row, colIdx: col };
      }
      this.updateRange(row, col);
    } else {
      this.selectSingleCell(row, col);
    }
    return this.active;
  }

  clampToView() {
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
