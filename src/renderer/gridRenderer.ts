import { RefObject } from "react";
import {
  AggregateScope,
  AggregateType,
} from "../interfaces/aggregate";
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
  GridEventPaginationChangedParams,
  GridEventViewportChangedParams,
} from "../events/events";
import { MenuCoordinator } from "../menu/coordinator";
import { MenuRenderer } from "./menuRenderer";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { AggregateCalculator } from "./aggregate/calculator";
import { AggregateRowBuilder } from "./aggregate/rowBuilder";
import { AggregateServerFetcher } from "./aggregate/serverFetcher";
import { AggregateRowRenderer } from "./aggregate/wrapper";
import { BodyCellRenderer } from "./body/cellRenderer";
import { BodyPoolSizer } from "./body/poolSizer";
import { BodyRowHoverRenderer } from "./body/rowHover";
import { BodyRowPoolRenderer } from "./body/rowPool";
import { BodyViewportRenderer } from "./body/viewport";
import { BodyWindowRenderer } from "./body/window";
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
import { ServerSideController } from "./serverSideController";

export class GridRenderer {
  _menuRenderer: MenuRenderer;
  _coreEventBinder: GridRendererCoreEventBinder;
  _modelChangeHandler: GridModelChangeHandler;
  _exportRenderer: ExportRenderer;
  _columnMenuOpener: ColumnMenuOpener;
  _filterUpdateHandler: FilterUpdateHandler;
  _aggregateCalculator: AggregateCalculator;
  _aggregateRowBuilder: AggregateRowBuilder;
  _aggregateRowRenderer: AggregateRowRenderer;
  _aggregateServerFetcher: AggregateServerFetcher;
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

  _selectionAnchor: { row: number; colIdx: number } | null;
  _selectionRange: { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null;
  _isSelecting: boolean;

  _selectedColumnIDs: Set<string>;

  // DOM elements
  root: HTMLDivElement;
  hScrollContainer: HTMLDivElement;
  hScrollLeftParent: HTMLDivElement;
  hScrollParent: HTMLDivElement;
  hScrollRightParent: HTMLDivElement;
  hScrollLeft: HTMLDivElement;
  hScroll: HTMLDivElement;
  hScrollRight: HTMLDivElement;
  hScrollerLeft: HTMLDivElement;
  hScroller: HTMLDivElement;
  hScrollerRight: HTMLDivElement;
  vScrollParent: HTMLDivElement;
  vScroll: HTMLDivElement;
  vScroller: HTMLDivElement;
  headerWrapper: HTMLDivElement;
  leftHeader: HTMLDivElement;
  header: HTMLDivElement;
  rightHeader: HTMLDivElement;
  body: HTMLDivElement;
  leftScroller: HTMLDivElement;
  scroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  spacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  leftViewport: HTMLDivElement;
  viewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
  aggregateRow: HTMLDivElement;
  aggregateLeft: HTMLDivElement;
  aggregateCenter: HTMLDivElement;
  aggregateRight: HTMLDivElement;
  aggregateLeftRow?: HTMLDivElement;
  aggregateCenterRow: HTMLDivElement;
  aggregateRightRow?: HTMLDivElement;
  aggregateCloseBtn: HTMLButtonElement;
  _aggregateLeftCells: HTMLDivElement[];
  _aggregateCells: HTMLDivElement[];
  _aggregateRightCells: HTMLDivElement[];
  _aggregateVisible: boolean;

  paginator: HTMLDivElement;
  pageSizeSelect!: HTMLSelectElement;
  pageSelect!: HTMLSelectElement;
  firstPageBtn!: HTMLButtonElement;
  prevPageBtn!: HTMLButtonElement;
  nextPageBtn!: HTMLButtonElement;
  lastPageBtn!: HTMLButtonElement;
  aggregateScopeSelect!: HTMLSelectElement;
  aggregateClearBtn!: HTMLButtonElement;

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
  ) {
    this._measureCtx = null;
    this._measureCache = new Map();
    this._columnWidths = new Map();

    // DOM skeleton
    this.root = div("pte-root");
    this.root.dataset.pteGridId = this.core.id;
    this.root.style.position = "relative";
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
      onDataChanged: (params) => this._modelChangeHandler.onDataChanged(params),
      updatePaginationControls: (params) => this._updatePaginationControls(params),
    });
    this._modelChangeHandler = new GridModelChangeHandler({
      core: this.core,
      serverSidePendingRangeKeys: this._serverSidePendingRangeKeys,
      recomputeView: () => this._bodyViewportRenderer.recomputeView(),
      updateWindow: (forcePatch, scrollSrc, params) => this._bodyWindowRenderer.update(forcePatch, scrollSrc, params),
      resetScrollPosition: () => this._resetScrollPosition(),
      updatePaginationControls: () => this._updatePaginationControls(),
      addSortIndicatorToHeader: (colID, dir) => this._headerRenderer.addSortIndicatorToHeader(colID, dir),
      setFilterIndicators: () => this._headerRenderer.setFilterIndicators(),
      buildRowPool: () => this._buildRowPool(),
      buildHeaderDOM: (reason) => this._buildHeaderDOM(reason),
      updateColumnWidths: (colIDs) => this._columnLayoutRenderer.updateColumnWidths(colIDs),
    });
    this._exportRenderer = new ExportRenderer({
      core: this.core,
      leafColumns: () => this._leafColumns,
      columnWidths: () => this._columnWidths,
      selectionRange: () => this._selectionRange,
      selectedColumnIDs: () => this._selectedColumnIDs,
    });
    this._columnMenuOpener = new ColumnMenuOpener({
      core: this.core,
      menuCoordinator,
      filterMenuCoordinator,
      menuRenderer: this._menuRenderer,
      selectedColumnIDs: () => this._selectedColumnIDs,
    });
    this._filterUpdateHandler = new FilterUpdateHandler({
      core: this.core,
      setFilterIndicators: () => this._headerRenderer.setFilterIndicators(),
      recomputeView: () => this._bodyViewportRenderer.recomputeView(),
      updateWindow: (forcePatch, scrollSrc) => this._bodyWindowRenderer.update(forcePatch, scrollSrc),
    });
    this._aggregateCalculator = new AggregateCalculator();
    this._aggregateServerFetcher = new AggregateServerFetcher({
      core: this.core,
      leafColumns: () => this._leafColumns,
      getAggregateMap: () => this._getAggregateMap(),
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
      getBody: () => this.body,
      getContainerEl: () => this._rootAttachmentRenderer.getContainerEl(),
    });
    const headerRefs = this._headerRenderer.getRefs();
    this.headerWrapper = headerRefs.wrapper;
    this.leftHeader = headerRefs.left;
    this.header = headerRefs.center;
    this.rightHeader = headerRefs.right;

    this._bodyViewportRenderer = new BodyViewportRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
    });
    const bodyWrapper = this._bodyViewportRenderer.getRefs();
    this.body = bodyWrapper.body;
    this._bodyRowHoverRenderer = new BodyRowHoverRenderer(this.body);
    this.leftScroller = bodyWrapper.leftScroller;
    this.scroller = bodyWrapper.centerScroller;
    this.rightScroller = bodyWrapper.rightScroller;

    this._aggregateRowRenderer = new AggregateRowRenderer(this.root, this.rowHeight, (e) => {
      e.stopPropagation();
      this._setAggregateScope("none");
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.value = "none";
      }
    });
    const aggregateRow = this._aggregateRowRenderer.getRefs();
    this.aggregateRow = aggregateRow.row;
    this.aggregateLeft = aggregateRow.left;
    this.aggregateCenter = aggregateRow.center;
    this.aggregateRight = aggregateRow.right;
    this.aggregateCloseBtn = aggregateRow.closeButton;
    this.aggregateCenterRow = aggregateRow.centerRow;
    this._aggregateLeftCells = [];
    this._aggregateCells = [];
    this._aggregateRightCells = [];
    this._aggregateVisible = false;
    this._aggregateRowBuilder = new AggregateRowBuilder({
      rowHeight: () => this.rowHeight,
      leafColumnLookup: () => this._leafColumnLookup,
      aggregateRow: this.aggregateRow,
      aggregateLeft: this.aggregateLeft,
      aggregateCenter: this.aggregateCenter,
      aggregateRight: this.aggregateRight,
      leftPinnedLeafColumns: () => this._leftPinnedLeafColumns,
      centerLeafColumns: () => this._centerLeafColumns,
      rightPinnedLeafColumns: () => this._rightPinnedLeafColumns,
    });

    this._horizontalScrollRenderer = new HorizontalScrollRenderer(this.root);
    const horizontalScroll = this._horizontalScrollRenderer.getRefs();
    this.hScrollContainer = horizontalScroll.container;
    this.hScrollLeftParent = horizontalScroll.leftParent;
    this.hScrollParent = horizontalScroll.centerParent;
    this.hScrollRightParent = horizontalScroll.rightParent;
    this.hScrollLeft = horizontalScroll.leftSpacer;
    this.hScroll = horizontalScroll.centerSpacer;
    this.hScrollRight = horizontalScroll.rightSpacer;
    this.hScrollerLeft = horizontalScroll.leftScroller;
    this.hScroller = horizontalScroll.centerScroller;
    this.hScrollerRight = horizontalScroll.rightScroller;

    this.vScrollParent = bodyWrapper.vScrollParent;
    this.vScroll = bodyWrapper.vScroll;
    this.vScroller = bodyWrapper.vScroller;
    this.leftSpacer = bodyWrapper.leftSpacer;
    this.spacer = bodyWrapper.centerSpacer;
    this.rightSpacer = bodyWrapper.rightSpacer;
    this.leftViewport = bodyWrapper.leftViewport;
    this.viewport = bodyWrapper.centerViewport;
    this.rightViewport = bodyWrapper.rightViewport;
    this._bodyRowPoolRenderer = new BodyRowPoolRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      leftViewport: this.leftViewport,
      centerViewport: this.viewport,
      rightViewport: this.rightViewport,
    });
    this._columnInteractionRenderer = new ColumnInteractionRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
      maxDepth: () => this._maxDepth,
      headerWrapper: this.headerWrapper,
      leftHeader: this.leftHeader,
      centerHeader: this.header,
      rightHeader: this.rightHeader,
      leftScroller: this.leftScroller,
      centerScroller: this.scroller,
      rightScroller: this.rightScroller,
      leafColumnLookup: () => this._leafColumnLookup,
    });
    this._headerInteractionHandler = new HeaderInteractionHandler({
      core: this.core,
      root: this.root,
      selectedColumnIDs: () => this._selectedColumnIDs,
      toggleColumnSelection: (colID) => this._toggleColumnSelection(colID),
      openColumnMenu: (trigger, colID, anchor) => this._columnMenuOpener.openColumnMenu(trigger, colID, anchor),
      openColumnFilter: (colID, anchorEl) => this._columnMenuOpener.openFilterMenu(colID, anchorEl),
    });
    this._interactionEventBinder = new GridInteractionEventBinder({
      headerWrapper: this.headerWrapper,
      body: this.body,
      onHeaderMouseDown: (e) => this._columnInteractionRenderer.onHeaderMouseDown(e),
      onHeaderContextMenu: (e) => this._headerInteractionHandler.onHeaderContextMenu(e),
      onHeaderDoubleClick: (e) => this._columnInteractionRenderer.onHeaderDoubleClick(e),
      onCellMouseDown: (e) => this._onCellMouseDown(e),
      onColumnResizeMouseMove: (e) => this._columnInteractionRenderer.onColumnResizeMouseMove(e),
      onColumnDragMouseMove: (e) => this._columnInteractionRenderer.onColumnDragMouseMove(e),
      onCellMouseMove: (e) => this._onCellMouseMove(e),
      onColumnResizeMouseUp: () => this._columnInteractionRenderer.onColumnResizeMouseUp(),
      onColumnDragMouseUp: () => this._columnInteractionRenderer.onColumnDragMouseUp(),
      onCellMouseUp: () => this._onCellMouseUp(),
      shouldSuppressClick: () => this._columnInteractionRenderer.consumeSuppressClick(),
      onClick: (e) => this._headerInteractionHandler.onDocumentClick(e),
    });
    this._columnLayoutRenderer = new ColumnLayoutRenderer({
      core: this.core,
      root: this.root,
      body: this.body,
      rowPool: () => this._rowPool,
      leftViewport: this.leftViewport,
      centerViewport: this.viewport,
      rightViewport: this.rightViewport,
      leftScroller: this.leftScroller,
      rightScroller: this.rightScroller,
      leftHeader: this.leftHeader,
      centerHeader: this.header,
      rightHeader: this.rightHeader,
      headerWrapper: this.headerWrapper,
      hScrollContainer: this.hScrollContainer,
      hScrollLeftParent: this.hScrollLeftParent,
      hScrollParent: this.hScrollParent,
      hScrollRightParent: this.hScrollRightParent,
      hScrollerLeft: this.hScrollerLeft,
      hScroller: this.hScroller,
      hScrollerRight: this.hScrollerRight,
      aggregateLeft: this.aggregateLeft,
      aggregateCenterRow: () => this.aggregateCenterRow,
      aggregateRight: this.aggregateRight,
    });
    this._pinnedSectionLayoutRenderer = new PinnedSectionLayoutRenderer({
      root: this.root,
      leftHeader: this.leftHeader,
      rightHeader: this.rightHeader,
      hScrollLeftParent: this.hScrollLeftParent,
      hScrollRightParent: this.hScrollRightParent,
      leftScroller: this.leftScroller,
      rightScroller: this.rightScroller,
      aggregateLeft: this.aggregateLeft,
      aggregateRight: this.aggregateRight,
    });
    this._scrollSyncRenderer = new GridScrollSyncRenderer({
      leftScroller: this.leftScroller,
      centerScroller: this.scroller,
      rightScroller: this.rightScroller,
      vScroll: this.vScroll,
      leftSpacer: this.leftSpacer,
      centerSpacer: this.spacer,
      rightSpacer: this.rightSpacer,
      hScrollLeft: this.hScrollLeft,
      hScrollCenter: this.hScroll,
      hScrollRight: this.hScrollRight,
      leftHeader: this.leftHeader,
      centerHeader: this.header,
      rightHeader: this.rightHeader,
      aggregateLeft: this.aggregateLeft,
      aggregateCenter: this.aggregateCenter,
      aggregateRight: this.aggregateRight,
      onWindowUpdate: (scrollSrc) => this._bodyWindowRenderer.update(false, scrollSrc),
    });
    this._bodyWindowRenderer = new BodyWindowRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      rowPool: () => this._rowPool,
      leftScroller: this.leftScroller,
      centerScroller: this.scroller,
      rightScroller: this.rightScroller,
      vScroll: this.vScroll,
      leftViewport: this.leftViewport,
      centerViewport: this.viewport,
      rightViewport: this.rightViewport,
      serverSidePendingRangeKeys: this._serverSidePendingRangeKeys,
      beginScrollSync: (targets) => this._scrollSyncRenderer.beginScrollSync(targets),
      setStartIndex: (startIndex) => {
        this._startIndex = startIndex;
      },
      renderCell: (cell, row, col, cellRendererMap) => this._bodyCellRenderer.renderCell(cell, row, col, cellRendererMap),
      applySelectionToSlot: (slot, viewIndex) => this._applySelectionToSlot(slot, viewIndex),
    });

    this._paginationRenderer = new PaginationRenderer({
      core: this.core,
      root: this.root,
      resetScrollPosition: () => this._resetScrollPosition(),
    });
    this.paginator = this._paginationRenderer.getElement();
    this._bodyPoolSizer = new BodyPoolSizer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      height: () => this.height,
      getContainerEl: () => this._rootAttachmentRenderer.getContainerEl(),
      headerWrapper: this.headerWrapper,
      hScrollContainer: this.hScrollContainer,
      paginator: this.paginator,
      getAggregateRowHeight: () => this._getAggregateRowHeight(),
    });
    // this.buildPaginationControls();

    this._leafColumns = [];
    this._leafColumnLookup = new Map();
    this._leftLeafOrder = [];
    this._centerLeafOrder = [];
    this._rightLeafOrder = [];

    this._selectionAnchor = null;
    this._selectionRange = null;
    this._isSelecting = false;
    this._selectedColumnIDs = new Set();

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
    const aggregates = this._getAggregateMap();
    const prevSize = aggregates.size;
    if (!aggType) {
      aggregates.delete(colID);
    } else {
      aggregates.set(colID, aggType);
    }
    this._setAggregateMap(aggregates);
    if (prevSize === 0 && aggregates.size > 0 && this.core.getAggregateScope() === "none") {
      this._setAggregateScope("page");
    }
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _aggregateSelectedColumns(aggType: AggregateType) {
    const aggregates = this._getAggregateMap();
    const prevSize = aggregates.size;
    const selectedCols = Array.from(this._selectedColumnIDs);
    for (const colID of selectedCols) {
      const col = this.core.getColumnModel().getById(colID);
      if (!col) continue;
      if (col.children.length > 0) continue; // skip parent columns
      aggregates.set(colID, aggType);
    }
    this._setAggregateMap(aggregates);
    if (prevSize === 0 && aggregates.size > 0 && this.core.getAggregateScope() === "none") {
      this._setAggregateScope("page");
    }
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _clearAggregates() {
    if (this.core.getAggregateModel().length === 0) return;
    this.core.setAggregateModel([]);
    this._setAggregateScope("none");
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _markAggregatesDirty() {
    this._aggregateServerFetcher.markDirty();
  }

  _setAggregateScope(scope: AggregateScope) {
    const changed = scope !== this.core.getAggregateScope();
    this.core.setAggregateScope(scope);
    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.value = scope;
    }
    this._markAggregatesDirty();
    this._aggregateServerFetcher.maybeRequest();
    if (changed) {
      this._renderAggregateRow();
    }
  }

  _pruneAggregates() {
    const aggregates = this._getAggregateMap();
    if (aggregates.size === 0) return;
    const valid = new Set(this._leafColumns.map(c => c.instanceID));
    for (const key of Array.from(aggregates.keys())) {
      if (!valid.has(key)) {
        aggregates.delete(key);
      }
    }
    this._setAggregateMap(aggregates);
  }

  _getAggregateOpForColumn(col: Column): AggregateType {
    const explicit = this._getAggregateMap().get(col.instanceID);
    if (explicit != null) return explicit;
    return col.isComputableType() ? AggregateType.SUM : AggregateType.COUNT;
  }

  private _getAggregateMap(): Map<string, AggregateType> {
    return new Map(this.core.getAggregateModel().map(a => [a.key, a.type]));
  }

  private _setAggregateMap(aggregates: Map<string, AggregateType>) {
    this.core.setAggregateModel(Array.from(aggregates.entries()).map(([key, type]) => ({ key, type })));
  }

  _getAggregateRows(): any[] {
    if (this.core.getAggregateScope() === "all") {
      const rows: any[] = [];
      this.core.getRowModel().forEachNodeAfterFilterAndSort((node) => rows.push(node.data));
      return rows;
    }
    const rows: any[] = [];
    for (let i = 0; i < this.core.getRowModel().getViewCount(); i++) {
      const node = this.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  _renderAggregateRow() {
    this._pruneAggregates();
    const aggregateMap = this._getAggregateMap();
    const aggregateScope = this.core.getAggregateScope();
    const shouldShow = aggregateScope !== "none" && aggregateMap.size > 0;
    const wasVisible = this._aggregateVisible;
    this._aggregateVisible = shouldShow;
    if (this.aggregateClearBtn) {
      this.aggregateClearBtn.disabled = aggregateMap.size === 0;
    }

    this.aggregateRow.classList.toggle("visible", shouldShow);
    this.aggregateRow.style.display = shouldShow ? "flex" : "none";

    if (!shouldShow) {
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.disabled = aggregateMap.size === 0;
      }
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.value = aggregateScope;
      }
      if (wasVisible !== shouldShow) {
        this._columnLayoutRenderer.updateColumnWidths();
        this._maybeUpdatePoolSize();
      }
      return;
    }

    const values = new Map<string, string>();
    const serverAggregationSource = (this.rowModel as any).serverAggregationSource as ServerSideAggregationSource | undefined;
    if (this.rowModel.getType() === "serverSide" && aggregateScope === "all" && serverAggregationSource) {
      this._aggregateServerFetcher.maybeRequest();
      const remote = this._aggregateServerFetcher.getRemoteValues();
      for (const col of this._leafColumns) {
        if (col.hidden) continue;
        const v = remote?.get(col.instanceID);
        const display = v == null ? "" : this._aggregateCalculator.formatAggregateDisplay(col, v);
        values.set(col.instanceID, display ?? "");
      }
    } else {
      const rows = this._getAggregateRows();
      for (const col of this._leafColumns) {
        if (col.hidden) continue;
        const op = this._getAggregateOpForColumn(col);
        const raw = this._aggregateCalculator.calculateAggregate(col, op, rows);
        const display = this._aggregateCalculator.formatAggregateDisplay(col, raw);
        values.set(col.instanceID, display ?? "");
      }
    }

    this._aggregateRowRenderer.renderCells(this._aggregateLeftCells, this._leftPinnedLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateCells, this._centerLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateRightCells, this._rightPinnedLeafColumns, aggregateMap, values);

    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.disabled = aggregateMap.size === 0;
    }

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
    this._centerLeafColumns = [];
    this._leftPinnedLeafColumns = [];
    this._rightPinnedLeafColumns = [];
    this._headerRenderer.buildDOM(reason);
    // this._pruneColumnSelection();
    // this._applyColumnSelectionStyles();
  }

  private buildAggregationControls() {
    const aggSection = document.createElement("div");
    aggSection.className = "pte-pagination-section pte-aggregate-controls";
    const aggLabel = document.createElement("span");
    aggLabel.className = "pte-pagination-label";
    aggLabel.textContent = "Aggregate";
    this.aggregateScopeSelect = document.createElement("select");
    this.aggregateScopeSelect.className = "pte-select pte-pagination-select pte-aggregate-scope";
    const aggOptions: Array<{ value: AggregateScope; label: string }> = [
      { value: "none", label: "None" },
      { value: "page", label: "Current page" },
      { value: "all", label: "Entire dataset" },
    ];
    for (const optDef of aggOptions) {
      const opt = document.createElement("option");
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      this.aggregateScopeSelect.appendChild(opt);
    }
    this.aggregateScopeSelect.value = this.core.getAggregateScope();
    this.aggregateScopeSelect.addEventListener("change", (e) => {
      const next = (e.target as HTMLSelectElement).value as AggregateScope;
      this._setAggregateScope(next);
    });
    this.aggregateScopeSelect.disabled = this.core.getAggregateModel().length === 0;

    this.aggregateClearBtn = document.createElement("button");
    this.aggregateClearBtn.type = "button";
    this.aggregateClearBtn.className = "pte-pagination-btn pte-aggregate-clear";
    this.aggregateClearBtn.title = "Remove aggregate row";
    this.aggregateClearBtn.textContent = "x";
    this.aggregateClearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._setAggregateScope("none");
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.value = "none";
      }
    });

    aggSection.appendChild(aggLabel);
    aggSection.appendChild(this.aggregateScopeSelect);
    aggSection.appendChild(this.aggregateClearBtn);

    return aggSection;
  }

  private buildPaginationControls() {
    this._paginationRenderer.buildControls();
    this._syncPaginationControlRefs();
  }

  _updatePaginationControls(params?: GridEventPaginationChangedParams) {
    this._paginationRenderer.updateControls(params);
    this._syncPaginationControlRefs();
    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.value = this.core.getAggregateScope();
      this.aggregateScopeSelect.disabled = this.core.getAggregateModel().length === 0;
    }
    if (this.aggregateClearBtn) {
      this.aggregateClearBtn.disabled = this.core.getAggregateModel().length === 0;
    }
  }

  private _syncPaginationControlRefs() {
    if (this._paginationRenderer.pageSizeSelect) this.pageSizeSelect = this._paginationRenderer.pageSizeSelect;
    if (this._paginationRenderer.pageSelect) this.pageSelect = this._paginationRenderer.pageSelect;
    if (this._paginationRenderer.firstPageBtn) this.firstPageBtn = this._paginationRenderer.firstPageBtn;
    if (this._paginationRenderer.prevPageBtn) this.prevPageBtn = this._paginationRenderer.prevPageBtn;
    if (this._paginationRenderer.nextPageBtn) this.nextPageBtn = this._paginationRenderer.nextPageBtn;
    if (this._paginationRenderer.lastPageBtn) this.lastPageBtn = this._paginationRenderer.lastPageBtn;
  }

  _resetScrollPosition() {
    this.leftScroller.scrollTop = 0;
    this.scroller.scrollTop = 0;
    this.rightScroller.scrollTop = 0;
    this.vScroll.scrollTop = 0;
  }

  _buildAggregateRow() {
    const result = this._aggregateRowBuilder.build();
    this._aggregateLeftCells = result.leftCells;
    this._aggregateCells = result.centerCells;
    this._aggregateRightCells = result.rightCells;
    this.aggregateLeftRow = result.leftRow;
    this.aggregateCenterRow = result.centerRow;
    this.aggregateRightRow = result.rightRow;
    this._renderAggregateRow();
  }

  _buildRowPool() {
    this._rowPool = this._bodyRowPoolRenderer.build(this._poolSize);

    // this._buildAggregateRow();
  }

  _rebuildRowPool() {
    // If columns change frequently, you’d do smarter diffing.
    this._buildRowPool();
  }

  // ---------------- Internals: hot path ----------------
  _applySelectionToSlot(slot: RowPoolDef, viewIndex: number | null) {
    const range = this._selectionRange;
    const rowSelected = !!range && viewIndex != null && viewIndex >= range.rowStart && viewIndex <= range.rowEnd;
    const firstRow = viewIndex === 0;
    const lastRow = viewIndex != null ? viewIndex === this.core.getRowModel().getViewCount() - 1 : false;

    const apply = (cells: HTMLDivElement[], order: number[]) => {
      if (!cells) return;
      for (let i = 0; i < cells.length; i++) {
        const colIdx = order[i];
        const leaves = this.core.getColumnModel().getLeaves();
        const leafCol = Number.isFinite(colIdx) ? leaves[colIdx] : null;
        const colId = leafCol?.instanceID;
        const colSelected = colId ? this._selectedColumnIDs.has(colId) : false;

        const rangeSelected = !!rowSelected && range && Number.isFinite(colIdx) && colIdx >= range.colStart && colIdx <= range.colEnd;
        const selected = rangeSelected || colSelected;

        const prevColIdx = order[i - 1];
        const nextColIdx = order[i + 1];
        const prevSelected = (() => {
          if (Number.isFinite(prevColIdx)) {
            if (range && prevColIdx >= range.colStart && prevColIdx <= range.colEnd) return true;
            const prevCol = leaves[prevColIdx];
            if (prevCol && this._selectedColumnIDs.has(prevCol.instanceID)) return true;
          }
          return false;
        })();
        const nextSelected = (() => {
          if (Number.isFinite(nextColIdx)) {
            if (range && nextColIdx >= range.colStart && nextColIdx <= range.colEnd) return true;
            const nextCol = leaves[nextColIdx];
            if (nextCol && this._selectedColumnIDs.has(nextCol.instanceID)) return true;
          }
          return false;
        })();

        const isTop = rangeSelected ? (viewIndex === range?.rowStart) : false;
        const isBottom = rangeSelected ? (viewIndex === range?.rowEnd) : (colSelected && lastRow);
        const isLeft = rangeSelected
          ? (colIdx === range?.colStart)
          : (colSelected && !prevSelected);
        const isRight = rangeSelected
          ? (colIdx === range?.colEnd)
          : (colSelected && !nextSelected);

        const cls = cells[i].classList;
        cls.toggle("selected", selected);
        cls.toggle("selected-top", selected && isTop);
        cls.toggle("selected-bottom", selected && isBottom);
        cls.toggle("selected-left", selected && isLeft);
        cls.toggle("selected-right", selected && isRight);
      }
    };

    apply(slot.leftCellEls, this._leftLeafOrder);
    apply(slot.cellEls, this._centerLeafOrder);
    apply(slot.rightCellEls, this._rightLeafOrder);
  }

  _refreshSelectionStyles() {
    const total = this.core.getRowModel().getViewCount();
    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIndex = this._startIndex + i;
      const slot = this._rowPool[i];
      if (viewIndex >= total) {
        this._applySelectionToSlot(slot, null);
        continue;
      }
      this._applySelectionToSlot(slot, viewIndex);
    }
  }

  _clearSelection() {
    this._selectionAnchor = null;
    this._selectionRange = null;
    this._isSelecting = false;
    this._refreshSelectionStyles();
  }

  _clearColumnSelection() {
    this._selectedColumnIDs.clear();
    this._applyColumnSelectionStyles();
    this._refreshSelectionStyles();
  }

  _pruneColumnSelection() {
    const keep = new Set<string>();
    const visit = (cols: Column[]) => {
      for (const col of cols) {
        if (this._selectedColumnIDs.has(col.instanceID)) keep.add(col.instanceID);
        if (col.children) visit(col.children);
      }
    };
    visit(this.core.getColumnModel().getColumns());

    this._selectedColumnIDs = keep;
  }

  _clampSelectionToView() {
    if (!this._selectionRange) return;
    const viewCount = this.core.getRowModel().getViewCount();
    if (viewCount === 0 || this._leafColumns.length === 0) {
      this._clearSelection();
      return;
    }

    const maxRow = viewCount - 1;
    const maxCol = this._leafColumns.length - 1;

    const rowStart = Math.min(this._selectionRange.rowStart, maxRow);
    const rowEnd = Math.min(this._selectionRange.rowEnd, maxRow);
    const colStart = Math.min(this._selectionRange.colStart, maxCol);
    const colEnd = Math.min(this._selectionRange.colEnd, maxCol);

    this._selectionRange = {
      rowStart: Math.min(rowStart, rowEnd),
      rowEnd: Math.max(rowStart, rowEnd),
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
    };

    if (this._selectionAnchor) {
      this._selectionAnchor = {
        row: Math.min(Math.max(this._selectionAnchor.row, 0), maxRow),
        colIdx: Math.min(Math.max(this._selectionAnchor.colIdx, 0), maxCol),
      };
    }

    this._refreshSelectionStyles();
  }

  _getCellLocation(target: EventTarget | null): { viewIdx: number; colIdx: number } | null {
    const cell = (target as HTMLElement | null)?.closest(".pte-cell") as HTMLDivElement | null;
    if (!cell || !this.root.contains(cell)) return null;

    const rowEl = cell.closest(".pte-row") as HTMLDivElement | null;
    if (!rowEl) return null;

    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    const colIdx = Number(cell.dataset.colIdx);
    if (!Number.isFinite(viewIdx) || !Number.isFinite(colIdx)) return null;

    return { viewIdx, colIdx };
  }

  _startSelectionFromCell(location: { viewIdx: number; colIdx: number }) {
    if (location.viewIdx < 0 || location.viewIdx >= this.core.getRowModel().getViewCount()) return;
    if (location.colIdx < 0 || location.colIdx >= this._leafColumns.length) return;
    this._selectionAnchor = { row: location.viewIdx, colIdx: location.colIdx };
    this._selectionRange = {
      rowStart: location.viewIdx,
      rowEnd: location.viewIdx,
      colStart: location.colIdx,
      colEnd: location.colIdx,
    };
    this._isSelecting = true;
    this._refreshSelectionStyles();
  }

  _updateSelectionRange(endRow: number, endCol: number) {
    if (!this._selectionAnchor) return;
    const viewCount = this.core.getRowModel().getViewCount();
    if (viewCount === 0 || this._leafColumns.length === 0) {
      this._clearSelection();
      return;
    }

    const maxRow = viewCount - 1;
    const maxCol = this._leafColumns.length - 1;

    const nextRow = Math.min(Math.max(endRow, 0), maxRow);
    const nextCol = Math.min(Math.max(endCol, 0), maxCol);

    this._selectionRange = {
      rowStart: Math.min(this._selectionAnchor.row, nextRow),
      rowEnd: Math.max(this._selectionAnchor.row, nextRow),
      colStart: Math.min(this._selectionAnchor.colIdx, nextCol),
      colEnd: Math.max(this._selectionAnchor.colIdx, nextCol),
    };

    this._refreshSelectionStyles();
  }

  _onCellMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    // this._clearColumnSelection();
    const location = this._getCellLocation(e.target);
    if (!location) return;
    e.preventDefault();
    this._startSelectionFromCell(location);
  }

  _onCellMouseMove(e: MouseEvent) {
    if (!this._isSelecting || !this._selectionAnchor) return;
    const location = this._getCellLocation(e.target);
    if (!location) return;
    this._updateSelectionRange(location.viewIdx, location.colIdx);
  }

  _onCellMouseUp() {
    if (!this._isSelecting) return;
    this._isSelecting = false;
  }

  _applyColumnSelectionStyles() {
    const leafIndexMap = new Map<string, number>();
    this.core.getColumnModel().getLeaves().forEach((c, idx) => leafIndexMap.set(c.instanceID, idx));

    const selectedLeafIdx = new Set<number>();
    this.core.getColumnModel().getLeaves().forEach((c, idx) => {
      if (this._selectedColumnIDs.has(c.instanceID)) selectedLeafIdx.add(idx);
    });

    const getRange = (col: Column | null): [number, number] | null => {
      if (!col) return null;
      if (col.hidden) return null;
      if (!col.children || col.children.length === 0) {
        const idx = leafIndexMap.get(col.instanceID);
        return idx == null ? null : [idx, idx];
      }
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const visit = (c: Column) => {
        if (isTrue(c.hidden)) return;
        if (!c.children || c.children.length === 0) {
          const idx = leafIndexMap.get(c.instanceID);
          if (idx == null) return;
          min = Math.min(min, idx);
          max = Math.max(max, idx);
          return;
        }
        for (const child of c.children) visit(child);
      };
      visit(col);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return [min, max];
    };

    const headers = this.root.querySelectorAll<HTMLElement>(".pte-hcell");
    headers.forEach(h => {
      const col = this.core.getColumnModel().getById(h.id);
      const selected = !!col && this._selectedColumnIDs.has(col.instanceID);
      const range = col ? getRange(col) : null;
      const leftSelected = !!range && selectedLeafIdx.has(range[0] - 1);
      const rightSelected = !!range && selectedLeafIdx.has(range[1] + 1);

      let parent = false;
      if (selected) {
        const tree = this.core.getColumnModel().getAncestors(col.instanceID);
        const treeLen = tree.length;
        if (treeLen > 1) {
          parent = this._selectedColumnIDs.has(tree[treeLen - 2].instanceID);
        }
      }

      h.classList.toggle("selected", selected);
      h.classList.toggle("selected-left", selected && !leftSelected);
      h.classList.toggle("not-selected-left", selected && leftSelected);
      h.classList.toggle("selected-right", selected && !rightSelected);
      h.classList.toggle("not-selected-right", selected && rightSelected);
      h.classList.toggle("selected-top", selected && !parent);
      h.classList.toggle("not-selected-top", selected && parent);

      const content = h.querySelector<HTMLElement>(".pte-hcell-content");
      if (content) content.classList.toggle("selected", selected);
    });
  }

  _toggleColumnSelection(colID: string) {
    this._clearSelection();
    const col = this.core.getColumnModel().getById(colID);
    if (!col) return;

    const leaves = col.getVisibleLeaves();
    const hasChildren = col.children.length > 0;

    if (hasChildren) {
      const ids = new Set<string>();
      for (const leaf of leaves) ids.add(leaf.instanceID);

      const allSelected = Array.from(ids).every(id => this._selectedColumnIDs.has(id));
      if (allSelected) {
        ids.forEach(id => this._selectedColumnIDs.delete(id));
      } else {
        ids.forEach(id => this._selectedColumnIDs.add(id));
      }
    } else {
      if (this._selectedColumnIDs.has(col.instanceID)) {
        this._selectedColumnIDs.delete(col.instanceID);
      } else {
        this._selectedColumnIDs.add(col.instanceID);
      }
    }

    const colsWithSelectedChildren = new Map<string, Column>();
    for (const selectedColID of this._selectedColumnIDs) {
      const col = this.core.getColumnModel().getById(selectedColID);
      if (!col) continue;
      if (col.children.length > 0) colsWithSelectedChildren.set(col.instanceID, col);
      else {
        const tree = this.core.getColumnModel().getAncestors(selectedColID);
        if (tree.length > 1) {
          tree.slice(0, -1).forEach(e => colsWithSelectedChildren.set(e.instanceID, e));
        }
      }
    }

    for (const col of colsWithSelectedChildren.values()) {
      const leaves = col.getVisibleLeaves();
      if (leaves.filter(l => this._selectedColumnIDs.has(l.instanceID)).length == leaves.length) {
        this._selectedColumnIDs.add(col.instanceID);
      } else {
        this._selectedColumnIDs.delete(col.instanceID);
      }
    }

    this._applyColumnSelectionStyles();
    this._refreshSelectionStyles();
  }

}
