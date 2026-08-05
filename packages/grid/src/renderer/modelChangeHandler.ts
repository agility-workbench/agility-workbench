import { GridCore } from "../core/core";
import {
  GridEventColumnsChangedParams,
  GridEventColumnWidthsChangedParams,
  GridEventPaginationChangedParams,
  GridEventRowsChangedParams,
} from "../events/events";

interface GridModelChangeHandlerParams {
  core: GridCore;
  serverSidePendingRangeKeys: Set<string>;
  recomputeView: () => void;
  updateWindow: (forcePatch: boolean, scrollSrc?: HTMLDivElement, params?: GridEventRowsChangedParams) => void;
  resetScrollPosition: () => void;
  updatePaginationControls: (params?: GridEventPaginationChangedParams) => void;
  refreshSortIndicators: () => void;
  setFilterIndicators: () => void;
  buildRowPool: () => void;
  buildHeaderDOM: (reason: string) => void;
  updateColumnWidths: (colIDs?: string[]) => void;
  refreshCellsForColumns: (colIDs: string[], reason: "data" | "resize") => void;
  refreshSelectionStyles: () => void;
}

export class GridModelChangeHandler {
  constructor(private params: GridModelChangeHandlerParams) { }

  onDataChanged(params: GridEventRowsChangedParams) {
    const wipesSelection = params.reason === "sort" || params.reason === "filter";
    const isPageChange = params.reason === "page" || params.reason === "pagination";
    const resetsScroll = wipesSelection || isPageChange;

    if (params.reason === "viewport") {
      this.params.serverSidePendingRangeKeys.delete(`${params.firstRowIndex}:${params.lastRowIndex}`);
    } else {
      this.params.serverSidePendingRangeKeys.clear();
      // Selection clearing on sort/filter is now owned by the core (it emits selectionChanged);
      // the renderer only needs to repaint, which happens via updateWindow below.
    }
    if (params.reason !== "sort") {
      this.params.recomputeView();
    }
    this.params.updateWindow(true, undefined, params);
    if (isPageChange) {
      this.params.refreshSelectionStyles();
    }
    if (resetsScroll
      && (this.params.core.getRowModel().getType() !== "serverSide"
        || (params.reason !== "viewport" && params.firstRowIndex === 0))) {
      this.params.resetScrollPosition();
    }
    this.params.updatePaginationControls();
  }

  onColumnsChanged(params: GridEventColumnsChangedParams) {
    let rebuiltRows = false;
    // Selection clearing on column visibility/state/order/defs changes is owned by the core
    // (it emits selectionChanged); the renderer only rebuilds/repaints below.
    if (params.reason === "sort") {
      // Refresh all sort icons, not just the changed columns: adding/removing a sorted column
      // renumbers the priority badges of the others.
      this.params.refreshSortIndicators();
    } else if (params.reason === "filter") {
      this.params.setFilterIndicators();
    } else if (params.reason === "visibility") {
      this.params.buildRowPool();
      this.params.buildHeaderDOM(params.reason);
      rebuiltRows = true;
    } else if (params.reason === "state") {
      this.params.buildRowPool();
      this.params.buildHeaderDOM(params.reason);
      this.params.updateColumnWidths();
      rebuiltRows = true;
    } else {
      this.params.buildRowPool();
      this.params.buildHeaderDOM(params.reason);
      rebuiltRows = true;
    }
    if (rebuiltRows) {
      this.params.updateWindow(true, undefined);
      this.params.updatePaginationControls();
    }
  }

  onColumnWidthsChanged(params: GridEventColumnWidthsChangedParams) {
    // Apply the new widths to the cell/header boxes first, then let renderers remeasure: a
    // pixel-drawing renderer (e.g. the sparkline) reads its cell's box in refresh(), so the box
    // must already be resized before we invoke it.
    this.params.updateColumnWidths(params.changedColIds);
    this.params.refreshCellsForColumns(params.changedColIds, "resize");
  }
}
