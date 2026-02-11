import { ColDef } from "../interfaces/column";
import { FilterModel } from "../interfaces/filter";
import { ColumnState } from "../interfaces/iGridCore";
import { CellRef, SelectionRange } from "../interfaces/selection";
import { SortDef } from "../interfaces/sort";

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
  sortModel: SortDef[];
};

export type GridActionFilterModelSet = {
  type: "filterModelSet";
  filterModel: FilterModel[];
};

// Focus/Selection actions
export type GridActionFocusSet = {
  type: "focusSet";
  cell?: CellRef;
  reason?: "mouse" | "keyboard" | "api";
};

export type GridActionSelectionClear = {
  type: "selectionClear";
};

export type GridActionRowSelectSet = {
  type: "rowSelectSet";
  rowId: string;
  selected: boolean;
  multi?: boolean;
};

export type GridActionRangeSelectSet = {
  type: "rangeSelectSet";
  range: SelectionRange;
  mode?: "replace" | "extend";
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

// Keyboard navigation action
export type GridActionKeyboardNavigate = {
  type: "navigate";
  dir: "up" | "down" | "left" | "right" | "pageUp" | "pageDown" | "home" | "end";
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
  | GridActionFocusSet
  | GridActionSelectionClear
  | GridActionRowSelectSet
  | GridActionRangeSelectSet
  | GridActionEditStart
  | GridActionEditCommit
  | GridActionEditCancel
  | GridActionKeyboardNavigate;
