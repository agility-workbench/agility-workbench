import { GridEventMap } from "../events/events";
import { ColDef } from "../interfaces/column";
import { ExportParams, IGridAPI, NavDir } from "../interfaces/iGridAPI";
import { ColumnState, GridId, IGridCore, RowData } from "../interfaces/iGridCore";
import { IColumnModel } from "../interfaces/iColumnModel";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";
import { IRowNode } from "../interfaces/iRowNode";
import { QuickFilterMatchMode } from "../interfaces/gridOptions";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";

/** Export hooks provided by the renderer once it's attached (it owns the leaf columns + widths). */
export interface GridApiExporter {
  exportCSV: (params: ExportParams) => void;
  exportExcel: (params: ExportParams) => void;
  getDataAsCsv: (params: ExportParams) => string | null;
  getDataAsExcel: (params: ExportParams) => Promise<Uint8Array | null>;
}

/** Tooltip hooks provided by the renderer once it's attached (it owns the floating layer). */
export interface GridApiTooltipController {
  showBodyTooltip: (viewIdx: number, colIdx: number) => void;
  hideTooltip: () => void;
}

export class GridAPI implements IGridAPI {
  private _clipboard?: ClipboardRenderer;
  private _exporter: GridApiExporter | null = null;
  private _tooltip: GridApiTooltipController | null = null;

  constructor(private core: IGridCore) {}

  /** Wire the export target. Called by the renderer on attach; before that, exports are no-ops. */
  setExporter(exporter: GridApiExporter): void {
    this._exporter = exporter;
  }

  /** Wire the tooltip controller. Called by the renderer on attach; before that these are no-ops. */
  setTooltipController(controller: GridApiTooltipController): void {
    this._tooltip = controller;
  }

  showTooltip(cell: CellRef): void {
    if (!this._tooltip) return;
    const viewIdx = this.core.getViewIndexForRowId(cell.rowId);
    const colIdx = this.core.getColumnModel().getLeaves().findIndex((c) => c.instanceID === cell.colId);
    if (viewIdx == null || viewIdx < 0 || colIdx < 0) return;
    this._tooltip.showBodyTooltip(viewIdx, colIdx);
  }

  hideTooltip(): void {
    this._tooltip?.hideTooltip();
  }

  openActionFrame(cell: CellRef): void {
    this.core.dispatch({ type: "actionFrameOpen", cell, source: "api" });
  }

  closeActionFrame(): void {
    this.core.dispatch({ type: "actionFrameClose" });
  }

  getActionFrameCell(): CellRef | null {
    return this.core.getActionFrameCell();
  }

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
    this.dispatch({ type: "columnDefsSet", defs });
  }

  setRowData(rows: RowData[]): void {
    this.dispatch({ type: "rowDataSet", rows });
  }

  getColumnState(): ColumnState[] {
    return this.core.getColumnModel().getColumnState();
  }

  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void {
    this.dispatch({ type: "columnStateSet", state, defaultState: opts?.defaultState });
  }

  getColumnModel(): IColumnModel {
    return this.core.getColumnModel();
  }

  applyTransaction(tx: {
    add?: RowData[];
    update?: { rowId: GridId; row: RowData }[];
    remove?: GridId[];
  }): void {
    this.dispatch({ type: "rowTransactionApply", add: tx.add, update: tx.update, remove: tx.remove });
  }

  setQuickFilter(text: string, opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean }): void {
    this.dispatch({ type: "quickFilterSet", text, matchMode: opts?.matchMode, caseSensitive: opts?.caseSensitive });
  }

  getQuickFilterText(): string {
    return this.core.getQuickFilterText();
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

  getSelectedRows(): unknown[] {
    return this.core.getSelectedRows();
  }

  getSelectedNodes(): IRowNode[] {
    return this.core.getSelectedNodes() as IRowNode[];
  }

  selectAllRows(): void {
    this.core.dispatch({ type: "rowSelectAll", selected: true });
  }

  deselectAllRows(): void {
    this.core.dispatch({ type: "rowSelectAll", selected: false });
  }

  areAllRowsSelected(): boolean {
    return this.core.areAllRowsSelected();
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

  // ---------------- Export ----------------
  exportDataAsCsv(params: ExportParams = {}): void {
    if (!this._exporter) {
      console.warn("exportDataAsCsv called before the grid was rendered; ignoring.");
      return;
    }
    this._exporter.exportCSV(params);
  }

  exportDataAsExcel(params: ExportParams = {}): void {
    if (!this._exporter) {
      console.warn("exportDataAsExcel called before the grid was rendered; ignoring.");
      return;
    }
    this._exporter.exportExcel(params);
  }

  getDataAsCsv(params: ExportParams = {}): string {
    if (!this._exporter) {
      console.warn("getDataAsCsv called before the grid was rendered; returning empty string.");
      return "";
    }
    return this._exporter.getDataAsCsv(params) ?? "";
  }

  async getDataAsExcel(params: ExportParams = {}): Promise<Uint8Array> {
    if (!this._exporter) {
      console.warn("getDataAsExcel called before the grid was rendered; returning empty bytes.");
      return new Uint8Array(0);
    }
    return (await this._exporter.getDataAsExcel(params)) ?? new Uint8Array(0);
  }

  destroy(): void {
    // Cleanup if necessary
  }
}
