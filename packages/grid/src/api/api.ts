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
import { FilterDef, FilterItem, FilterType, SetFilterMode } from "../interfaces/filter";
import { RowTransactionResult, ServerSideRefreshOptions } from "../interfaces/iRowModel";
import { GridViewFilterState, GridViewState } from "../interfaces/gridView";
import { Column } from "../column/column";
import { ColumnFilterMenuService } from "../filter/filterMenuService";
import { FilterPanelSpec, FilterValueAsyncSourceParamsImpl, SetFilterOptions } from "../filter/types";
import {
  computeUniqueValues,
  buildSetOptions,
  defaultValueKey,
  defFromCheckedKeys,
  isValueChecked,
  resolveOption,
  selectionSummary,
  SetFilterSelection,
  toggleOption,
  ValueKeyFn,
  valueOptions,
} from "../filter/setFilterCore";
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
  private filterMenuService?: ColumnFilterMenuService;

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

  refreshServerSideData(options?: ServerSideRefreshOptions): Promise<boolean> {
    return this.core.refreshServerSideData(options);
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
  }): RowTransactionResult {
    return this.core.applyTransaction(tx);
  }

  setQuickFilter(text: string, opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean }): void {
    this.dispatch({ type: "quickFilterSet", text, matchMode: opts?.matchMode, caseSensitive: opts?.caseSensitive });
  }

  getQuickFilterText(): string {
    return this.core.getQuickFilterText();
  }

  // ---------------- Filtering ----------------
  getFilterModel(): GridViewFilterState[] {
    return this.core.getFilterModel().items.map(item => ({
      colId: item.col.colId,
      filters: item.filters.map(filter => ({
        type: filter.type,
        values: cloneViewValue(filter.values),
        ...(filter.mode ? { mode: filter.mode } : {}),
      })),
      join: item.join,
    }));
  }

  setFilterModel(filters: GridViewFilterState[]): void {
    this.dispatch({ type: "filterModelSet", filterModel: this.toFilterItems(filters ?? []) });
  }

  addFilterModel(filter: GridViewFilterState): void {
    const [item] = this.toFilterItems([filter]);
    if (!item) return;
    const others = this.core.getFilterModel().items
      .filter(existing => existing.col.instanceID !== item.col.instanceID);
    this.dispatch({ type: "filterModelSet", filterModel: [...others, item] });
  }

  removeFilterModel(colId: string): void {
    const col = this.resolveColumn(colId);
    if (!col) return;
    const items = this.core.getFilterModel().items;
    const next = items.filter(existing => existing.col.instanceID !== col.instanceID);
    // No filter on that column — skip the dispatch, which would reset the page and clear selection.
    if (next.length === items.length) return;
    this.dispatch({ type: "filterModelSet", filterModel: next });
  }

  // ---------------- Set filter ----------------
  async getSetFilterValues(colId: string): Promise<unknown[]> {
    const session = await this.loadSetFilterSession(colId);
    return session ? valueOptions(session.options).map(o => o.raw) : [];
  }

  async getSetFilterState(colId: string): Promise<SetFilterSelection | null> {
    const col = this.resolveColumn(colId);
    if (!col) return null;
    const def = this.currentSetDef(col);
    if (!def) return null;
    const session = await this.loadSetFilterSession(colId);
    if (!session) return null;
    return selectionSummary(def, session.options, session.keyFn);
  }

  checkSetFilterValue(colId: string, value: unknown): Promise<void> {
    return this.toggleSetFilterValue(colId, value, true);
  }

  uncheckSetFilterValue(colId: string, value: unknown): Promise<void> {
    return this.toggleSetFilterValue(colId, value, false);
  }

  async setSetFilterValues(colId: string, values: unknown[], opts?: { mode?: SetFilterMode }): Promise<void> {
    const session = await this.loadSetFilterSession(colId);
    if (!session) return;
    const mode = opts?.mode ?? "include";

    const resolved = new Set<string>();
    for (const value of values ?? []) {
      const option = resolveOption(session.options, value, session.keyFn);
      if (option) resolved.add(option.key);
      else console.warn(`Set filter on "${colId}": value ${JSON.stringify(value)} is not in the value universe; ignoring it.`);
    }
    const checked = mode === "include"
      ? resolved
      : new Set(valueOptions(session.options).map(o => o.key).filter(key => !resolved.has(key)));
    this.applySetDef(session.col, defFromCheckedKeys(checked, session.options, { mode }));
  }

  private async toggleSetFilterValue(colId: string, value: unknown, checked: boolean): Promise<void> {
    const session = await this.loadSetFilterSession(colId);
    if (!session) return;
    const option = resolveOption(session.options, value, session.keyFn);
    if (!option) {
      console.warn(`Set filter on "${colId}": value ${JSON.stringify(value)} is not in the value universe; ignoring it.`);
      return;
    }
    const def = this.currentSetDef(session.col);
    // Already in the requested state — skip the dispatch (which resets the page and selection).
    if (isValueChecked(def, option, session.keyFn) === checked) return;
    this.applySetDef(session.col, toggleOption(def, option, checked, session.options, session.keyFn));
  }

  /** The column's active in/notIn def, or null when it has no set filter. */
  private currentSetDef(col: Column): FilterDef | null {
    const item = this.core.getFilterModel().items.find(i => i.col.instanceID === col.instanceID);
    return item?.filters.find(f => f.type === FilterType.IN || f.type === FilterType.NOT_IN) ?? null;
  }

  /** Replace the column's whole filter with one set def (null removes it). */
  private applySetDef(col: Column, def: FilterDef | null): void {
    const items = this.core.getFilterModel().items;
    const others = items.filter(i => i.col.instanceID !== col.instanceID);
    if (def === null) {
      if (others.length === items.length) return;
      this.dispatch({ type: "filterModelSet", filterModel: others });
      return;
    }
    this.dispatch({
      type: "filterModelSet",
      filterModel: [...others, { col, key: col.key, filters: [def], join: "and" }],
    });
  }

  /** Build the column's set-filter universe headlessly (same spec + sources the menu uses). */
  private async loadSetFilterSession(
    colId: string,
  ): Promise<{ col: Column; options: SetFilterOptions[]; keyFn: ValueKeyFn } | null> {
    const col = this.resolveColumn(colId);
    if (!col) {
      console.warn(`Set filter: unknown column "${colId}".`);
      return null;
    }
    if (!this.filterMenuService) this.filterMenuService = new ColumnFilterMenuService(this.core);
    const spec = this.filterMenuService.buildFilterMenu({ trigger: "api", targetCol: col });
    if (spec.kind !== "set") {
      console.warn(`Set filter: column "${colId}" does not use the set filter (kind "${spec.kind}").`);
      return null;
    }
    const keyFn = spec.valueKey ?? defaultValueKey;
    const values = await this.loadSetFilterSourceValues(spec);
    return { col, options: buildSetOptions(values, keyFn, spec.valueLabel), keyFn };
  }

  private loadSetFilterSourceValues(spec: FilterPanelSpec): Promise<any[]> {
    const source = spec.conditionTemplate.valueSource;
    if (!source || source.kind === "static") {
      return Promise.resolve((source && source.values) ?? []);
    }
    if (source.kind === "fromRows") {
      return Promise.resolve(computeUniqueValues(
        (callback) => this.core.getRowModel().forEachNode(callback),
        (row) => spec.column.getValue(row),
        spec.valueKey ?? defaultValueKey,
        spec.valueLabel ?? ((x: any) => String(x)),
        typeof spec.params.maxFilterItems === "number" ? spec.params.maxFilterItems : undefined,
      ));
    }
    return new Promise((resolve, reject) => {
      const abort = new AbortController();
      const res = new FilterValueAsyncSourceParamsImpl(spec.column.col, abort.signal);
      res.onSuccess(values => resolve(values ?? []));
      res.onError(err => reject(err instanceof Error ? err : new Error(String(err ?? "Failed to load filter values"))));
      void source.load(res);
    });
  }

  /** Resolve a public colId (falling back to instance id, then key) to a live column. */
  private resolveColumn(colId: string): Column | undefined {
    const model = this.core.getColumnModel();
    return model.getByColId(colId) ?? model.getById(colId) ?? model.getByKey(colId);
  }

  /** Convert serializable per-column filter state into core FilterItems; unknown colIds drop out. */
  private toFilterItems(states: GridViewFilterState[]): FilterItem[] {
    return states.flatMap(item => {
      const col = this.resolveColumn(item.colId);
      if (!col) return [];
      return [{
        col,
        key: col.key,
        filters: item.filters.map(filter => ({
          type: filter.type,
          values: cloneViewValue(filter.values),
          ...(filter.mode ? { mode: filter.mode } : {}),
        })),
        join: item.join,
      }];
    });
  }

  getKeyboardNavigationMode(): TreeDataKeyboardNavigationMode {
    return this.core.getKeyboardNavigationMode();
  }

  setKeyboardNavigationMode(mode: TreeDataKeyboardNavigationMode): void {
    this.dispatch({ type: "keyboardNavigationModeSet", mode, source: "api" });
  }

  captureViewState(): GridViewState {
    const pagination = this.core.getPaginationInfo();
    return {
      version: 1,
      columns: this.getColumnState().map(state => ({ ...state })),
      rowGroupColumns: this.core.getRowGroupColumns().map(col => col.colId),
      sortModel: this.core.getSortModel().items.map(item => ({
        colId: item.col.colId,
        dir: item.dir,
      })),
      filterModel: this.getFilterModel(),
      quickFilterText: this.core.getQuickFilterText(),
      groupExpansion: this.core.getRowModel().getGroupNodes().map(node => ({
        groupId: node.id,
        expanded: node.isExpanded,
      })),
      ...(pagination.paginationEnabled
        ? { pagination: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize } }
        : {}),
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

    this.dispatch({ type: "filterModelSet", filterModel: this.toFilterItems(state.filterModel ?? []) });
    this.setQuickFilter(state.quickFilterText ?? "");

    // Restore the page AFTER the filter/quick-filter dispatches above — both reset to page 1.
    // Old captures without a pagination field leave the page untouched.
    const pagination = this.core.getPaginationInfo();
    if (state.pagination && pagination.paginationEnabled && state.pagination.pageSize > 0) {
      const { pageIndex, pageSize } = state.pagination;
      // Clamp to the last page of the CURRENT (possibly smaller) dataset when the total is known.
      const lastPage = pagination.totalRowCountKnown
        ? Math.max(0, Math.ceil(pagination.totalRowCount / pageSize) - 1)
        : Number.POSITIVE_INFINITY;
      this.dispatch({
        type: "paginationSet",
        enabled: true,
        pageIndex: Math.max(0, Math.min(pageIndex, lastPage)),
        pageSize,
      });
    }

    const expansion = new Map(
      (state.groupExpansion ?? []).map(item => [item.groupId, item.expanded]),
    );
    // Batch per direction so restoring expansion costs at most two view rebuilds, not one per node.
    const toExpand: string[] = [];
    const toCollapse: string[] = [];
    for (const node of this.core.getRowModel().getGroupNodes()) {
      const expanded = expansion.get(node.id) ?? false;
      if (node.isExpanded !== expanded) (expanded ? toExpand : toCollapse).push(node.id);
    }
    if (toExpand.length > 0) this.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: toExpand });
    if (toCollapse.length > 0) this.dispatch({ type: "groupSetExpanded", expanded: false, groupIds: toCollapse });
  }

  setAllGroupsExpanded(expanded: boolean): void {
    this.dispatch({ type: "groupSetExpanded", expanded });
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
