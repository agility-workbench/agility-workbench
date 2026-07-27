import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { RowDataChangeReason } from "@grid/interfaces/iRowModel";
import { ColId, GridId } from "../interfaces/iGridCore";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";

export type GridEventName =
  | "overlayShow"
  | "modelUpdated"
  | "viewportChanged"
  | "columnsChanged"
  | "columnWidthsChanged"
  | "cellsChanged"
  | "rowsChanged"
  | "aggregateChanged"
  | "selectionChanged"
  | "focusChanged"
  | "editingChanged"
  | "paginationChanged"
  | "cellClicked"
  | "rowClicked"
  | "tooltipShow"
  | "tooltipHide"
  | "actionFrameChanged"
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
  reason: "defs" | "state" | "pin" | "visibility" | "order" | "sort" | "filter" | "add";
  changedColIds?: ColId[];
};

export type GridEventColumnWidthsChangedParams = {
  /** Columns whose computedWidth changed. Empty array means "all visible columns". */
  changedColIds: ColId[];
};

export type GridEventRowsChangedParams = {
  reason: "rowData" | "transaction" | "group" | "viewport" | "add" | RowDataChangeReason;
  // displayed indices impacted (optional optimization)
  firstRowIndex?: number;
  lastRowIndex?: number;
  rowCount?: number;
  // row IDs impacted (optional optimization)
  changedRowIds?: GridId[];
};

export type GridEventAggregateChangedParams = {
  reason: "model" | "scope" | "rows" | "columns" | "dataSource";
  scope: AggregateScope;
  aggregateModel: AggregateModel[];
  valuesAvailable: boolean;
};

export type GridEventCellsChangedParams = {
  reason: "data" | "format" | "style" | "editCommit" | "refresh";
  rowIds: GridId[];
  colIds: ColId[];
  // If true, renderer may want to recreate cell content (e.g. renderer changed)
  force?: boolean;
};

export type GridEventSelectionChangedParams = {
  // full current selection snapshot (see snapshot.kind for the active selection kind)
  snapshot: SelectionSnapshot;
  reason?: "mouse" | "keyboard" | "api" | "model";
};

export type GridEventFocusChangedParams = {
  prev?: { rowId: GridId; colId: ColId };
  next?: { rowId: GridId; colId: ColId };
  // active cell position in view-index space (for scroll-into-view; survives unloaded rows)
  viewIdx?: number;
  colIdx?: number;
  // if focus moved due to keyboard navigation
  reason?: "mouse" | "keyboard" | "api";
};

export type GridEventEditingChangedParams = {
  state: "started" | "stopped" | "cancelled" | "committed";
  cell?: { rowId: GridId; colId: ColId };
  // committed value (only for committed)
  value?: unknown;
  // For state "started" via edit-on-typing: the printable character that opened the editor, so
  // the renderer can seed the editor with it.
  charPress?: string;
};

export type GridEventPaginationChangedParams = {
  paginationEnabled: boolean;
  pageIndex: number;
  pageSize: number;
  totalRowCount: number;
  totalPageCount: number;
  pageSizes: number[];
};

export type GridEventCellClickedParams = {
  rowId: GridId;
  colId: ColId;
  /** View index of the clicked row. */
  viewIdx: number;
  /** Global leaf-column index of the clicked cell. */
  colIdx: number;
  /** The clicked row's underlying data object. */
  data: unknown;
  /** The clicked cell's raw value. */
  value: unknown;
  /** The originating DOM click event. */
  event: MouseEvent;
};

export type GridEventRowClickedParams = {
  rowId: GridId;
  /** View index of the clicked row. */
  viewIdx: number;
  /** The clicked row's underlying data object. */
  data: unknown;
  /** Whether the clicked row is a group (summary) row. */
  isGroup: boolean;
  /** The originating DOM click event. */
  event: MouseEvent;
};

export type GridEventTooltipParams = {
  /** Where the tooltip is anchored. */
  location: "body" | "header";
  /** Column instance id (both body and header tooltips). */
  colId: ColId | null;
  /** Row id (body tooltips only; null for header tooltips). */
  rowId: GridId | null;
  /** Global leaf-column index (body tooltips; null for header tooltips). */
  colIdx: number | null;
  /** View index of the row (body tooltips; null for header tooltips). */
  viewIdx: number | null;
};

export type GridEventActionFrameParams = {
  /** Whether the frame opened or closed. */
  state: "opened" | "closed";
  /** The cell the frame is (or was) attached to. */
  cell: CellRef | null;
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
  columnWidthsChanged: GridEventColumnWidthsChangedParams;
  rowsChanged: GridEventRowsChangedParams;
  aggregateChanged: GridEventAggregateChangedParams;
  cellsChanged: GridEventCellsChangedParams;
  selectionChanged: GridEventSelectionChangedParams;
  focusChanged: GridEventFocusChangedParams;
  editingChanged: GridEventEditingChangedParams;
  paginationChanged: GridEventPaginationChangedParams;
  cellClicked: GridEventCellClickedParams;
  rowClicked: GridEventRowClickedParams;
  tooltipShow: GridEventTooltipParams;
  tooltipHide: GridEventTooltipParams;
  actionFrameChanged: GridEventActionFrameParams;
  error: GridEventErrorParams;
}

export type GridEventHandler<E extends GridEventName> = (ev: GridEventMap[E]) => void;
