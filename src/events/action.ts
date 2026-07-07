import { AggregateModel } from "@grid/interfaces";
import { ColDef } from "../interfaces/column";
import { FilterModel } from "../interfaces/filter";
import { ColumnState } from "../interfaces/iGridCore";
import { CellRef } from "../interfaces/selection";
import { SortItemUpdate } from "../interfaces/sort";

export type GridActionInit = {
  type: "init";
};

export type GridActionDestroy = {
  type: "destroy";
};

export type GridActionOverlayShow = {
  type: "overlayShow";
  overlayType: "loading" | "noRows" | "none";
};

// Viewport actions
export type GridActionViewportResize = {
  type: "viewportResize";
  widthPx: number;
  heightPx: number;
};

export type GridActionScrollSet = {
  type: "scrollSet";
  topPx: number;
  leftPx: number;
};

export type GridActionRowHeightSet = {
  type: "rowHeightSet";
  rowHeightPx: number;
};

export type GridActionOverscanSet = {
  type: "overscanSet";
  overscanRowCount: number;
};

// Column actions
export type GridActionColumnDefsSet = {
  type: "columnDefsSet";
  defs: ColDef[];
};

export type GridActionColumnStateSet = {
  type: "columnStateSet";
  state: ColumnState[];
};

export type GridActionColumnAutosize = {
  type: "columnAutosize";
  colId: string;
};

export type GridActionColumnResize = {
  type: "columnResize";
  colId: string;
  widthPx: number;
};

export type GridActionColumnPin = {
  type: "columnPin";
  colIds: string[];
  pinned: "left" | "right" | null;
};

export type GridActionColumnVisibility = {
  type: "columnVisibility";
  colIds: string[];
  hidden: boolean;
};

export type GridActionColumnMove = {
  type: "columnMove";
  colId: string;
  toIndex: number;
  toSection: "left" | "center" | "right";
};

export type GridActionThemeFontSet = {
  type: "themeFontSet";
  headerFont: string;
  cellFont: string;
  reason: string;
};

// Data actions
export type GridActionRowDataSet = {
  type: "rowDataSet";
  rows: any[];
};

export type GridActionTransactionApply = {
  type: "rowTransactionApply";
  add?: unknown[];
  update?: { rowId: string; row: unknown }[];
  remove?: string[];
};

// Pagination actions
export type GridActionPaginationSet = {
  type: "paginationSet";
  enabled: boolean;
  pageIndex: number;
  pageSize: number;
};

// Sort/Filter actions
export type GridActionSortModelSet = {
  type: "sortModelSet";
  sortItems: SortItemUpdate[];
};

export type GridActionFilterModelSet = {
  type: "filterModelSet";
  filterModel: FilterModel[];
};

export type GridActionAggregateModelSet = {
  type: "aggregateModelSet";
  aggregateModels: AggregateModel[];
}

// Focus/Selection actions
export type GridActionFocusSet = {
  type: "focusSet";
  viewIdx: number;
  colIdx: number;
  reason?: "mouse" | "keyboard" | "api";
};

export type GridActionSelectionClear = {
  type: "selectionClear";
  what?: "all" | "range" | "rows" | "columns";
};

export type GridActionHeaderAction = {
  type: "headerAction";
  colId: string;
  action: string;
};

export type GridActionRowSelectSet = {
  type: "rowSelectSet";
  viewIdx: number;
  mode: "replace" | "toggle" | "range";
};

export type GridActionColumnSelectSet = {
  type: "columnSelectSet";
  colId: string;
  mode?: "replace" | "toggle";
};

export type GridActionRangeSelectSet = {
  type: "rangeSelectSet";
  // Start a fresh range at this cell, or extend the current range's active corner to it.
  viewIdx: number;
  colIdx: number;
  mode: "start" | "extend";
};

// Editing actions
export type GridActionEditStart = {
  type: "editStart";
  cell: CellRef;
  source?: "mouse" | "keyboard" | "api";
};

export type GridActionEditCommit = {
  type: "editCommit";
  cell: CellRef;
  value: unknown;
};

export type GridActionEditCancel = {
  type: "editCancel";
  cell: CellRef;
};

// Keyboard navigation action.
// jump: undefined = one cell (Arrow); "edge" = hard first/last (Home/End);
// "block" = Excel-style data-block jump (Ctrl+Arrow).
export type GridActionKeyboardNavigate = {
  type: "navigate";
  dir: "up" | "down" | "left" | "right";
  extend?: boolean;
  jump?: "edge" | "block";
};

// Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End)
export type GridActionNavigateCorner = {
  type: "navigateCorner";
  corner: "topLeft" | "bottomRight";
  extend?: boolean;
};

// Select the entire grid (Ctrl+A)
export type GridActionSelectAll = {
  type: "selectAll";
};

// Union type of all actions
export type GridAction =
  | GridActionInit
  | GridActionDestroy
  | GridActionOverlayShow
  | GridActionViewportResize
  | GridActionScrollSet
  | GridActionRowHeightSet
  | GridActionOverscanSet
  | GridActionColumnDefsSet
  | GridActionColumnStateSet
  | GridActionColumnAutosize
  | GridActionColumnResize
  | GridActionColumnPin
  | GridActionColumnVisibility
  | GridActionColumnMove
  | GridActionThemeFontSet
  | GridActionRowDataSet
  | GridActionTransactionApply
  | GridActionPaginationSet
  | GridActionSortModelSet
  | GridActionFilterModelSet
  | GridActionAggregateModelSet
  | GridActionFocusSet
  | GridActionHeaderAction
  | GridActionSelectionClear
  | GridActionRowSelectSet
  | GridActionColumnSelectSet
  | GridActionRangeSelectSet
  | GridActionEditStart
  | GridActionEditCommit
  | GridActionEditCancel
  | GridActionKeyboardNavigate
  | GridActionNavigateCorner
  | GridActionSelectAll;
