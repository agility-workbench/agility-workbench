import { GridEventMap } from "../events/events";
import { ColDef } from "../interfaces/column";
import { IGridAPI, NavDir } from "../interfaces/iGridAPI";
import { ColumnState, GridId, IGridCore, RowData } from "../interfaces/iGridCore";
import { IColumnModel } from "../interfaces/iColumnModel";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";

export class GridAPI implements IGridAPI {
  private _clipboard?: ClipboardRenderer;

  constructor(private core: IGridCore) {}

  getCore(): IGridCore {
    return this.core;
  }

  dispatch(action: any): void {
    this.core.dispatch(action);
  }

  on<E extends keyof GridEventMap>(
    event: E,
    handler: (ev: GridEventMap[E]) => void
  ): () => void {
    return this.core.on(event, handler);
  }

  setColumnDefs(defs: ColDef[]): void {
    this.dispatch({ type: "SET_COLUMN_DEFS", columnDefs: defs });
  }

  setRowData(rows: RowData[]): void {
    this.dispatch({ type: "SET_ROW_DATA", rows });
  }

  getColumnState(): ColumnState[] {
    return this.core.getColumnModel().getColumnState();
  }

  getColumnModel(): IColumnModel {
    return this.core.getColumnModel();
  }

  applyTransaction(tx: {
    add?: RowData[];
    update?: { rowId: GridId; row: RowData }[];
    remove?: GridId[];
  }): void {
    this.dispatch({ type: "APPLY_TRANSACTION", transaction: tx });
  }

  // ---------------- Selection ----------------
  setFocusedCell(viewIdx: number, colIdx: number): void {
    this.core.dispatch({ type: "focusSet", viewIdx, colIdx, reason: "api" });
  }

  selectRange(viewIdx: number, colIdx: number): void {
    this.core.dispatch({ type: "rangeSelectSet", viewIdx, colIdx, mode: "start" });
  }

  extendRangeTo(viewIdx: number, colIdx: number): void {
    this.core.dispatch({ type: "rangeSelectSet", viewIdx, colIdx, mode: "extend" });
  }

  navigate(dir: NavDir, opts?: { extend?: boolean; jump?: "edge" | "block" | "page"; pageRows?: number }): void {
    this.core.dispatch({ type: "navigate", dir, extend: opts?.extend, jump: opts?.jump, pageRows: opts?.pageRows });
  }

  navigateToCorner(corner: "topLeft" | "bottomRight", opts?: { extend?: boolean }): void {
    this.core.dispatch({ type: "navigateCorner", corner, extend: opts?.extend });
  }

  selectAll(): void {
    this.core.dispatch({ type: "selectAll" });
  }

  selectRow(viewIdx: number, mode: "replace" | "toggle" | "range" = "replace"): void {
    this.core.dispatch({ type: "rowSelectSet", viewIdx, mode });
  }

  selectColumn(colId: string, mode: "replace" | "toggle" = "replace"): void {
    this.core.dispatch({ type: "columnSelectSet", colId, mode });
  }

  clearSelection(what: "all" | "range" | "rows" | "columns" = "all"): void {
    this.core.dispatch({ type: "selectionClear", what });
  }

  getSelection(): SelectionSnapshot {
    // Always resolve range row/column ids for API consumers — they typically want record
    // identity, not view indices.
    return this.core.getSelectionSnapshot(true);
  }

  // ---------------- Editing ----------------
  startEditingCell(cell: CellRef): void {
    this.core.dispatch({ type: "editStart", cell, source: "api" });
  }

  stopEditing(value: unknown): void {
    const cell = this.core.getEditingCell();
    if (!cell) return;
    this.core.dispatch({ type: "editCommit", cell, value });
  }

  cancelEditing(): void {
    const cell = this.core.getEditingCell();
    if (!cell) return;
    this.core.dispatch({ type: "editCancel", cell });
  }

  getEditingCell(): CellRef | null {
    return this.core.getEditingCell();
  }

  setCellValue(cell: CellRef, value: unknown): void {
    this.core.dispatch({ type: "editCommit", cell, value });
  }

  // ---------------- Clipboard ----------------
  private clipboard(): ClipboardRenderer {
    if (!this._clipboard) this._clipboard = new ClipboardRenderer({ core: this.core });
    return this._clipboard;
  }

  copySelection(): void {
    this.clipboard().copy();
  }

  cutSelection(): void {
    this.clipboard().cut();
  }

  paste(): Promise<void> {
    return this.clipboard().paste();
  }

  // ---------------- Undo / redo ----------------
  undo(): void {
    this.core.dispatch({ type: "undo" });
  }

  redo(): void {
    this.core.dispatch({ type: "redo" });
  }

  canUndo(): boolean {
    return this.core.canUndo();
  }

  canRedo(): boolean {
    return this.core.canRedo();
  }

  clearHistory(): void {
    this.core.clearHistory();
  }

  destroy(): void {
    // Cleanup if necessary
  }
}
