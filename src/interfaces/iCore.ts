import { GridEventHandler, GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { SortDef } from "./sort";
import { FilterDef } from "./filter";
import { IRowModel } from "./IRowModel";
import { IColumnModel } from "./IColumnModel";
import { GridAction } from "../events/action";
import { CellRef, SelectionRange } from "../interfaces/selection";
import { AggregateModel, AggregateScope } from "./aggregate";
import { GridOptions } from "./GridOptions";

export type GridId = string;
export type ColId = string;

export type RowData = unknown;

export interface ColumnState {
  colId: ColId;
  widthPx?: number;
  pinned?: "left" | "right" | null;
  hidden?: boolean;
  order?: number; // leaf order
}

/* ---------- Read-only view of derived state for renderer ---------- */

export interface ViewportInfo {
  scrollTopPx: number;
  scrollLeftPx: number;
  rowHeightPx: number;
  overscanRowCount: number;
}

export interface RenderCell {
  rowId: GridId;
  colId: ColId;
  // display value is what the renderer can put in the cell fast
  display: string;
  // raw can be useful for edit start etc.
  value: unknown;
}

export interface RenderRow {
  rowId: GridId;
  displayedIndex: number;
}

export interface GridSnapshot {
  viewport: ViewportInfo;
  displayedRowCount: number;
  visibleLeafColIds: ColId[]; // includes pinned handling as you define
  focusedCell?: CellRef;
  selectedRowIds?: GridId[];
  // optional: selection range if you implement it
  selectionRange?: SelectionRange;
}

/* ---------- Core interface ---------- */

export interface IGridCore {
  /** Stable grid id (useful if multiple grids exist). */
  readonly id: string;

  getOptions(): Readonly<GridOptions>;

  /** Dispatch an action (from renderer and/or API). */
  dispatch(action: GridAction): void;

  /** Subscribe to core events (renderer uses). */
  onInternal<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe;
  /** Subscribe to core events (API uses this). */
  on<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe;

  /** Read-only snapshot (useful to renderer to initialize). */
  getSnapshot(): GridSnapshot;

  /* ----- Derived read APIs renderer will need (hot paths) ----- */
  getRowModel(): IRowModel;
  getColumnModel(): IColumnModel;

  /** Returns rowId for a displayed index (post filter/sort/group pipeline). */
  getRowIdAtViewIndex(displayedIndex: number): GridId | null;

  /** Returns displayed index for a rowId if currently displayed; null if filtered out. */
  getViewIndexForRowId(rowId: GridId): number | null;

  /** Returns cell value (raw). */
  getCellValue(rowId: GridId, colId: ColId): unknown;

  /** Returns cell display string (formatted). */
  getCellDisplayValue(rowId: GridId, colId: ColId): string;

  /* ----- Models via facade getters (optional but handy) ----- */
  getSortModel(): SortDef[];
  getFilterModel(): FilterDef[];
  getAggregateModel(): AggregateModel[];
  getAggregateScope(): AggregateScope;

  setSortModel(sort: SortDef[]): void;
  setFilterModel(filter: FilterDef[]): void;

  /** Ensure core releases resources (timers, subscriptions). Renderer/React calls on unmount. */
  destroy(): void;
}
