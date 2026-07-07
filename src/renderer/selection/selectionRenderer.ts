import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { isTrue } from "../../misc";
import { SelectionRange } from "../../interfaces/selection";
import { RowPoolDef } from "../types";

interface SelectionRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  rowPool: () => RowPoolDef[];
  startIndex: () => number;
  leafColumns: () => Column[];
  ensureCellVisible: (viewIdx: number, colIdx: number) => void;
  // Number of fully-visible rows in the viewport — used to size PageUp/PageDown moves.
  viewportRows: () => number;
}

type NavDir = "up" | "down" | "left" | "right";

/**
 * Pure-view selection renderer. Holds NO selection state — it reads the core's selection
 * (getSelectionRange / getSelectedColumnIds / getSelectedRowIds) on the render hot path and
 * repaints when the core emits selectionChanged / focusChanged. User input is translated to
 * actions and dispatched to the core, which owns all selection logic.
 */
export class SelectionRenderer {
  // Transient input-gesture state (mouse drag in progress) — NOT selection state.
  private isSelecting = false;

  constructor(private params: SelectionRendererParams) { }

  // ---------------- Hot path: per-row styling ----------------
  applySelectionToSlot(slot: RowPoolDef, viewIndex: number | null) {
    const range = this.params.core.getSelectionRange();
    const selectedRowIDs = this.params.core.getSelectedRowIds();
    const selectedColumnIDs = this.params.core.getSelectedColumnIds();
    const rangeRow = !!range && viewIndex != null && viewIndex >= range.rowStart && viewIndex <= range.rowEnd;
    const lastRow = viewIndex != null ? viewIndex === this.params.core.getRowModel().getViewCount() - 1 : false;
    const leaves = this.params.leafColumns();

    const rowId = viewIndex != null
      ? this.params.core.getRowIdAtViewIndex(viewIndex)
      : null;
    const rowSelected = !!rowId && selectedRowIDs.has(rowId);
    const prevRowSelected = this.isViewIndexRowSelected(viewIndex != null ? viewIndex - 1 : null, selectedRowIDs);
    const nextRowSelected = this.isViewIndexRowSelected(viewIndex != null ? viewIndex + 1 : null, selectedRowIDs);

    const apply = (cells: HTMLDivElement[] | undefined) => {
      if (!cells) return;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const colIdxRaw = cell.dataset.colIdx;
        const colIdx = colIdxRaw == null ? NaN : Number(colIdxRaw);
        const leafCol = Number.isFinite(colIdx) ? leaves[colIdx] : null;
        const colId = leafCol?.instanceID;
        const colSelected = colId ? selectedColumnIDs.has(colId) : false;

        const rangeSelected = !!rangeRow && !!range && Number.isFinite(colIdx)
          && colIdx >= range.colStart && colIdx <= range.colEnd;
        const selected = rangeSelected || colSelected || rowSelected;

        const prevColSelected = this.neighborSelected(leaves, range, selectedColumnIDs, colIdx - 1);
        const nextColSelected = this.neighborSelected(leaves, range, selectedColumnIDs, colIdx + 1);

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

  private isViewIndexRowSelected(viewIndex: number | null, selectedRowIDs: Set<string>): boolean {
    if (viewIndex == null || viewIndex < 0) return false;
    const id = this.params.core.getRowIdAtViewIndex(viewIndex);
    return !!id && selectedRowIDs.has(id);
  }

  private neighborSelected(leaves: Column[], range: SelectionRange | null, selectedColumnIDs: Set<string>, colIdx: number): boolean {
    if (!Number.isFinite(colIdx) || colIdx < 0) return false;
    if (range && colIdx >= range.colStart && colIdx <= range.colEnd) return true;
    const col = leaves[colIdx];
    return !!col && selectedColumnIDs.has(col.instanceID);
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

  applyColumnSelectionStyles() {
    const columnModel = this.params.core.getColumnModel();
    const selectedColumnIDs = this.params.core.getSelectedColumnIds();
    const leaves = columnModel.getLeaves();
    const leafIndexMap = new Map<string, number>();
    const selectedLeafIdx = new Set<number>();
    leaves.forEach((c, idx) => {
      leafIndexMap.set(c.instanceID, idx);
      if (selectedColumnIDs.has(c.instanceID)) selectedLeafIdx.add(idx);
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
      const selected = !!col && selectedColumnIDs.has(col.instanceID);
      const range = col ? getRange(col) : null;
      const leftSelected = !!range && selectedLeafIdx.has(range[0] - 1);
      const rightSelected = !!range && selectedLeafIdx.has(range[1] + 1);

      let parent = false;
      if (selected && col) {
        const tree = columnModel.getAncestors(col.instanceID);
        if (tree.length > 1) {
          parent = selectedColumnIDs.has(tree[tree.length - 2].instanceID);
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

  // ---------------- Event-driven repaint ----------------
  /** Called when core emits selectionChanged — repaint body + header. */
  onSelectionChanged() {
    this.refreshSelectionStyles();
    this.applyColumnSelectionStyles();
  }

  /** Called when core emits focusChanged — scroll the active cell into view. */
  onFocusChanged(viewIdx?: number, colIdx?: number) {
    if (viewIdx == null || colIdx == null) return;
    this.params.ensureCellVisible(viewIdx, colIdx);
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

  // ---------------- Input handlers (translate → dispatch) ----------------
  onKeyDown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd+A — select all.
    if (ctrl && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      this.params.core.dispatch({ type: "selectAll" });
      return;
    }

    // Home / End — horizontal edge; with Ctrl/Cmd — jump to a grid corner.
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (ctrl) {
        this.params.core.dispatch({
          type: "navigateCorner",
          corner: e.key === "Home" ? "topLeft" : "bottomRight",
          extend: e.shiftKey,
        });
      } else {
        this.params.core.dispatch({
          type: "navigate",
          dir: e.key === "Home" ? "left" : "right",
          extend: e.shiftKey,
          jump: "edge",
        });
      }
      return;
    }

    // PageUp / PageDown — move by one viewport of rows.
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      this.params.core.dispatch({
        type: "navigate",
        dir: e.key === "PageUp" ? "up" : "down",
        extend: e.shiftKey,
        jump: "page",
        pageRows: this.params.viewportRows(),
      });
      return;
    }

    let dir: NavDir | null = null;
    switch (e.key) {
      case "ArrowUp": dir = "up"; break;
      case "ArrowDown": dir = "down"; break;
      case "ArrowLeft": dir = "left"; break;
      case "ArrowRight": dir = "right"; break;
      default: return;
    }
    e.preventDefault();
    this.params.core.dispatch({
      type: "navigate",
      dir,
      extend: e.shiftKey,
      jump: ctrl ? "block" : undefined,
    });
  }

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
      this.params.core.dispatch({ type: "rowSelectSet", viewIdx, mode });
      return;
    }

    const location = this.getCellLocation(e.target);
    if (!location) {
      if (this.params.core.options.clearSelectionOnBodyClick) {
        this.params.core.dispatch({ type: "selectionClear", what: "all" });
      }
      return;
    }
    e.preventDefault();
    this.isSelecting = true;
    this.params.core.dispatch({
      type: "rangeSelectSet",
      viewIdx: location.viewIdx,
      colIdx: location.colIdx,
      mode: "start",
    });
    this.params.root.focus();
  }

  onCellMouseMove(e: MouseEvent) {
    if (!this.isSelecting) return;
    const location = this.getCellLocation(e.target);
    if (!location) return;
    this.params.core.dispatch({
      type: "rangeSelectSet",
      viewIdx: location.viewIdx,
      colIdx: location.colIdx,
      mode: "extend",
    });
  }

  onCellMouseUp() {
    if (!this.isSelecting) return;
    this.isSelecting = false;
  }
}
