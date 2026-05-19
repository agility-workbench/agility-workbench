import { GridCore } from "../core/core";
import {
  GridEventColumnsChangedParams,
  GridEventRowsChangedParams,
} from "../events/events";

interface GridModelChangeHandlerParams {
  core: GridCore;
  serverSidePendingRangeKeys: Set<string>;
  recomputeView: () => void;
  updateWindow: (forcePatch: boolean, scrollSrc?: HTMLDivElement, params?: GridEventRowsChangedParams) => void;
  resetScrollPosition: () => void;
  updatePaginationControls: () => void;
  addSortIndicatorToHeader: (colID: string, dir: "asc" | "desc" | "") => void;
  setFilterIndicators: () => void;
  buildRowPool: () => void;
  buildHeaderDOM: (reason: string) => void;
  updateColumnWidths: (colIDs?: string[]) => void;
}

export class GridModelChangeHandler {
  constructor(private params: GridModelChangeHandlerParams) { }

  onDataChanged(params: GridEventRowsChangedParams) {
    console.log(params);
    if (params.reason === "viewport") {
      this.params.serverSidePendingRangeKeys.delete(`${params.firstRowIndex}:${params.lastRowIndex}`);
    } else {
      this.params.serverSidePendingRangeKeys.clear();
    }
    if (params.reason !== "sort") {
      this.params.recomputeView();
    }
    this.params.updateWindow(true, undefined, params);
    if (this.params.core.getRowModel().getType() !== "serverSide" || (params.reason !== "viewport" && params.firstRowIndex === 0)) {
      this.params.resetScrollPosition();
    }
    this.params.updatePaginationControls();
  }

  onColumnsChanged(params: GridEventColumnsChangedParams) {
    console.log(params);
    let rebuiltRows = false;
    if (params.reason === "sort") {
      const sorts = this.params.core.getSortModel().items;
      for (const colID of params.changedColIds || []) {
        const sort = sorts.find(s => s.col.instanceID === colID);
        this.params.addSortIndicatorToHeader(colID, sort?.dir || "");
      }
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
    } else if (params.reason !== "resize") {
      this.params.buildRowPool();
      this.params.buildHeaderDOM(params.reason);
      rebuiltRows = true;
    } else {
      this.params.updateColumnWidths(params.changedColIds || []);
    }
    if (rebuiltRows) {
      this.params.updateWindow(true, undefined);
    }
  }
}
