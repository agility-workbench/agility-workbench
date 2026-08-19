import { GridEventMap } from "../events/events";
import { ColDef } from "../interfaces/column";
import {
  ExportParams,
  GridApiConfigController,
  IGridAPI,
  NavDir,
  RowScrollPosition,
} from "../interfaces/iGridAPI";
import { ColumnState, GridId, IGridCore, RowData } from "../interfaces/iGridCore";
import { IColumnModel } from "../interfaces/iColumnModel";
import { IBodyMenuAdapter } from "../interfaces/iBodyMenuAdapter";
import { IMenuAdapter } from "../interfaces/iMenuAdapter";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";
import { IRowNode } from "../interfaces/iRowNode";
import {
  QuickFilterMatchMode,
  RowPinnedPosition,
  RUNTIME_OPTION_KEYS,
  RuntimeGridOptions,
  TreeDataKeyboardNavigationMode,
  TreeDataKeyboardNavigationOptions,
  UPDATABLE_OPTION_KEYS,
  UpdatableGridOptions,
} from "../interfaces/gridOptions";
import { FilterDef, FilterItem, FilterType, SetFilterMode } from "../interfaces/filter";
import { RowTransaction, RowTransactionResult, ServerSideRefreshOptions } from "../interfaces/iRowModel";
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
import { GridHistoryState } from "../core/historyModel";

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

export interface GridApiRowPresentationController {
  refreshRowPresentation: () => void;
}

/** Scroll hooks provided by the renderer once it's attached (it owns the scrollers). */
export interface GridApiScrollController {
  ensureRowVisible: (viewIdx: number, rowPinned?: RowPinnedPosition, position?: RowScrollPosition) => void;
  ensureColumnVisible: (colIdx: number) => void;
}

export interface GridApiPinnedRowsController {
  setPinnedTopRowData: (rows: RowData[]) => void;
  setPinnedBottomRowData: (rows: RowData[]) => void;
  setRowPinned: (rowId: GridId, position: RowPinnedPosition | null) => void;
}

/**
 * Menu-adapter slots owned by `initDomRenderer`. Internal wiring for
 * {@link IGridAPI.registerMenuAdapter} / {@link IGridAPI.registerBodyMenuAdapter}.
 */
export interface GridApiMenuAdapterController {
  setMenuAdapter: (adapter: IMenuAdapter | null) => void;
  setBodyMenuAdapter: (adapter: IBodyMenuAdapter | null) => void;
}

export class GridAPI implements IGridAPI {
  private _clipboard?: ClipboardRenderer;
  private _exporter: GridApiExporter | null = null;
  private _tooltip: GridApiTooltipController | null = null;
  private _rowPresentation: GridApiRowPresentationController | null = null;
  private _scroll: GridApiScrollController | null = null;
  private _pinnedRows: GridApiPinnedRowsController | null = null;
  private _config: GridApiConfigController | null = null;
  private _menuAdapters: GridApiMenuAdapterController | null = null;
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

  setRowPresentationController(controller: GridApiRowPresentationController): void {
    this._rowPresentation = controller;
  }

  /** Wire the scrollers. Called by the renderer on attach; before that these are no-ops. */
  setScrollController(controller: GridApiScrollController): void {
    this._scroll = controller;
  }

  setPinnedRowsController(controller: GridApiPinnedRowsController): void {
    this._pinnedRows = controller;
  }

  /**
   * Wire live reconfiguration. Called by the renderer on attach; before that, `updateGridOptions`
   * warns and does nothing.
   */
  setConfigController(controller: GridApiConfigController): void {
    this._config = controller;
  }

  /**
   * Wire the menu-adapter slots. Called by `initDomRenderer` as it assembles the grid, so this is
   * in place before any host holds the api; before that, `registerMenuAdapter` warns and does
   * nothing.
   */
  setMenuAdapterController(controller: GridApiMenuAdapterController): void {
    this._menuAdapters = controller;
  }

  registerMenuAdapter(adapter: IMenuAdapter | null): void {
    if (!this._menuAdapters) {
      console.warn("registerMenuAdapter called on an api with no menu wiring; ignoring.");
      return;
    }
    this._menuAdapters.setMenuAdapter(adapter);
  }

  registerBodyMenuAdapter(adapter: IBodyMenuAdapter | null): void {
    if (!this._menuAdapters) {
      console.warn("registerBodyMenuAdapter called on an api with no menu wiring; ignoring.");
      return;
    }
    this._menuAdapters.setBodyMenuAdapter(adapter);
  }

  // ---------------- Live reconfiguration ----------------

  /**
   * Route each supplied option to its owner: renderer widgets, the pinned-row bands, the core's
   * grouping setters, the caller-owned column-def path, or the runtime slice.
   *
   * Presence — not truthiness — decides what changes, so `{ getRowStyle: undefined }` clears the
   * callback while an omitted `getRowStyle` leaves it alone. The runtime slice must be handed to the
   * renderer whole (a missing key there reads as "set this to undefined"), so the current resolved
   * values are read back off the core and the caller's overrides layered on top.
   */
  updateGridOptions(options: UpdatableGridOptions): void {
    if (!this._config) {
      console.warn("updateGridOptions called before the grid was rendered; ignoring.");
      return;
    }
    const config = this._config;
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(options, key);
    const supplied = options as Record<string, unknown>;

    // Widgets and chrome: each option is independent, so only forward the ones supplied.
    if (has("toolbar")) config.setToolbarOptions(options.toolbar);
    if (has("quickFilter")) config.setQuickFilterOptions(options.quickFilter);
    if (has("tooltip")) config.setTooltipOptions(options.tooltip);
    if (has("columnPanel")) config.setColumnPanelOptions(options.columnPanel);
    if (has("savedViews")) config.setSavedViewsOptions(options.savedViews);
    if (has("rowSelection")) config.setRowSelectionOptions(options.rowSelection);
    if (has("pagination")) config.togglePagination(options.pagination ?? false);
    if (has("paginationControls")) config.setPaginationControls(options.paginationControls);
    if (has("serverSideDataSource")) config.setServerSideDataSource(options.serverSideDataSource);
    if (has("serverSideAggregationSource")) {
      config.setServerSideAggregation(options.serverSideAggregationSource);
    }

    // Theme variables and icons are one visual layer: icons supplied here (or already on the core's
    // options) win over icons carried by the theme, which is what setTheme resolves.
    if (has("theme")) config.setTheme(options.theme);
    if (has("icons")) config.setIcons(options.icons);

    // The pinned bands share one renderer call, and its own contract is already presence-based.
    if (
      has("pinnedTopRowData") || has("pinnedBottomRowData")
      || has("isRowPinned") || has("groupRowsSticky")
    ) {
      const pinned: Parameters<GridApiConfigController["setPinnedRowOptions"]>[0] = {};
      if (has("pinnedTopRowData")) pinned.pinnedTopRowData = options.pinnedTopRowData ?? [];
      if (has("pinnedBottomRowData")) pinned.pinnedBottomRowData = options.pinnedBottomRowData ?? [];
      if (has("isRowPinned")) pinned.isRowPinned = options.isRowPinned;
      if (has("groupRowsSticky")) pinned.groupRowsSticky = options.groupRowsSticky ?? false;
      config.setPinnedRowOptions(pinned);
    }

    // Row-grouping presentation is core-owned and each setter rebuilds the view it affects.
    if (has("groupDisplayType")) {
      this.core.setGroupDisplayType(options.groupDisplayType ?? "singleColumn");
    }
    if (has("groupSortMode")) this.core.setGroupSortMode(options.groupSortMode ?? "local");
    if (has("groupRowsSelectable")) {
      this.core.setGroupRowsSelectable(options.groupRowsSelectable ?? false);
    }

    // Caller-owned schema, same as `createGrid({ columnDefs })`.
    if (has("columnDefs")) this.core.setColumnDefsFromProps(options.columnDefs);

    const runtimeKeys = RUNTIME_OPTION_KEYS.filter(key => has(key));
    if (runtimeKeys.length > 0) {
      const current = this.core.getOptions() as Record<string, unknown>;
      const next = {} as Record<string, unknown>;
      for (const key of RUNTIME_OPTION_KEYS) {
        next[key] = has(key) ? supplied[key] : current[key];
      }
      config.setRuntimeOptions(next as unknown as RuntimeGridOptions);
    }

    const unknown = Object.keys(supplied)
      .filter(key => !(UPDATABLE_OPTION_KEYS as readonly string[]).includes(key));
    if (unknown.length > 0) {
      console.warn(
        `updateGridOptions ignored option(s) that cannot change after the grid is created: `
        + `${unknown.join(", ")}. Create a new grid to change these.`,
      );
    }
  }

  // ---------------- Scrolling ----------------
  ensureRowVisible(rowId: GridId, opts?: { position?: RowScrollPosition }): boolean {
    if (!this._scroll) {
      console.warn("ensureRowVisible called before the grid was rendered; ignoring.");
      return false;
    }
    // The core does the model half — expand ancestors, page to the row — and reports the slot the
    // renderer will draw it at. No slot means no amount of scrolling would show it.
    const target = this.core.revealRow(rowId);
    if (!target) return false;
    this._scroll.ensureRowVisible(target.viewIndex, target.rowPinned, opts?.position ?? "auto");
    return true;
  }

  ensureColumnVisible(colId: string): boolean {
    if (!this._scroll) {
      console.warn("ensureColumnVisible called before the grid was rendered; ignoring.");
      return false;
    }
    const colIdx = this.leafColumnIndex(colId);
    if (colIdx < 0) return false;
    this._scroll.ensureColumnVisible(colIdx);
    return true;
  }

  ensureCellVisible(cell: CellRef, opts?: { position?: RowScrollPosition }): boolean {
    // Checked here as well as in each half, so an unrendered grid warns once per call, not twice.
    if (!this._scroll) {
      console.warn("ensureCellVisible called before the grid was rendered; ignoring.");
      return false;
    }
    // Deliberately not short-circuiting: each axis is independently useful, so a bad colId still
    // gets you to the row.
    const rowVisible = this.ensureRowVisible(cell.rowId, opts);
    const colVisible = this.ensureColumnVisible(cell.colInstanceId ?? cell.colId);
    return rowVisible && colVisible;
  }

  /** Index of a column among the visible leaves (what the renderer indexes cells by); -1 if it
   * isn't one — unknown id, or hidden (directly or by a collapsed column group). */
  private leafColumnIndex(colId: string | undefined): number {
    if (colId == null) return -1;
    const model = this.core.getColumnModel();
    // resolve() is instance-id first, then public colId, then field key (A3: public colIds are not
    // unique), which is exactly the precedence every other id input on this API uses.
    const col = model.resolve(colId);
    if (!col || col.hidden) return -1;
    return model.getLeaves().findIndex(c => c.instanceID === col.instanceID);
  }

  showTooltip(cell: CellRef): void {
    if (!this._tooltip) return;
    const viewIdx = this.core.getViewIndexForRowId(cell.rowId);
    const col = cell.colInstanceId
      ? this.core.getColumnModel().getById(cell.colInstanceId)
      : this.core.getColumnModel().resolve(cell.colId);
    const colIdx = col
      ? this.core.getColumnModel().getLeaves().findIndex((c) => c.instanceID === col.instanceID)
      : -1;
    if (viewIdx == null || viewIdx < 0 || colIdx < 0) return;
    this._tooltip.showBodyTooltip(viewIdx, colIdx);
  }

  hideTooltip(): void {
    this._tooltip?.hideTooltip();
  }

  refreshRowPresentation(): void {
    this._rowPresentation?.refreshRowPresentation();
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

  forEachNodeAfterFilter(callback: (node: IRowNode, idx: number) => void): void {
    this.core.getRowModel().forEachNodeAfterFilter(callback);
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    this.core.getRowModel().forEachNodeAfterFilterAndSort(callback);
  }

  getGroupNodes(): IRowNode[] {
    return this.core.getRowModel().getGroupNodes();
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

  applyTransaction(tx: RowTransaction<RowData>): RowTransactionResult {
    return this.core.applyTransaction(tx);
  }

  applyTransactionAsync(tx: RowTransaction<RowData>): Promise<RowTransactionResult> {
    return this.core.applyTransactionAsync(tx);
  }

  flushAsyncTransactions(): void {
    this.core.flushAsyncTransactions();
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

  setTreeDataKeyboardNavigationOptions(options: TreeDataKeyboardNavigationOptions): void {
    const has = (key: keyof TreeDataKeyboardNavigationOptions): boolean =>
      Object.prototype.hasOwnProperty.call(options, key);
    // The core setter takes the pair, so an unsupplied field has to be re-stated at its current
    // value rather than left out — otherwise setting one would silently reset the other.
    const current = this.core.getOptions().treeData;
    const mode = has("keyboardNavigationMode")
      ? options.keyboardNavigationMode ?? "grid"
      : this.core.getKeyboardNavigationMode();
    const enableModeSwitch = has("enableKeyboardNavigationModeSwitch")
      ? options.enableKeyboardNavigationModeSwitch ?? false
      : current?.enableKeyboardNavigationModeSwitch ?? false;
    this.core.setTreeDataKeyboardNavigationOptions(mode, enableModeSwitch);
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

    // Restore the page AFTER the filter/quick-filter dispatches above — depending on
    // `resetPageOn` they may reset to page 1 (or clamp), and the explicit restore must win.
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

  selectRowsById(rowIds: GridId[], mode: "set" | "add" | "remove" = "set"): void {
    this.core.dispatch({ type: "rowSelectByIds", rowIds, mode });
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

  // A programmatic write states its own type: a string is user-style input and runs through the
  // column's valueParser, anything else is already the typed value to store. Without this,
  // setCellValue(cell, 99) on a parser-less numeric column stores the string "99".
  setCellValue(cell: CellRef, value: unknown): void {
    this.core.dispatch({ type: "editCommit", cell, value, parsed: typeof value !== "string" });
  }

  setCellValues(edits: { cell: CellRef; value: unknown }[]): void {
    if (edits.length === 0) return;
    this.core.dispatch({
      type: "cellsCommit",
      reason: "api",
      edits: edits.map(e => ({ ...e, parsed: typeof e.value !== "string" })),
    });
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

  getHistoryState(): GridHistoryState {
    return this.core.getHistoryState();
  }

  clearHistory(): void {
    this.core.clearHistory();
  }

  withUndoGroup<T>(fn: () => T): T {
    return this.core.runInHistoryScope("group", fn);
  }

  withoutUndoHistory<T>(fn: () => T): T {
    return this.core.runInHistoryScope("skip", fn);
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
