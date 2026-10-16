import { GridEventMap, GridEventPaginationChangedParams } from "../events/events";
import { ColDef } from "../interfaces/column";
import {
  ColumnWidthItem,
  ExportParams,
  FlashCellsParams,
  GridApiConfigController,
  GridApiShortcutController,
  IGridAPI,
  NavDir,
  PaginationUpdate,
  RedrawRowsParams,
  RefreshCellsParams,
  RowScrollPosition,
  SortModelItem,
} from "../interfaces/iGridAPI";
import type { KeyboardShortcutInfo } from "../renderer/interaction/keyboardRouter";
import type { GridShortcut } from "../renderer/interaction/shortcutPolicy";
import { ColumnState, GridId, IGridCore, RowData } from "../interfaces/iGridCore";
import { IColumnModel } from "../interfaces/iColumnModel";
import { IBodyMenuAdapter } from "../interfaces/iBodyMenuAdapter";
import { IMenuAdapter } from "../interfaces/iMenuAdapter";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";
import { IRowNode } from "../interfaces/iRowNode";
import {
  QuickFilterBehavior,
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
import {
  GridViewColumnGroupState,
  GridViewFilterState,
  GridViewRowPinnedState,
  GridViewState,
} from "../interfaces/gridView";
import { QuickFilterFindMatch, QuickFilterFindState } from "../interfaces/find";
import { PivotResultColumnDescriptor } from "../interfaces/pivot";
import { AggregateKind, ColumnAggregate } from "../interfaces/aggregate";
import { Column } from "../column/column";
import { ColumnFilterMenuService } from "../filter/filterMenuService";
import { FilterPanelSpec, FilterValueAsyncSourceParamsImpl, SetFilterOptions } from "../filter/types";
import {
  computeUniqueValues,
  addSetOptionCounts,
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
import {
  buildSetFilterTree,
  findSetFilterPath,
  groupCheckState,
  SetFilterTreeNode,
  setFilterTreeNodes,
  setOptionStates,
  toggleGroup,
} from "../filter/setFilterTree";
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

/**
 * Repaint and rendered-window hooks provided by the renderer once it's attached (it owns the row
 * pool, the frozen bands and the body viewport). Ids arrive resolved: row ids as given, columns as
 * the instance ids of visible leaves.
 */
export interface GridApiRenderController {
  /** Repaint rendered cells; `undefined` sets mean "all". `rebuild` destroys renderer instances. */
  refreshCells: (params: { rowIds?: Set<string>; colInstanceIds?: Set<string>; rebuild: boolean }) => void;
  /** Destroy and repaint rendered rows; `undefined` means every rendered row. */
  redrawRows: (rowIds?: Set<string>) => void;
  /** Flash rendered cells; `undefined` sets mean "all". */
  flashCells: (params: {
    rowIds?: Set<string>;
    colInstanceIds?: Set<string>;
    flashMs: number;
    fadeMs: number;
  }) => void;
  /** The page-relative view-index range of the rendered body window, or null when it is empty. */
  getRenderedRange: () => { first: number; last: number } | null;
  /** The centre section's visible width in px (0 while not laid out). */
  getCenterViewportWidth: () => number;
}

/** Fill hooks provided by the renderer once it's attached (it owns the fill handle). */
export interface GridApiFillController {
  canFillDown: () => boolean;
  canFillRight: () => boolean;
  fillDown: () => number;
  fillRight: () => number;
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
  /** The runtime pin overrides (setRowPinned / the row-pinning menu), for saved views. */
  getRowPinnedOverrides?: () => GridViewRowPinnedState[];
  /** Replace every runtime pin override at once (a saved view's restore). */
  setRowPinnedOverrides?: (overrides: GridViewRowPinnedState[]) => void;
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
  private _fill: GridApiFillController | null = null;
  private _rowPresentation: GridApiRowPresentationController | null = null;
  private _render: GridApiRenderController | null = null;
  private _scroll: GridApiScrollController | null = null;
  private _pinnedRows: GridApiPinnedRowsController | null = null;
  private _config: GridApiConfigController | null = null;
  private _menuAdapters: GridApiMenuAdapterController | null = null;
  private _shortcuts: GridApiShortcutController | null = null;
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

  /** Wire repaints and the rendered window. Called by the renderer on attach; before that the
   * repaint methods are no-ops and the window reads report nothing rendered. */
  setRenderController(controller: GridApiRenderController): void {
    this._render = controller;
  }

  /** Wire the fill handle. Called by the renderer on attach; before that the fills warn and do nothing. */
  setFillController(controller: GridApiFillController): void {
    this._fill = controller;
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

  /**
   * Wire the keyboard-shortcut hooks. Called by the renderer on attach; before that,
   * `registerShortcut` warns and does nothing.
   */
  setShortcutController(controller: GridApiShortcutController): void {
    this._shortcuts = controller;
  }

  registerShortcut(shortcut: GridShortcut): () => void {
    if (!this._shortcuts) {
      console.warn("registerShortcut called on an api with no keyboard wiring; ignoring.");
      return () => undefined;
    }
    return this._shortcuts.register(shortcut);
  }

  getKeyboardShortcuts(): readonly KeyboardShortcutInfo[] {
    if (!this._shortcuts) {
      console.warn("getKeyboardShortcuts called on an api with no keyboard wiring; returning [].");
      return [];
    }
    return this._shortcuts.getShortcuts();
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
    if (has("sheets")) config.setSheetsOptions(options.sheets);
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

    // The three header heights resolve against each other (an unset level height follows
    // headerHeight), so they go over as one presence-based patch.
    if (has("headerHeight") || has("leafHeaderHeight") || has("parentHeaderHeight")) {
      const heights: Parameters<GridApiConfigController["setHeaderHeights"]>[0] = {};
      if (has("headerHeight")) heights.headerHeight = options.headerHeight;
      if (has("leafHeaderHeight")) heights.leafHeaderHeight = options.leafHeaderHeight;
      if (has("parentHeaderHeight")) heights.parentHeaderHeight = options.parentHeaderHeight;
      config.setHeaderHeights(heights);
    }

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
    if (has("pivotColumnMoveMode")) {
      this.core.setPivotColumnMoveMode(options.pivotColumnMoveMode ?? "measures");
    }
    if (has("groupRowsSelectable")) {
      this.core.setGroupRowsSelectable(options.groupRowsSelectable ?? false);
    }
    if (has("groupSelectsChildren")) {
      this.core.setGroupSelectsChildren(options.groupSelectsChildren ?? false);
    }
    if (has("groupChildCount")) this.core.setGroupChildCount(options.groupChildCount);
    // Both footer options share one rebuild of the group tree.
    if (has("groupTotalRow") || has("grandTotalRow")) {
      const footers: Parameters<IGridCore["setGroupTotalRows"]>[0] = {};
      if (has("groupTotalRow")) footers.groupTotalRow = options.groupTotalRow;
      if (has("grandTotalRow")) footers.grandTotalRow = options.grandTotalRow;
      this.core.setGroupTotalRows(footers);
    }
    if (has("groupTotalRowLabel")) this.core.setGroupTotalRowLabel(options.groupTotalRowLabel);
    if (has("isRowSelectable")) this.core.setIsRowSelectable(options.isRowSelectable);

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

  // ---------------- Repainting ----------------
  refreshCells(params?: RefreshCellsParams): void {
    if (!this._render) return;
    const colInstanceIds = this.resolveLeafInstanceIds(params?.colIds);
    // Named columns that are all hidden or unknown: nothing to repaint (an empty set would read as
    // "all" further down).
    if (colInstanceIds && colInstanceIds.size === 0) return;
    this._render.refreshCells({
      rowIds: params?.rowIds ? new Set(params.rowIds.map(String)) : undefined,
      colInstanceIds,
      rebuild: params?.force === true,
    });
  }

  redrawRows(params?: RedrawRowsParams): void {
    if (!this._render) return;
    this._render.redrawRows(params?.rowIds ? new Set(params.rowIds.map(String)) : undefined);
  }

  flashCells(params: FlashCellsParams = {}): void {
    if (!this._render) return;
    const colInstanceIds = this.resolveLeafInstanceIds(params.colIds);
    if (colInstanceIds && colInstanceIds.size === 0) return;
    const options = this.core.getOptions();
    this._render.flashCells({
      rowIds: params.rowIds ? new Set(params.rowIds.map(String)) : undefined,
      colInstanceIds,
      flashMs: nonNegative(params.flashDuration) ?? options.cellFlashDuration ?? 500,
      fadeMs: nonNegative(params.fadeDuration) ?? options.cellFadeDuration ?? 1000,
    });
  }

  /**
   * The visible leaves the given column ids address (a group stands for its visible leaves), as
   * instance ids; undefined when no list was given ("every column").
   */
  private resolveLeafInstanceIds(colIds: string[] | undefined): Set<string> | undefined {
    if (!colIds) return undefined;
    const model = this.core.getColumnModel();
    const ids = new Set<string>();
    for (const colId of colIds) {
      const col = model.resolve(colId) ?? model.getAutoGroupColumnByColId(colId);
      for (const leaf of col?.getVisibleLeaves() ?? []) ids.add(leaf.instanceID);
    }
    return ids;
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

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    const rowModel = this.core.getRowModel();
    let idx = 0;
    // The row model's own walk visits data rows only (it skips synthetic group nodes); the group
    // nodes follow, so "every node" holds for grouped and tree grids alike.
    const seen = new Set<string>();
    rowModel.forEachNode(node => {
      seen.add(node.id);
      callback(node, idx++);
    });
    for (const node of rowModel.getGroupNodes()) {
      if (seen.has(node.id)) continue;
      callback(node, idx++);
    }
  }

  forEachLeafNode(callback: (node: IRowNode, idx: number) => void): void {
    let idx = 0;
    this.core.getRowModel().forEachNode(node => {
      if (!node.isGroup) callback(node, idx++);
    });
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

  getPaginationInfo(): GridEventPaginationChangedParams {
    return this.core.getPaginationInfo();
  }

  setPagination(update: PaginationUpdate): void {
    const current = this.core.getPaginationInfo();
    const enabled = update.enabled ?? current.paginationEnabled;
    let pageSize = current.pageSize;
    if (update.pageSize !== undefined) {
      if (!Number.isInteger(update.pageSize) || update.pageSize <= 0) {
        console.warn(`setPagination: pageSize must be a positive integer; got ${update.pageSize}. Ignoring.`);
        return;
      }
      pageSize = update.pageSize;
    }
    // A new page size re-pages the rows, so the current index means nothing under it: back to the
    // first page unless the caller says where to go, as the footer's size selector does.
    let pageIndex = update.pageIndex ?? (pageSize !== current.pageSize ? 0 : current.pageIndex);
    if (!Number.isFinite(pageIndex)) pageIndex = 0;
    // With pagination off there is no page to be on; a stored index would resurface as a stale
    // page when it is turned back on.
    if (!enabled) pageIndex = 0;
    // Clamp only while the total is known: a provisional server-side count is a floor, and the
    // core snaps a page past the real end back once the count pins.
    const lastPage = current.totalRowCountKnown
      ? Math.max(0, Math.ceil(current.totalRowCount / pageSize) - 1)
      : Number.POSITIVE_INFINITY;
    pageIndex = Math.max(0, Math.min(Math.floor(pageIndex), lastPage));
    if (
      enabled === current.paginationEnabled
      && pageSize === current.pageSize
      && pageIndex === current.pageIndex
    ) {
      return;
    }
    this.dispatch({ type: "paginationSet", enabled, pageIndex, pageSize });
  }

  goToPage(pageIndex: number): void {
    if (!this.core.getPaginationInfo().paginationEnabled) return;
    this.setPagination({ pageIndex });
  }

  nextPage(): void {
    this.goToPage(this.core.getPaginationInfo().pageIndex + 1);
  }

  previousPage(): void {
    this.goToPage(this.core.getPaginationInfo().pageIndex - 1);
  }

  firstPage(): void {
    this.goToPage(0);
  }

  lastPage(): void {
    this.goToPage(this.core.getPaginationInfo().totalPageCount - 1);
  }

  setPageSize(pageSize: number): void {
    this.setPagination({ pageSize });
  }

  // ---------------- Displayed rows ----------------
  getDisplayedRowCount(): number {
    return this.core.getRowModel().getViewCount();
  }

  getDisplayedRowAtIndex(viewIdx: number): IRowNode | undefined {
    if (!Number.isInteger(viewIdx) || viewIdx < 0) return undefined;
    return this.core.getRowModel().getRowNodeAtViewIndex(viewIdx) ?? undefined;
  }

  getFirstDisplayedRowIndex(): number {
    return this._render?.getRenderedRange()?.first ?? -1;
  }

  getLastDisplayedRowIndex(): number {
    return this._render?.getRenderedRange()?.last ?? -1;
  }

  getRenderedNodes(): IRowNode[] {
    if (!this._render) return [];
    const nodes: IRowNode[] = [];
    const seen = new Set<string>();
    const add = (node: IRowNode | null | undefined) => {
      if (!node || seen.has(node.id)) return;
      seen.add(node.id);
      nodes.push(node);
    };
    const core = this.core;
    for (let i = 0; i < core.getDisplayedPinnedRowCount("top"); i++) add(core.getDisplayedPinnedRow("top", i));
    const range = this._render.getRenderedRange();
    if (range) {
      const rowModel = core.getRowModel();
      for (let viewIdx = range.first; viewIdx <= range.last; viewIdx++) {
        const node = rowModel.getRowNodeAtViewIndex(viewIdx);
        // A row mirrored into a band is painted there (its body slot is hidden): it was listed
        // with its band, so the dedupe drops it here.
        add(node);
      }
    }
    for (let i = 0; i < core.getDisplayedPinnedRowCount("bottom"); i++) add(core.getDisplayedPinnedRow("bottom", i));
    return nodes;
  }

  getRowNode(rowId: GridId): IRowNode | undefined {
    // Application-pinned rows never enter the row model; the band holds them.
    return this.core.getRowModel().getRowNode(rowId)
      ?? this.core.getDisplayedPinnedRowRef(rowId)?.node
      ?? undefined;
  }

  getCellValue(cell: CellRef): unknown {
    const node = this.getRowNode(cell.rowId);
    const col = this.resolveCellColumn(cell);
    if (!node || !col) return undefined;
    return this.core.getNodeCellValue(col, node);
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
    // Sort lives in the core's sort model, not on the columns, so it is joined in here by colId.
    // The first sort entry for a colId wins (public colIds are not guaranteed unique).
    const sorts = new Map<string, { dir: SortModelItem["dir"]; index: number }>();
    this.getSortModel().forEach((item, index) => {
      if (!sorts.has(item.colId)) sorts.set(item.colId, { dir: item.dir, index });
    });
    return this.core.getColumnModel().getColumnState().map(state => {
      const sort = sorts.get(state.colId);
      return { ...state, sort: sort?.dir ?? null, sortIndex: sort?.index ?? null };
    });
  }

  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void {
    this.dispatch({ type: "columnStateSet", state, defaultState: opts?.defaultState });
    this.applyColumnStateSort(state, opts?.defaultState);
  }

  /**
   * The sort half of `applyColumnState`, as one sort-model replacement. Entries without a `sort`
   * field leave their column's sort alone; `defaultState.sort === null` clears every column the
   * state does not name. Named sorts are placed at their `sortIndex` (ascending, so each lands at
   * its absolute position), and those without one are appended — which makes a `getColumnState()`
   * round trip reproduce the model exactly, internal columns' sorts included.
   */
  private applyColumnStateSort(state: ColumnState[], defaultState?: Partial<ColumnState>): void {
    const touched = new Set(state.filter(s => s.sort !== undefined).map(s => s.colId));
    const clearOthers = defaultState?.sort === null;
    if (touched.size === 0 && !clearOthers) return;

    const named = new Set(state.map(s => s.colId));
    const next = this.getSortModel().filter(item => !touched.has(item.colId)
      && !(clearOthers && !named.has(item.colId)));
    const placed = state
      .map((s, arrayIndex) => ({ s, arrayIndex }))
      .filter(({ s }) => s.sort != null)
      .sort((a, b) => (a.s.sortIndex ?? Infinity) - (b.s.sortIndex ?? Infinity)
        || a.arrayIndex - b.arrayIndex);
    for (const { s } of placed) {
      const item = { colId: s.colId, dir: s.sort! };
      if (s.sortIndex != null && Number.isFinite(s.sortIndex)) {
        next.splice(Math.max(0, Math.min(Math.floor(s.sortIndex), next.length)), 0, item);
      } else {
        next.push(item);
      }
    }
    this.setSortModel(next);
  }

  // ---------------- Sorting ----------------
  getSortModel(): SortModelItem[] {
    return this.core.getSortModel().items.map(item => ({ colId: item.col.colId, dir: item.dir }));
  }

  setSortModel(items: ReadonlyArray<SortModelItem | { colId: string; dir: null }>): void {
    const wanted: SortModelItem[] = [];
    const seen = new Set<string>();
    for (const item of items ?? []) {
      if (!item || item.dir == null || seen.has(item.colId)) continue;
      seen.add(item.colId);
      wanted.push({ colId: item.colId, dir: item.dir });
    }
    const current = this.getSortModel();
    const unchanged = current.length === wanted.length
      && current.every((item, i) => item.colId === wanted[i].colId && item.dir === wanted[i].dir);
    // Skip the dispatch outright: even an all-equal replacement would re-sort, reset the page under
    // resetPageOn and clear the range.
    if (unchanged) return;
    this.replaceSortModel(wanted);
  }

  /**
   * Replace the whole sort model, in the given order, with one `sortModelSet` dispatch: every
   * current entry is cleared and the new ones are added after, so position follows the list.
   * Shared with `applyViewState`, whose captured sorts must replay in captured order.
   */
  private replaceSortModel(items: ReadonlyArray<SortModelItem>): void {
    const clear: SortItemUpdate[] = this.core.getSortModel().items.map(item => ({
      key: item.col.instanceID,
      dir: null,
    }));
    this.dispatch({
      type: "sortModelSet",
      // `key` resolves instance id, then public colId, then field key, then the internal sortable
      // columns (auto-group, generated pivot) by colId — so a public colId is all a caller needs.
      sortItems: [...clear, ...items.map(item => ({ key: item.colId, dir: item.dir }))],
    });
  }

  // ---------------- Column sizing ----------------
  autoSizeColumns(colIds: string[]): void {
    const model = this.core.getColumnModel();
    const changed = new Set<string>();
    for (const colId of colIds ?? []) {
      const col = model.resolve(colId) ?? model.getAutoGroupColumnByColId(colId);
      if (!col) continue;
      // By instance id: the core's ancestor lookup matches instance ids only, and a public colId
      // would leave it without a root to roll the new width up into.
      for (const id of this.core.autosizeColumn(col.instanceID)) changed.add(id);
    }
    this.emitWidthsChanged(changed);
  }

  autoSizeAllColumns(): void {
    const leaves = this.core.getColumnModel().getLeaves().filter(col => !col.isLeadingUtilityColumn());
    this.autoSizeColumns(leaves.map(col => col.instanceID));
  }

  setColumnWidth(colId: string, widthPx: number): void {
    this.setColumnWidths([{ colId, widthPx }]);
  }

  setColumnWidths(widths: ColumnWidthItem[]): void {
    const model = this.core.getColumnModel();
    const changed = new Set<string>();
    for (const { colId, widthPx } of widths ?? []) {
      if (typeof widthPx !== "number" || !Number.isFinite(widthPx)) continue;
      const col = model.resolve(colId) ?? model.getAutoGroupColumnByColId(colId);
      if (!col) continue;
      const before = new Map(col.getVisibleLeaves().map(leaf => [leaf.instanceID, leaf.computedWidth]));
      // The resize-handle path (clamping, group spreading, the user-width stamp). It reports every
      // leaf it touched; only real changes are announced.
      for (const id of model.resizeColumn(col.instanceID, widthPx)) {
        if (model.getById(id)?.computedWidth !== before.get(id)) changed.add(id);
      }
    }
    this.emitWidthsChanged(changed);
  }

  sizeColumnsToFit(): void {
    const available = this._render?.getCenterViewportWidth() ?? 0;
    if (available <= 0) return;
    const model = this.core.getColumnModel();
    // The bounds the resize-handle path clamps a leaf to (ColumnModel.resizeColumn), so the widths
    // planned here are the widths it will accept.
    const { minResizeWidth = 0, maxColumnWidth = Number.POSITIVE_INFINITY } = this.core.getOptions();
    const leaves = model.getCenterLeaves().filter(col => col.isVisible() && !col.isLeadingUtilityColumn());
    const fixed = leaves.filter(col => !col.resizable);
    const flexible = leaves
      .filter(col => col.resizable)
      .map(col => ({
        col,
        width: col.computedWidth,
        min: Math.max(minResizeWidth, col.minWidth ?? minResizeWidth),
        max: col.maxWidth != null && Number.isFinite(col.maxWidth) ? col.maxWidth : maxColumnWidth,
      }));
    if (flexible.length === 0) return;
    let remaining = available - fixed.reduce((sum, col) => sum + col.computedWidth, 0);

    // Proportional scaling with bound pinning: a column the scale would push past its min/max is
    // fixed at that bound and the rest re-scale over what is left, until no bound is violated.
    const target = new Map<typeof flexible[number], number>();
    let open = flexible.slice();
    while (open.length > 0) {
      const total = open.reduce((sum, c) => sum + Math.max(1, c.width), 0);
      const scale = remaining / total;
      const clamped = open.filter(c => {
        const w = Math.max(1, c.width) * scale;
        return w < c.min || w > c.max;
      });
      if (clamped.length === 0) {
        for (const c of open) target.set(c, Math.max(1, c.width) * scale);
        break;
      }
      for (const c of clamped) {
        const bound = Math.max(1, c.width) * scale < c.min ? c.min : c.max;
        target.set(c, bound);
        remaining -= bound;
      }
      open = open.filter(c => !clamped.includes(c));
    }

    // Whole pixels that still sum to the viewport: floor each, then hand the lost pixels to the
    // columns with the largest remainders (those under their max).
    const rounded = flexible.map(c => {
      const exact = target.get(c)!;
      return { c, exact, px: Math.floor(exact) };
    });
    const sum = rounded.reduce((acc, r) => acc + r.px, 0) + fixed.reduce((acc, col) => acc + col.computedWidth, 0);
    let spare = Math.round(available - sum);
    for (const r of [...rounded].sort((a, b) => (b.exact - b.px) - (a.exact - a.px))) {
      if (spare <= 0) break;
      if (r.px + 1 > r.c.max) continue;
      r.px += 1;
      spare -= 1;
    }
    this.setColumnWidths(rounded.map(r => ({ colId: r.c.col.instanceID, widthPx: r.px })));
  }

  // One columnWidthsChanged for a batch, the payload the core's own width events carry. An empty
  // id list would read as "every visible column", so a batch that changed nothing emits nothing.
  private emitWidthsChanged(instanceIds: Set<string>): void {
    if (instanceIds.size === 0) return;
    const model = this.core.getColumnModel();
    const cols = [...instanceIds].map(id => model.getById(id)).filter((col): col is Column => col != null);
    if (cols.length === 0) return;
    this.core.emit("columnWidthsChanged", {
      changedColIds: [...new Set(cols.map(col => col.colId))],
      changedColInstanceIds: cols.map(col => col.instanceID),
      final: true,
      // Every caller of this is an IGridAPI method, never a UI gesture.
      source: "api",
    });
  }

  getColumnGroupState(): GridViewColumnGroupState[] {
    return this.core.getColumnModel().getColumnGroupState();
  }

  setColumnGroupState(groups: GridViewColumnGroupState[]): void {
    this.dispatch({ type: "columnGroupStateSet", groups });
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

  setQuickFilter(
    text: string,
    opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean; behavior?: QuickFilterBehavior },
  ): void {
    this.dispatch({
      type: "quickFilterSet",
      text,
      matchMode: opts?.matchMode,
      caseSensitive: opts?.caseSensitive,
      behavior: opts?.behavior,
    });
  }

  getQuickFilterText(): string {
    return this.core.getQuickFilterText();
  }

  getQuickFilterBehavior(): QuickFilterBehavior {
    return this.core.getQuickFilterBehavior();
  }

  // ---------------- Quick-filter find ----------------
  getFindState(): QuickFilterFindState {
    return this.core.getFindState();
  }

  findNext(): QuickFilterFindMatch | null {
    this.dispatch({ type: "findNavigate", direction: "next" });
    return this.core.getFindState().activeMatch;
  }

  findPrevious(): QuickFilterFindMatch | null {
    this.dispatch({ type: "findNavigate", direction: "previous" });
    return this.core.getFindState().activeMatch;
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

  async getSetFilterTree(colId: string): Promise<SetFilterTreeNode[] | null> {
    const session = await this.loadSetFilterSession(colId);
    if (!session) return null;
    if (!session.tree) {
      console.warn(`Set filter on "${colId}": the column has no tree layout (filter: "tree"); there is no value tree to return.`);
      return null;
    }
    const def = this.currentSetDef(session.col);
    return setFilterTreeNodes(session.tree, setOptionStates(def, session.tree, session.keyFn));
  }

  checkSetFilterPath(colId: string, path: unknown[]): Promise<void> {
    return this.toggleSetFilterPath(colId, path, true);
  }

  uncheckSetFilterPath(colId: string, path: unknown[]): Promise<void> {
    return this.toggleSetFilterPath(colId, path, false);
  }

  /** A path names a group (every leaf beneath it) or one leaf; the toggle goes through the menu's own functions. */
  private async toggleSetFilterPath(colId: string, path: unknown[], checked: boolean): Promise<void> {
    const session = await this.loadSetFilterSession(colId);
    if (!session) return;
    if (!session.tree) {
      console.warn(`Set filter on "${colId}": the column has no tree layout (filter: "tree"); address its values with checkSetFilterValue/uncheckSetFilterValue.`);
      return;
    }
    const idx = findSetFilterPath(session.tree, path);
    if (idx < 0) {
      console.warn(`Set filter on "${colId}": path ${JSON.stringify(path)} is not in the value tree; ignoring it.`);
      return;
    }
    const option = session.tree[idx];
    const def = this.currentSetDef(session.col);
    if (option.type === "group") {
      // Already in the requested state — skip the dispatch (which resets the page and selection).
      const state = groupCheckState(def, session.tree, idx, session.keyFn);
      if (checked ? state.selected : !state.selected && !state.indeterminate) return;
      this.applySetDef(session.col, toggleGroup(def, session.tree, idx, checked, session.keyFn));
      return;
    }
    if (isValueChecked(def, option, session.keyFn) === checked) return;
    this.applySetDef(session.col, toggleOption(def, option, checked, session.tree, session.keyFn));
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

  /**
   * Build the column's set-filter universe headlessly (same spec + sources the menu uses). `options`
   * is the flat universe every value helper works on; `tree` is the same universe regrouped for a
   * tree column (counts attached when the column shows them), which the path helpers work on.
   */
  private async loadSetFilterSession(
    colId: string,
  ): Promise<{ col: Column; options: SetFilterOptions[]; keyFn: ValueKeyFn; tree?: SetFilterOptions[] } | null> {
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
    const options = buildSetOptions(values, keyFn, spec.valueLabel);
    if (!spec.tree) return { col, options, keyFn };
    const counted = spec.params.showValueCounts
      ? addSetOptionCounts(options, (callback) => this.core.getRowModel().forEachNode(callback), (row) => spec.column.getValue(row), keyFn)
      : options;
    return { col, options, keyFn, tree: buildSetFilterTree(counted, spec.tree) };
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
        spec.compare,
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

  // Mirrors the core's emit-side convention (public colId plus instance id, the instance id
  // winning) so a ref the grid emitted reads back whole, and reaches the auto-group column by the
  // colId its refs carry: internal columns are kept out of the public colId index.
  private resolveCellColumn(cell: CellRef): Column | undefined {
    const model = this.core.getColumnModel();
    const byInstance = cell.colInstanceId ? model.getById(cell.colInstanceId) : undefined;
    return byInstance ?? this.resolveColumn(cell.colId) ?? model.getAutoGroupColumnByColId(cell.colId);
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

  // ---------------- Pivot ----------------
  setPivotMode(on: boolean): void {
    this.dispatch({ type: "pivotModeSet", on });
  }

  getPivotMode(): boolean {
    return this.core.getPivotMode();
  }

  isPivotUnconfigured(): boolean {
    return this.core.isPivotUnconfigured();
  }

  setPivotColumns(colIds: string[]): void {
    this.dispatch({ type: "pivotColumnsSet", colIds });
  }

  getPivotColumns(): string[] {
    return this.core.getPivotColumns().map(col => col.colId);
  }

  getPivotResultColumns(): PivotResultColumnDescriptor[] {
    return this.core.getPivotResultColumns();
  }

  setPivotColumnOrder(order: string[] | null): void {
    this.dispatch({ type: "pivotColumnOrderSet", order });
  }

  getPivotColumnOrder(): string[] | null {
    return this.core.getPivotColumnOrder();
  }

  setRowGroupColumns(colIds: string[]): void {
    this.dispatch({ type: "rowGroupSet", colIds });
  }

  getRowGroupColumns(): string[] {
    return this.core.getRowGroupColumns().map(col => col.colId);
  }

  setAggregates(aggregates: ColumnAggregate[]): void {
    this.dispatch({
      type: "aggregateModelSet",
      aggregateModels: aggregates.map(a => ({ key: a.colId, type: a.type })),
    });
  }

  getAggregates(): ColumnAggregate[] {
    return this.core.getAggregateModelByColId();
  }

  captureViewState(): GridViewState {
    const pagination = this.core.getPaginationInfo();
    const pivotLayers = this.core.getPivotStateLayers();
    return {
      version: 1,
      // Layout only: the sort is captured once, in `sortModel` (which also holds the internal
      // columns' sorts), so the column entries do not carry a second copy of it.
      columns: this.core.getColumnModel().getColumnState().map(state => ({ ...state })),
      // Column-group expanders by the group's colId — the source groups while pivoted, like
      // `columns`.
      columnGroupState: this.getColumnGroupState(),
      rowGroupColumns: this.core.getRowGroupColumns().map(col => col.colId),
      // Aggregates serialize by public colId (the model keys them by instanceID, which does not
      // survive a reload); entries on columns that no longer resolve are dropped.
      aggregateModel: this.getAggregates(),
      pivotColumns: this.core.getPivotColumns().map(col => col.colId),
      pivotMode: this.core.getPivotMode(),
      // Only present while a manual arrangement exists; the role dispatches an apply always runs
      // reset any prior arrangement, so an absent field applies canonically.
      pivotColumnOrder: this.core.getPivotColumnOrder() ?? undefined,
      // Pivot mode swaps a whole layer of role state in and out (see IGridCore.setPivotMode), so a
      // capture carries the layer that is NOT live: without it a restored view has no state to
      // return to when the mode turns off (or to re-enter with when it turns on).
      ...(pivotLayers.base ? { prePivotState: pivotLayers.base } : {}),
      ...(pivotLayers.pivot ? { pivotState: pivotLayers.pivot } : {}),
      sortModel: this.core.getSortModel().items.map(item => ({
        colId: item.col.colId,
        dir: item.dir,
      })),
      filterModel: this.getFilterModel(),
      quickFilterText: this.core.getQuickFilterText(),
      quickFilterSettings: {
        ...this.core.getQuickFilterMatchSettings(),
        behavior: this.core.getQuickFilterBehavior(),
      },
      aggregateScope: this.core.getAggregateScope(),
      // Only once the renderer has wired the pin controller: a headless API has no runtime pins to
      // speak of, and an absent field restores as "leave the pins alone" rather than "unpin all".
      ...(this._pinnedRows?.getRowPinnedOverrides
        ? { rowPinning: this._pinnedRows.getRowPinnedOverrides().map(pin => ({ ...pin })) }
        : {}),
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

    // Pivot-aware states restore over the SOURCE layout: drop out of pivot first (column state,
    // sorts, and filters address source columns), re-enter at the end if the state says so.
    // States without a pivotMode field leave pivot untouched, like every absent field.
    if (state.pivotMode != null) {
      if (this.core.getPivotMode()) this.dispatch({ type: "pivotModeSet", on: false });
      // Wipe the layer memo now that the outgoing view is gone: a restore rebuilds the state from
      // the ground up, and the exit above stashed the view being *replaced* — re-entering below
      // would otherwise reinstate that stash over the state being applied. The captured layers are
      // seeded back at the end, once nothing else can overwrite them.
      this.core.setPivotStateLayers({});
    }

    this.dispatch({ type: "rowGroupSet", colIds: state.rowGroupColumns ?? [] });
    // Expanders BEFORE the column state: opening a group sizes the leaves it reveals to content
    // (as the header toggle does), and the captured widths below must win over that. Old captures
    // without the field leave every group as it is, like every absent field.
    if (state.columnGroupState) {
      this.dispatch({ type: "columnGroupStateSet", groups: state.columnGroupState });
    }
    // Layout only, through the action rather than `applyColumnState`: `sortModel` owns the sort,
    // so a hand-written state's per-column `sort` fields are dropped rather than applied twice.
    this.dispatch({
      type: "columnStateSet",
      state: (state.columns ?? []).map(({ sort: _sort, sortIndex: _sortIndex, ...layout }) => layout),
      defaultState: opts?.columns === "merge" ? undefined : { hidden: true },
    });

    // Replace the whole sort model with the captured list, in captured order — position is
    // meaningful (a pivot-column sort and a group-column sort compete by it, first one winning).
    const replaySorts = (items: NonNullable<GridViewState["sortModel"]>): void => {
      this.replaceSortModel(items);
    };
    // Some captured sorts cannot be replayed here, because the column they address does not exist
    // yet: a GENERATED pivot column appears only when the mode toggle below runs its discovery, and
    // in an UNGROUPED pivot so does the auto-group column. Those are held back and replayed once
    // the toggle has run; every id that already names a live column sorts now.
    const captured = state.sortModel ?? [];
    const deferred = captured.filter(item => !this.core.canResolveSortColId(item.colId));
    replaySorts(captured.filter(item => !deferred.includes(item)));

    this.dispatch({ type: "filterModelSet", filterModel: this.toFilterItems(state.filterModel ?? []) });
    // Old captures carry the text only; the live match settings and behavior then stay as they are.
    this.setQuickFilter(state.quickFilterText ?? "", state.quickFilterSettings
      ? {
          matchMode: state.quickFilterSettings.matchMode,
          caseSensitive: state.quickFilterSettings.caseSensitive,
          behavior: state.quickFilterSettings.behavior,
        }
      : undefined);

    // Aggregates and pivot columns before the mode toggle, so entering pivot derives with its
    // measures in place (one derive, not two).
    if (state.aggregateModel) {
      this.dispatch({
        type: "aggregateModelSet",
        aggregateModels: state.aggregateModel.map(a => ({ key: a.colId, type: a.type as AggregateKind })),
      });
    }
    if (state.pivotColumns) this.dispatch({ type: "pivotColumnsSet", colIds: state.pivotColumns });
    // After the role dispatches (which reset any prior arrangement), before the mode toggle — so
    // entering pivot lays out the arranged tree in the same derive.
    if (state.pivotColumnOrder) this.dispatch({ type: "pivotColumnOrderSet", order: state.pivotColumnOrder });
    if (state.pivotMode === true) this.dispatch({ type: "pivotModeSet", on: true });
    // The layer memo is bookkeeping, not a mutation, so it is seeded LAST: entering pivot above
    // records the layer it swaps out, and the captured layers must win over that. Only a
    // pivot-addressing state touches it — for such a state an absent layer means "none", not
    // "keep", so another view's stash can never be inherited here.
    if (state.pivotMode != null) {
      this.core.setPivotStateLayers({ base: state.prePivotState, pivot: state.pivotState });
    }

    // The deferred columns may exist now (the discovery ran inside the mode toggle), so replay if
    // any of them became addressable — a held-back sort that still resolves to nothing stays
    // dropped, and costs no second dispatch. The whole list is replayed rather than appended, so
    // the captured order — which decides whether a pivot or a group sort controls the buckets — is
    // preserved. Still ahead of the pagination restore below, which must win over any
    // `resetPageOn: ["sort"]` reset this triggers.
    if (deferred.some(item => this.core.canResolveSortColId(item.colId))) replaySorts(captured);

    // The live scope LAST of the aggregate state: assigning a first aggregate turns the footer on at
    // page scope and a pivot layer carries its own scope, and the captured scope must win over both.
    if (state.aggregateScope) this.core.setAggregateScope(state.aggregateScope);

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

    // Pins after expansion: a pinned row's band shows its ancestors, which follow the view.
    if (state.rowPinning) this.applyRowPinning(state.rowPinning);
  }

  private applyRowPinning(pins: GridViewRowPinnedState[]): void {
    const controller = this._pinnedRows;
    if (!controller) return;
    const next = pins.map(pin => ({ rowId: String(pin.rowId), position: pin.position ?? null }));
    if (controller.setRowPinnedOverrides) {
      controller.setRowPinnedOverrides(next);
      return;
    }
    // A controller without the bulk setter: unpin what it reports, then pin the captured rows.
    for (const pin of controller.getRowPinnedOverrides?.() ?? []) {
      if (!next.some(item => item.rowId === pin.rowId)) controller.setRowPinned(pin.rowId, null);
    }
    for (const pin of next) controller.setRowPinned(pin.rowId, pin.position);
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

  // ---------------- Fill ----------------
  fillDown(): number {
    if (!this._fill) {
      console.warn("fillDown called before the grid was rendered; ignoring.");
      return 0;
    }
    return this._fill.fillDown();
  }

  fillRight(): number {
    if (!this._fill) {
      console.warn("fillRight called before the grid was rendered; ignoring.");
      return 0;
    }
    return this._fill.fillRight();
  }

  // State probes a toolbar reads on every selection change: silently false before render.
  canFillDown(): boolean {
    return this._fill?.canFillDown() ?? false;
  }

  canFillRight(): boolean {
    return this._fill?.canFillRight() ?? false;
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

/** A finite, non-negative number, else undefined (so a bad input falls back to the default). */
function nonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
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
