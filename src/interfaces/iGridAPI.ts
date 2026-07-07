import { GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { ColumnState, GridId, RowData } from "./iGridCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";
import { SelectionSnapshot } from "./selection";

export type NavDir = "up" | "down" | "left" | "right";

export interface IGridAPI {
  /** Dispatch an action to the core. */
  dispatch(action: GridAction): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: (ev: GridEventMap[E]) => void): Unsubscribe;

  /** Get the current column state. */
  getColumnState(): ColumnState[];

  /** Set the column definitions. */
  setColumnDefs(defs: ColDef[]): void;

  /** Set the row data. */
  setRowData(rows: RowData[]): void;

  /** Apply a transaction to the row data. */
  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData }[]; remove?: GridId[] }): void;

  /* ----- Selection ----- */
  /** Focus a single cell (view index + global leaf column index). */
  setFocusedCell(viewIdx: number, colIdx: number): void;
  /** Start a range selection at a cell (collapses to a single cell). */
  selectRange(viewIdx: number, colIdx: number): void;
  /** Extend the current range's active corner to a cell. */
  extendRangeTo(viewIdx: number, colIdx: number): void;
  /** Move the selection by keyboard-style navigation. */
  navigate(dir: NavDir, opts?: { extend?: boolean; toEdge?: boolean }): void;
  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). */
  navigateToCorner(corner: "topLeft" | "bottomRight", opts?: { extend?: boolean }): void;
  /** Select the entire grid. */
  selectAll(): void;
  /** Select/toggle a row by view index. */
  selectRow(viewIdx: number, mode?: "replace" | "toggle" | "range"): void;
  /** Select/toggle a column by colId. */
  selectColumn(colId: string, mode?: "replace" | "toggle"): void;
  /** Clear all or part of the selection. */
  clearSelection(what?: "all" | "range" | "rows" | "columns"): void;
  /** Read the current selection snapshot. */
  getSelection(): SelectionSnapshot;

  destroy(): void;
}
