import { RefObject } from "react";
import { AggregateType } from "../interfaces/aggregate";
import { RowPoolDef } from "./types";
import { isTrue } from "../misc";
import { ExportOptions } from "../export/export";
import { ServerSideAggregationSource } from "../ssrm/serverSide";
import { IServerSideDataSource } from "../interfaces/serverSide";
import { Column } from "../column/column";
import { div } from "./element";
import { GridCore } from "../core/core";
import { GridRendererCoreEventBinder } from "./coreEventBinder";
import { ExportRenderer } from "./exportRenderer";
import { GridIconMap } from "../theme/icons";
import { GridModelChangeHandler } from "./modelChangeHandler";
import {
  GridEventAggregateChangedParams,
  GridEventPaginationChangedParams,
  GridEventViewportChangedParams,
} from "../events/events";
import { MenuCoordinator } from "../menu/coordinator";
import { MenuRenderer } from "./menuRenderer";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { AggregateCalculator } from "./aggregate/calculator";
import { AggregateModelController } from "./aggregate/modelController";
import { AggregateRowBuilder } from "./aggregate/rowBuilder";
import { AggregateRowRenderer } from "./aggregate/wrapper";
import { BodyCellRenderer } from "./body/cellRenderer";
import { BodyPoolSizer } from "./body/poolSizer";
import { BodyRowHoverRenderer } from "./body/rowHover";
import { BodyRowPoolRenderer } from "./body/rowPool";
import { BodyViewportRenderer } from "./body/viewport";
import { BodyWindowRenderer } from "./body/window";
import { BodyMenuOpener } from "./bodyMenuOpener";
import { ColumnMenuOpener } from "./columnMenuOpener";
import { ColumnInteractionRenderer } from "./header/columnInteraction";
import { HeaderInteractionHandler } from "./header/interactionHandler";
import { HeaderRenderer } from "./header/renderer";
import { IconRenderer } from "./iconRenderer";
import { GridInteractionEventBinder } from "./interaction/eventBinder";
import { FilterUpdateHandler } from "./filterUpdateHandler";
import { ColumnLayoutRenderer } from "./layout/columnLayout";
import { PinnedSectionLayoutRenderer } from "./layout/pinnedSectionLayout";
import { FilterOverlayRenderer } from "./overlay/filter";
import { LoadingOverlayRenderer } from "./overlay/loading";
import { PaginationRenderer } from "./pagination/renderer";
import { RootAttachmentRenderer } from "./rootAttachment";
import { HorizontalScrollRenderer } from "./scroll/horizontal";
import { GridScrollSyncRenderer } from "./scroll/sync";
import { SelectionRenderer } from "./selection/selectionRenderer";
import { ServerSideController } from "./serverSideController";

export class GridRenderer {
  _menuRenderer: MenuRenderer;
  _coreEventBinder: GridRendererCoreEventBinder;
  _modelChangeHandler: GridModelChangeHandler;
  _exportRenderer: ExportRenderer;
  _columnMenuOpener: ColumnMenuOpener;
  _bodyMenuOpener: BodyMenuOpener | null = null;
  _filterUpdateHandler: FilterUpdateHandler;
  _aggregateCalculator: AggregateCalculator;
  _aggregateModelController: AggregateModelController;
  _aggregateRowBuilder: AggregateRowBuilder;
  _aggregateRowRenderer: AggregateRowRenderer;
  _serverSideController: ServerSideController;
  _iconRenderer: IconRenderer;
  _bodyCellRenderer: BodyCellRenderer;
  _bodyPoolSizer: BodyPoolSizer;
  _bodyRowHoverRenderer: BodyRowHoverRenderer;
  _headerRenderer: HeaderRenderer;
  _paginationRenderer: PaginationRenderer;
  _bodyRowPoolRenderer: BodyRowPoolRenderer;
  _bodyViewportRenderer: BodyViewportRenderer;
  _bodyWindowRenderer: BodyWindowRenderer;
  _columnInteractionRenderer: ColumnInteractionRenderer;
  _headerInteractionHandler: HeaderInteractionHandler;
  _columnLayoutRenderer: ColumnLayoutRenderer;
  _pinnedSectionLayoutRenderer: PinnedSectionLayoutRenderer;
  _interactionEventBinder: GridInteractionEventBinder;
  _filterOverlayRenderer: FilterOverlayRenderer;
  _loadingOverlayRenderer: LoadingOverlayRenderer;
  _rootAttachmentRenderer: RootAttachmentRenderer;
  _horizontalScrollRenderer: HorizontalScrollRenderer;
  _scrollSyncRenderer: GridScrollSyncRenderer;
  _selectionRenderer: SelectionRenderer;
  rowHeight: number = 43;
  height?: number;

  _maxDepth: number = 1;

  _measureCtx: CanvasRenderingContext2D | null;
  _columnWidths: Map<string, {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    fixed?: boolean;
  }>;

  _leafColumns: Column[];
  _leafColumnLookup: Map<string, { section: "left" | "center" | "right"; globalIndex: number; localIndex: number }>;
  _leftLeafOrder: number[];
  _centerLeafOrder: number[];
  _rightLeafOrder: number[];

  // DOM elements
  root: HTMLDivElement;
  _aggregateLeadingCells: HTMLDivElement[];
  _aggregateLeftCells: HTMLDivElement[];
  _aggregateCells: HTMLDivElement[];
  _aggregateRightCells: HTMLDivElement[];
  _aggregateVisible: boolean;

  _leadingLeafColumns: Column[] = [];
  _leftPinnedColumns: Column[] = [];
  _leftPinnedLeafColumns: Column[] = [];
  _rightPinnedColumns: Column[] = [];
  _rightPinnedLeafColumns: Column[] = [];
  _centerColumns: Column[] = [];
  _centerLeafColumns: Column[] = [];

  _poolSize: number = 0;
  _startIndex: number = 0;
  _rowPool: RowPoolDef[];
  private _serverSidePendingRangeKeys: Set<string> = new Set();

  private get rowModel() {
    return this.core.getRowModel();
  }

  _measureCache: Map<string, Map<string, number>>;

  constructor(
    private core: GridCore,
    menuCoordinator: MenuCoordinator,
    filterMenuCoordinator: FilterMenuCoordinator,
    createBodyMenuCoordinator?: (
      exporter: import("../menu/bodyMenuService").BodyMenuExportTarget,
      clipboard: import("../menu/bodyMenuService").BodyMenuClipboardTarget,
    ) => import("../menu/bodyMenuCoordinator").BodyMenuCoordinator,
  ) {
    this._measureCtx = null;
    this._measureCache = new Map();
    this._columnWidths = new Map();

    // DOM skeleton
    this.root = div("pte-root");
    this.root.dataset.pteGridId = this.core.id;
    this.root.style.position = "relative";
    this.root.tabIndex = 0;
    this._rootAttachmentRenderer = new RootAttachmentRenderer(this.root);
    this._iconRenderer = new IconRenderer(this.root, this.core.id);
    this.setIcons(this.core.getOptions().icons);

    this._menuRenderer = new MenuRenderer(this.root);
    this._coreEventBinder = new GridRendererCoreEventBinder({
      core: this.core,
      setLoading: (isLoading) => this.setLoading(isLoading),
      buildPaginationControls: () => this.buildPaginationControls(),
      maybeUpdatePoolSize: (params) => this._maybeUpdatePoolSize(params),
      onColumnsChanged: (params) => this._modelChangeHandler.onColumnsChanged(params),
      onColumnWidthsChanged: (params) => this._modelChangeHandler.onColumnWidthsChanged(params),
      onDataChanged: (params) => this._modelChangeHandler.onDataChanged(params),
      onAggregateChanged: (params) => this._onAggregateChanged(params),
      updatePaginationControls: (params) => this._updatePaginationControls(params),
      renderAggregateRow: () => this._renderAggregateRow(),
      onSelectionChanged: () => this._selectionRenderer.onSelectionChanged(),
      onFocusChanged: (params) => this._selectionRenderer.onFocusChanged(params.viewIdx, params.colIdx),
    });
    this._modelChangeHandler = new GridModelChangeHandler({
      core: this.core,
      serverSidePendingRangeKeys: this._serverSidePendingRangeKeys,
      recomputeView: () => {
        this._bodyViewportRenderer.recomputeView();
        this.core.clampSelectionToView();
      },
      updateWindow: (forcePatch, scrollSrc, params) => this._bodyWindowRenderer.update(forcePatch, scrollSrc, params),
      resetScrollPosition: () => this._bodyViewportRenderer.resetScrollPosition(),
      updatePaginationControls: (params?: GridEventPaginationChangedParams) => this._updatePaginationControls(params),
      addSortIndicatorToHeader: (colID, dir) => this._headerRenderer.addSortIndicatorToHeader(colID, dir),
      setFilterIndicators: () => this._headerRenderer.setFilterIndicators(),
      buildRowPool: () => this._buildRowPool(),
      buildHeaderDOM: (reason) => this._buildHeaderDOM(reason),
      updateColumnWidths: (colIDs) => this._columnLayoutRenderer.updateColumnWidths(colIDs),
      refreshSelectionStyles: () => this._selectionRenderer?.refreshSelectionStyles(),
    });
    this._selectionRenderer = new SelectionRenderer({
      core: this.core,
      root: this.root,
      rowPool: () => this._rowPool,
      startIndex: () => this._startIndex,
      leafColumns: () => this._leafColumns,
      ensureCellVisible: (viewIdx, colIdx) => this._ensureCellVisible(viewIdx, colIdx),
    });
    this._exportRenderer = new ExportRenderer({
      core: this.core,
      leafColumns: () => this._leafColumns,
      columnWidths: () => this._columnWidths,
      selectionRange: () => this.core.getSelectionRange(),
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
    });
    this._columnMenuOpener = new ColumnMenuOpener({
      core: this.core,
      menuCoordinator,
      filterMenuCoordinator,
      menuRenderer: this._menuRenderer,
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
    });
    if (createBodyMenuCoordinator) {
      const bodyMenuCoordinator = createBodyMenuCoordinator(
        {
          exportCSV: (opts) => this._exportRenderer.exportCSV(opts),
          exportExcel: (opts) => this._exportRenderer.exportExcel(opts),
        },
        {
          copySelection: ({ includeHeaders, ctx }) => this._copySelectionToClipboard({ includeHeaders, ctx }),
        },
      );
      this._bodyMenuOpener = new BodyMenuOpener({
        core: this.core,
        root: this.root,
        bodyMenuCoordinator,
        menuRenderer: this._menuRenderer,
      });
    }
    this._filterUpdateHandler = new FilterUpdateHandler({
      core: this.core,
      setFilterIndicators: () => this._headerRenderer.setFilterIndicators(),
      recomputeView: () => this._bodyViewportRenderer.recomputeView(),
      updateWindow: (forcePatch, scrollSrc) => this._bodyWindowRenderer.update(forcePatch, scrollSrc),
    });
    this._aggregateCalculator = new AggregateCalculator();
    this._aggregateModelController = new AggregateModelController({
      core: this.core,
      leafColumns: () => this._leafColumns,
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
      markAggregatesDirty: () => this._markAggregatesDirty(),
      requestServerAggregates: () => undefined,
      renderAggregateRow: () => this._renderAggregateRow(),
    });
    this._serverSideController = new ServerSideController({
      core: this.core,
      markAggregatesDirty: () => this._markAggregatesDirty(),
      renderAggregateRow: () => this._renderAggregateRow(),
    });
    this._bodyCellRenderer = new BodyCellRenderer();

    this._headerRenderer = new HeaderRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
      getBody: () => this._bodyViewportRenderer.getRefs().body,
      getContainerEl: () => this._rootAttachmentRenderer.getContainerEl(),
    });
    const headerRefs = this._headerRenderer.getRefs();

    this._bodyViewportRenderer = new BodyViewportRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
    });
    const bodyWrapper = this._bodyViewportRenderer.getRefs();
    this._bodyRowHoverRenderer = new BodyRowHoverRenderer(bodyWrapper.body);
    this._aggregateRowRenderer = new AggregateRowRenderer(this.root, this.rowHeight, (e) => {
      e.stopPropagation();
      this._aggregateModelController.setAggregateScope("none");
    });
    const aggregateRefs = this._aggregateRowRenderer.getRefs();
    this._aggregateLeadingCells = [];
    this._aggregateLeftCells = [];
    this._aggregateCells = [];
    this._aggregateRightCells = [];
    this._aggregateVisible = false;
    this._aggregateRowBuilder = new AggregateRowBuilder({
      rowHeight: () => this.rowHeight,
      leafColumnLookup: () => this._leafColumnLookup,
      aggregateRowRenderer: this._aggregateRowRenderer,
      leadingLeafColumns: () => this._leadingLeafColumns,
      leftPinnedLeafColumns: () => this._leftPinnedLeafColumns,
      centerLeafColumns: () => this._centerLeafColumns,
      rightPinnedLeafColumns: () => this._rightPinnedLeafColumns,
    });

    this._horizontalScrollRenderer = new HorizontalScrollRenderer(this.root);
    const horizontalScroll = this._horizontalScrollRenderer.getRefs();

    this._bodyRowPoolRenderer = new BodyRowPoolRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      leadingViewport: bodyWrapper.leadingViewport,
      leftViewport: bodyWrapper.leftViewport,
      centerViewport: bodyWrapper.centerViewport,
      rightViewport: bodyWrapper.rightViewport,
    });
    this._columnInteractionRenderer = new ColumnInteractionRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
      maxDepth: () => this._maxDepth,
      headerWrapper: headerRefs.wrapper,
      leftHeader: headerRefs.left,
      centerHeader: headerRefs.center,
      rightHeader: headerRefs.right,
      leftScroller: bodyWrapper.leftScroller,
      centerScroller: bodyWrapper.centerScroller,
      rightScroller: bodyWrapper.rightScroller,
      leafColumnLookup: () => this._leafColumnLookup,
    });
    this._headerInteractionHandler = new HeaderInteractionHandler({
      core: this.core,
      root: this.root,
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
      toggleColumnSelection: (colID, mode) => this.core.dispatch({ type: "columnSelectSet", colId: colID, mode }),
      openColumnMenu: (trigger, colID, anchor) => this._columnMenuOpener.openColumnMenu(trigger, colID, anchor),
      openColumnFilter: (colID, anchorEl) => this._columnMenuOpener.openFilterMenu(colID, anchorEl),
    });
    this._interactionEventBinder = new GridInteractionEventBinder({
      root: this.root,
      headerWrapper: headerRefs.wrapper,
      body: bodyWrapper.body,
      onHeaderMouseDown: (e) => this._columnInteractionRenderer.onHeaderMouseDown(e),
      onHeaderContextMenu: (e) => this._headerInteractionHandler.onHeaderContextMenu(e),
      onHeaderDoubleClick: (e) => this._columnInteractionRenderer.onHeaderDoubleClick(e),
      onCellMouseDown: (e) => this._selectionRenderer.onCellMouseDown(e),
      onBodyContextMenu: (e) => this._bodyMenuOpener?.onBodyContextMenu(e),
      onColumnResizeMouseMove: (e) => this._columnInteractionRenderer.onColumnResizeMouseMove(e),
      onColumnDragMouseMove: (e) => this._columnInteractionRenderer.onColumnDragMouseMove(e),
      onCellMouseMove: (e) => this._selectionRenderer.onCellMouseMove(e),
      onColumnResizeMouseUp: () => this._columnInteractionRenderer.onColumnResizeMouseUp(),
      onColumnDragMouseUp: () => this._columnInteractionRenderer.onColumnDragMouseUp(),
      onCellMouseUp: () => this._selectionRenderer.onCellMouseUp(),
      shouldSuppressClick: () => this._columnInteractionRenderer.consumeSuppressClick(),
      onClick: (e) => this._headerInteractionHandler.onDocumentClick(e),
      onKeyDown: (e) => this._selectionRenderer.onKeyDown(e),
    });
    this._columnLayoutRenderer = new ColumnLayoutRenderer({
      core: this.core,
      root: this.root,
      body: bodyWrapper.body,
      rowPool: () => this._rowPool,
      leadingViewport: bodyWrapper.leadingViewport,
      leftViewport: bodyWrapper.leftViewport,
      centerViewport: bodyWrapper.centerViewport,
      rightViewport: bodyWrapper.rightViewport,
      leadingScroller: bodyWrapper.leadingScroller,
      leftScroller: bodyWrapper.leftScroller,
      rightScroller: bodyWrapper.rightScroller,
      leadingHeader: headerRefs.leading,
      leftHeader: headerRefs.left,
      centerHeader: headerRefs.center,
      rightHeader: headerRefs.right,
      headerWrapper: headerRefs.wrapper,
      hScrollContainer: horizontalScroll.container,
      hScrollLeadingParent: horizontalScroll.leadingParent,
      hScrollLeftParent: horizontalScroll.leftParent,
      hScrollParent: horizontalScroll.centerParent,
      hScrollRightParent: horizontalScroll.rightParent,
      hScrollerLeft: horizontalScroll.leftScroller,
      hScroller: horizontalScroll.centerScroller,
      hScrollerRight: horizontalScroll.rightScroller,
      aggregateLeading: aggregateRefs.leading,
      aggregateLeadingCells: () => this._aggregateLeadingCells,
      aggregateLeft: aggregateRefs.left,
      aggregateLeftCells: () => this._aggregateLeftCells,
      aggregateCenterRow: () => this._aggregateRowRenderer.getCenterRow(),
      aggregateCenterCells: () => this._aggregateCells,
      aggregateRight: aggregateRefs.right,
      aggregateRightCells: () => this._aggregateRightCells,
    });
    this._pinnedSectionLayoutRenderer = new PinnedSectionLayoutRenderer({
      root: this.root,
      leftHeader: headerRefs.left,
      rightHeader: headerRefs.right,
      hScrollLeftParent: horizontalScroll.leftParent,
      hScrollRightParent: horizontalScroll.rightParent,
      leftScroller: bodyWrapper.leftScroller,
      rightScroller: bodyWrapper.rightScroller,
      aggregateLeft: aggregateRefs.left,
      aggregateRight: aggregateRefs.right,
    });
    this._scrollSyncRenderer = new GridScrollSyncRenderer({
      leadingScroller: bodyWrapper.leadingScroller,
      leftScroller: bodyWrapper.leftScroller,
      centerScroller: bodyWrapper.centerScroller,
      rightScroller: bodyWrapper.rightScroller,
      vScroll: bodyWrapper.vScroll,
      leadingSpacer: bodyWrapper.leadingSpacer,
      leftSpacer: bodyWrapper.leftSpacer,
      centerSpacer: bodyWrapper.centerSpacer,
      rightSpacer: bodyWrapper.rightSpacer,
      hScrollLeft: horizontalScroll.leftSpacer,
      hScrollCenter: horizontalScroll.centerSpacer,
      hScrollRight: horizontalScroll.rightSpacer,
      leftHeader: headerRefs.left,
      centerHeader: headerRefs.center,
      rightHeader: headerRefs.right,
      aggregateLeft: aggregateRefs.left,
      aggregateCenter: aggregateRefs.center,
      aggregateRight: aggregateRefs.right,
      onWindowUpdate: (scrollSrc) => this._bodyWindowRenderer.update(false, scrollSrc),
    });
    this._bodyWindowRenderer = new BodyWindowRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      rowPool: () => this._rowPool,
      leadingScroller: bodyWrapper.leadingScroller,
      leftScroller: bodyWrapper.leftScroller,
      centerScroller: bodyWrapper.centerScroller,
      rightScroller: bodyWrapper.rightScroller,
      vScroll: bodyWrapper.vScroll,
      leadingViewport: bodyWrapper.leadingViewport,
      leftViewport: bodyWrapper.leftViewport,
      centerViewport: bodyWrapper.centerViewport,
      rightViewport: bodyWrapper.rightViewport,
      serverSidePendingRangeKeys: this._serverSidePendingRangeKeys,
      beginScrollSync: (targets) => this._scrollSyncRenderer.beginScrollSync(targets),
      setStartIndex: (startIndex) => {
        this._startIndex = startIndex;
      },
      renderCell: (cell, row, col, cellRendererMap, viewIndex, rowNumber) => this._bodyCellRenderer.renderCell(cell, row, col, cellRendererMap, viewIndex, rowNumber),
      applySelectionToSlot: (slot, viewIndex) => this._selectionRenderer.applySelectionToSlot(slot, viewIndex),
    });

    this._paginationRenderer = new PaginationRenderer({
      core: this.core,
      root: this.root,
      resetScrollPosition: () => this._bodyViewportRenderer.resetScrollPosition(),
      setAggregateScope: (scope) => this._aggregateModelController.setAggregateScope(scope),
    });
    this._bodyPoolSizer = new BodyPoolSizer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      height: () => this.height,
      getContainerEl: () => this._rootAttachmentRenderer.getContainerEl(),
      headerWrapper: headerRefs.wrapper,
      hScrollContainer: horizontalScroll.container,
      paginator: this._paginationRenderer.getElement(),
      getAggregateRowHeight: () => this._getAggregateRowHeight(),
    });
    // this.buildPaginationControls();

    this._leafColumns = [];
    this._leafColumnLookup = new Map();
    this._leftLeafOrder = [];
    this._centerLeafOrder = [];
    this._rightLeafOrder = [];

    // Overlays
    this._filterOverlayRenderer = new FilterOverlayRenderer();
    this._filterOverlayRenderer.bind();
    this._loadingOverlayRenderer = new LoadingOverlayRenderer(this.root);

    // Create a pooled set of row nodes
    // this._poolSize = this._bodyPoolSizer.computePoolSize(...);
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    // this._buildHeaderDOM();
    // this._buildRowPool();

    // Events
    this._pinnedSectionLayoutRenderer.bind();
    this._scrollSyncRenderer.bind();
    this._interactionEventBinder.bind();
    this._bodyRowHoverRenderer.bind();

    // initial
    // requestAnimationFrame(() => this._maybeUpdatePoolSize());
    // this._bodyViewportRenderer.recomputeView();
    // this._columnLayoutRenderer.updateColumnWidths();
    // this._bodyWindowRenderer.update(true, undefined);
    // if (this.rowModel.getType() === "serverSide" && this.rowModel.isValid()) {
    //   this._filterUpdateHandler.fetchServerSideRows("init");
    // }
    this._coreEventBinder.bind();
  }

  attach(container: RefObject<HTMLElement | null>) {
    this._rootAttachmentRenderer.attach(container);
  }

  detach() {
    this._rootAttachmentRenderer.detach();
  }

  _maybeUpdatePoolSize(params?: GridEventViewportChangedParams) {
    const rowHeightPx = params?.rowHeightPx ?? this.core.getOptions().rowHeight ?? this.rowHeight;
    const overscanRowCount = params?.overscanRowCount ?? this.core.getOptions().overscanRowCount ?? 0;
    this.rowHeight = rowHeightPx;
    const poolSize = this._bodyPoolSizer.computePoolSize(rowHeightPx, overscanRowCount);
    if (poolSize === this._poolSize) return;
    this._poolSize = poolSize;
    this._rebuildRowPool();
    this._columnLayoutRenderer.updateColumnWidths();
    this._bodyWindowRenderer.update(true, undefined);
    this.buildPaginationControls();
  }

  // ---------------- Public API ----------------
  togglePagination(pagination: boolean) {
    this._paginationRenderer.togglePagination(pagination);
  }

  setLoading(isLoading: boolean) {
    const next = isTrue(isLoading);
    if (this._loadingOverlayRenderer.getLoading() === next) return;
    this._loadingOverlayRenderer.setLoading(next);
  }

  setIcons(icons?: GridIconMap) {
    this._iconRenderer.setIcons(icons);
  }

  setServerSideDataSource(dataSource?: IServerSideDataSource) {
    this._serverSideController.setDataSource(dataSource);
  }

  setServerSideAggregation(aggregation?: ServerSideAggregationSource) {
    this._serverSideController.setAggregation(aggregation);
  }

  refreshServerSideData() {
    this._serverSideController.refreshData();
  }

  exportCSV(options: ExportOptions = {}) {
    this._exportRenderer.exportCSV(options);
  }

  exportExcel(options: ExportOptions = {}) {
    this._exportRenderer.exportExcel(options);
  }

  destroy() {
    this._coreEventBinder.destroy();
    this._filterOverlayRenderer.destroy();
    this._interactionEventBinder.destroy();
    this._bodyRowHoverRenderer.destroy();
    this._pinnedSectionLayoutRenderer.destroy();
    this._rootAttachmentRenderer.destroy();
  }

  _aggregate(colID: string, aggType?: AggregateType) {
    this._aggregateModelController.aggregate(colID, aggType);
  }

  _aggregateSelectedColumns(aggType: AggregateType) {
    this._aggregateModelController.aggregateSelectedColumns(aggType);
  }

  _clearAggregates() {
    this._aggregateModelController.clearAggregates();
  }

  _markAggregatesDirty() {
    return;
  }

  _onAggregateChanged(params: GridEventAggregateChangedParams) {
    this._updatePaginationControls();
    this._paginationRenderer.updateAggregateControls(params);
    this._ensureAggregateRowBuilt();
    this._renderAggregateRow();
  }

  _renderAggregateRow() {
    this._syncLeafColumns();
    this._aggregateModelController.pruneAggregates();
    const aggregateMap = this._aggregateModelController.getAggregateMap();
    const aggregateScope = this.core.getAggregateScope();
    const shouldShow = aggregateScope !== "none" && aggregateMap.size > 0;
    const wasVisible = this._aggregateVisible;
    this._aggregateVisible = shouldShow;

    this._aggregateRowRenderer.setVisible(shouldShow);

    if (!shouldShow) {
      if (wasVisible !== shouldShow) {
        this._columnLayoutRenderer.updateColumnWidths();
        this._maybeUpdatePoolSize();
      }
      return;
    }

    const values = new Map<string, string>();
    const rawValues = this.rowModel.getAggregateValues();
    for (const col of this._leafColumns) {
      if (col.hidden) continue;
      const raw = rawValues.get(col.instanceID);
      const display = raw == null ? "" : this._aggregateCalculator.formatAggregateDisplay(col, raw);
      values.set(col.instanceID, display ?? "");
    }

    this._aggregateRowRenderer.renderCells(this._aggregateLeadingCells, this._leadingLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateLeftCells, this._leftPinnedLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateCells, this._centerLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateRightCells, this._rightPinnedLeafColumns, aggregateMap, values);

    if (wasVisible !== shouldShow) {
      this._columnLayoutRenderer.updateColumnWidths();
      this._maybeUpdatePoolSize();
    }
  }

  _getAggregateRowHeight(): number {
    return this._aggregateVisible ? this.rowHeight : 0;
  }

  // ---------------- Internals: DOM build ----------------
  _buildHeaderDOM(reason: string) {
    this._syncLeafColumns();
    this._headerRenderer.buildDOM(reason);
    this.core.pruneColumnSelection();
    this._selectionRenderer.applyColumnSelectionStyles();
  }

  private buildPaginationControls() {
    this._paginationRenderer.buildControls();
  }

  _updatePaginationControls(params?: GridEventPaginationChangedParams) {
    this._paginationRenderer.updateControls(params);
  }

  _buildAggregateRow() {
    this._syncLeafColumns();
    const result = this._aggregateRowBuilder.build();
    this._aggregateLeadingCells = result.leadingCells;
    this._aggregateLeftCells = result.leftCells;
    this._aggregateCells = result.centerCells;
    this._aggregateRightCells = result.rightCells;
    this._columnLayoutRenderer.updateColumnWidths();
    this._renderAggregateRow();
  }

  private _ensureAggregateRowBuilt() {
    this._syncLeafColumns();
    if (
      this._aggregateLeadingCells.length > 0
      || this._aggregateLeftCells.length > 0
      || this._aggregateCells.length > 0
      || this._aggregateRightCells.length > 0
      || this._leafColumns.length === 0
    ) {
      return;
    }
    this._buildAggregateRow();
  }

  private _syncLeafColumns() {
    const columnModel = this.core.getColumnModel();
    this._leafColumns = columnModel.getLeaves();
    this._leafColumnLookup = columnModel.leafColumnLookup;
    this._leadingLeafColumns = columnModel.getLeadingLeaves();
    this._leftPinnedLeafColumns = columnModel.getLeftLeaves();
    this._centerLeafColumns = columnModel.getCenterLeaves();
    this._rightPinnedLeafColumns = columnModel.getRightLeaves();
  }

  _ensureCellVisible(viewIdx: number, colIdx: number) {
    const refs = this._bodyViewportRenderer.getRefs();

    // Vertical: scroll centerScroller so the row is fully in view.
    const rowTop = viewIdx * this.rowHeight;
    const viewH = refs.body.clientHeight;
    const st = refs.centerScroller.scrollTop;
    if (rowTop < st) {
      refs.centerScroller.scrollTop = rowTop;
    } else if (rowTop + this.rowHeight > st + viewH) {
      refs.centerScroller.scrollTop = rowTop + this.rowHeight - viewH;
    }

    // Horizontal: only center-section columns scroll; leading/pinned are always visible.
    const col = this._leafColumns[colIdx];
    if (!col) return;
    const meta = this._leafColumnLookup.get(col.instanceID);
    if (!meta || meta.section !== "center" || col.centralPosition == null) return;

    const centerLeaves = this.core.getColumnModel().getCenterLeaves();
    let colLeft = 0;
    for (let i = 0; i < col.centralPosition; i++) {
      colLeft += centerLeaves[i].computedWidth;
    }
    const colWidth = col.computedWidth;
    const viewW = refs.centerSpacer.clientWidth;
    const sl = refs.centerSpacer.scrollLeft;
    if (colLeft < sl) {
      refs.centerSpacer.scrollLeft = colLeft;
    } else if (colLeft + colWidth > sl + viewW) {
      refs.centerSpacer.scrollLeft = colLeft + colWidth - viewW;
    }
  }

  _buildRowPool() {
    this._syncLeafColumns();
    this._rowPool = this._bodyRowPoolRenderer.build(this._poolSize);

    this._buildAggregateRow();
  }

  _rebuildRowPool() {
    // If columns change frequently, you’d do smarter diffing.
    this._buildRowPool();
  }

  private _copySelectionToClipboard({ includeHeaders, ctx }: {
    includeHeaders: boolean;
    ctx: import("../menu/bodyContext").BodyMenuContext;
  }) {
    const tsv = this._buildClipboardTSV(includeHeaders, ctx);
    if (!tsv) return;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).catch(err => {
        console.error("Failed to write to clipboard", err);
      });
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = tsv;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (err) { console.error("Failed to copy to clipboard", err); }
    document.body.removeChild(ta);
  }

  private _buildClipboardTSV(includeHeaders: boolean, ctx: import("../menu/bodyContext").BodyMenuContext): string {
    const columnModel = this.core.getColumnModel();
    const allLeaves = columnModel.getLeaves().filter(c => !c.isInternal() && !c.hidden);
    const rowModel = this.core.getRowModel();

    let cols = allLeaves;
    let viewIdxRange: { start: number; end: number };

    if (ctx.selection.range) {
      const r = ctx.selection.range;
      cols = allLeaves.filter((_, idx) => {
        const globalIdx = columnModel.getLeaves().indexOf(allLeaves[idx]);
        return globalIdx >= r.colStart && globalIdx <= r.colEnd;
      });
      viewIdxRange = { start: r.rowStart, end: r.rowEnd };
    } else if (ctx.selection.rowIds.length > 0) {
      const rowIdSet = new Set(ctx.selection.rowIds);
      const viewIdxs: number[] = [];
      for (let i = 0; i < rowModel.getViewCount(); i++) {
        const id = this.core.getRowIdAtViewIndex(i);
        if (id && rowIdSet.has(id)) viewIdxs.push(i);
      }
      if (viewIdxs.length === 0) return "";
      return this.serializeRowsToTSV(cols, viewIdxs, includeHeaders);
    } else if (ctx.selection.colIds.length > 0) {
      cols = allLeaves.filter(c => ctx.selection.colIds.includes(c.instanceID));
      viewIdxRange = { start: 0, end: rowModel.getViewCount() - 1 };
    } else {
      cols = allLeaves.filter(c => c.instanceID === ctx.colId);
      viewIdxRange = { start: ctx.viewIdx, end: ctx.viewIdx };
    }

    const viewIdxs: number[] = [];
    for (let i = viewIdxRange.start; i <= viewIdxRange.end; i++) viewIdxs.push(i);
    return this.serializeRowsToTSV(cols, viewIdxs, includeHeaders);
  }

  private serializeRowsToTSV(cols: import("../column/column").Column[], viewIdxs: number[], includeHeaders: boolean): string {
    const rowModel = this.core.getRowModel();
    const lines: string[] = [];
    if (includeHeaders) {
      lines.push(cols.map(c => this.escapeTSV(c.label ?? c.key ?? "")).join("\t"));
    }
    for (const viewIdx of viewIdxs) {
      const node = rowModel.getRowNodeAtViewIndex(viewIdx);
      if (!node) continue;
      const cells = cols.map(col => this.escapeTSV(col.formatValue(col.getValue(node), node)));
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }

  private escapeTSV(value: unknown): string {
    if (value == null) return "";
    const s = String(value);
    if (s.includes("\t") || s.includes("\n") || s.includes("\r") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

}
