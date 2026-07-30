import { GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { ColumnState, GridId, IGridCore, RowData } from "./iGridCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";
import { CellRef, SelectionSnapshot } from "./selection";
import { IColumnModel } from "./iColumnModel";
import { IRowNode } from "./iRowNode";
import { QuickFilterMatchMode, RowPinnedPosition } from "./gridOptions";
import { GridViewState } from "./gridView";

export type NavDir = "up" | "down" | "left" | "right";

/** Which rows/columns an export covers. */
export type ExportScope = "all" | "selection" | "selectedColumns";

/** Options for a programmatic CSV/Excel export (all optional). */
export interface ExportParams {
  /** "all" (default) exports the full view; "selection" a cell range; "selectedColumns" the picked columns. */
  scope?: ExportScope;
  /** Output filename. Auto-derived (e.g. "grid-all.xlsx") when omitted; the extension is enforced. */
  fileName?: string;
  /** Restrict the export to these column instanceIDs / colIds / keys. */
  columnIds?: string[];
  /** Include the (hierarchical) header rows. Defaults to true. */
  includeHeaders?: boolean;
  /** For a row-grouped grid: "tree" (group headers + subtotals, default) or "leaves" (flat rows). */
  groupMode?: "tree" | "leaves";
}

export interface IGridAPI {
  /** The underlying grid core (state + dispatch + event emission). */
  getCore(): IGridCore;

  /** Dispatch an action to the core. */
  dispatch(action: GridAction): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: (ev: GridEventMap[E]) => void): Unsubscribe;

  /** Get the current column state. */
  getColumnState(): ColumnState[];

  /**
   * Restore a previously-captured column layout (widths / pinning / visibility / order). By default
   * merges over the current columns: unknown colIds are ignored and columns absent from `state` keep
   * their place. Pass `opts.defaultState` to apply a fallback to those absent columns instead — e.g.
   * `{ hidden: true }` for an exact restore that hides everything not in the saved view (including
   * columns added since it was captured).
   */
  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void;

  /** Read-only access to the column model (columns, leaves, lookups). */
  getColumnModel(): IColumnModel;

  /** Set the column definitions. */
  setColumnDefs(defs: ColDef[]): void;

  /** Set the row data. */
  setRowData(rows: RowData[]): void;

  /** Replace the application-owned rows in the frozen top band. */
  setPinnedTopRowData(rows: RowData[]): void;
  /** Replace the application-owned rows in the frozen bottom band. */
  setPinnedBottomRowData(rows: RowData[]): void;
  /**
   * Explicitly mirror a displayed row-model node in a frozen band. Generated group node ids are
   * supported; pass null to unpin. The original row remains in the hierarchy.
   */
  setRowPinned(rowId: GridId, position: RowPinnedPosition | null): void;

  /** Apply a transaction to the row data. */
  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData }[]; remove?: GridId[] }): void;

  /** Set the quick-filter (global search) text. Client-side row model only. */
  setQuickFilter(text: string, opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean }): void;
  /** Current quick-filter text ("" when inactive). */
  getQuickFilterText(): string;

  /** Capture serializable column, grouping, sorting, filtering, and expansion state. */
  captureViewState(): GridViewState;
  /** Apply a captured view through the grid's existing state actions. */
  applyViewState(state: GridViewState, opts?: { columns?: "exact" | "merge" }): void;

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
  /** Underlying data objects of the currently-selected rows. */
  getSelectedRows(): unknown[];
  /** Currently-selected row nodes (unloaded / no-longer-present rows are omitted). */
  getSelectedNodes(): IRowNode[];
  /** Select every selectable data row in the current view (skips group rows). */
  selectAllRows(): void;
  /** Clear the row selection. */
  deselectAllRows(): void;
  /** Whether every selectable data row in the current view is currently selected. */
  areAllRowsSelected(): boolean;

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

  /* ----- Tooltips ----- */
  /** Programmatically show the tooltip for a body cell (bypasses the hover delay). No-op if the
   * cell resolves nothing to show or the grid isn't rendered yet. */
  showTooltip(cell: CellRef): void;
  /** Hide any visible tooltip. */
  hideTooltip(): void;

  /* ----- ActionFrame ----- */
  /** Open the persistent ActionFrame (frame + form popover) on a body cell. Closes any open editor
   * or previously-open frame (only one at a time). No-op on a group row / missing cell. */
  openActionFrame(cell: CellRef): void;
  /** Close any open ActionFrame. */
  closeActionFrame(): void;
  /** The cell with an open ActionFrame, or null. */
  getActionFrameCell(): CellRef | null;

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

  /* ----- Export ----- */
  /**
   * Download the grid as a CSV file. No-op until the grid is rendered (the exporter is wired by the
   * renderer on attach).
   */
  exportDataAsCsv(params?: ExportParams): void;
  /** Download the grid as an Excel (.xlsx) file. No-op until the grid is rendered. */
  exportDataAsExcel(params?: ExportParams): void;
  /**
   * Return the CSV text for the current state + params WITHOUT downloading — for programmatic export
   * (upload, custom filename dialog, further processing). "" before the grid is rendered or when
   * there's nothing to export.
   */
  getDataAsCsv(params?: ExportParams): string;
  /**
   * Return the raw .xlsx bytes (Uint8Array) for the current state + params WITHOUT downloading — so
   * the caller decides what to do (stream to a server, encrypt/password-protect, wrap in a Blob,
   * upload, etc.). Empty Uint8Array before the grid is rendered or when there's nothing to export.
   */
  getDataAsExcel(params?: ExportParams): Promise<Uint8Array>;

  destroy(): void;
}
