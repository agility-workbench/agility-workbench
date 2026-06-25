import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { isTrue } from "../../misc";
import { RowPoolDef } from "../types";

export interface SelectionRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
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
}

export class SelectionRenderer {
  private selectionAnchor: SelectionAnchor | null = null;
  private selectionRange: SelectionRange | null = null;
  private isSelecting = false;
  private selectedColumnIDs: Set<string> = new Set();

  constructor(private params: SelectionRendererParams) { }

  // ---------------- Public accessors ----------------
  getSelectionRange(): SelectionRange | null {
    return this.selectionRange;
  }

  getSelectedColumnIDs(): Set<string> {
    return this.selectedColumnIDs;
  }

  // ---------------- Hot path: per-row styling ----------------
  applySelectionToSlot(slot: RowPoolDef, viewIndex: number | null) {
    const range = this.selectionRange;
    const rowSelected = !!range && viewIndex != null && viewIndex >= range.rowStart && viewIndex <= range.rowEnd;
    const lastRow = viewIndex != null ? viewIndex === this.params.core.getRowModel().getViewCount() - 1 : false;
    const leaves = this.params.leafColumns();

    const apply = (cells: HTMLDivElement[] | undefined) => {
      if (!cells) return;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const colIdxRaw = cell.dataset.colIdx;
        const colIdx = colIdxRaw == null ? NaN : Number(colIdxRaw);
        const leafCol = Number.isFinite(colIdx) ? leaves[colIdx] : null;
        const colId = leafCol?.instanceID;
        const colSelected = colId ? this.selectedColumnIDs.has(colId) : false;

        const rangeSelected = !!rowSelected && !!range && Number.isFinite(colIdx)
          && colIdx >= range.colStart && colIdx <= range.colEnd;
        const selected = rangeSelected || colSelected;

        const prevSelected = this.neighborSelected(leaves, range, colIdx - 1);
        const nextSelected = this.neighborSelected(leaves, range, colIdx + 1);

        const isTop = rangeSelected ? (viewIndex === range?.rowStart) : false;
        const isBottom = rangeSelected ? (viewIndex === range?.rowEnd) : (colSelected && lastRow);
        const isLeft = rangeSelected
          ? (colIdx === range?.colStart)
          : (colSelected && !prevSelected);
        const isRight = rangeSelected
          ? (colIdx === range?.colEnd)
          : (colSelected && !nextSelected);

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
    this.selectionAnchor = { row: location.viewIdx, colIdx: location.colIdx };
    this.selectionRange = {
      rowStart: location.viewIdx,
      rowEnd: location.viewIdx,
      colStart: location.colIdx,
      colEnd: location.colIdx,
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

    this.selectionRange = {
      rowStart: Math.min(this.selectionAnchor.row, nextRow),
      rowEnd: Math.max(this.selectionAnchor.row, nextRow),
      colStart: Math.min(this.selectionAnchor.colIdx, nextCol),
      colEnd: Math.max(this.selectionAnchor.colIdx, nextCol),
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
    this.selectionRange = null;
    this.isSelecting = false;
    this.refreshSelectionStyles();
  }

  clampSelectionToView() {
    if (!this.selectionRange) return;
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
    };

    if (this.selectionAnchor) {
      this.selectionAnchor = {
        row: Math.min(Math.max(this.selectionAnchor.row, 0), maxRow),
        colIdx: Math.min(Math.max(this.selectionAnchor.colIdx, 0), maxCol),
      };
    }

    this.refreshSelectionStyles();
  }

  // ---------------- Column selection ----------------
  toggleColumnSelection(colID: string, mode: "replace" | "toggle" = "toggle") {
    this.clearSelection();
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

  // ---------------- Mouse handlers ----------------
  onCellMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    this.clearColumnSelection();
    const location = this.getCellLocation(e.target);
    if (!location) return;
    e.preventDefault();
    this.startSelectionFromCell(location);
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
