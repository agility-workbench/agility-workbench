import { GridEventMap } from "../events/events";
import { ColDef } from "../interfaces/column";
import { ExportParams, IGridAPI, NavDir } from "../interfaces/iGridAPI";
import { ColumnState, GridId, IGridCore, RowData } from "../interfaces/iGridCore";
import { IColumnModel } from "../interfaces/iColumnModel";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";
import { IRowNode } from "../interfaces/iRowNode";
import {
  QuickFilterMatchMode,
  RowPinnedPosition,
  TreeDataKeyboardNavigationMode,
} from "../interfaces/gridOptions";
import { FilterItem } from "../interfaces/filter";
import { GridViewState } from "../interfaces/gridView";
import { SortItemUpdate } from "../interfaces/sort";
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

export interface GridApiPinnedRowsController {
  setPinnedTopRowData: (rows: RowData[]) => void;
  setPinnedBottomRowData: (rows: RowData[]) => void;
  setRowPinned: (rowId: GridId, position: RowPinnedPosition | null) => void;
}

export class GridAPI implements IGridAPI {
  private _clipboard?: ClipboardRenderer;
  private _exporter: GridApiExporter | null = null;
  private _tooltip: GridApiTooltipController | null = null;
  private _pinnedRows: GridApiPinnedRowsController | null = null;

  constructor(private core: IGridCore) {}

  /** Wire the export target. Called by the renderer on attach; before that, exports are no-ops. */
  setExporter(exporter: GridApiExporter): void {
    this._exporter = exporter;
  }

  /** Wire the tooltip controller. Called by the renderer on attach; before that these are no-ops. */
  setTooltipController(controller: GridApiTooltipController): void {
    this._tooltip = controller;
  }

  setPinnedRowsController(controller: GridApiPinnedRowsController): void {
    this._pinnedRows = controller;
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

  setPinnedTopRowData(rows: RowData[]): void {
    this._pinnedRows?.setPinnedTopRowData(rows);
  }

  setPinnedBottomRowData(rows: RowData[]): void {
    this._pinnedRows?.setPinnedBottomRowData(rows);
  }

  setRowPinned(rowId: GridId, position: RowPinnedPosition | null): void {
    this._pinnedRows?.setRowPinned(rowId, position);
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

  getKeyboardNavigationMode(): TreeDataKeyboardNavigationMode {
    return this.core.getKeyboardNavigationMode();
  }

  setKeyboardNavigationMode(mode: TreeDataKeyboardNavigationMode): void {
    this.dispatch({ type: "keyboardNavigationModeSet", mode, source: "api" });
  }

  captureViewState(): GridViewState {
    return {
      version: 1,
      columns: this.getColumnState().map(state => ({ ...state })),
      rowGroupColumns: this.core.getRowGroupColumns().map(col => col.colId),
      sortModel: this.core.getSortModel().items.map(item => ({
        colId: item.col.colId,
        dir: item.dir,
      })),
      filterModel: this.core.getFilterModel().items.map(item => ({
        colId: item.col.colId,
        filters: item.filters.map(filter => ({
          type: filter.type,
          values: cloneViewValue(filter.values),
        })),
        join: item.join,
      })),
      quickFilterText: this.core.getQuickFilterText(),
      groupExpansion: this.core.getRowModel().getGroupNodes().map(node => ({
        groupId: node.id,
        expanded: node.isExpanded,
      })),
    };
  }

  applyViewState(state: GridViewState, opts?: { columns?: "exact" | "merge" }): void {
    if (!state || state.version !== 1) return;

    this.dispatch({ type: "rowGroupSet", colIds: state.rowGroupColumns ?? [] });
    this.applyColumnState(
      state.columns ?? [],
      opts?.columns === "merge" ? undefined : { defaultState: { hidden: true } },
    );

    const clearSorts: SortItemUpdate[] = this.core.getSortModel().items.map(item => ({
      key: item.col.instanceID,
      dir: null,
    }));
    this.dispatch({
      type: "sortModelSet",
      sortItems: [
        ...clearSorts,
        ...(state.sortModel ?? []).map(item => ({ key: item.colId, dir: item.dir })),
      ],
    });

    const filters: FilterItem[] = (state.filterModel ?? []).flatMap(item => {
      const col = this.core.getColumnModel().getByColId(item.colId)
        ?? this.core.getColumnModel().getById(item.colId)
        ?? this.core.getColumnModel().getByKey(item.colId);
      if (!col) return [];
      return [{
        col,
        key: col.key,
        filters: item.filters.map(filter => ({
          type: filter.type,
          values: cloneViewValue(filter.values),
        })),
        join: item.join,
      }];
    });
    this.dispatch({ type: "filterModelSet", filterModel: filters });
    this.setQuickFilter(state.quickFilterText ?? "");

    const expansion = new Map(
      (state.groupExpansion ?? []).map(item => [item.groupId, item.expanded]),
    );
    for (const node of this.core.getRowModel().getGroupNodes()) {
      const expanded = expansion.get(node.id) ?? false;
      if (node.isExpanded !== expanded) {
        this.dispatch({ type: "groupToggleExpand", groupId: node.id, expanded });
      }
    }
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

function cloneViewValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through for values a custom filter may have made non-cloneable.
    }
  }
  if (Array.isArray(value)) return value.map(item => cloneViewValue(item)) as T;
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) clone[key] = cloneViewValue(item);
    return clone as T;
  }
  return value;
}
