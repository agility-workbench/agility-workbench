import type { AggregateScope } from "./aggregate";
import type { FilterDef } from "./filter";
import type { ColumnState } from "./iGridCore";
import type { SortDir } from "./sort";

export interface GridViewSortState {
  colId: string;
  dir: SortDir;
}

export interface GridViewFilterState {
  colId: string;
  filters: FilterDef[];
  join?: "and" | "or";
}

export interface GridViewGroupExpansionState {
  groupId: string;
  expanded: boolean;
}

export interface GridViewPaginationState {
  pageIndex: number;
  pageSize: number;
}

/** One aggregate-model entry in serializable form (keyed by public colId, not instanceID). */
export interface GridViewAggregateState {
  colId: string;
  type: string;
}

/**
 * One pivot state layer: the role assignments (row groups, pivot columns, values) that pivot mode
 * swaps in and out as a unit. Pivot mode is a state *layer*, not a lens over the current state —
 * see `GridViewState.prePivotState`.
 */
export interface GridPivotLayerState {
  rowGroupColumns: string[];
  aggregateModel: GridViewAggregateState[];
  pivotColumns: string[];
  /** Absent = the canonical generated-column order. */
  pivotColumnOrder?: string[];
  /** The aggregate scope in force in this layer. The state has no top-level scope field, so scope
   * round-trips only inside a layer; absent = leave the live scope alone when the layer applies. */
  aggregateScope?: AggregateScope;
}

/** The pair of pivot state layers a grid holds (see `IGridCore.getPivotStateLayers`). */
export interface GridPivotStateLayers {
  /** The state pivot mode exits to. Present while pivot mode is on. */
  base?: GridPivotLayerState;
  /** The pivot configuration re-entering pivot mode reinstates. Present while pivot mode is off,
   * once a pivot session has been exited. */
  pivot?: GridPivotLayerState;
}

/** Serializable grid presentation state captured by `api.captureViewState()`. */
export interface GridViewState {
  version: 1;
  columns: ColumnState[];
  rowGroupColumns: string[];
  sortModel: GridViewSortState[];
  filterModel: GridViewFilterState[];
  quickFilterText: string;
  groupExpansion: GridViewGroupExpansionState[];
  /** Present only when pagination is enabled at capture time. Absent in states saved before this
   * field existed; applyViewState leaves the page untouched when it's missing. */
  pagination?: GridViewPaginationState;
  /** Aggregate model by colId. Absent in states saved before pivot existed; applyViewState leaves
   * the aggregate model untouched when it's missing (same rule as `pagination`). */
  aggregateModel?: GridViewAggregateState[];
  /** Pivot columns' colIds in level order. Absent = leave untouched. */
  pivotColumns?: string[];
  /** Whether pivot mode is on. Absent = leave untouched. */
  pivotMode?: boolean;
  /** Manual arrangement of the generated pivot columns (displayed leaf order by generated colId,
   * `pivotColumnMoveMode: "free"`). Absent = none captured; the role dispatches an apply always
   * runs reset any prior arrangement, so a state without this field applies canonically. */
  pivotColumnOrder?: string[];
  /** The state pivot mode returns to when it turns off — captured only while pivot mode is ON
   * (while it is off, that state IS the live one). Without it, a restored pivoted view has no
   * record of the flat grid it came from and exiting pivot mode clears the roles instead. */
  prePivotState?: GridPivotLayerState;
  /** The pivot configuration re-entering pivot mode reinstates — captured only while pivot mode is
   * OFF, and only when a pivot session was exited earlier (while it is on, that state IS the live
   * one). */
  pivotState?: GridPivotLayerState;
}

export interface SavedGridView {
  id: string;
  name: string;
  state: GridViewState;
}

/**
 * One spreadsheet-style sheet: a named, live view state over the shared row model. The grid
 * captures the sheet's state whenever the user leaves it; a sheet supplied without a state adopts
 * the grid's state on its first activation instead of resetting anything.
 */
export interface GridSheet {
  id: string;
  name: string;
  state?: GridViewState;
  /**
   * Tab colour, in any CSS colour notation. Sheet metadata rather than view state: it belongs to
   * the tab, not to what the tab shows, so it survives every switch and capture untouched.
   *
   * The strip wears it as a tint over the tab's own fill and paints it solid only in the active
   * tab's underline — so a colour never has to win a contrast fight with the label, in either
   * theme. Set through the tab menu's "Change color", and reported through `onChange` like any
   * other change to the list.
   */
  color?: string;
}

/**
 * Application-owned sheet tabs (footer, left zone). Supplying this option mounts the tab strip;
 * like {@link SavedViewsOptions}, the grid renders and optimistically updates the supplied list,
 * then reports the complete next list through `onChange` — persistence stays with the application.
 * An empty/omitted `sheets` list shows a single synthesized "Data" tab for the grid's current
 * state. The strip's **+** button appends a fresh pivot sheet (pivot mode on, no roles assigned).
 */
export interface SheetsOptions {
  sheets?: readonly GridSheet[];
  activeSheetId?: string | null;
  onChange?: (sheets: GridSheet[]) => void;
  onActiveSheetChange?: (sheetId: string | null) => void;
  /**
   * The palette offered by the tab menu's "Change color", **replacing** the built-in one — a brand
   * set rather than a superset, so an application decides the whole list.
   *
   * A function form makes the palette per-sheet: it is consulted each time a tab menu opens, with
   * the sheet it was opened on, so it can key off live application state as well as the sheet
   * itself. An array is simply the same list for every tab.
   *
   * An empty array (or an empty return) drops "Change color" from the menu, which is how an
   * application opts out of tab colours — per sheet, in the function form; omitting the option
   * keeps the built-in palette. Colours a sheet already carries are unaffected either way:
   * `GridSheet.color` is honoured whether or not the palette contains it, so a colour set
   * programmatically, or persisted from an older palette, still paints its tab (the menu simply
   * shows no entry checked, and "None" still clears it).
   */
  colors?: readonly SheetTabColor[] | ((sheet: GridSheet) => readonly SheetTabColor[]);
}

/**
 * One entry of the sheet tab colour palette.
 *
 * A tab wears its colour as a tint over the tab's own fill, and paints it solid only in the active
 * tab's underline, so an entry here never has to win a contrast fight with the label — any CSS
 * colour works, in either theme, with no light/dark variant to supply.
 */
export interface SheetTabColor {
  color: string;
  /**
   * The menu item's label, and how assistive technology names the colour. Falls back to `color`
   * itself, so an unnamed entry is announced as "#ef4444" — supply a name for anything
   * user-facing.
   */
  name?: string;
}

/**
 * Application-owned saved views. The grid renders and optimistically updates the supplied list,
 * then reports the complete next list through `onChange`; persistence remains the application's
 * responsibility.
 */
export interface SavedViewsOptions {
  views?: readonly SavedGridView[];
  activeViewId?: string | null;
  onChange?: (views: SavedGridView[]) => void;
  onActiveViewChange?: (viewId: string | null) => void;
}
