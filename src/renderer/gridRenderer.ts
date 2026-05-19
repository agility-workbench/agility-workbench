import { RefObject } from "react";
import {
  AggregateModel,
  AggregateScope,
  AggregateType,
} from "../interfaces/aggregate";
import { MenuItem } from "../interfaces/menuItem";
import { ColDef } from "../interfaces/column";
import { RowPoolDef } from "./types";
import { isTrue } from "../misc";
import { exportCSV as downloadCSV, exportExcel as downloadExcel, ExportConfig, ExportOptions, ExportScope } from "../export/export";
import { RendererRecord } from "./renderer";
import { ServerSideAggregationSource, ServerSideRequest } from "../ssrm/serverSide";
import { IServerSideDataSource } from "../interfaces/serverSide";
import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { div } from "./element";
import { GridCore } from "../core/core";
import { GridIconMap } from "../theme/icons";
import {
  GridEventColumnsChangedParams,
  GridEventPaginationChangedParams,
  GridEventRowsChangedParams,
  GridEventViewportChangedParams,
} from "../events/events";
import { MenuCoordinator } from "../menu/coordinator";
import { MenuRenderer } from "./menuRenderer";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { createAggregateRow } from "./aggregate/wrapper";
import { BodyCellRenderer } from "./body/cellRenderer";
import { BodyPoolSizer } from "./body/poolSizer";
import { BodyRowPoolRenderer } from "./body/rowPool";
import { BodyViewportRenderer } from "./body/viewport";
import { BodyWindowRenderer } from "./body/window";
import { createBodyWrapper } from "./body/wrapper";
import { ColumnInteractionRenderer } from "./header/columnInteraction";
import { HeaderRenderer } from "./header/renderer";
import { createHeaderWrapper } from "./header/wrapper";
import { IconRenderer } from "./iconRenderer";
import { ColumnLayoutRenderer } from "./layout/columnLayout";
import { PinnedSectionLayoutRenderer } from "./layout/pinnedSectionLayout";
import { createLoadingOverlay, LoadingOverlayRenderer } from "./overlay/loading";
import { PaginationRenderer } from "./pagination/renderer";
import { createPaginationWrapper } from "./pagination/wrapper";
import { createHorizontalScroll } from "./scroll/horizontal";
import { GridScrollSyncRenderer } from "./scroll/sync";

export class GridRenderer {
  _menuRenderer: MenuRenderer;
  _iconRenderer: IconRenderer;
  _bodyCellRenderer: BodyCellRenderer;
  _bodyPoolSizer: BodyPoolSizer;
  _headerRenderer: HeaderRenderer;
  _paginationRenderer: PaginationRenderer;
  _bodyRowPoolRenderer: BodyRowPoolRenderer;
  _bodyViewportRenderer: BodyViewportRenderer;
  _bodyWindowRenderer: BodyWindowRenderer;
  _columnInteractionRenderer: ColumnInteractionRenderer;
  _columnLayoutRenderer: ColumnLayoutRenderer;
  _pinnedSectionLayoutRenderer: PinnedSectionLayoutRenderer;
  _loadingOverlayRenderer: LoadingOverlayRenderer;
  _scrollSyncRenderer: GridScrollSyncRenderer;
  _containerEl!: HTMLElement;
  rowHeight: number = 43;
  height?: number;
  _externalLoading: boolean = false;
  _exportAsCSV: boolean = true;
  _exportAsExcel: boolean = true;
  _loadingOverlay: HTMLDivElement;

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

  _menuOverlay: HTMLDivElement;
  _submenuOverlay: HTMLDivElement;
  _menuOverlays: HTMLDivElement[];
  _menuItemsByLevel: MenuItem[][];
  _menuParentIds: (string | null)[];
  _menuOpenParentEls: (HTMLElement | null)[];
  _menuOpenTimers: (number | NodeJS.Timeout)[];
  _menuColKey: string | null;

  _filterOverlay: HTMLDivElement;
  _filterColID: string | null;

  _poolSize: number = 0;
  _startIndex: number = 0;
  _rowPool: RowPoolDef[];
  private _aggregateRemoteValues: Map<string, any> | null = null;
  private _aggregateRemoteDirty = true;
  private _aggregateRequestSeq = 0;
  private _aggregateFetchInFlight = false;
  private _serverSidePendingRangeKeys: Set<string> = new Set();

  private get rowModel() {
    return this.core.getRowModel();
  }

  _measureCache: Map<string, Map<string, number>>;

  constructor(
    private core: GridCore,
    private menuCoordinator: MenuCoordinator,
    private filterMenuCoordinator: FilterMenuCoordinator,
  ) {
    this._measureCtx = null;
    this._measureCache = new Map();
    this._columnWidths = new Map();

    // DOM skeleton
    this.root = div("pte-root");
    this.root.dataset.pteGridId = this.core.id;
    this.root.style.position = "relative";
    this._iconRenderer = new IconRenderer(this.root, this.core.id);
    this.setIcons(this.core.getOptions().icons);

    this._menuRenderer = new MenuRenderer(this.root);
    this._bodyCellRenderer = new BodyCellRenderer();

    const headerWrapper = createHeaderWrapper();
    this.headerWrapper = headerWrapper.wrapper;
    this.root.appendChild(this.headerWrapper);
    this.leftHeader = headerWrapper.left;
    this.header = headerWrapper.center;
    this.rightHeader = headerWrapper.right;

    const bodyWrapper = createBodyWrapper();
    this.body = bodyWrapper.body;
    this.root.appendChild(this.body);
    this.leftScroller = bodyWrapper.leftScroller;
    this.scroller = bodyWrapper.centerScroller;
    this.rightScroller = bodyWrapper.rightScroller;
    this._headerRenderer = new HeaderRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      headerWrapper: this.headerWrapper,
      leftHeader: this.leftHeader,
      centerHeader: this.header,
      rightHeader: this.rightHeader,
      body: this.body,
      getContainerEl: () => this._containerEl,
    });

    const aggregateRow = createAggregateRow(this.rowHeight, (e) => {
      e.stopPropagation();
      this._setAggregateScope("none");
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.value = "none";
      }
    });
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
    this.root.appendChild(this.aggregateRow);

    const horizontalScroll = createHorizontalScroll();
    this.hScrollContainer = horizontalScroll.container;
    this.root.appendChild(this.hScrollContainer);
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
    this._bodyViewportRenderer = new BodyViewportRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      body: this.body,
      leftSpacer: this.leftSpacer,
      centerSpacer: this.spacer,
      rightSpacer: this.rightSpacer,
      vScrollParent: this.vScrollParent,
      vScroller: this.vScroller,
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
      onWindowUpdate: (scrollSrc) => this._updateWindow(false, scrollSrc),
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
      beginScrollSync: (targets) => this._beginScrollSync(targets),
      setStartIndex: (startIndex) => {
        this._startIndex = startIndex;
      },
      renderCell: (cell, row, col, cellRendererMap) => this._renderCell(cell, row, col, cellRendererMap),
      applySelectionToSlot: (slot, viewIndex) => this._applySelectionToSlot(slot, viewIndex),
    });

    this.paginator = createPaginationWrapper();
    this.root.appendChild(this.paginator);
    this._paginationRenderer = new PaginationRenderer({
      core: this.core,
      paginator: this.paginator,
      resetScrollPosition: () => this._resetScrollPosition(),
    });
    this._bodyPoolSizer = new BodyPoolSizer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      height: () => this.height,
      getContainerEl: () => this._containerEl,
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

    this._menuColKey = null;
    this._menuOverlays = [];
    this._menuItemsByLevel = [];
    this._menuParentIds = [];
    this._menuOpenParentEls = [];
    this._menuOpenTimers = [];
    this._filterColID = null;

    // this._exportAsCSV = exportAsCSV;
    // this._exportAsExcel = exportAsExcel;

    // Overlays
    this._menuOverlay = document.createElement("div");
    this._submenuOverlay = document.createElement("div");
    this._initMenuOverlay();
    this._filterOverlay = document.createElement("div");
    this._initFilterOverlay();
    this._loadingOverlay = createLoadingOverlay();
    this.root.appendChild(this._loadingOverlay);
    this._loadingOverlayRenderer = new LoadingOverlayRenderer(this._loadingOverlay);
    this._updateLoadingOverlay();

    // Create a pooled set of row nodes
    // this._poolSize = this._computePoolSize();
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    // this._buildHeaderDOM();
    // this._buildRowPool();

    // Events
    this._pinnedSectionLayoutRenderer.bind();
    this._scrollSyncRenderer.bind();

    // header sort click delegation
    // this.header.addEventListener("click", (e) => this._headerCellClickHandler(e));

    this.headerWrapper.addEventListener("mousedown", (e) => this._onHeaderMouseDown(e));
    this.headerWrapper.addEventListener("contextmenu", (e) => this._headerCellContextMenuHandler(e));
    this.headerWrapper.addEventListener("dblclick", (e) => this._onHeaderDoubleClick(e));
    this.body.addEventListener("mousedown", (e) => this._onCellMouseDown(e));
    document.addEventListener("mousemove", (e) => {
      this._onColumnResizeMouseMove(e);
      this._onColumnDragMouseMove(e);
      this._onCellMouseMove(e);
    });
    document.addEventListener("mouseup", () => {
      this._onColumnResizeMouseUp();
      this._onColumnDragMouseUp();
      this._onCellMouseUp();
    });
    document.addEventListener("click", (e) => {
      if (this._columnInteractionRenderer.consumeSuppressClick()) return;
      this._cellClickHandler(e);
    });
    document.addEventListener("mouseover", (e) => {
      this.body.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
      const row = (e.target as HTMLElement)?.closest(".pte-row");
      if (row) {
        this.body.querySelectorAll(`.pte-row[row-id="${row.getAttribute("row-id")}"]`).forEach(r => r.classList.add("pte-row-hover"));
      }
    });

    // initial
    // requestAnimationFrame(() => this._maybeUpdatePoolSize());
    // this._recomputeView();
    // this._updateColumnWidths();
    // this._updateWindow(true, undefined);
    // if (this.rowModel.getType() === "serverSide" && this.rowModel.isValid()) {
    //   this._fetchServerSideRows("init");
    // }
    this.setup();
  }

  attach(container: RefObject<HTMLElement | null>) {
    if (!container.current) {
      throw new Error("Table container ref is not attached");
    }
    this._containerEl = container.current;
    this._containerEl.appendChild(this.root);
  }

  detach() {
    this._containerEl = document.createElement("div");
  }

  private setup() {
    this.core.on("overlayShow", (ev: { overlayType: "loading" | "noRows" | "none" }) => {
      this.setLoading(ev.overlayType === "loading" || ev.overlayType === "noRows");
    });
    this.core.on("modelUpdated", () => {
      this.buildPaginationControls();
    });
    this.core.on("viewportChanged", (params: GridEventViewportChangedParams) => this._maybeUpdatePoolSize(params));
    this.core.on("columnsChanged", (params: GridEventColumnsChangedParams) => this.onColumnsChanged(params));
    this.core.on("rowsChanged", (params: GridEventRowsChangedParams) => this.onDataChanged(params));
    this.core.on("paginationChanged", (params: GridEventPaginationChangedParams) => this._updatePaginationControls(params));
  }

  _getBodyHeight() {
    return this._bodyPoolSizer.getBodyHeight();
  }

  _computePoolSize(rowHeightPx: number, overscanRowCount: number) {
    return this._bodyPoolSizer.computePoolSize(rowHeightPx, overscanRowCount);
  }

  _maybeUpdatePoolSize(params?: GridEventViewportChangedParams) {
    const rowHeightPx = params?.rowHeightPx ?? this.core.getOptions().rowHeight ?? this.rowHeight;
    const overscanRowCount = params?.overscanRowCount ?? this.core.getOptions().overscanRowCount ?? 0;
    this.rowHeight = rowHeightPx;
    const poolSize = this._computePoolSize(rowHeightPx, overscanRowCount);
    if (poolSize === this._poolSize) return;
    this._poolSize = poolSize;
    this._rebuildRowPool();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
    this.buildPaginationControls();
  }

  // ---------------- Public API ----------------
  togglePagination(pagination: boolean) {
    const current = this.core.getPaginationInfo();
    const next = isTrue(pagination);
    if (current.paginationEnabled === next) return;
    this._resetScrollPosition();
    this.core.dispatch({
      type: "paginationSet",
      enabled: next,
      pageIndex: 0,
      pageSize: current.pageSize,
    });
  }

  setLoading(isLoading: boolean) {
    const next = isTrue(isLoading);
    if (this._externalLoading === next) return;
    this._externalLoading = next;
    this._updateLoadingOverlay();
  }

  setIcons(icons?: GridIconMap) {
    this._iconRenderer.setIcons(icons);
  }

  setServerSideDataSource(dataSource?: IServerSideDataSource) {
    this.core.setServerSideDataSource(dataSource ?? null);
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  setServerSideAggregation(aggregation?: ServerSideAggregationSource) {
    this.core.setServerSideAggregationSource(aggregation ?? null);
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  refreshServerSideData() {
    if (this.core.getRowModel().getType() !== "serverSide") return;
    this.core.refreshRows("refresh");
  }

  onDataChanged(params: GridEventRowsChangedParams) {
    // this._clearSelection();
    // this._resetScrollPosition();
    console.log(params);
    if (params.reason === "viewport") {
      this._serverSidePendingRangeKeys.delete(`${params.firstRowIndex}:${params.lastRowIndex}`);
    } else {
      this._serverSidePendingRangeKeys.clear();
    }
    if (params.reason !== "sort") {
      this._recomputeView();
    }
    // this._updateColumnWidths();
    this._updateWindow(true, undefined, params);
    if (this.rowModel.getType() !== "serverSide" || (params.reason !== "viewport" && params.firstRowIndex === 0)) {
      this._resetScrollPosition();
    }
    this._updatePaginationControls();
  }

  onColumnsChanged(params: GridEventColumnsChangedParams) {
    console.log(params);
    // this._clearSelection();
    // this._clearColumnSelection();
    let rebuiltRows = false;
    if (params.reason === "sort") {
      const sorts = this.core.getSortModel().items;
      for (const colID of params.changedColIds || []) {
        const sort = sorts.find(s => s.col.instanceID === colID);
        this._addSortIndicatorToHeader(colID, sort?.dir || '');
      }
    } else if (params.reason === "filter") {
      this._setFilterIndicators();
    } else if (params.reason === "visibility") {
      this._buildRowPool();
      this._buildHeaderDOM(params.reason);
      rebuiltRows = true;
    } else if (params.reason === "state") {
      this._buildRowPool();
      this._buildHeaderDOM(params.reason);
      this._updateColumnWidths();
      rebuiltRows = true;
    } else if (params.reason !== "resize") {
      this._buildRowPool();
      this._buildHeaderDOM(params.reason);
      rebuiltRows = true;
    } else {
      this._updateColumnWidths(params.changedColIds || []);
    }
    if (rebuiltRows) {
      this._updateWindow(true, undefined);
    }
  }

  exportCSV(options: ExportOptions = {}) {
    this._performExport("csv", options);
  }

  exportExcel(options: ExportOptions = {}) {
    this._performExport("excel", options);
  }

  _exportColumnCSV(columnIDs: string[] | null = []) {
    const selectedColumns = columnIDs || [...this._selectedColumnIDs];
    let fileName = "Export";
    if (selectedColumns.length == 1) {
      fileName = this.core.getColumnModel().getById(selectedColumns[0])?.label || fileName;
    }
    this._performExport("csv", {
      scope: "all",
      columnIds: selectedColumns,
      fileName: fileName,
    });
  }

  _exportColumnXLSX(columnIDs: string[] | null = []) {
    const selectedColumns = columnIDs || [...this._selectedColumnIDs];
    let fileName = "Export";
    if (selectedColumns.length == 1) {
      fileName = this.core.getColumnModel().getById(selectedColumns[0])?.label || fileName;
    }
    this._performExport("excel", {
      scope: "all",
      columnIds: selectedColumns,
      fileName: fileName,
    });
  }

  _performExport(format: "csv" | "excel", options: ExportOptions = {}) {
    const config = this._buildExportConfig(options);
    if (!config) return;

    const fileName = options.fileName ?? this._defaultExportFileName(format, options);
    if (format === "csv") {
      downloadCSV(config, fileName);
    } else {
      downloadExcel(config, fileName);
    }
  }

  _buildExportConfig(options: ExportOptions): ExportConfig | null {
    const scope = this._resolveExportScope(options);
    const columns = this._leafColumns?.length ? this._leafColumns.slice() : [];
    if (!columns.length) return null;

    let rows: any[] = [];
    let selectionRange = null;
    let selectedColumnIDs: Set<string> | undefined;

    if (scope === "selection" && this._selectionRange) {
      rows = this._getRowsForSelectionExport();
      selectionRange = { ...this._selectionRange };
    } else if (scope === "selectedColumns") {
      rows = this._getRowsForExport(true);
      selectedColumnIDs = this._selectedColumnIDs;
    } else {
      rows = this._getRowsForExport(true);
    }

    if (!rows || rows.length === 0) return null;

    return {
      rows,
      columns,
      selectionRange,
      selectedColumnIDs,
      columnIds: options.columnIds,
      includeHeaders: options.includeHeaders,
      columnTree: this.core.getColumnModel().getColumns(),
      columnWidths: this._columnWidths,
    };
  }

  _resolveExportScope(options: ExportOptions): ExportScope {
    if (options.scope) return options.scope;
    if (options.columnIds && options.columnIds.length > 0) return "all";
    if (this._selectionRange) return "selection";
    if (this._selectedColumnIDs.size > 0) return "selectedColumns";
    return "all";
  }

  _getRowsForExport(includeAllRows: boolean): any[] {
    const rows: any[] = [];
    if (includeAllRows) {
      this.core.getRowModel().forEachNodeAfterFilterAndSort((node) => {
        rows.push(node.data);
      });
      return rows;
    }

    for (let i = 0; i < this.core.getRowModel().getViewCount(); i++) {
      const node = this.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  _getRowsForSelectionExport(): any[] {
    if (!this._selectionRange) return [];
    const rows: any[] = [];
    const rowStart = Math.max(0, this._selectionRange.rowStart);
    const rowEnd = Math.min(this.core.getRowModel().getViewCount() - 1, this._selectionRange.rowEnd);
    for (let i = rowStart; i <= rowEnd; i++) {
      const node = this.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  _defaultExportFileName(format: "csv" | "excel", options: ExportOptions): string {
    const ext = format === "csv" ? "csv" : "xlsx";
    if (options.columnIds && options.columnIds.length === 1) {
      const col = this.core.getColumnModel().getById(options.columnIds[0]);
      if (col) return `${col.label ?? col.key}.${ext}`;
    }
    const scope = this._resolveExportScope(options);
    if (scope === "selection") return `grid-selection.${ext}`;
    if (scope === "selectedColumns") return `grid-columns.${ext}`;
    return `grid-all.${ext}`;
  }

  destroy() {
    this._pinnedSectionLayoutRenderer.destroy();
    this.root.remove();
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

  _showSparklinesForSelectedColumns(type: "line" | "bar" | "column") {
    const selectedLeaves = this._leafColumns.filter(col => this._selectedColumnIDs.has(col.instanceID));
    const numericLeaves = selectedLeaves.filter(col => col.isComputableType());
    if (numericLeaves.length < 2) return;

    const keyBase = "sparkline";
    const existingKeys = new Set(this._leafColumns.map(col => col.key));
    let key = keyBase;
    let suffix = 1;
    while (existingKeys.has(key)) {
      key = `${keyBase}_${suffix}`;
      suffix += 1;
    }

    const pinnedSet = new Set(numericLeaves.map(col => col.pinned ?? null));
    const pinned = pinnedSet.size === 1 ? (Array.from(pinnedSet)[0] as "left" | "right" | null) : null;

    const sparklineCol: ColDef = {
      key,
      label: `Sparkline ${suffix > 1 ? suffix : ''}`,
      sparklineType: type,
      pinned: pinned ?? undefined,
      sortable: false,
      groupable: false,
      minWidth: 120,
      valueGetter: (row: any) => numericLeaves.map(col => this._getRawCellValue(row, col)),
    };

    this.core.dispatch({
      type: "columnDefsSet",
      defs: [...this.core.getColumnModel().getColumns().map(col => col.col), sparklineCol],
    });
    this._clearColumnSelection();
  }

  _clearAggregates() {
    if (this.core.getAggregateModel().length === 0) return;
    this.core.setAggregateModel([]);
    this._setAggregateScope("none");
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _markAggregatesDirty() {
    if (this.rowModel.getType() !== "serverSide") return;
    this._aggregateRemoteDirty = true;
    this._aggregateRemoteValues = null;
    this._aggregateRequestSeq++;
    this._aggregateFetchInFlight = false;
  }

  _setAggregateScope(scope: AggregateScope) {
    const changed = scope !== this.core.getAggregateScope();
    this.core.setAggregateScope(scope);
    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.value = scope;
    }
    this._markAggregatesDirty();
    this._maybeRequestServerAggregates();
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

  _valueToNumber(value: any): number | null {
    if (value == null) return null;
    const num = value instanceof Date ? value.getTime() : Number(value);
    return Number.isFinite(num) ? num : null;
  }

  _calculateAggregate(col: Column, aggType: AggregateType, rows: any[]): any {
    if (aggType === AggregateType.COUNT) {
      return rows.length;
    }

    const rawValues = rows.map(row => this._getRawCellValue(row, col)).filter(v => v != null);
    if (rawValues.length === 0) {
      if (aggType === AggregateType.SUM || aggType === AggregateType.AVG || aggType === AggregateType.MEDIAN) return 0;
      return "";
    }

    const collator = col.getCollator();
    const isNumeric = col.isComputableType();

    switch (aggType) {
      case AggregateType.SUM: {
        const nums = rawValues
          .map(v => this._valueToNumber(v))
          .filter((v): v is number => Number.isFinite(v));
        return nums.reduce((sum, v) => sum + v, 0);
      }
      case AggregateType.AVG: {
        const nums = rawValues
          .map(v => this._valueToNumber(v))
          .filter((v): v is number => Number.isFinite(v));
        if (nums.length === 0) return 0;
        const sum = nums.reduce((acc, v) => acc + v, 0);
        return sum / nums.length;
      }
      case AggregateType.MEDIAN: {
        const nums = rawValues
          .map(v => this._valueToNumber(v))
          .filter((v): v is number => Number.isFinite(v))
          .sort((a, b) => a - b);
        if (nums.length === 0) return 0;
        const mid = Math.floor(nums.length / 2);
        if (nums.length % 2 === 0) {
          return (nums[mid - 1] + nums[mid]) / 2;
        }
        return nums[mid];
      }
      case AggregateType.MIN: {
        let best: any = null;
        for (const v of rawValues) {
          if (best == null) {
            best = v;
            continue;
          }
          if (isNumeric) {
            const next = this._valueToNumber(v);
            const prev = this._valueToNumber(best);
            if (next == null) continue;
            if (prev == null || next < prev) {
              best = v;
            }
          } else {
            const cmp = collator.compare(String(v), String(best));
            if (cmp < 0) best = v;
          }
        }
        return best ?? "";
      }
      case AggregateType.MAX: {
        let best: any = null;
        for (const v of rawValues) {
          if (best == null) {
            best = v;
            continue;
          }
          if (isNumeric) {
            const next = this._valueToNumber(v);
            const prev = this._valueToNumber(best);
            if (next == null) continue;
            if (prev == null || next > prev) {
              best = v;
            }
          } else {
            const cmp = collator.compare(String(v), String(best));
            if (cmp > 0) best = v;
          }
        }
        return best ?? "";
      }
      default:
        return "";
    }
  }

  _formatAggregateDisplay(col: Column, value: any): string {
    if (value == null) return "";
    try {
      return col.formatValue(value, { data: null } as IRowNode);
    } catch {
      return String(value);
    }
  }

  private _getRawCellValue(row: any, col: Column): any {
    if (row && typeof row === "object" && "data" in row) {
      return col.getValue(row as IRowNode);
    }
    return col.getValue({ data: row } as IRowNode);
  }

  _getAggregateRows(): any[] {
    if (this.core.getAggregateScope() === "all") {
      const rows: any[] = [];
      this.core.getRowModel().forEachNodeAfterFilterAndSort((node) => rows.push(node.data));
      return rows;
    }
    return this._getRowsForExport(false);
  }

  _maybeRequestServerAggregates() {
    if (this.rowModel.getType() !== "serverSide") return;
    if (this.core.getAggregateScope() !== "all") return;
    const serverAggregationSource = (this.rowModel as any).serverAggregationSource as ServerSideAggregationSource | undefined;
    if (!serverAggregationSource) return;
    const aggregateMap = this._getAggregateMap();
    if (aggregateMap.size === 0) return;
    if (!this._aggregateRemoteDirty && this._aggregateRemoteValues) return;
    if (this._aggregateFetchInFlight) return;

    const aggregates = Array.from(aggregateMap.entries())
      .map(([colId, type]) => {
        const col = this.core.getColumnModel().getById(colId);
        if (!col) return null;
        return { key: col.key, type };
      })
      .filter(Boolean) as Array<AggregateModel>;

    if (aggregates.length === 0) return;

    if (aggregates.length < this._leafColumns.length) {
      const missingLeaves = this._leafColumns.filter(l => aggregates.findIndex(f => f.key == l.key) < 0);
      aggregates.push(...missingLeaves.map(m => ({ key: m.key, type: AggregateType.COUNT })) as Array<AggregateModel>);
    }

    const filtersByKey = new Map<string, ServerSideRequest["filters"][number]>();
    for (const item of this.core.getFilterModel().items) {
      filtersByKey.set(item.col.key, {
        key: item.col.key,
        filters: item.filters.map(filter => ({ type: filter.type, values: filter.values })),
        join: item.join,
      });
    }
    const filters: ServerSideRequest["filters"] = Array.from(filtersByKey.values());

    const sortsByKey = new Map<string, ServerSideRequest["sorts"][number]>();
    for (const item of this.core.getSortModel().items) {
      sortsByKey.set(item.col.key, {
        key: item.col.key,
        dir: item.dir,
      });
    }
    const sorts: ServerSideRequest["sorts"] = Array.from(sortsByKey.values());

    this._aggregateFetchInFlight = true;
    this._aggregateRemoteDirty = false;
    const requestId = ++this._aggregateRequestSeq;
    new Promise<any>((resolve, reject) => {
      const maybePromise = serverAggregationSource({
        request: {
          aggregates,
          aggregateScope: "all",
          filters,
          sorts,
          startRow: undefined,
          endRow: undefined,
        },
        success: resolve,
        error: reject,
      });
      Promise.resolve(maybePromise)
        .then((maybeResult) => {
          if (maybeResult && typeof maybeResult === "object") {
            resolve(maybeResult);
          }
        })
        .catch(reject);
    })
      .then((result) => {
        if (requestId !== this._aggregateRequestSeq) return;
        const valuesObj = (result as any)?.values ?? result ?? {};
        const map = new Map<string, any>();
        for (const col of this._leafColumns) {
          const v = valuesObj?.[col.instanceID] ?? valuesObj?.[col.key];
          if (v != null) {
            map.set(col.instanceID, v);
          }
        }
        this._aggregateRemoteValues = map;
        this._aggregateFetchInFlight = false;
        this._renderAggregateRow();
      })
      .catch((err) => {
        console.error("Failed to fetch server-side aggregates", err);
        if (requestId !== this._aggregateRequestSeq) return;
        this._aggregateRemoteValues = null;
        this._aggregateFetchInFlight = false;
        this._renderAggregateRow();
      });
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
        this._updateColumnWidths();
        this._maybeUpdatePoolSize();
      }
      return;
    }

    const values = new Map<string, string>();
    const serverAggregationSource = (this.rowModel as any).serverAggregationSource as ServerSideAggregationSource | undefined;
    if (this.rowModel.getType() === "serverSide" && aggregateScope === "all" && serverAggregationSource) {
      this._maybeRequestServerAggregates();
      const remote = this._aggregateRemoteValues;
      for (const col of this._leafColumns) {
        if (col.hidden) continue;
        const v = remote?.get(col.instanceID);
        const display = v == null ? "" : this._formatAggregateDisplay(col, v);
        values.set(col.instanceID, display ?? "");
      }
    } else {
      const rows = this._getAggregateRows();
      for (const col of this._leafColumns) {
        if (col.hidden) continue;
        const op = this._getAggregateOpForColumn(col);
        const raw = this._calculateAggregate(col, op, rows);
        const display = this._formatAggregateDisplay(col, raw);
        values.set(col.instanceID, display ?? "");
      }
    }

    const apply = (cells: HTMLDivElement[], cols: Column[]) => {
      let idx = -1;
      for (const col of cols) {
        if (col.hidden) continue;
        idx++;
        const cell = cells[idx];
        if (!cell) continue;
        if (cell.children.length > 0) cell.innerHTML = "";
        const aggFn = aggregateMap.get(col.instanceID) || AggregateType.COUNT;
        const icon = document.createElement("div");
        icon.className = "pte-aggregate-icon";
        let suffix = "";
        if ([AggregateType.MIN, AggregateType.MAX].includes(aggFn)) {
          suffix = "-" + (col.isComputableType() ? "number" : "string");
        }
        icon.classList.add("icon-" + aggFn + suffix);
        icon.title = aggFn[0].toUpperCase() + aggFn.substring(1);
        cell.appendChild(icon);
        const content = document.createElement("div");
        content.className = "pte-aggregate-cell-content";
        content.textContent = values.get(col.instanceID) ?? "";
        cell.appendChild(content);
        if (content.scrollWidth > content.clientWidth) {
          content.title = values.get(col.instanceID) ?? "";
        }
      }
    };

    apply(this._aggregateLeftCells, this._leftPinnedLeafColumns);
    apply(this._aggregateCells, this._centerLeafColumns);
    apply(this._aggregateRightCells, this._rightPinnedLeafColumns);

    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.disabled = aggregateMap.size === 0;
    }

    if (wasVisible !== shouldShow) {
      this._updateColumnWidths();
      this._maybeUpdatePoolSize();
    }
  }

  _getAggregateRowHeight(): number {
    return this._aggregateVisible ? this.rowHeight : 0;
  }

  _recomputeView() {
    this._bodyViewportRenderer.recomputeView();

    // this._updatePaginationControls();
    // this._clampSelectionToView();
    // this._renderAggregateRow();
  }

  // ---------------- Internals: DOM build ----------------
  _applyLeftColumnWidths(colIDs: string[] = []): number {
    return this._columnLayoutRenderer.applyLeftColumnWidths(colIDs);
  }

  _applyCenterColumnWidths(colIDs: string[] = []): number {
    return this._columnLayoutRenderer.applyCenterColumnWidths(colIDs);
  }

  _applyRightColumnWidths(colIDs: string[] = []): number {
    return this._columnLayoutRenderer.applyRightColumnWidths(colIDs);
  }

  _updateColumnWidths(colIDs: string[] = []) {
    this._columnLayoutRenderer.updateColumnWidths(colIDs);
  }

  _buildHeaderCell(col: Column, maxDepth: number): HTMLDivElement {
    return this._headerRenderer.buildHeaderCell(col, maxDepth);
  }

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

  _populatePageSelect(pageIndex: number, totalPageCount: number) {
    this._paginationRenderer.populatePageSelect(pageIndex, totalPageCount);
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

  _goToPage(pageIdx: number) {
    this._paginationRenderer.goToPage(pageIdx);
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
    this.aggregateLeft.innerHTML = "";
    this.aggregateCenter.innerHTML = "";
    this.aggregateRight.innerHTML = "";
    this._aggregateLeftCells = [];
    this._aggregateCells = [];
    this._aggregateRightCells = [];

    const makeRow = () => {
      const row = document.createElement("div");
      row.className = "pte-row";
      row.style.height = `${this.rowHeight}px`;
      return row;
    };

    if (this._leftPinnedLeafColumns.length > 0) {
      const row = makeRow();
      let leftIdx = 0;
      for (const col of this._leftPinnedLeafColumns) {
        if (col.hidden) continue;
        const cell = document.createElement("div");
        cell.className = "pte-cell pte-aggregate-cell";
        const meta = this._leafColumnLookup.get(col.instanceID);
        if (meta) {
          cell.dataset.colId = col.instanceID;
          cell.dataset.colIdx = String(meta.globalIndex);
        } else {
          cell.dataset.colIdx = String(leftIdx);
        }
        if (col.isComputableType()) cell.classList.add("pte-cell-right-aligned");
        row.appendChild(cell);
        this._aggregateLeftCells.push(cell);
        leftIdx++;
      }
      this.aggregateLeft.appendChild(row);
      this.aggregateLeftRow = row;
    } else {
      this.aggregateLeftRow = undefined;
    }

    const centerRow = makeRow();
    let centerIdx = 0;
    for (const col of this._centerLeafColumns) {
      if (col.hidden) continue;
      const cell = document.createElement("div");
      cell.className = "pte-cell pte-aggregate-cell";
      const meta = this._leafColumnLookup.get(col.instanceID);
      if (meta) {
        cell.dataset.colId = col.instanceID;
        cell.dataset.colIdx = String(meta.globalIndex);
      } else {
        cell.dataset.colIdx = String(centerIdx);
      }
      if (col.isComputableType()) cell.classList.add("pte-cell-right-aligned");
      centerRow.appendChild(cell);
      this._aggregateCells.push(cell);
      centerIdx++;
    }
    this.aggregateCenter.appendChild(centerRow);
    this.aggregateCenterRow = centerRow;

    if (this._rightPinnedLeafColumns.length > 0) {
      const row = makeRow();
      let rightIdx = 0;
      for (const col of this._rightPinnedLeafColumns) {
        if (col.hidden) continue;
        const cell = document.createElement("div");
        cell.className = "pte-cell pte-aggregate-cell";
        const meta = this._leafColumnLookup.get(col.instanceID);
        if (meta) {
          cell.dataset.colId = col.instanceID;
          cell.dataset.colIdx = String(meta.globalIndex);
        } else {
          cell.dataset.colIdx = String(rightIdx);
        }
        if (col.isComputableType()) cell.classList.add("pte-cell-right-aligned");
        row.appendChild(cell);
        this._aggregateRightCells.push(cell);
        rightIdx++;
      }
      this.aggregateRight.appendChild(row);
      this.aggregateRightRow = row;
    } else {
      this.aggregateRightRow = undefined;
    }

    this.aggregateRow.style.height = `${this.rowHeight}px`;
    this.aggregateRow.style.minHeight = `${this.rowHeight}px`;
    this.aggregateRow.style.maxHeight = `${this.rowHeight}px`;
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

  _addSortIndicatorToHeader(key: string, dir: "asc" | "desc" | '') {
    this._headerRenderer.addSortIndicatorToHeader(key, dir);
  }

  // ---------------- Internals: hot path ----------------
  _scheduleWindowUpdate(scrollSrc: HTMLDivElement) {
    this._scrollSyncRenderer.scheduleWindowUpdate(scrollSrc);
  }

  _beginScrollSync(targets: HTMLDivElement[]) {
    this._scrollSyncRenderer.beginScrollSync(targets);
  }

  _renderCell(cell: HTMLDivElement, row: IRowNode, col: Column, cellRendererMap: Map<string, RendererRecord>) {
    this._bodyCellRenderer.renderCell(cell, row, col, cellRendererMap);
  }

  _updateWindow(forcePatch: boolean, scrollSrc?: HTMLDivElement, params?: GridEventRowsChangedParams) {
    this._bodyWindowRenderer.update(forcePatch, scrollSrc, params);
  }

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

  _onHeaderMouseDown(e: MouseEvent) {
    this._columnInteractionRenderer.onHeaderMouseDown(e);
  }

  _onColumnResizeMouseMove(e: MouseEvent) {
    this._columnInteractionRenderer.onColumnResizeMouseMove(e);
  }

  _onColumnResizeMouseUp() {
    this._columnInteractionRenderer.onColumnResizeMouseUp();
  }

  _onColumnDragMouseMove(e: MouseEvent) {
    this._columnInteractionRenderer.onColumnDragMouseMove(e);
  }

  _onColumnDragMouseUp() {
    this._columnInteractionRenderer.onColumnDragMouseUp();
  }

  _onHeaderDoubleClick(e: MouseEvent) {
    this._columnInteractionRenderer.onHeaderDoubleClick(e);
  }

  _updateAncestorWidths(colID: string) {
    const ancestors = this.core.getColumnModel().getAncestors(colID);
    if (ancestors.length <= 1) return;

    for (let i = ancestors.length - 2; i >= 0; i--) {
      const ancestor = ancestors[i];
      const ancestorInfo = this._columnWidths.get(ancestor.instanceID);
      if (ancestorInfo?.fixed) continue;
      if (!ancestor.children || ancestor.children.length === 0) continue;
      let totalWidth = 0;
      for (const child of ancestor.children) {
        if (isTrue(child.hidden)) continue;
        const childInfo = this._columnWidths.get(child.instanceID);
        if (childInfo) totalWidth += childInfo.width;
      }
      const minWidth = Math.max(this.core.options.minResizeWidth, ancestor.minWidth ?? ancestorInfo?.minWidth ?? this.core.options.minResizeWidth);
      let maxWidth = ancestor.maxWidth ?? ancestorInfo?.maxWidth ?? 420;
      maxWidth = Math.max(maxWidth, totalWidth);
      const width = Math.min(Math.max(totalWidth, minWidth), maxWidth);
      this._columnWidths.set(ancestor.instanceID, {
        width,
        minWidth,
        maxWidth,
        fixed: false,
      });
    }
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

  _toggleColumnGroupExpanded(colID: string) {
    this.core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: colID });
  }

  // ---------------- Menus ----------------
  _initMenuOverlay() {
    this._menuOverlays = [this._menuOverlay, this._submenuOverlay];
    this._menuOverlays.forEach((overlay, level) => this._prepareMenuOverlay(overlay, level));

    // Close on click outside
    document.addEventListener("mousedown", (e) => {
      const hasOpenMenu = this._menuOverlays.some((overlay) => overlay.style.display !== "none");
      if (!hasOpenMenu) return;
      const target = e.target as Node | null;
      if (!target) return;
      const insideMenu = this._menuOverlays.some((overlay) =>
        overlay.style.display !== "none" && overlay.contains(target)
      );
      if (!insideMenu) this._closeMenu();
    });

    // Close on Esc
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._closeMenu();
    });
  }

  _prepareMenuOverlay(overlay: HTMLDivElement, level: number) {
    overlay.className = level === 0 ? "pte-menu" : "pte-menu pte-submenu";
    overlay.style.position = "fixed";
    overlay.style.zIndex = `${9999 + level}`;
    overlay.style.display = "none";
    overlay.style.visibility = "hidden";
    this.root.appendChild(overlay);
    overlay.addEventListener("mousemove", (e) => this._handleMenuMouseMove(level, e));
    overlay.addEventListener("click", (e) => this._handleMenuClick(level, e));
  }

  _ensureMenuOverlay(level: number) {
    if (this._menuOverlays[level]) return this._menuOverlays[level];
    const overlay = document.createElement("div");
    this._menuOverlays[level] = overlay;
    this._prepareMenuOverlay(overlay, level);
    return overlay;
  }

  _getMenuBounds() {
    const r = this.root.getBoundingClientRect();
    return {
      left: r.left + 8,
      top: r.top + 8,
      right: r.right - 8,
      bottom: r.bottom - 8,
    };
  }

  _getMenuItemById(level: number, id: string | null) {
    if (!id) return null;
    return this._menuItemsByLevel[level]?.find(x => x.id === id) || null;
  }

  _setMenuParentExpanded(level: number, btn: HTMLElement) {
    const prev = this._menuOpenParentEls[level];
    if (prev && prev !== btn) prev.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-expanded", "true");
    this._menuOpenParentEls[level] = btn;
  }

  _hideMenuLevels(fromLevel: number) {
    for (let level = fromLevel; level < this._menuOverlays.length; level++) {
      const overlay = this._menuOverlays[level];
      if (!overlay) continue;
      overlay.style.display = "none";
      overlay.style.opacity = "0";
      overlay.style.visibility = "hidden";
    }

    for (let level = fromLevel; level < this._menuOpenTimers.length; level++) {
      const timer = this._menuOpenTimers[level];
      if (timer != null) clearTimeout(timer);
    }
    this._menuOpenTimers.length = fromLevel;

    const clearFrom = Math.max(0, fromLevel - 1);
    for (let level = clearFrom; level < this._menuOpenParentEls.length; level++) {
      const el = this._menuOpenParentEls[level];
      if (el) el.setAttribute("aria-expanded", "false");
    }
    this._menuOpenParentEls.length = clearFrom;

    this._menuItemsByLevel.length = fromLevel;
    this._menuParentIds.length = fromLevel;
  }

  _handleMenuMouseMove(level: number, e: MouseEvent) {
    const overlay = this._menuOverlays[level];
    if (!overlay || overlay.style.display === "none") return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest(".pte-menu-item[data-item-id]") as HTMLElement | null;
    if (!btn || !overlay.contains(btn)) return;

    const item = this._getMenuItemById(level, btn.getAttribute("data-item-id"));
    const nextLevel = level + 1;
    if (!item || item.disabled || !item.subMenu || item.subMenu.length === 0) {
      const timer = this._menuOpenTimers[nextLevel];
      if (timer != null) clearTimeout(timer);
      this._hideMenuLevels(nextLevel);
      return;
    }

    if (this._menuParentIds[nextLevel] === item.id) return;

    const timer = this._menuOpenTimers[nextLevel];
    if (timer != null) clearTimeout(timer);
    this._menuOpenTimers[nextLevel] = setTimeout(() => {
      this._openSubmenu(nextLevel, btn, item.subMenu || []);
    }, 120);
  }

  _handleMenuClick(level: number, e: MouseEvent) {
    const overlay = this._menuOverlays[level];
    if (!overlay || overlay.style.display === "none") return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest(".pte-menu-item[data-item-id]") as HTMLElement | null;
    if (!btn || !overlay.contains(btn)) return;

    const item = this._getMenuItemById(level, btn.getAttribute("data-item-id"));
    if (!item || item.disabled) return;

    if (item.subMenu && item.subMenu.length > 0) {
      this._openSubmenu(level + 1, btn, item.subMenu);
      return;
    }

    if (item.onClick) {
      this._closeMenu();
      if (level === 0) {
        console.time("menuOnClick");
        item.onClick();
        console.timeEnd("menuOnClick");
      } else {
        item.onClick();
      }
    }
  }

  _initFilterOverlay() {
    this._filterOverlay.className = "pte-filter";
    this._filterOverlay.style.position = "fixed";
    this._filterOverlay.style.zIndex = "10000";
    this._filterOverlay.style.display = "none";
    document.body.appendChild(this._filterOverlay);

    document.addEventListener("mousedown", (e) => {
      if (this._filterOverlay.style.display === "none") return;
      const target = e.target as Node | null;
      if (!this._filterOverlay.contains(target)) this._closeFilter();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._closeFilter();
    });
  }

  _updateLoadingOverlay() {
    this._loadingOverlayRenderer.setLoading(this._externalLoading);
  }

  _setServerLoading(isLoading: boolean, requestId?: number) {
    this._externalLoading = isLoading;
    this._updateLoadingOverlay();
  }

  _openSubmenu(level: number, parentBtnEl: HTMLElement, submenuItems: MenuItem[]) {
    const overlay = this._ensureMenuOverlay(level);
    this._hideMenuLevels(level + 1);
    this._menuItemsByLevel[level] = submenuItems;
    this._menuParentIds[level] = parentBtnEl.getAttribute("data-item-id");
    this._renderMenuItems(overlay, submenuItems, { isSubmenu: true });
    if (level > 0) this._setMenuParentExpanded(level - 1, parentBtnEl);

    const r = parentBtnEl.getBoundingClientRect();
    const W = 220;

    // Default: open to the right
    let left = r.right;
    let top = r.top;

    const bounds = this._getMenuBounds();

    // If would overflow right edge, open to the left
    if (left + W > bounds.right) {
      left = r.left - W;
    }

    overlay.style.minWidth = `${W}px`;
    overlay.style.visibility = "hidden";
    overlay.style.display = "block";
    const submenuRect = overlay.getBoundingClientRect();
    overlay.style.opacity = "1";

    if (left + submenuRect.width > bounds.right) {
      left = bounds.right - submenuRect.width;
    }
    if (left < bounds.left) {
      left = bounds.left;
    }
    if (top + submenuRect.height > bounds.bottom) {
      top = bounds.bottom - submenuRect.height;
    }
    if (top < bounds.top) {
      top = bounds.top;
    }

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.visibility = "visible";
  }

  _renderMenuItems(container: HTMLDivElement, items: MenuItem[], { isSubmenu = false } = {}) {
    container.innerHTML = "";
    let idCounter = 0;
    for (const item of items) {
      item.id = item.id || `menuitem-${Date.now()}-${idCounter++}`;
      if (isTrue(item.isSeparator)) {
        const hr = document.createElement("hr");
        hr.className = "pte-menu-separator";
        container.appendChild(hr);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pte-menu-item";
      const text = document.createElement("span");
      text.className = "pte-menu-item-text";
      text.textContent = item.label || '';
      el.appendChild(text);
      el.disabled = !!item.disabled;
      if (item.subMenu) {
        el.classList.add("has-submenu");
        el.setAttribute("aria-haspopup", "menu");
        el.setAttribute("aria-expanded", "false");
        item.right = "icon-arrow-right";
      }
      if (item.left) {
        const left = document.createElement("span");
        left.className = `pte-menu-item-icon pte-menu-item-icon-left ${item.left}`;
        el.prepend(left);
      }
      if (item.right) {
        const right = document.createElement("span");
        right.className = `pte-menu-item-icon pte-menu-item-icon-right ${item.right}`;
        el.appendChild(right);
      }
      el.setAttribute("data-item-id", item.id);
      container.appendChild(el);
    }
  }

  _openColMenu(trigger: "columnMenuButton" | "headerContextMenu", colID: string, { anchorEl, left, top }: { anchorEl?: HTMLElement, left?: number, top?: number }) {
    const session = this.menuCoordinator.openColumnMenu({
      trigger: trigger,
      targetColId: colID,
      colIds: this._selectedColumnIDs.size > 1 ? Array.from(this._selectedColumnIDs) : [colID],
      anchorEl: anchorEl,
      clientX: left,
      clientY: top,
    });
    this._menuRenderer.open({
      anchorEl: anchorEl,
      clientX: left || 100,
      clientY: top || 100,
      items: session.items,
      level: 0,
      parentId: null,
      parentEl: null,
      position: "bottom-left",
      onItemClick: session.onItemClick,
      onClose: session.onClose,
    });
  }

  _openColFilter(colID: string, anchorEl: HTMLElement) {
    const col = this.core.getColumnModel().getById(colID);
    if (!col) return;
    const session = this.filterMenuCoordinator.openFilterMenu({
      trigger: "filterButton",
      targetCol: col,
      anchorEl: anchorEl,
    });
    this._menuRenderer.open({
      anchorEl: anchorEl,
      clientX: anchorEl.getBoundingClientRect().left,
      clientY: anchorEl.getBoundingClientRect().bottom + 4,
      contentEl: session.contentEl,
      onOpen: session.onOpen,
      onClose: session.onClose,
      items: [],
    });
    return;
  }

  _closeMenu() {
    this._menuColKey = null;
    this._hideMenuLevels(0);
  }

  _closeFilter() {
    this._filterColID = null;
    this._filterOverlay.style.display = "none";
  }

  // ---------------- Event listeners ----------------
  _headerCellContextMenuHandler(e: MouseEvent) {
    e.preventDefault();
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (!header) return;
    const col = this.core.getColumnModel().getById(header.id);
    if (!col) return;
    const leaves = col.getLeaves();
    if (leaves.filter(l => this._selectedColumnIDs.has(l.instanceID)).length != leaves.length) {
      this._selectedColumnIDs.clear();
      this._toggleColumnSelection(col.instanceID);
    }
    this._openColMenu("headerContextMenu", header.id, { left: e.clientX, top: e.clientY });
  }

  _headerCellClickHandler(e: MouseEvent) {
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (!header) return;
    const headerExpand = (e.target as HTMLElement)?.closest(".pte-hcell-expander");
    if (headerExpand) {
      return this.core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: header.id });
    }
    const headerContent = (e.target as HTMLElement)?.closest(".pte-hcell-content");
    if (headerContent) {
      const col = this.core.getColumnModel().getById(header.id);
      if (!col) return;
      if (e.shiftKey) {
        return this.core.dispatch({ type: "headerAction", action: "toggleSort", colId: header.id });
      }
      this._toggleColumnSelection(header.id);
      return this.core.dispatch({ type: "headerAction", action: "click", colId: header.id });
    }
    const btn: HTMLDivElement | null = (e.target as HTMLElement)?.closest(".pte-hcell-menu-btn");
    if (btn) {
      const isFilter = btn.classList.contains("pte-hcell-menu-filterBtn");
      // this._clearColumnSelection();
      // Based on the btn clicked, render filter/menu UI
      this.core.dispatch({ type: "headerAction", action: (isFilter ? "filter" : "menu") + "Click", colId: header.id });
      if (!isFilter) {
        this._openColMenu("columnMenuButton", header.id, { anchorEl: btn });
      } else {
        this._openColFilter(header.id, btn);
      }
      return;
    }
  }

  _cellClickHandler(e: MouseEvent) {
    const btn: HTMLDivElement | null = (e.target as HTMLElement)?.closest(".pte-hcell-menu-btn");
    if (btn) {
      if ((btn.parentNode as HTMLElement)?.classList?.contains("active")) {
        const activeMenus = this.root.querySelectorAll(".pte-hcell-menu-item.active");
        activeMenus.forEach(m => m != btn.parentNode && m.classList.remove("active"));
        return;
      }
    }
    // close any other active menus
    const activeMenus = this.root.querySelectorAll(".pte-hcell-menu-item.active");
    activeMenus.forEach(m => m.classList.remove("active"));

    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (header) {
      this._headerCellClickHandler(e);
      return;
    }
  }

  async _fetchServerSideRows(_reason: string) {
    if (this.rowModel.getType() !== "serverSide" || !this.rowModel.isValid()) return;
    this.core.refreshRows("refresh");
  }

  _updateFilterIndicators() {
    this._setFilterIndicators();
  }

  _setFilterIndicators() {
    this._headerRenderer.setFilterIndicators();
  }

  _onFilterModelChanged() {
    this._setFilterIndicators();
    if (this.rowModel.getType() === "serverSide") {
      this._fetchServerSideRows("filterChanged");
      return;
    }
    this._recomputeView();
    this._updateWindow(true, undefined);
  }

  _getExportMenuItems(plural: boolean = false, columnIDs: string[] | null = null): MenuItem[] {
    const items: MenuItem[] = [];
    if (this._exportAsCSV) {
      items.push({ id: 'export-csv', label: "Export as CSV", onClick: () => this._exportColumnCSV(columnIDs) });
    }
    if (this._exportAsExcel) {
      items.push({ id: 'export-excel', label: "Export as Excel", onClick: () => this._exportColumnXLSX(columnIDs) });
    }
    if (items.length === 2) {
      return [{
        id: 'export-col',
        label: "Export Column" + (plural ? "s" : ""),
        subMenu: items,
      }];
    }
    return items;
  }

}
