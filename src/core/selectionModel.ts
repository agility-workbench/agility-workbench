import { Column } from "../column/column";
import { ColumnModel } from "../column/columnModel";
import { GridId } from "../interfaces/iGridCore";
import { IRowModel } from "../interfaces/iRowModel";
import { CellPos, CellRef, SelectionRange, SelectionSnapshot } from "../interfaces/selection";

export type NavDir = "up" | "down" | "left" | "right";

interface SelectionModelDeps {
  getRowModel: () => IRowModel;
  getColumnModel: () => ColumnModel;
  getRowIdAtViewIndex: (viewIdx: number) => GridId | null;
  getPageStartIdx: () => number;
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

  // Last loaded contiguous row in the given vertical direction. For client-side rows
  // getRowNodeAtViewIndex is always defined, so this resolves to 0 / maxRow.
  private verticalEdge(fromRow: number, dir: "up" | "down"): number {
    const rowModel = this.deps.getRowModel();
    if (dir === "up") {
      let edge = fromRow;
      while (edge - 1 >= 0 && rowModel.getRowNodeAtViewIndex(edge - 1)) edge--;
      return edge;
    }
    const maxRow = this.maxRow();
    let edge = fromRow;
    while (edge + 1 <= maxRow && rowModel.getRowNodeAtViewIndex(edge + 1)) edge++;
    return edge;
  }

  /** Arrow-key navigation. Returns the new active cell, or null if nothing changed. */
  navigate(dir: NavDir, opts: { extend: boolean; toEdge: boolean }): CellPos | null {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const maxRow = this.maxRow();
    if (lastCol < firstCol || maxRow < 0) return null;

    // Nothing selected yet: select the first data cell.
    if (!this.active || !this.range) {
      this.selectSingleCell(0, firstCol);
      return this.active;
    }

    const from = this.active;
    let nextRow = from.row;
    let nextCol = from.colIdx;

    switch (dir) {
      case "left":
        nextCol = opts.toEdge ? firstCol : Math.max(firstCol, from.colIdx - 1);
        break;
      case "right":
        nextCol = opts.toEdge ? lastCol : Math.min(lastCol, from.colIdx + 1);
        break;
      case "up":
        nextRow = opts.toEdge ? this.verticalEdge(from.row, "up") : Math.max(0, from.row - 1);
        break;
      case "down":
        nextRow = opts.toEdge ? this.verticalEdge(from.row, "down") : Math.min(maxRow, from.row + 1);
        break;
    }

    return this.moveActiveTo(nextRow, nextCol, opts.extend);
  }

  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). Returns the new active cell. */
  navigateToCorner(corner: "topLeft" | "bottomRight", extend: boolean): CellPos | null {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const maxRow = this.maxRow();
    if (lastCol < firstCol || maxRow < 0) return null;

    const nextRow = corner === "topLeft" ? 0 : maxRow;
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
