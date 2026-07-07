import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { isTrue } from "../../misc";
import { RowPoolDef } from "../types";

export interface SelectionRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  pageStartIdx: number;
}

export interface SelectionAnchor {
  row: number;
  colIdx: number;
}

interface SelectionRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  rowPool: () => RowPoolDef[];
  startIndex: () => number;
  leafColumns: () => Column[];
  ensureCellVisible: (viewIdx: number, colIdx: number) => void;
}

type NavDir = "up" | "down" | "left" | "right";

export class SelectionRenderer {
  private selectionAnchor: SelectionAnchor | null = null;
  private activeCell: SelectionAnchor | null = null;
  private selectionRange: SelectionRange | null = null;
  private isSelecting = false;
  private selectedColumnIDs: Set<string> = new Set();
  private selectedRowIDs: Set<string> = new Set();
  private rowSelectionAnchorViewIdx: number | null = null;

  constructor(private params: SelectionRendererParams) { }

  // ---------------- Public accessors ----------------
  getSelectionRange(): SelectionRange | null {
    if (!this.selectionRange) return null;
    if (this.selectionRange.pageStartIdx !== this.params.core.getPageStartIdx()) return null;
    return this.selectionRange;
  }

  getSelectedColumnIDs(): Set<string> {
    return this.selectedColumnIDs;
  }

  getSelectedRowIDs(): Set<string> {
    return this.selectedRowIDs;
  }

  // ---------------- Context-menu helpers ----------------
  isCellInActiveSelection(viewIdx: number, colIdx: number, rowId: string, colId: string): boolean {
    const r = this.selectionRange;
    if (r && r.pageStartIdx === this.params.core.getPageStartIdx()) {
      if (viewIdx >= r.rowStart && viewIdx <= r.rowEnd && colIdx >= r.colStart && colIdx <= r.colEnd) return true;
    }
    if (this.selectedRowIDs.has(rowId)) return true;
    if (this.selectedColumnIDs.has(colId)) return true;
    return false;
  }

  selectSingleCell(viewIdx: number, colIdx: number) {
    this.clearRowSelection();
    this.clearColumnSelectionState();
    this.startSelectionFromCell({ viewIdx, colIdx });
    this.isSelecting = false;
    this.applyColumnSelectionStyles();
  }

  // ---------------- Hot path: per-row styling ----------------
  applySelectionToSlot(slot: RowPoolDef, viewIndex: number | null) {
    const storedRange = this.selectionRange;
    const range = storedRange && storedRange.pageStartIdx === this.params.core.getPageStartIdx()
      ? storedRange
      : null;
    const rangeRow = !!range && viewIndex != null && viewIndex >= range.rowStart && viewIndex <= range.rowEnd;
    const lastRow = viewIndex != null ? viewIndex === this.params.core.getRowModel().getViewCount() - 1 : false;
    const leaves = this.params.leafColumns();

    const rowId = viewIndex != null
      ? this.params.core.getRowIdAtViewIndex(viewIndex)
      : null;
    const rowSelected = !!rowId && this.selectedRowIDs.has(rowId);
    const prevRowSelected = this.isViewIndexRowSelected(viewIndex != null ? viewIndex - 1 : null);
    const nextRowSelected = this.isViewIndexRowSelected(viewIndex != null ? viewIndex + 1 : null);

    const apply = (cells: HTMLDivElement[] | undefined) => {
      if (!cells) return;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const colIdxRaw = cell.dataset.colIdx;
        const colIdx = colIdxRaw == null ? NaN : Number(colIdxRaw);
        const leafCol = Number.isFinite(colIdx) ? leaves[colIdx] : null;
        const colId = leafCol?.instanceID;
        const colSelected = colId ? this.selectedColumnIDs.has(colId) : false;

        const rangeSelected = !!rangeRow && !!range && Number.isFinite(colIdx)
          && colIdx >= range.colStart && colIdx <= range.colEnd;
        const selected = rangeSelected || colSelected || rowSelected;

        const prevColSelected = this.neighborSelected(leaves, range, colIdx - 1);
        const nextColSelected = this.neighborSelected(leaves, range, colIdx + 1);

        const isTop = rangeSelected
          ? (viewIndex === range?.rowStart)
          : rowSelected
            ? !prevRowSelected
            : false;
        const isBottom = rangeSelected
          ? (viewIndex === range?.rowEnd)
          : rowSelected
            ? !nextRowSelected
            : (colSelected && lastRow);
        const isLeft = rangeSelected
          ? (colIdx === range?.colStart)
          : rowSelected
            ? colIdx === 0
            : (colSelected && !prevColSelected);
        const isRight = rangeSelected
          ? (colIdx === range?.colEnd)
          : rowSelected
            ? colIdx === leaves.length - 1
            : (colSelected && !nextColSelected);

        const cls = cell.classList;
        cls.toggle("selected", selected);
        cls.toggle("selected-top", selected && isTop);
        cls.toggle("selected-bottom", selected && isBottom);
        cls.toggle("selected-left", selected && isLeft);
        cls.toggle("selected-right", selected && isRight);
      }
    };

    apply(slot.leadingCellEls);
    apply(slot.leftCellEls);
    apply(slot.cellEls);
    apply(slot.rightCellEls);
  }

  private isViewIndexRowSelected(viewIndex: number | null): boolean {
    if (viewIndex == null || viewIndex < 0) return false;
    const id = this.params.core.getRowIdAtViewIndex(viewIndex);
    return !!id && this.selectedRowIDs.has(id);
  }

  private neighborSelected(leaves: Column[], range: SelectionRange | null, colIdx: number): boolean {
    if (!Number.isFinite(colIdx) || colIdx < 0) return false;
    if (range && colIdx >= range.colStart && colIdx <= range.colEnd) return true;
    const col = leaves[colIdx];
    return !!col && this.selectedColumnIDs.has(col.instanceID);
  }

  refreshSelectionStyles() {
    const rowPool = this.params.rowPool();
    const total = this.params.core.getRowModel().getViewCount();
    const startIndex = this.params.startIndex();
    for (let i = 0; i < rowPool.length; i++) {
      const viewIndex = startIndex + i;
      const slot = rowPool[i];
      if (viewIndex >= total) {
        this.applySelectionToSlot(slot, null);
        continue;
      }
      this.applySelectionToSlot(slot, viewIndex);
    }
  }

  // ---------------- Cell range selection ----------------
  startSelectionFromCell(location: { viewIdx: number; colIdx: number }) {
    if (location.viewIdx < 0 || location.viewIdx >= this.params.core.getRowModel().getViewCount()) return;
    if (location.colIdx < 0 || location.colIdx >= this.params.leafColumns().length) return;
    this.clearRowSelection();
    this.selectionAnchor = { row: location.viewIdx, colIdx: location.colIdx };
    this.activeCell = { row: location.viewIdx, colIdx: location.colIdx };
    this.selectionRange = {
      rowStart: location.viewIdx,
      rowEnd: location.viewIdx,
      colStart: location.colIdx,
      colEnd: location.colIdx,
      pageStartIdx: this.params.core.getPageStartIdx(),
    };
    this.isSelecting = true;
    this.refreshSelectionStyles();
  }

  updateSelectionRange(endRow: number, endCol: number) {
    if (!this.selectionAnchor) return;
    const viewCount = this.params.core.getRowModel().getViewCount();
    const leafCount = this.params.leafColumns().length;
    if (viewCount === 0 || leafCount === 0) {
      this.clearSelection();
      return;
    }

    const maxRow = viewCount - 1;
    const maxCol = leafCount - 1;
    const nextRow = Math.min(Math.max(endRow, 0), maxRow);
    const nextCol = Math.min(Math.max(endCol, 0), maxCol);

    this.activeCell = { row: nextRow, colIdx: nextCol };
    this.selectionRange = {
      rowStart: Math.min(this.selectionAnchor.row, nextRow),
      rowEnd: Math.max(this.selectionAnchor.row, nextRow),
      colStart: Math.min(this.selectionAnchor.colIdx, nextCol),
      colEnd: Math.max(this.selectionAnchor.colIdx, nextCol),
      pageStartIdx: this.params.core.getPageStartIdx(),
    };
    this.refreshSelectionStyles();
  }

  isDraggingRange() {
    return this.isSelecting;
  }

  endRangeDrag() {
    this.isSelecting = false;
  }

  clearSelection() {
    this.selectionAnchor = null;
    this.activeCell = null;
    this.selectionRange = null;
    this.isSelecting = false;
    this.refreshSelectionStyles();
  }

  clampSelectionToView() {
    if (!this.selectionRange) return;
    if (this.selectionRange.pageStartIdx !== this.params.core.getPageStartIdx()) return;
    const viewCount = this.params.core.getRowModel().getViewCount();
    const leafCount = this.params.leafColumns().length;
    if (viewCount === 0 || leafCount === 0) {
      this.clearSelection();
      return;
    }

    const maxRow = viewCount - 1;
    const maxCol = leafCount - 1;
    const rowStart = Math.min(this.selectionRange.rowStart, maxRow);
    const rowEnd = Math.min(this.selectionRange.rowEnd, maxRow);
    const colStart = Math.min(this.selectionRange.colStart, maxCol);
    const colEnd = Math.min(this.selectionRange.colEnd, maxCol);

    this.selectionRange = {
      rowStart: Math.min(rowStart, rowEnd),
      rowEnd: Math.max(rowStart, rowEnd),
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
      pageStartIdx: this.selectionRange.pageStartIdx,
    };

    if (this.selectionAnchor) {
      this.selectionAnchor = {
        row: Math.min(Math.max(this.selectionAnchor.row, 0), maxRow),
        colIdx: Math.min(Math.max(this.selectionAnchor.colIdx, 0), maxCol),
      };
    }

    if (this.activeCell) {
      this.activeCell = {
        row: Math.min(Math.max(this.activeCell.row, 0), maxRow),
        colIdx: Math.min(Math.max(this.activeCell.colIdx, 0), maxCol),
      };
    }

    this.refreshSelectionStyles();
  }

  // ---------------- Column selection ----------------
  toggleColumnSelection(colID: string, mode: "replace" | "toggle" = "toggle") {
    this.clearSelection();
    this.clearRowSelection();
    const columnModel = this.params.core.getColumnModel();
    const col = columnModel.getById(colID);
    if (!col || col.isInternal()) return;

    const leaves = col.getVisibleLeaves();
    const hasChildren = col.children.length > 0;
    const targetIds = hasChildren
      ? leaves.map(l => l.instanceID)
      : [col.instanceID];

    if (mode === "replace") {
      const allSelected = targetIds.every(id => this.selectedColumnIDs.has(id))
        && this.selectedColumnIDs.size === targetIds.length;
      this.selectedColumnIDs.clear();
      if (!allSelected) {
        targetIds.forEach(id => this.selectedColumnIDs.add(id));
      }
    } else {
      const allSelected = targetIds.every(id => this.selectedColumnIDs.has(id));
      if (allSelected) {
        targetIds.forEach(id => this.selectedColumnIDs.delete(id));
      } else {
        targetIds.forEach(id => this.selectedColumnIDs.add(id));
      }
    }

    this.reconcileParentSelection();
    this.applyColumnSelectionStyles();
    this.refreshSelectionStyles();
  }

  clearColumnSelection() {
    this.selectedColumnIDs.clear();
    this.applyColumnSelectionStyles();
    this.refreshSelectionStyles();
  }

  // ---------------- Row selection ----------------
  toggleRowSelection(viewIdx: number, mode: "replace" | "toggle" | "range") {
    const rowId = this.params.core.getRowIdAtViewIndex(viewIdx);
    if (!rowId) return;

    if (mode === "range" && this.rowSelectionAnchorViewIdx != null) {
      const anchorIdx = this.rowSelectionAnchorViewIdx;
      const start = Math.min(anchorIdx, viewIdx);
      const end = Math.max(anchorIdx, viewIdx);
      this.selectedRowIDs.clear();
      for (let i = start; i <= end; i++) {
        const id = this.params.core.getRowIdAtViewIndex(i);
        if (id) this.selectedRowIDs.add(id);
      }
      this.clearSelectionRange();
      this.clearColumnSelectionState();
      this.refreshSelectionStyles();
      this.applyColumnSelectionStyles();
      return;
    }

    if (mode === "toggle") {
      if (this.selectedRowIDs.has(rowId)) {
        this.selectedRowIDs.delete(rowId);
      } else {
        this.selectedRowIDs.add(rowId);
      }
      this.rowSelectionAnchorViewIdx = viewIdx;
      this.clearSelectionRange();
      this.clearColumnSelectionState();
      this.refreshSelectionStyles();
      this.applyColumnSelectionStyles();
      return;
    }

    this.replaceRowSelection(rowId, viewIdx);
  }

  private replaceRowSelection(rowId: string, viewIdx: number) {
    const wasOnlySelected = this.selectedRowIDs.size === 1 && this.selectedRowIDs.has(rowId);
    this.selectedRowIDs.clear();
    if (!wasOnlySelected) {
      this.selectedRowIDs.add(rowId);
      this.rowSelectionAnchorViewIdx = viewIdx;
    } else {
      this.rowSelectionAnchorViewIdx = null;
    }
    this.clearSelectionRange();
    this.clearColumnSelectionState();
    this.refreshSelectionStyles();
    this.applyColumnSelectionStyles();
  }

  clearRowSelection() {
    if (this.selectedRowIDs.size === 0 && this.rowSelectionAnchorViewIdx == null) return;
    this.selectedRowIDs.clear();
    this.rowSelectionAnchorViewIdx = null;
    this.refreshSelectionStyles();
  }

  private clearSelectionRange() {
    this.selectionAnchor = null;
    this.activeCell = null;
    this.selectionRange = null;
    this.isSelecting = false;
  }

  private clearColumnSelectionState() {
    if (this.selectedColumnIDs.size === 0) return;
    this.selectedColumnIDs.clear();
  }

  pruneColumnSelection() {
    const keep = new Set<string>();
    const visit = (cols: Column[]) => {
      for (const col of cols) {
        if (this.selectedColumnIDs.has(col.instanceID)) keep.add(col.instanceID);
        if (col.children) visit(col.children);
      }
    };
    visit(this.params.core.getColumnModel().getColumns());
    this.selectedColumnIDs = keep;
  }

  private reconcileParentSelection() {
    const columnModel = this.params.core.getColumnModel();
    const parents = new Map<string, Column>();
    for (const selectedColID of this.selectedColumnIDs) {
      const col = columnModel.getById(selectedColID);
      if (!col) continue;
      if (col.children.length > 0) {
        parents.set(col.instanceID, col);
      } else {
        const tree = columnModel.getAncestors(selectedColID);
        if (tree.length > 1) {
          tree.slice(0, -1).forEach(p => parents.set(p.instanceID, p));
        }
      }
    }

    for (const parent of parents.values()) {
      const leaves = parent.getVisibleLeaves();
      const allSelected = leaves.length > 0
        && leaves.every(l => this.selectedColumnIDs.has(l.instanceID));
      if (allSelected) {
        this.selectedColumnIDs.add(parent.instanceID);
      } else {
        this.selectedColumnIDs.delete(parent.instanceID);
      }
    }
  }

  applyColumnSelectionStyles() {
    const columnModel = this.params.core.getColumnModel();
    const leaves = columnModel.getLeaves();
    const leafIndexMap = new Map<string, number>();
    const selectedLeafIdx = new Set<number>();
    leaves.forEach((c, idx) => {
      leafIndexMap.set(c.instanceID, idx);
      if (this.selectedColumnIDs.has(c.instanceID)) selectedLeafIdx.add(idx);
    });

    const getRange = (col: Column | null): [number, number] | null => {
      if (!col || col.hidden) return null;
      if (!col.children || col.children.length === 0) {
        const idx = leafIndexMap.get(col.instanceID);
        return idx == null ? null : [idx, idx];
      }
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const visit = (c: Column) => {
        if (isTrue(c.hidden)) return;
        if (!c.children || c.children.length === 0) {
          const idx = leafIndexMap.get(c.instanceID);
          if (idx == null) return;
          min = Math.min(min, idx);
          max = Math.max(max, idx);
          return;
        }
        for (const child of c.children) visit(child);
      };
      visit(col);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return [min, max];
    };

    const headers = this.params.root.querySelectorAll<HTMLElement>(".pte-hcell");
    headers.forEach(h => {
      const col = columnModel.getById(h.id);
      const selected = !!col && this.selectedColumnIDs.has(col.instanceID);
      const range = col ? getRange(col) : null;
      const leftSelected = !!range && selectedLeafIdx.has(range[0] - 1);
      const rightSelected = !!range && selectedLeafIdx.has(range[1] + 1);

      let parent = false;
      if (selected && col) {
        const tree = columnModel.getAncestors(col.instanceID);
        if (tree.length > 1) {
          parent = this.selectedColumnIDs.has(tree[tree.length - 2].instanceID);
        }
      }

      h.classList.toggle("selected", selected);
      h.classList.toggle("selected-left", selected && !leftSelected);
      h.classList.toggle("not-selected-left", selected && leftSelected);
      h.classList.toggle("selected-right", selected && !rightSelected);
      h.classList.toggle("not-selected-right", selected && rightSelected);
      h.classList.toggle("selected-top", selected && !parent);
      h.classList.toggle("not-selected-top", selected && parent);

      const content = h.querySelector<HTMLElement>(".pte-hcell-content");
      if (content) content.classList.toggle("selected", selected);
    });
  }

  // ---------------- DOM resolution ----------------
  getCellLocation(target: EventTarget | null): { viewIdx: number; colIdx: number } | null {
    const cell = (target as HTMLElement | null)?.closest(".pte-cell") as HTMLDivElement | null;
    if (!cell || !this.params.root.contains(cell)) return null;
    if (cell.classList.contains("pte-row-number-cell")) return null;

    const rowEl = cell.closest(".pte-row") as HTMLDivElement | null;
    if (!rowEl) return null;

    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    const colIdx = Number(cell.dataset.colIdx);
    if (!Number.isFinite(viewIdx) || !Number.isFinite(colIdx)) return null;

    return { viewIdx, colIdx };
  }

  // ---------------- Keyboard navigation ----------------
  onKeyDown(e: KeyboardEvent) {
    let dir: NavDir | null = null;
    switch (e.key) {
      case "ArrowUp": dir = "up"; break;
      case "ArrowDown": dir = "down"; break;
      case "ArrowLeft": dir = "left"; break;
      case "ArrowRight": dir = "right"; break;
      default: return;
    }
    e.preventDefault();
    this.moveSelection(dir, { extend: e.shiftKey, toEdge: e.ctrlKey || e.metaKey });
  }

  private firstSelectableColIdx(): number {
    return this.params.core.getColumnModel().getLeadingLeaves().length;
  }

  private lastColIdx(): number {
    return this.params.leafColumns().length - 1;
  }

  private maxRow(): number {
    return this.params.core.getRowModel().getViewCount() - 1;
  }

  // Last loaded contiguous row in the given vertical direction. For client-side
  // rows getRowNodeAtViewIndex is always defined, so this resolves to 0 / maxRow.
  private verticalEdge(fromRow: number, dir: "up" | "down"): number {
    const rowModel = this.params.core.getRowModel();
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

  private moveSelection(dir: NavDir, opts: { extend: boolean; toEdge: boolean }) {
    const firstCol = this.firstSelectableColIdx();
    const lastCol = this.lastColIdx();
    const maxRow = this.maxRow();
    if (lastCol < firstCol || maxRow < 0) return;

    // Nothing selected yet: select the first data cell.
    if (!this.activeCell || !this.selectionRange) {
      this.clearRowSelection();
      this.clearColumnSelectionState();
      this.startSelectionFromCell({ viewIdx: 0, colIdx: firstCol });
      this.isSelecting = false;
      this.params.ensureCellVisible(0, firstCol);
      this.applyColumnSelectionStyles();
      return;
    }

    const from = this.activeCell;
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

    if (opts.extend) {
      if (!this.selectionAnchor) {
        this.selectionAnchor = { row: from.row, colIdx: from.colIdx };
      }
      this.updateSelectionRange(nextRow, nextCol);
    } else {
      this.clearRowSelection();
      this.clearColumnSelectionState();
      this.startSelectionFromCell({ viewIdx: nextRow, colIdx: nextCol });
      this.isSelecting = false;
      this.applyColumnSelectionStyles();
    }

    this.params.ensureCellVisible(nextRow, nextCol);
  }

  // ---------------- Mouse handlers ----------------
  onCellMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;

    const rowNumberCell = (e.target as HTMLElement | null)?.closest(".pte-row-number-cell") as HTMLDivElement | null;
    if (rowNumberCell && this.params.root.contains(rowNumberCell) && this.params.core.options.rowSelection) {
      const rowEl = rowNumberCell.closest(".pte-row") as HTMLDivElement | null;
      const viewIdx = rowEl ? Number(rowEl.getAttribute("data-view-idx")) : NaN;
      if (!Number.isFinite(viewIdx)) return;
      e.preventDefault();
      const mode: "replace" | "toggle" | "range" = e.shiftKey
        ? "range"
        : (e.ctrlKey || e.metaKey)
          ? "toggle"
          : "replace";
      this.toggleRowSelection(viewIdx, mode);
      return;
    }

    this.clearColumnSelection();
    const location = this.getCellLocation(e.target);
    if (!location) {
      if (this.params.core.options.clearSelectionOnBodyClick) {
        this.clearSelection();
        this.clearRowSelection();
      }
      return;
    }
    e.preventDefault();
    this.startSelectionFromCell(location);
    this.params.root.focus();
  }

  onCellMouseMove(e: MouseEvent) {
    if (!this.isSelecting || !this.selectionAnchor) return;
    const location = this.getCellLocation(e.target);
    if (!location) return;
    this.updateSelectionRange(location.viewIdx, location.colIdx);
  }

  onCellMouseUp() {
    if (!this.isSelecting) return;
    this.isSelecting = false;
  }
}
