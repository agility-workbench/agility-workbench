import { ColId, GridId } from "../interfaces/iCore";

export type GridEventName =
  | "overlayShow"
  | "modelUpdated"
  | "viewportChanged"
  | "columnsChanged"
  | "cellsChanged"
  | "rowsChanged"
  | "selectionChanged"
  | "focusChanged"
  | "editingChanged"
  | "error";

export type Unsubscribe = () => void;

export type GridEventOverlayShowParams = {
  overlayType: "loading" | "noRows" | "none";
};

export type GridEventModelUpdatedParams = {
  reason:
    | "init"
    | "rowData"
    | "transaction"
    | "filter"
    | "sort"
    | "group"
    | "pivot"
    | "columns"
    | "viewport"
    | "options"
    | "api";
  // row-model specific step hints (optional)
  step?: "filter" | "sort" | "group" | "pivot" | "all";
};

export type GridEventViewportChangedParams = {
  scrollTopPx: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
  viewportHeightPx: number;

  rowHeightPx: number;
  overscanRowCount: number;

  firstRowIndex: number; // displayed index
  lastRowIndex: number; // displayed index (inclusive)
};

export type GridEventColumnsChangedParams = {
  reason: "defs" | "state" | "resize" | "pin" | "visibility" | "order";
  changedColIds?: ColId[];
};

export type GridEventRowsChangedParams = {
  reason: "rowData" | "transaction" | "sort" | "filter" | "group" | "viewport";
  // displayed indices impacted (optional optimization)
  firstRowIndex?: number;
  lastRowIndex?: number;
  // row IDs impacted (optional optimization)
  changedRowIds?: GridId[];
};

export type GridEventCellsChangedParams = {
  reason: "data" | "format" | "style" | "editCommit" | "refresh";
  rowIds: GridId[];
  colIds: ColId[];
  // If true, renderer may want to recreate cell content (e.g. renderer changed)
  force?: boolean;
};

export type GridEventSelectionChangedParams = {
  mode: "single" | "multiple" | "range";
  addedRowIds: GridId[];
  removedRowIds: GridId[];
  // current selection snapshot (optional; can be expensive)
  selectedRowIds?: GridId[];
};

export type GridEventFocusChangedParams = {
  prev?: { rowId: GridId; colId: ColId };
  next?: { rowId: GridId; colId: ColId };
  // if focus moved due to keyboard navigation
  reason?: "mouse" | "keyboard" | "api";
};

export type GridEventEditingChangedParams = {
  state: "started" | "stopped" | "cancelled" | "committed";
  cell?: { rowId: GridId; colId: ColId };
  // committed value (only for committed)
  value?: unknown;
};

export type GridEventErrorParams = {
  code: string;
  message: string;
  details?: unknown;
};

export interface GridEventMap {
  overlayShow: GridEventOverlayShowParams;
  modelUpdated: GridEventModelUpdatedParams;
  viewportChanged: GridEventViewportChangedParams;
  columnsChanged: GridEventColumnsChangedParams;
  rowsChanged: GridEventRowsChangedParams;
  cellsChanged: GridEventCellsChangedParams;
  selectionChanged: GridEventSelectionChangedParams;
  focusChanged: GridEventFocusChangedParams;
  editingChanged: GridEventEditingChangedParams;
  error: GridEventErrorParams;
}

export type GridEventHandler<E extends GridEventName> = (ev: GridEventMap[E]) => void;
