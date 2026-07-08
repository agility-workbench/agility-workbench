import { GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { ColumnState, GridId, RowData } from "./iGridCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";
import { CellRef, SelectionSnapshot } from "./selection";
import { IColumnModel } from "./iColumnModel";

export type NavDir = "up" | "down" | "left" | "right";

export interface IGridAPI {
  /** Dispatch an action to the core. */
  dispatch(action: GridAction): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: (ev: GridEventMap[E]) => void): Unsubscribe;

  /** Get the current column state. */
  getColumnState(): ColumnState[];

  /** Read-only access to the column model (columns, leaves, lookups). */
  getColumnModel(): IColumnModel;

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
  navigate(dir: NavDir, opts?: { extend?: boolean; jump?: "edge" | "block" | "page"; pageRows?: number }): void;
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

  /* ----- Editing ----- */
  /** Begin editing a cell. No-op if the column is not editable or the cell doesn't exist. */
  startEditingCell(cell: CellRef): void;
  /** Commit the current edit with the given raw value (passed through the column's valueParser). */
  stopEditing(value: unknown): void;
  /** Cancel the current edit without changing the cell value. */
  cancelEditing(): void;
  /** The cell currently being edited, or null when not editing. */
  getEditingCell(): CellRef | null;
  /** Set a cell's value directly (bypasses the inline editor; runs the column's valueParser). */
  setCellValue(cell: CellRef, value: unknown): void;

  /* ----- Clipboard ----- */
  /** Copy the current selection to the clipboard as TSV. */
  copySelection(): void;
  /** Copy the current selection as TSV, then clear its editable cells. */
  cutSelection(): void;
  /** Paste the clipboard's first cell into the active cell (runs the column's valueParser). */
  paste(): Promise<void>;

  /* ----- Undo / redo ----- */
  /** Undo the last cell-edit step (single edit, paste, or cut). */
  undo(): void;
  /** Redo the last undone step. */
  redo(): void;
  /** Whether there is a step to undo. */
  canUndo(): boolean;
  /** Whether there is a step to redo. */
  canRedo(): boolean;
  /** Clear the undo/redo history. */
  clearHistory(): void;

  destroy(): void;
}
