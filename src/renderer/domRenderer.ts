import { RefObject } from "react";
import {
  adjustPinned,
  collectLeaves,
  findColumnById,
  getVisibleChildren,
  getColumnAncestors,
  mergeColumns,
  newColumnHierarchy,
  splitTreeAtColumn,
} from "./helpers";
import {
  AggregateModel,
  AggregateScope,
  AggregateType,
} from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { FilterModel, FilterType } from "../interfaces/filter";
import { MenuItem } from "../interfaces/menuItem";
import { RowPoolDef } from "./types";
import { SortDef } from "../interfaces/sort";
import { isFalse, isNullOrUndefined, isTrue, validatePageSizes } from "../misc";
import { exportCSV as downloadCSV, exportExcel as downloadExcel, ExportConfig } from "../export/export";
import { createRendererRuntime, getCellRendererParams, RendererRecord } from "./renderer";
import { IRowModel } from "../interfaces/iRowModel";
import { ServerSideAggregationSource, ServerSideDataSource, ServerSideRequest, ServerSideRowModel } from "../core/rowModel/serverSide";
import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { div } from "./element";
import { GridCore } from "../core/core";
import { GridEventColumnsChangedParams, GridEventRowsChangedParams, GridEventViewportChangedParams } from "../events/events";
import { MenuCoordinator } from "../menu/coordinator";
import { MenuRenderer } from "./menuRenderer";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";

const MIN_RESIZE_WIDTH = 75;
const COLUMN_DRAG_THRESHOLD_PX = 4;

export class GridRenderer {
  _menuRenderer: MenuRenderer;
  _containerEl!: HTMLElement;
  rowHeight: number = 43;
  height?: number;
  _externalLoading: boolean = false;
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

  _resizingColumn: string = "";
  _resizeStartX: number = 0;
  _resizeStartWidth: number = 0;
  _suppressHeaderClick: boolean;
  _isDraggingColumn: boolean;
  _draggingColumn: Column | null;
  _dragStartX: number;
  _dragStartY: number;
  _dragLastX: number;
  _dragTargetIndex: number;
  _dragGhostEl: HTMLDivElement | null;
  _dragIndicatorEl: HTMLDivElement | null;
  _dragHeaderEl: HTMLDivElement | null;
  _dragHeaderContainer: HTMLDivElement | null;
  _dragSection: "left" | "center" | "right" | null;
  _dragDirection: "left" | "right" | null;
  _dragAllowsDrop: boolean;

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
  _rowPool: RowPoolDef[];

  _rafPending: boolean;
  _syncingScrollTargets: Set<HTMLDivElement>;
  _syncingScrollRaf: number | null;
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
    this.root.style.position = "relative";

    this._menuRenderer = new MenuRenderer(this.root);

    this.headerWrapper = document.createElement("div");
    this.headerWrapper.className = "pte-header-wrapper";
    this.root.appendChild(this.headerWrapper);
    this.leftHeader = document.createElement("div");
    this.leftHeader.className = "pte-header-left";
    this.headerWrapper.appendChild(this.leftHeader);
    this.header = document.createElement("div");
    this.header.className = "pte-header";
    this.headerWrapper.appendChild(this.header);
    this.rightHeader = document.createElement("div");
    this.rightHeader.className = "pte-header-right";
    this.headerWrapper.appendChild(this.rightHeader);

    this.body = document.createElement("div");
    this.body.className = "pte-body";
    this.root.appendChild(this.body);

    this.leftScroller = document.createElement("div");
    this.leftScroller.className = "pte-scroller-left";
    this.body.appendChild(this.leftScroller);

    this.scroller = document.createElement("div");
    this.scroller.className = "pte-scroller";
    this.body.appendChild(this.scroller);

    this.rightScroller = document.createElement("div");
    this.rightScroller.className = "pte-scroller-right";
    this.body.appendChild(this.rightScroller);

    this.aggregateRow = document.createElement("div");
    this.aggregateRow.className = "pte-aggregate-row";
    this.aggregateRow.style.display = "none";
    this.aggregateRow.style.height = `${this.rowHeight}px`;
    this.aggregateRow.style.minHeight = `${this.rowHeight}px`;
    this.aggregateRow.style.maxHeight = `${this.rowHeight}px`;
    this.aggregateLeft = document.createElement("div");
    this.aggregateLeft.className = "pte-aggregate-left";
    this.aggregateCenter = document.createElement("div");
    this.aggregateCenter.className = "pte-aggregate-center";
    this.aggregateRight = document.createElement("div");
    this.aggregateRight.className = "pte-aggregate-right";
    this.aggregateCloseBtn = document.createElement("button");
    this.aggregateCloseBtn.type = "button";
    this.aggregateCloseBtn.className = "pte-aggregate-close";
    this.aggregateCloseBtn.title = "Hide aggregate row";
    this.aggregateCloseBtn.setAttribute("aria-label", "Hide aggregate row");
    this.aggregateCloseBtn.textContent = "x";
    this.aggregateCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._setAggregateScope("none");
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.value = "none";
      }
    });
    this.aggregateCenterRow = document.createElement("div");
    this._aggregateLeftCells = [];
    this._aggregateCells = [];
    this._aggregateRightCells = [];
    this._aggregateVisible = false;
    this.aggregateRow.appendChild(this.aggregateLeft);
    this.aggregateRow.appendChild(this.aggregateCenter);
    this.aggregateRow.appendChild(this.aggregateRight);
    this.aggregateRow.appendChild(this.aggregateCloseBtn);
    this.root.appendChild(this.aggregateRow);

    this.hScrollContainer = document.createElement("div");
    this.hScrollContainer.className = "pte-scroller-horizontal-container-wrapper";
    this.root.appendChild(this.hScrollContainer);
    this.hScrollLeftParent = document.createElement("div");
    this.hScrollLeftParent.className = "pte-scroller-horizontal-left-container";
    this.hScrollContainer.appendChild(this.hScrollLeftParent);
    this.hScrollParent = document.createElement("div");
    this.hScrollParent.className = "pte-scroller-horizontal-container";
    this.hScrollContainer.appendChild(this.hScrollParent);
    this.hScrollRightParent = document.createElement("div");
    this.hScrollRightParent.className = "pte-scroller-horizontal-right-container";
    this.hScrollContainer.appendChild(this.hScrollRightParent);
    this.hScrollLeft = document.createElement("div");
    this.hScrollLeft.style.height = "15px";
    this.hScrollLeft.className = "pte-scroller-horizontal-spacer";
    this.hScrollLeftParent.appendChild(this.hScrollLeft);
    this.hScroll = document.createElement("div");
    this.hScroll.style.height = "15px";
    this.hScroll.className = "pte-scroller-horizontal-spacer";
    this.hScrollParent.appendChild(this.hScroll);
    this.hScrollRight = document.createElement("div");
    this.hScrollRight.style.height = "15px";
    this.hScrollRight.className = "pte-scroller-horizontal-spacer";
    this.hScrollRightParent.appendChild(this.hScrollRight);
    this.hScrollerLeft = document.createElement("div");
    this.hScrollerLeft.className = "pte-scroller-horizontal";
    this.hScrollLeft.appendChild(this.hScrollerLeft);
    this.hScroller = document.createElement("div");
    this.hScroller.className = "pte-scroller-horizontal";
    this.hScroll.appendChild(this.hScroller);
    this.hScrollerRight = document.createElement("div");
    this.hScrollerRight.className = "pte-scroller-horizontal";
    this.hScrollRight.appendChild(this.hScrollerRight);

    this.vScrollParent = document.createElement("div");
    this.vScrollParent.className = "pte-scroller-vertical-container";
    this.body.appendChild(this.vScrollParent);
    this.vScroll = document.createElement("div");
    this.vScroll.className = "pte-scroller-vertical-spacer";
    this.vScrollParent.appendChild(this.vScroll);
    this.vScroller = document.createElement("div");
    this.vScroller.className = "pte-scroller-vertical";
    this.vScroll.appendChild(this.vScroller);

    this.leftSpacer = document.createElement("div");
    this.leftSpacer.className = "pte-spacer-left";
    this.leftScroller.appendChild(this.leftSpacer);

    this.spacer = document.createElement("div");
    this.spacer.className = "pte-spacer";
    this.scroller.appendChild(this.spacer);

    this.rightSpacer = document.createElement("div");
    this.rightSpacer.className = "pte-spacer-right";
    this.rightScroller.appendChild(this.rightSpacer);

    this.leftViewport = document.createElement("div");
    this.leftViewport.className = "pte-viewport-left";
    this.leftSpacer.appendChild(this.leftViewport);

    this.viewport = document.createElement("div");
    this.viewport.className = "pte-viewport";
    this.spacer.appendChild(this.viewport);

    this.rightViewport = document.createElement("div");
    this.rightViewport.className = "pte-viewport-right";
    this.rightSpacer.appendChild(this.rightViewport);

    this.paginator = document.createElement("div");
    this.paginator.className = "pte-pagination-wrapper";
    this.root.appendChild(this.paginator);
    // this.buildPaginationControls();

    this._leafColumns = [];
    this._leafColumnLookup = new Map();
    this._leftLeafOrder = [];
    this._centerLeafOrder = [];
    this._rightLeafOrder = [];

    this._selectionAnchor = null;
    this._selectionRange = null;
    this._isSelecting = false;
    this._resizeStartX = 0;
    this._resizeStartWidth = 0;
    this._suppressHeaderClick = false;
    this._isDraggingColumn = false;
    this._draggingColumn = null;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragLastX = 0;
    this._dragTargetIndex = -1;
    this._dragGhostEl = null;
    this._dragIndicatorEl = null;
    this._dragHeaderEl = null;
    this._dragHeaderContainer = null;
    this._dragSection = null;
    this._dragDirection = null;
    this._dragAllowsDrop = false;
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
    this._loadingOverlay = document.createElement("div");
    this._initLoadingOverlay();
    this._updateLoadingOverlay();

    // Create a pooled set of row nodes
    // this._poolSize = this._computePoolSize();
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    // this._buildHeaderDOM();
    // this._buildRowPool();

    const setPinSectionMaxWidths = () => {
      this.leftHeader.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.hScrollLeftParent.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.leftScroller.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.aggregateLeft.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.rightHeader.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.hScrollRightParent.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.rightScroller.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.aggregateRight.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
    };
    setPinSectionMaxWidths();

    // Events
    this._rafPending = false;
    this._syncingScrollTargets = new Set();
    this._syncingScrollRaf = null;
    this.leftScroller.addEventListener("scroll", () => {
      if (this._syncingScrollTargets.has(this.leftScroller)) return;
      this._scheduleWindowUpdate(this.leftScroller);
    });
    this.scroller.addEventListener("scroll", () => {
      if (this._syncingScrollTargets.has(this.scroller)) return;
      this._scheduleWindowUpdate(this.scroller);
    });
    this.rightScroller.addEventListener("scroll", () => {
      if (this._syncingScrollTargets.has(this.rightScroller)) return;
      this._scheduleWindowUpdate(this.rightScroller);
    });
    this.vScroll.addEventListener("scroll", () => {
      if (this._syncingScrollTargets.has(this.vScroll)) return;
      this._scheduleWindowUpdate(this.vScroll);
    });
    this.leftSpacer.addEventListener("scroll", () => {
      this.leftHeader.scrollLeft = this.leftSpacer.scrollLeft;
      this.hScrollLeft.scrollLeft = this.leftSpacer.scrollLeft;
      this.aggregateLeft.scrollLeft = this.leftSpacer.scrollLeft;
    });
    this.spacer.addEventListener("scroll", () => {
      this.header.scrollLeft = this.spacer.scrollLeft;
      this.hScroll.scrollLeft = this.spacer.scrollLeft;
      this.aggregateCenter.scrollLeft = this.spacer.scrollLeft;
    });
    this.rightSpacer.addEventListener("scroll", () => {
      this.rightHeader.scrollLeft = this.rightSpacer.scrollLeft;
      this.hScrollRight.scrollLeft = this.rightSpacer.scrollLeft;
      this.aggregateRight.scrollLeft = this.rightSpacer.scrollLeft;
    });
    this.hScrollLeft.addEventListener("scroll", () => {
      this.leftSpacer.scrollLeft = this.hScrollLeft.scrollLeft;
      this.leftHeader.scrollLeft = this.hScrollLeft.scrollLeft;
      this.aggregateLeft.scrollLeft = this.hScrollLeft.scrollLeft;
    });
    this.hScroll.addEventListener("scroll", () => {
      this.spacer.scrollLeft = this.hScroll.scrollLeft;
      this.header.scrollLeft = this.hScroll.scrollLeft;
      this.aggregateCenter.scrollLeft = this.hScroll.scrollLeft;
    });
    this.hScrollRight.addEventListener("scroll", () => {
      this.rightSpacer.scrollLeft = this.hScrollRight.scrollLeft;
      this.rightHeader.scrollLeft = this.hScrollRight.scrollLeft;
      this.aggregateRight.scrollLeft = this.hScrollRight.scrollLeft;
    });
    this.leftHeader.addEventListener("scroll", () => {
      this.leftSpacer.scrollLeft = this.leftHeader.scrollLeft;
      this.hScrollLeft.scrollLeft = this.leftHeader.scrollLeft;
      this.aggregateLeft.scrollLeft = this.leftHeader.scrollLeft;
    });
    this.header.addEventListener("scroll", () => {
      this.spacer.scrollLeft = this.header.scrollLeft;
      this.hScroll.scrollLeft = this.header.scrollLeft;
      this.aggregateCenter.scrollLeft = this.header.scrollLeft;
    });
    this.rightHeader.addEventListener("scroll", () => {
      this.rightSpacer.scrollLeft = this.rightHeader.scrollLeft;
      this.hScrollRight.scrollLeft = this.rightHeader.scrollLeft;
      this.aggregateRight.scrollLeft = this.rightHeader.scrollLeft;
    });
    this.aggregateLeft.addEventListener("scroll", () => {
      this.leftSpacer.scrollLeft = this.aggregateLeft.scrollLeft;
      this.leftHeader.scrollLeft = this.aggregateLeft.scrollLeft;
      this.hScrollLeft.scrollLeft = this.aggregateLeft.scrollLeft;
    });
    this.aggregateCenter.addEventListener("scroll", () => {
      this.spacer.scrollLeft = this.aggregateCenter.scrollLeft;
      this.header.scrollLeft = this.aggregateCenter.scrollLeft;
      this.hScroll.scrollLeft = this.aggregateCenter.scrollLeft;
    });
    this.aggregateRight.addEventListener("scroll", () => {
      this.rightSpacer.scrollLeft = this.aggregateRight.scrollLeft;
      this.rightHeader.scrollLeft = this.aggregateRight.scrollLeft;
      this.hScrollRight.scrollLeft = this.aggregateRight.scrollLeft;
    });
    const resizeObserver = new ResizeObserver(entries => {
      setPinSectionMaxWidths();
      // this._maybeUpdatePoolSize();
    });
    resizeObserver.observe(this.root);

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
      if (this._suppressHeaderClick) {
        this._suppressHeaderClick = false;
        return;
      }
      this._cellClickHandler(e);
    });
    document.addEventListener("mouseover", (e) => {
      this.body.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
      const row = e.target.closest(".pte-row");
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
    this.core.onInternal("overlayShow", (ev: { overlayType: "loading" | "noRows" | "none" }) => {
      this.setLoading(ev.overlayType === "loading" || ev.overlayType === "noRows");
    });
    this.core.onInternal("viewportChanged", (params: GridEventViewportChangedParams) => this._maybeUpdatePoolSize(params));
    this.core.onInternal("columnsChanged", (params: GridEventColumnsChangedParams) => this.onColumnsChanged(params));
    this.core.onInternal("rowsChanged", (params: GridEventRowsChangedParams) => this.onDataChanged(params));
  }

  _getBodyHeight() {
    const headerHeight = this.headerWrapper.getBoundingClientRect().height || 0;
    const hScrollHeight = this.hScrollContainer.getBoundingClientRect().height || 0;
    const paginationHeight = this._pagination ? (this.paginator?.getBoundingClientRect().height || 0) : 0;
    const aggregateHeight = this._getAggregateRowHeight();
    const chromeHeight = headerHeight + hScrollHeight + paginationHeight + aggregateHeight;

    const containerHeight = this._containerEl?.clientHeight ?? 0;
    const fallbackHeight = this.height ?? window.innerHeight ?? 0;

    const availableHeight = Math.max(0, Math.min(Math.max(containerHeight, fallbackHeight), window.innerHeight || fallbackHeight) - chromeHeight);
    if (availableHeight > 0) return availableHeight;

    return this.rowHeight;
  }

  _computePoolSize(params: GridEventViewportChangedParams) {
    const bodyHeight = this._getBodyHeight();
    return Math.max(1, Math.ceil(bodyHeight / params.rowHeightPx) + params.overscanRowCount * 2);
  }

  _maybeUpdatePoolSize(params: GridEventViewportChangedParams) {
    this.rowHeight = params.rowHeightPx;
    const poolSize = this._computePoolSize(params);
    if (poolSize === this._poolSize) return;
    this._poolSize = poolSize;
    this._rebuildRowPool();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
  }

  // ---------------- Public API ----------------
  togglePagination(pagination: boolean) {
    const next = isTrue(pagination);
    if (this._pagination === next) return;
    this._pagination = next;
    if (!this._pagination) this._pageIdx = 0;
    this._resetScrollPosition();
    this._recomputeView();
    this._updateColumnWidths();
    this._maybeUpdatePoolSize();
    this._updateWindow(true, undefined);
    if (this.rowModel.getType() === "serverSide") {
      this._fetchServerSideRows("togglePagination");
    }
  }

  setLoading(isLoading: boolean) {
    const next = isTrue(isLoading);
    if (this._externalLoading === next) return;
    this._externalLoading = next;
    this._updateLoadingOverlay();
  }

  setRowModel(rowModel: IRowModel) {
    if (this.rowModel.getType() === rowModel.getType()) return;
    this._aggregateFetchInFlight = false;
    this._aggregateRequestSeq++;
    this._aggregateRemoteValues = null;
    this.rowModel = rowModel;
    this._filterDirty = true;
    this._sortDirty = true;
    this._pageIdx = 0;
    this._resetScrollPosition();
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
    if (this.rowModel.getType() === "serverSide") {
      this._fetchServerSideRows("rowModelChanged");
    } else {
      this._setServerLoading(false);
    }
  }

  setServerSideDataSource(dataSource?: ServerSideDataSource) {
    if (this.rowModel.getType() !== "serverSide") return;
    const rowModel = this.rowModel as ServerSideRowModel;
    if (rowModel.serverDataSource === dataSource) return;
    rowModel.serverDataSource = dataSource;
    this._fetchServerSideRows("dataSourceChanged");
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  setServerSideAggregation(aggregation?: ServerSideAggregationSource) {
    if (this.rowModel.getType() !== "serverSide") return;
    const rowModel = this.rowModel as ServerSideRowModel;
    if (rowModel.serverAggregationSource === aggregation) return;
    rowModel.serverAggregationSource = aggregation;
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  refreshServerSideData() {
    if (this.rowModel.getType() !== "serverSide") return;
    this._fetchServerSideRows("manualRefresh");
  }

  onDataChanged(params: GridEventRowsChangedParams) {
    // this._clearSelection();
    // this._resetScrollPosition();
    console.log(params);
    this._recomputeView();
    // this._updateColumnWidths();
    this._updateWindow(true, undefined, params);
  }

  setData(data: any[], options: { resetPage?: boolean; totalRows?: number } = {}) {
    this.rowModel.setRows(data || []);
    this._sortComparatorCache.clear();
    this._columnWidths.clear();
    this._clearSelection();

    const resetPage = options?.resetPage ?? true;
    if (this.rowModel.getType() === "serverSide") {
      this._serverSideTotalRows = options?.totalRows ?? this.data.length;
      this._totalPages = this._pagination ? Math.max(1, Math.ceil(this._serverSideTotalRows / this._paginationPageSize)) : 1;
    } else {
      this._totalPages = this._pagination ? Math.max(1, Math.ceil(this.rowModel.getRowCount() / this._paginationPageSize)) : 1;
    }

    if (resetPage) {
      this._pageIdx = 0;
    } else if (this._pagination) {
      const totalPages = Math.max(this._totalPages, 1);
      this._pageIdx = Math.min(Math.max(this._pageIdx, 0), totalPages - 1);
    }

    this._resetScrollPosition();
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
  }

  onColumnsChanged(params: GridEventColumnsChangedParams) {
    console.log(params);
    // this._clearSelection();
    // this._clearColumnSelection();
    // Structural change -> rebuild header + pool
    if (params.reason === "sort") {
      const sorts = this.core.getSortModel();
      for (const colID of params.changedColIds || []) {
        const sort = sorts.find(s => s.key === colID);
        this._addSortIndicatorToHeader(colID, sort?.dir || '');
      }
      return;
    } else if (params.reason === "filter") {
      this._setFilterIndicators();
      return;
    }
    if (params.reason !== "resize" && params.reason !== "state") {
      this._buildHeaderDOM();
      this._buildRowPool();
    } else {
      this._updateColumnWidths(params.changedColIds || []);
    }
    // this._recomputeView();
  }

  onColumnsMoved() {
    const prevWidths = new Map(this._columnWidths);
    this._columnWidths.clear();
    const walk = (cols: Column[]) => {
      for (const col of cols) {
        const info = prevWidths.get(col.id);
        if (info) this._columnWidths.set(col.id, info);
        if (col.children.length > 0) walk(col.children);
      }
    };
    walk(this.columns);
    this._clearSelection();
    this._clearColumnSelection();
    // Structural change -> rebuild header
    this._buildHeaderDOM();
    this._rebuildRowPool();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
  }

  setColumns(columns: Column[], options: { preserveWidths?: boolean } = {}) {
    const prevWidths = options.preserveWidths ? new Map(this._columnWidths) : null;
    this._columnWidths.clear();
    if (prevWidths) {
      const walk = (cols: Column[]) => {
        for (const col of cols) {
          const info = prevWidths.get(col.id);
          if (info) this._columnWidths.set(col.id, info);
          if (col.children.length > 0) walk(col.children);
        }
      };
      walk(this.columns);
    }
    this._clearSelection();
    this._clearColumnSelection();
    // Structural change -> rebuild header + pool
    this._buildHeaderDOM();
    this._rebuildRowPool(); // rare operation
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
  }

  setFilters(filters: FilterModel[]) {
    this._filters = filters ?? [];
    this._onFilterModelChanged();
  }

  setSort(sort: SortDef) {
    const existing = this._sorts.find(s => s.key === sort?.key);
    let removed = false;
    if (existing && existing.dir === sort?.dir) {
      removed = true;
      this._sorts = this._sorts.filter(s => s.key !== sort.key);
    } else {
      this._sorts.push(sort);
    }
    this._sortDirty = true;
    if (this.rowModel.getType() === "serverSide") {
      this._addSortIndicatorToHeader(sort.key, removed ? '' : sort.dir);
      this._fetchServerSideRows("setSort");
      return;
    }
    this._recomputeView();
    this._addSortIndicatorToHeader(sort.key, removed ? '' : sort.dir);
    this._updateWindow(true, undefined);
  }

  /** Patch only specific cells if you know what changed */
  refreshCells({ rowIds, colKeys } = {}) {
    // For simplicity in this tiny engine, we re-patch visible window only.
    // In a real grid you’d map rowId -> viewIndex and only update those indices.
    this._patchVisibleCells({ rowIds, colKeys });
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
      fileName = findColumnById(this.columns, selectedColumns[0])?.label || fileName;
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
      fileName = findColumnById(this.columns, selectedColumns[0])?.label || fileName;
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
      rows = this._viewRows.slice();
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
      columnTree: this.columns,
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
    if (includeAllRows && this.rowModel.getType() === "clientSide") {
      const idx = (this.rowModel.sortedIdx && this.rowModel.sortedIdx.length > 0) ? this.rowModel.sortedIdx : this._viewIdx;
      return idx.map(i => this.data[i]);
    }
    return this._viewIdx.map(i => this.data[i]);
  }

  _defaultExportFileName(format: "csv" | "excel", options: ExportOptions): string {
    const ext = format === "csv" ? "csv" : "xlsx";
    if (options.columnIds && options.columnIds.length === 1) {
      const col = findColumnById(this.columns, options.columnIds[0]);
      if (col) return `${col.label ?? col.key}.${ext}`;
    }
    const scope = this._resolveExportScope(options);
    if (scope === "selection") return `grid-selection.${ext}`;
    if (scope === "selectedColumns") return `grid-columns.${ext}`;
    return `grid-all.${ext}`;
  }

  destroy() {
    this.root.remove();
  }

  // ---------------- Internals: view ----------------
  async _toggleSort(col: Column) {
    const { colIDs, dir } = await this.core.toggleSort(col);
    if (this.rowModel.getType() === "serverSide") {
      for (const colID of colIDs) {
        this._addSortIndicatorToHeader(colID, dir || '');
      }
      this._fetchServerSideRows("sortChanged");
      return;
    }
    this._recomputeView();
    for (const colID of colIDs) {
      this._addSortIndicatorToHeader(colID, dir || '');
    }
    this._updateWindow(true, undefined);
  }

  _sortBySelectedColumns(dir: "asc" | "desc") {
    const selectedCols = Array.from(this._selectedColumnIDs);
    const sortedCols = [];
    for (const colID of selectedCols) {
      const col = findColumnById(this.columns, colID);
      if (!col) continue;
      if (col.children.length > 0) continue; // skip parent columns
      sortedCols.push(colID);
      const existing = this._sorts.find(s => s.key === colID);
      if (existing) {
        existing.dir = dir;
      } else {
        this._sorts.push({ key: colID, dir });
      }
    }
    this._sortDirty = true;
    if (this.rowModel.getType() === "serverSide") {
      for (const colID of selectedCols) {
        this._addSortIndicatorToHeader(colID, dir);
      }
      this._fetchServerSideRows("sortBySelectedColumns");
      return;
    }
    this._recomputeView();
    for (const colID of sortedCols) {
      this._addSortIndicatorToHeader(colID, dir);
    }
    this._updateWindow(true, undefined);
  }

  _clearSortsForSelectedColumns() {
    const selectedCols = Array.from(this._selectedColumnIDs);
    this._sorts = this._sorts.filter(s => !selectedCols.includes(s.key));
    this._sortDirty = true;
    if (this.rowModel.getType() === "serverSide") {
      for (const colID of selectedCols) {
        this._addSortIndicatorToHeader(colID, '');
      }
      this._fetchServerSideRows("clearSortsForSelectedColumns");
      return;
    }
    this._recomputeView();
    for (const colID of selectedCols) {
      this._addSortIndicatorToHeader(colID, '');
    }
    this._updateWindow(true, undefined);
  }

  _toggleColumnHidden(colID: string) {
    const col = findColumnById(this.columns, colID);
    if (!col) return;
    col.hidden = !col.hidden;
    this.setColumns(this.columns, { preserveWidths: true });
  }

  _hideSelectedColumns() {
    const selectedCols = Array.from(this._selectedColumnIDs);
    let changed = false;
    for (const colID of selectedCols) {
      const col = findColumnById(this.columns, colID);
      if (!col) continue;
      if (col.hidden) continue;
      col.hidden = true;
      changed = true;
    }
    if (changed) {
      this.setColumns(this.columns, { preserveWidths: true });
      this._clearColumnSelection();
    }
  }

  _aggregate(colID: string, aggType?: AggregateType) {
    const prevSize = this._aggregates.size;
    if (!aggType) {
      this._aggregates.delete(colID);
    } else {
      this._aggregates.set(colID, aggType);
    }
    if (prevSize === 0 && this._aggregates.size > 0 && this._aggregateScope === "none") {
      this._setAggregateScope("page");
    }
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _aggregateSelectedColumns(aggType: AggregateType) {
    const prevSize = this._aggregates.size;
    const selectedCols = Array.from(this._selectedColumnIDs);
    for (const colID of selectedCols) {
      const col = findColumnById(this.columns, colID);
      if (!col) continue;
      if (col.children.length > 0) continue; // skip parent columns
      this._aggregates.set(colID, aggType);
    }
    if (prevSize === 0 && this._aggregates.size > 0 && this._aggregateScope === "none") {
      this._setAggregateScope("page");
    }
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _showSparklinesForSelectedColumns(type: "line" | "bar" | "column") {
    const selectedLeaves = this._leafColumns.filter(col => this._selectedColumnIDs.has(col.id));
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

    const sparklineCol = getColumnDef({
      key,
      label: `Sparkline ${suffix > 1 ? suffix : ''}`,
      sparklineType: type,
      pinned: pinned ?? undefined,
      sortable: false,
      filterable: false,
      groupable: false,
      minWidth: 120,
      valueGetter: (row: any) => numericLeaves.map(col => getValue(row, col)),
    });

    this.setColumns([...this.columns, sparklineCol], { preserveWidths: true });
    this._clearColumnSelection();
  }

  _clearAggregates() {
    if (this._aggregates.size === 0) return;
    this._aggregates.clear();
    this._setAggregateScope("none");
    this._markAggregatesDirty();
    this._renderAggregateRow();
  }

  _markAggregatesDirty() {
    if (this.rowModel !== "serverSide") return;
    this._aggregateRemoteDirty = true;
    this._aggregateRemoteValues = null;
    this._aggregateRequestSeq++;
    this._aggregateFetchInFlight = false;
  }

  _setAggregateScope(scope: AggregateScope) {
    const changed = scope !== this._aggregateScope;
    this._aggregateScope = scope;
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
    if (this._aggregates.size === 0) return;
    const valid = new Set(this._leafColumns.map(c => c.id));
    for (const key of Array.from(this._aggregates.keys())) {
      if (!valid.has(key)) {
        this._aggregates.delete(key);
      }
    }
  }

  _getAggregateOpForColumn(col: Column): AggregateType {
    const explicit = this._aggregates.get(col.id);
    if (explicit != null) return explicit;
    return col.isComputableType() ? AggregateType.SUM : AggregateType.COUNT;
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

    const rawValues = rows.map(row => getValue(row, col)).filter(v => v != null);
    if (rawValues.length === 0) {
      if (aggType === AggregateType.SUM || aggType === AggregateType.AVG || aggType === AggregateType.MEDIAN) return 0;
      return "";
    }

    const collator = this._getCollator();
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
      return formatValue(value, null as any, col);
    } catch {
      return String(value);
    }
  }

  _getAggregateRows(): any[] {
    if (this._aggregateScope === "all" && this.rowModel.getType() === "clientSide") {
      const idx = this.rowModel.sortedIdx && this.rowModel.sortedIdx.length > 0 ? this.rowModel.sortedIdx : this._viewIdx;
      return idx.map(i => this.data[i]);
    }
    return this._viewIdx.map(i => this.data[i]);
  }

  _maybeRequestServerAggregates() {
    if (this.rowModel !== "serverSide") return;
    if (!this._pagination) return;
    if (this._aggregateScope !== "all") return;
    if (!this._serverSideAggregation) return;
    if (this._aggregates.size === 0) return;
    if (!this._aggregateRemoteDirty && this._aggregateRemoteValues) return;
    if (this._aggregateFetchInFlight) return;

    const aggregates = Array.from(this._aggregates.entries())
      .map(([colId, type]) => {
        const col = findColumnById(this.columns, colId);
        if (!col) return null;
        return { key: col.key, type };
      })
      .filter(Boolean) as Array<AggregateModel>;

    if (aggregates.length === 0) return;

    if (aggregates.length < this._leafColumns.length) {
      const missingLeaves = this._leafColumns.filter(l => aggregates.findIndex(f => f.key == l.key) < 0);
      aggregates.push(...missingLeaves.map(m => ({ key: m.key, type: AggregateType.COUNT })) as Array<AggregateModel>);
    }

    const filters = this._filters
      .map(f => {
        const col = findColumnById(this.columns, f.key);
        if (!col) return null;
        return {
          key: col.key,
          type: f.type,
          value: f.v,
        };
      })
      .filter(Boolean) as ServerSideRequest["filters"];

    const sorts = this._sorts
      .map(s => {
        const col = findColumnById(this.columns, s.key);
        if (!col) return null;
        return {
          key: col.key,
          dir: s.dir,
        };
      })
      .filter(Boolean) as ServerSideRequest["sorts"];

    this._aggregateFetchInFlight = true;
    this._aggregateRemoteDirty = false;
    const requestId = ++this._aggregateRequestSeq;
    Promise.resolve(this._serverSideAggregation({
      aggregates,
      filters,
      sorts,
      scope: "all",
      page: this._pageIdx,
      pageSize: this._paginationPageSize,
    }))
      .then((result) => {
        if (requestId !== this._aggregateRequestSeq) return;
        const valuesObj = (result as any)?.values ?? result ?? {};
        const map = new Map<string, any>();
        for (const col of this._leafColumns) {
          const v = valuesObj?.[col.id] ?? valuesObj?.[col.key];
          if (v != null) {
            map.set(col.id, v);
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
    const shouldShow = this._aggregateScope !== "none" && this._aggregates.size > 0;
    const wasVisible = this._aggregateVisible;
    this._aggregateVisible = shouldShow;
    if (this.aggregateClearBtn) {
      this.aggregateClearBtn.disabled = this._aggregates.size === 0;
    }

    this.aggregateRow.classList.toggle("visible", shouldShow);
    this.aggregateRow.style.display = shouldShow ? "flex" : "none";

    if (!shouldShow) {
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.disabled = this._aggregates.size === 0;
      }
      if (this.aggregateScopeSelect) {
        this.aggregateScopeSelect.value = this._aggregateScope;
      }
      if (wasVisible !== shouldShow) {
        this._updateAllColumnWidths();
        this._maybeUpdatePoolSize();
      }
      return;
    }

    const values = new Map<string, string>();
    if (this.rowModel.getType() === "serverSide" && this._aggregateScope === "all" && this._serverSideAggregation) {
      this._maybeRequestServerAggregates();
      const remote = this._aggregateRemoteValues;
      for (const col of this._leafColumns) {
        if (col.hidden) continue;
        const v = remote?.get(col.id);
        const display = v == null ? "" : this._formatAggregateDisplay(col, v);
        values.set(col.id, display ?? "");
      }
    } else {
      const rows = this._getAggregateRows();
      for (const col of this._leafColumns) {
        if (col.hidden) continue;
        const op = this._getAggregateOpForColumn(col);
        const raw = this._calculateAggregate(col, op, rows);
        const display = this._formatAggregateDisplay(col, raw);
        values.set(col.id, display ?? "");
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
        const aggFn = this._aggregates.get(col.id) || AggregateType.COUNT;
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
        content.textContent = values.get(col.id) ?? "";
        cell.appendChild(content);
        if (content.scrollWidth > content.clientWidth) {
          content.title = values.get(col.id) ?? "";
        }
      }
    };

    apply(this._aggregateLeftCells, this._leftPinnedLeafColumns);
    apply(this._aggregateCells, this._centerLeafColumns);
    apply(this._aggregateRightCells, this._rightPinnedLeafColumns);

    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.disabled = this._aggregates.size === 0;
    }

    if (wasVisible !== shouldShow) {
      this._updateAllColumnWidths();
      this._maybeUpdatePoolSize();
    }
  }

  _getAggregateRowHeight(): number {
    return this._aggregateVisible ? this.rowHeight : 0;
  }

  _recomputeView() {
    // Update total scroll height
    const verticalSize = this.core.getRowModel().getViewCount() * this.rowHeight;
    this.leftSpacer.style.height = `${verticalSize}px`;
    this.spacer.style.height = `${verticalSize}px`;
    this.rightSpacer.style.height = `${verticalSize}px`;
    this.vScroller.style.height = `${verticalSize}px`;
    this.vScrollParent.style.display = verticalSize > this.body.clientHeight ? "block" : "none";

    // this._updatePaginationControls();
    // this._clampSelectionToView();
    // this._renderAggregateRow();
  }

  _pinColumn(colID: string, pin: "left" | "right" | null) {
    const col = findColumnById(this.columns, colID);
    if (!col) return;
    if (pin === col.pinned) return;

    let targetIdx = Infinity;
    if (pin === null) {
      if (isNullOrUndefined(col.centralPosition)) {
        if (col.pinned === "left") targetIdx = 0;
      } else {
        targetIdx = col.centralPosition || 0;
      }
      if (col.children.length > 0) {
        const leaves = collectLeaves(col);
        targetIdx = leaves[0].centralPosition || 0;
      }
    }

    this._applyColumnReorder(col, targetIdx, pin || "center");
  }

  // ---------------- Internals: DOM build ----------------
  _getMeasureContext(): CanvasRenderingContext2D | null {
    if (!this._measureCtx) {
      const canvas = document.createElement("canvas");
      this._measureCtx = canvas.getContext("2d");
    }

    const probe = this.header.querySelector(".pte-hcell") || this._containerEl;
    const font = getComputedStyle(probe).font || "16px sans-serif";
    if (this._measureCtx && this._measureCtx?.font !== font) {
      this._measureCtx.font = font;
    }
    return this._measureCtx;
  }

  _measureText(text: string) {
    const padding = 16; // small breathing room so text is not cramped
    return (this._measureCtx?.measureText(text ?? "")?.width || 0) + padding;
  }

  _autoSizeColumn(col: Column, maxWidth: number): number {
    const headerText = col.label ?? col.key;
    let best = this._measureText(headerText) + 104;
    if (best >= maxWidth) return maxWidth;

    // cache per column
    const colCacheKey = `col:${col.key}`;
    let colCache = this._measureCache.get(colCacheKey);
    if (!colCache) { colCache = new Map(); this._measureCache.set(colCacheKey, colCache); }

    // const rows = this.data; // IMPORTANT: raw data order, not sorted view
    const n = this.rowModel.getRowCount();

    if (n == 0) return best;

    const measureValue = (s: string) => {
      const cached = colCache.get(s);
      if (cached != null) return cached;
      const w = this._measureText(s);
      colCache.set(s, w);
      return w;
    };

    let longestValue = "";
    let longestRow = null;
    this.rowModel.forEachNode((row, i) => {
      const v = col.getValue(row);
      if (v != null && String(v).length > longestValue.length) {
        longestValue = String(v);
        longestRow = row;
      }
    });

    best = Math.max(best, measureValue(col.formatValue(longestValue, longestRow!)));
    return Math.min(best, maxWidth);
  }

  _computeColumnWidths(column: Column | null = null, forceRecompute = false) {
    this._getMeasureContext();
    const computer = (col: Column, inTarget: boolean) => {
      if (col.hidden) return;
      const existing = this._columnWidths.get(col.id);
      const isTarget = inTarget || (!!column && col.id === column.id);
      const shouldCompute = !column || isTarget;

      if (!shouldCompute) {
        if (col.children.length > 0) {
          for (const child of col.children) computer(child, isTarget);
        }
        return;
      }

      if (!forceRecompute && !column && existing) return;

      if (col.width != null) {
        const minWidth = Math.max(MIN_RESIZE_WIDTH, col.minWidth ?? col.width);
        const maxWidth = col.width;
        this._columnWidths.set(col.id, { width: col.width, minWidth, maxWidth, fixed: true });
        return;
      }

      const minWidth = Math.max(MIN_RESIZE_WIDTH, col.minWidth ?? existing?.minWidth ?? MIN_RESIZE_WIDTH);
      const defaultMax = col.children.length > 0 ? Number.POSITIVE_INFINITY : 420;
      let maxWidth = col.maxWidth ?? existing?.maxWidth ?? defaultMax;

      const autoWidth = this._autoSizeColumn(col, maxWidth);
      let width = Math.min(Math.max(autoWidth, minWidth), maxWidth);

      if (col.children.length > 0) {
        let childrenWidth = 0;
        for (const child of col.children) {
          computer(child, isTarget);
          const childInfo = this._columnWidths.get(child.id);
          if (childInfo) childrenWidth += childInfo.width;
        }
        if (childrenWidth > width) {
          width = childrenWidth;
        }
        if (!Number.isFinite(maxWidth)) {
          maxWidth = Number.POSITIVE_INFINITY;
        }
      }

      this._columnWidths.set(col.id, { width, minWidth, maxWidth, fixed: false });
    };
    for (const col of this.core.columns) {
      computer(col, column == null ? true : col.id === column.id);
    }
  }

  _applyWidthsToChildren(col: Column) {
    const hcell = document.getElementById(col.instanceID) as HTMLDivElement;
    hcell.style.flex = "0 0 auto";
    if (col.children.length === 0) {
      hcell.style.width = `${col.computedWidth}px`;
    }
  };

  _applyLeftColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    let first = true;
    for (const slot of this._rowPool) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.core.getColumnModel().getLeftLeaves()) {
        if (col.hidden) continue;
        const cell = slot.leftCellEls[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        if (first) this._applyWidthsToChildren(col);
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      if (slot.leftRowEl) slot.leftRowEl.style.width = `${totalWidth}px`;
      if (first) {
        maxWidth = Math.max(maxWidth, totalWidth);
        first = false;
      }
    }
    this.leftViewport.style.width = `${maxWidth}px`;
    this.hScrollerLeft.style.width = `${maxWidth}px`;
    this.hScrollLeftParent.style.display = maxWidth > 0 ? "block" : "none";
    this.leftHeader.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.leftHeader.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.aggregateLeft.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.aggregateLeft.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    const totalWidth = maxWidth;
    if (maxWidth > 0) {
      this.leftScroller.classList.add("visible");
      this.leftHeader.classList.add("visible");
      if (maxWidth > this.root.clientWidth * 0.35) {
        maxWidth = this.root.clientWidth * 0.35;
        this.leftHeader.style.width = `${maxWidth}px`;
        this.leftHeader.style.minWidth = `${maxWidth}px`;
        this.aggregateLeft.style.width = `${maxWidth}px`;
        this.aggregateLeft.style.minWidth = `${maxWidth}px`;
      }
      this.aggregateLeft.style.display = "block";
    } else {
      this.leftScroller.classList.remove("visible");
      this.leftHeader.classList.remove("visible");
      this.aggregateLeft.style.display = "none";
    }
    this.hScrollLeftParent.style.width = `${maxWidth}px`;
    this.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
    return totalWidth;
  }

  _applyCenterColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    let first = true;
    for (const slot of this._rowPool) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.core.getColumnModel().getCenterLeaves()) {
        if (col.hidden) continue;
        const cell = slot.cellEls[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        if (first) this._applyWidthsToChildren(col);
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      slot.rowEl.style.width = `${totalWidth}px`;
      if (first) {
        maxWidth = Math.max(maxWidth, totalWidth);
        first = false;
      }
    }
    this.hScroller.style.width = `${maxWidth}px`;
    if (maxWidth == 0) {
      this.hScrollParent.style.flex = "1 1 auto";
    }
    this.viewport.style.width = `${maxWidth}px`;
    if (this.aggregateCenterRow) {
      this.aggregateCenterRow.style.width = `${maxWidth}px`;
      this.aggregateCenterRow.style.minWidth = `${maxWidth}px`;
    }
    return maxWidth;
  }

  _applyRightColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    let first = true;
    for (const slot of this._rowPool) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.core.getColumnModel().getRightLeaves()) {
        if (col.hidden) continue;
        const cell = slot.rightCellEls[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        if (first) this._applyWidthsToChildren(col);
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      if (slot.rightRowEl) slot.rightRowEl.style.width = `${totalWidth}px`;
      if (first) {
        maxWidth = Math.max(maxWidth, totalWidth);
        first = false;
      }
    }
    this.rightViewport.style.width = `${maxWidth}px`;
    this.rightHeader.style.paddingRight = `${maxWidth > 0 ? 15 : 0}px`;
    this.hScrollerRight.style.width = `${maxWidth}px`;
    this.hScrollRightParent.style.display = maxWidth > 0 ? "block" : "none";
    const totalWidth = maxWidth;
    if (maxWidth > 0) {
      this.rightScroller.classList.add("visible");
      this.rightHeader.classList.add("visible");
      if (maxWidth > this.root.clientWidth * 0.35) {
        maxWidth = this.root.clientWidth * 0.35;
      }
      this.hScrollRightParent.style.width = `${maxWidth}px`;
      this.rightHeader.style.width = `${maxWidth + 16}px`;
      this.rightHeader.style.minWidth = `${maxWidth + 16}px`;
      this.aggregateRight.style.width = `${maxWidth + 1}px`;
      this.aggregateRight.style.minWidth = `${maxWidth + 1}px`;
      this.aggregateRight.style.display = "block";
      maxWidth += this.hScrollLeftParent.clientWidth;
      this.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
    } else {
      this.rightScroller.classList.remove("visible");
      this.rightHeader.style.width = "0px";
      this.rightHeader.style.minWidth = "0px";
      this.rightHeader.classList.remove("visible");
      this.aggregateRight.style.width = "0px";
      this.aggregateRight.style.minWidth = "0px";
      this.aggregateRight.style.display = "none";
    }
    this.header.style.paddingRight = `${maxWidth > 0 ? 0 : 15}px`;
    return totalWidth;
  }

  _updateColumnWidths(colIDs: string[] = []) {
    let totalWidth = 0;
    totalWidth += this._applyLeftColumnWidths(colIDs);
    totalWidth += this._applyCenterColumnWidths(colIDs);
    totalWidth += this._applyRightColumnWidths(colIDs);

    let allColIDs = new Set();
    if (colIDs.length > 0) {
      colIDs.forEach(c => this.core.getColumnModel().getAncestors(c).slice(0, -1).forEach(a => allColIDs.add(a.instanceID)));
    } else {
      this.core.getColumnModel().getColumns().map(c => c.instanceID).forEach(c => allColIDs.add(c));
      this.core.getColumnModel().getLeaves().map(c => c.instanceID).forEach(l => allColIDs.delete(l));
    }
    allColIDs.forEach(c => {
      const col = this.core.getColumnModel().getById(c);
      if (!col || col.hidden) return;
      const hcell = document.getElementById(c);
      if (!hcell) return;
      hcell.style.width = `${col.computedWidth}px`;
    })

    if (totalWidth > this.root.clientWidth) {
      this.hScrollContainer.style.display = "flex";
    } else {
      this.hScrollContainer.style.display = "none";
    }

    const headerHeight = this.headerWrapper.getBoundingClientRect().height;
    const hScrollHeight = this.hScrollContainer.getBoundingClientRect().height;
    // const aggregateHeight = this._getAggregateRowHeight();
    // const paginationHeight = this._pagination && this.paginator.classList.contains("visible")
    //   ? (this.paginator.getBoundingClientRect().height || 0)
    //   : 0;
    const chromeHeight = headerHeight
      + (this.hScrollContainer.style.display === "flex" ? hScrollHeight : 0)
    // + paginationHeight
    // + aggregateHeight;
    this.body.style.height = `calc(100% - ${chromeHeight}px)`;
  }

  _buildHeaderCell(col: Column, maxDepth: number): HTMLDivElement {
    const header = document.createElement("div");
    header.className = "pte-hcell";
    if (col.children.length === 0) {
      header.classList.add("pte-hcell-leaf");
    }
    const contentHeight = maxDepth / col.depth!;
    header.style.height = `${this.rowHeight * maxDepth}px`;
    maxDepth--;
    header.id = col.instanceID;
    const headerWrapper = document.createElement("div");
    headerWrapper.className = "pte-hcell-wrapper";
    header.appendChild(headerWrapper);
    const headerResize = document.createElement("div");
    headerResize.className = "pte-hcell-resize-handle";
    if (!col.resizable) headerResize.classList.add("pte-hcell-resize-disabled");
    headerWrapper.appendChild(headerResize);
    const headerContainer = document.createElement("div");
    headerContainer.className = "pte-hcell-container";
    headerContainer.style.height = `${this.rowHeight * contentHeight}px`;
    if (col.isComputableType()) {
      headerContainer.classList.add('pte-hcell-computable');
    }
    headerWrapper.appendChild(headerContainer);
    const headerContent = document.createElement("div");
    headerContent.className = "pte-hcell-content";
    headerContainer.appendChild(headerContent);
    const headerLabel = document.createElement("div");
    headerLabel.className = "pte-hcell-label";
    headerLabel.textContent = col.label ?? col.key;
    headerContent.appendChild(headerLabel);
    if (col.children.length > 0) {
      const children = document.createElement("div");
      children.className = "pte-hcell-children";
      header.appendChild(children);
      for (const child of col.getVisibleChildren()) {
        children.append(this._buildHeaderCell(child, maxDepth));
      }
    } else {
      header.style.width = `${col.computedWidth}px`;
    }
    if (col.showExpander) {
      const expander = document.createElement("div");
      expander.className = "pte-hcell-expander";
      if (col.groupExpandState === "open") {
        expander.classList.add("icon-minus-frame");
      } else {
        expander.classList.add("icon-plus-frame");
      }
      headerContent.appendChild(expander);
    }
    const headerMenu = this._getHeaderMenuElement(col);
    headerContainer.appendChild(headerMenu);
    const sort = this.core.getSortModel().find(s => s.key === col.instanceID);
    if (sort) {
      headerContent.classList.add("pte-sorted-" + sort.dir);
    }
    return header;
  }

  _buildHeaderDOM() {
    this._centerLeafColumns = [];
    this._leftPinnedLeafColumns = [];
    this._rightPinnedLeafColumns = [];
    const headerHeight = this.core.options.headerHeight * this.core.getColumnModel().maxHeaderDepth;
    this.headerWrapper.style.height = `${headerHeight}px`;
    this.headerWrapper.style.minHeight = `${headerHeight}px`;
    this.leftHeader.style.height = `${headerHeight}px`;
    this.leftHeader.style.minHeight = `${headerHeight}px`;
    this.header.style.height = `${headerHeight}px`;
    this.header.style.minHeight = `${headerHeight}px`;
    this.rightHeader.style.height = `${headerHeight}px`;
    this.rightHeader.style.minHeight = `${headerHeight}px`;
    this.body.style.height = `calc(100% - ${headerHeight}px`;
    this.body.style.maxHeight = `calc(100% - ${headerHeight}px`;
    this.leftHeader.innerHTML = "";
    this.header.innerHTML = "";
    this.rightHeader.innerHTML = "";
    for (const col of this.core.getColumnModel().getLeftColumns()) {
      if (!col.hidden) {
        this.leftHeader.appendChild(this._buildHeaderCell(col, this.core.getColumnModel().maxHeaderDepth));
      }
    }
    for (const col of this.core.getColumnModel().getCenterColumns()) {
      if (!col.hidden) {
        this.header.appendChild(this._buildHeaderCell(col, this.core.getColumnModel().maxHeaderDepth));
      }
    }
    for (const col of this.core.getColumnModel().getRightColumns()) {
      if (!col.hidden) {
        this.rightHeader.appendChild(this._buildHeaderCell(col, this.core.getColumnModel().maxHeaderDepth));
      }
    }
    const headerProbe = getComputedStyle(this.header.querySelector(".pte-hcell") || this._containerEl);
    const cellProbe = getComputedStyle(this.body.querySelector(".pte-cell") || this._containerEl);
    this.core.dispatch({
      type: "themeFontSet",
      headerFont: `${headerProbe.fontWeight} ${headerProbe.fontSize} ${headerProbe.fontFamily}`,
      cellFont: `${cellProbe.fontWeight} ${cellProbe.fontSize} ${cellProbe.fontFamily}`,
    });
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
    this.aggregateScopeSelect.value = this._aggregateScope;
    this.aggregateScopeSelect.addEventListener("change", (e) => {
      const next = (e.target as HTMLSelectElement).value as AggregateScope;
      this._setAggregateScope(next);
    });
    this.aggregateScopeSelect.disabled = this._aggregates.size === 0;

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
    this.paginator.innerHTML = "";

    if (!this._paginationPageSizes.includes(this._paginationPageSize)) {
      this._paginationPageSizes = [...this._paginationPageSizes, this._paginationPageSize].sort((a, b) => a - b);
    }

    const sizeSection = document.createElement("div");
    sizeSection.className = "pte-pagination-section";
    const sizeLabel = document.createElement("span");
    sizeLabel.className = "pte-pagination-label";
    sizeLabel.textContent = "Rows per page";
    this.pageSizeSelect = document.createElement("select");
    this.pageSizeSelect.className = "pte-select pte-pagination-select";
    for (const size of this._paginationPageSizes) {
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = String(size);
      this.pageSizeSelect.appendChild(option);
    }
    this.pageSizeSelect.value = String(this._paginationPageSize);
    this.pageSizeSelect.addEventListener("change", (e) => {
      const next = Number((e.target as HTMLSelectElement).value);
      if (!Number.isFinite(next) || next <= 0) return;
      if (next === this._paginationPageSize) return;
      this._paginationPageSize = next;
      this._pageIdx = 0;
      this._resetScrollPosition();
      if (this.rowModel.getType() === "serverSide") {
        this._fetchServerSideRows("pageSizeChanged");
        return;
      }
      this._recomputeView();
      this._updateWindow(true, undefined);
    });
    sizeSection.appendChild(sizeLabel);
    sizeSection.appendChild(this.pageSizeSelect);

    const navSection = document.createElement("div");
    navSection.className = "pte-pagination-section pte-pagination-nav";

    this.firstPageBtn = document.createElement("button");
    this.firstPageBtn.type = "button";
    this.firstPageBtn.className = "pte-pagination-btn pte-pagination-btn-first";
    this.firstPageBtn.addEventListener("click", () => this._goToPage(0));

    this.prevPageBtn = document.createElement("button");
    this.prevPageBtn.type = "button";
    this.prevPageBtn.className = "pte-pagination-btn pte-pagination-btn-prev";
    this.prevPageBtn.addEventListener("click", () => this._goToPage(this._pageIdx - 1));

    const pageLabel = document.createElement("span");
    pageLabel.className = "pte-pagination-label";
    pageLabel.textContent = "Page";

    this.pageSelect = document.createElement("select");
    this.pageSelect.className = "pte-select pte-pagination-select pte-pagination-page-select";
    this.pageSelect.addEventListener("change", (e) => {
      const val = Number((e.target as HTMLSelectElement).value);
      if (!Number.isFinite(val)) return;
      this._goToPage(val);
    });

    this.nextPageBtn = document.createElement("button");
    this.nextPageBtn.type = "button";
    this.nextPageBtn.className = "pte-pagination-btn pte-pagination-btn-next";
    this.nextPageBtn.addEventListener("click", () => this._goToPage(this._pageIdx + 1));

    this.lastPageBtn = document.createElement("button");
    this.lastPageBtn.type = "button";
    this.lastPageBtn.className = "pte-pagination-btn pte-pagination-btn-last";
    this.lastPageBtn.addEventListener("click", () => this._goToPage(this._totalPages - 1));

    navSection.appendChild(this.firstPageBtn);
    navSection.appendChild(this.prevPageBtn);
    navSection.appendChild(pageLabel);
    navSection.appendChild(this.pageSelect);
    navSection.appendChild(this.nextPageBtn);
    navSection.appendChild(this.lastPageBtn);

    this.paginator.appendChild(this.buildAggregationControls());
    this.paginator.appendChild(sizeSection);
    this.paginator.appendChild(navSection);
    this._populatePageSelect();
    this._updatePaginationControls();
  }

  _populatePageSelect() {
    if (!this.pageSelect) return;
    const totalPages = Math.max(this._totalPages, 1);
    if (this.pageSelect.options.length !== totalPages) {
      this.pageSelect.innerHTML = "";
      for (let i = 0; i < totalPages; i++) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `${i + 1} of ${totalPages}`;
        this.pageSelect.appendChild(option);
      }
    } else {
      for (let i = 0; i < totalPages; i++) {
        const option = this.pageSelect.options[i];
        const desiredText = `${i + 1} of ${totalPages}`;
        if (option.textContent !== desiredText) {
          option.textContent = desiredText;
        }
      }
    }
    this.pageSelect.value = String(Math.min(this._pageIdx, totalPages - 1));
  }

  _updatePaginationControls() {
    if (!this._pagination) {
      this.paginator.classList.remove("visible");
      return;
    }
    this.paginator.classList.add("visible");

    if (this.pageSizeSelect) {
      this.pageSizeSelect.value = String(this._paginationPageSize);
    }
    if (this.aggregateScopeSelect) {
      this.aggregateScopeSelect.value = this._aggregateScope;
      this.aggregateScopeSelect.disabled = this._aggregates.size === 0;
    }
    if (this.aggregateClearBtn) {
      this.aggregateClearBtn.disabled = this._aggregates.size === 0;
    }

    this._populatePageSelect();

    const atFirstPage = this.core.currPage <= 0;
    const atLastPage = this.core.currPage >= Math.max(this.core.totalPages - 1, 0);
    const hasRows = this._viewIdx.length > 0;

    if (this.pageSizeSelect) this.pageSizeSelect.disabled = !hasRows || !this.core.isPaginationEnabled;

    if (this.firstPageBtn) this.firstPageBtn.disabled = atFirstPage || !hasRows;
    if (this.prevPageBtn) this.prevPageBtn.disabled = atFirstPage || !hasRows;
    if (this.nextPageBtn) this.nextPageBtn.disabled = atLastPage || !hasRows;
    if (this.lastPageBtn) this.lastPageBtn.disabled = atLastPage || !hasRows;
    if (this.pageSelect) this.pageSelect.disabled = this.core.totalPages <= 1 || !hasRows;
  }

  _goToPage(pageIdx: number) {
    if (!this.core.goToPage(pageIdx)) return;
    this._resetScrollPosition();
    if (this.rowModel.getType() === "serverSide") {
      this._fetchServerSideRows("pagination");
      return;
    }
    this._recomputeView();
    this._updateWindow(true, undefined);
  }

  _resetScrollPosition() {
    this.leftScroller.scrollTop = 0;
    this.scroller.scrollTop = 0;
    this.rightScroller.scrollTop = 0;
    this.vScroll.scrollTop = 0;
    this._startIndex = 0;
  }

  _getHeaderMenuElement(col: Column): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu";

    const buildMenuItem = (btnClass: string, iconClass: string, flyout: HTMLDivElement | null) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pte-hcell-menu-item";

      const btn = document.createElement("div");
      btn.className = `pte-hcell-menu-btn ${btnClass}`;
      const icon = document.createElement("span");
      icon.className = iconClass;
      btn.appendChild(icon);
      wrapper.appendChild(btn);
      if (flyout) {
        const hasFilter = this.core.getFilterModel().find(f => f.key === col.instanceID);
        if (hasFilter) {
          btn.classList.add("pte-hcell-menu-filter-active");
        }
        wrapper.appendChild(flyout);
      }

      return wrapper;
    };

    if (!isFalse(col.filter)) {
      if (col.children.length === 0) {
        menu.appendChild(buildMenuItem("pte-hcell-menu-filterBtn", "pte-filter-icon", this._getFilterMenuElement()));
      }
    }
    menu.appendChild(buildMenuItem("pte-hcell-menu-menuBtn", "pte-menu-icon", null));
    return menu;
  }

  _getFilterMenuElement(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu-flyout";
    return menu;
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
        const meta = this._leafColumnLookup.get(col.id);
        if (meta) {
          cell.dataset.colId = col.id;
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
      const meta = this._leafColumnLookup.get(col.id);
      if (meta) {
        cell.dataset.colId = col.id;
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
        const meta = this._leafColumnLookup.get(col.id);
        if (meta) {
          cell.dataset.colId = col.id;
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
    this.leftViewport.innerHTML = "";
    this.viewport.innerHTML = "";
    this.rightViewport.innerHTML = "";
    this._rowPool = [];

    for (let i = 0; i < this._poolSize; i++) {
      const row: RowPoolDef = {
        rowEl: document.createElement("div"),
        leftCellEls: [],
        cellEls: [],
        rightCellEls: [],
        cellRendererInstances: new Map<string, RendererRecord>(),
      };

      const leftLeaves = this.core.getColumnModel().getLeftLeaves();
      const centerLeaves = this.core.getColumnModel().getCenterLeaves();
      const rightLeaves = this.core.getColumnModel().getRightLeaves();
      if (leftLeaves.length > 0) {
        row.leftRowEl = document.createElement("div");
        row.leftRowEl.className = "pte-row";
        row.leftRowEl.style.height = `${this.rowHeight}px`;

        let leftIdx = 0;
        for (const col of leftLeaves) {
          if (col.hidden) continue;
          const cell = document.createElement("div");
          cell.className = "pte-cell";
          const meta = this.core.getColumnModel().leafColumnLookup.get(col.instanceID);
          if (meta) {
            cell.dataset.colId = col.instanceID;
            cell.dataset.colIdx = String(meta.globalIndex);
          }
          if (col.isComputableType()) cell.classList.add('pte-cell-right-aligned');
          row.leftRowEl.appendChild(cell);
          row.leftCellEls.push(cell);
          leftIdx++;
        }

        this.leftViewport.appendChild(row.leftRowEl);
      }

      row.rowEl = document.createElement("div");
      row.rowEl.className = "pte-row";
      row.rowEl.style.height = `${this.rowHeight}px`;

      let centerIdx = 0;
      for (const col of centerLeaves) {
        if (col.hidden) continue;
        const cell = document.createElement("div");
        cell.className = "pte-cell";
        const meta = this.core.getColumnModel().leafColumnLookup.get(col.instanceID);
        if (meta) {
          cell.dataset.colId = col.instanceID;
          cell.dataset.colIdx = String(meta.globalIndex);
        }
        if (col.isComputableType()) cell.classList.add('pte-cell-right-aligned');
        row.rowEl.appendChild(cell);
        row.cellEls.push(cell);
        centerIdx++;
      }

      this.viewport.appendChild(row.rowEl);

      if (rightLeaves.length > 0) {
        row.rightRowEl = document.createElement("div");
        row.rightRowEl.className = "pte-row";
        row.rightRowEl.style.height = `${this.rowHeight}px`;

        row.rightCellEls = [];
        let rightIdx = 0;
        for (const col of rightLeaves) {
          if (col.hidden) continue;
          const cell = document.createElement("div");
          cell.className = "pte-cell";
          const meta = this.core.getColumnModel().leafColumnLookup.get(col.instanceID);
          if (meta) {
            cell.dataset.colId = col.id;
            cell.dataset.colIdx = String(meta.globalIndex);
          }
          if (col.isComputableType()) cell.classList.add('pte-cell-right-aligned');
          row.rightRowEl.appendChild(cell);
          row.rightCellEls.push(cell);
          rightIdx++;
        }

        this.rightViewport.appendChild(row.rightRowEl);
      }

      this._rowPool.push(row);
    }

    // this._buildAggregateRow();
  }

  _rebuildRowPool() {
    // If columns change frequently, you’d do smarter diffing.
    this._buildRowPool();
  }

  _addSortIndicatorToHeader(key: string, dir: "asc" | "desc" | '') {
    const hcell = document.getElementById(key);
    if (!hcell) return;
    const hcellContent = hcell.querySelector(".pte-hcell-content");
    if (!hcellContent) return;
    // remove existing
    hcellContent.classList.remove("pte-sorted-asc", "pte-sorted-desc");
    // add new
    if (dir === '') return;
    hcellContent.classList.add("pte-sorted-" + dir);
  }

  // ---------------- Internals: hot path ----------------
  _scheduleWindowUpdate(scrollSrc: HTMLDivElement) {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._updateWindow(false, scrollSrc);
    });
  }

  _beginScrollSync(targets: HTMLDivElement[]) {
    if (targets.length === 0) return;
    for (const target of targets) {
      this._syncingScrollTargets.add(target);
    }
    if (this._syncingScrollRaf !== null) return;
    this._syncingScrollRaf = requestAnimationFrame(() => {
      this._syncingScrollTargets.clear();
      this._syncingScrollRaf = null;
    });
  }

  _renderCell(cell: HTMLDivElement, row: IRowNode, col: Column, cellRendererMap: Map<IRowNode>) {
    const rawValue = col.getValue(row);
    const displayValue = col.formatValue(rawValue, row);
    const renderer = col.cellRenderer;
    const rendererParams = getCellRendererParams(rawValue, displayValue, row, 0, col, cell, null);
    if (!renderer) {
      const rec: RendererRecord | undefined = cellRendererMap.get(col.id);
      if (rec) {
        rec.runtime.destroy();
        cellRendererMap.delete(col.id);
      }
      // text-only update
      cell.textContent = displayValue;
      return;
    }

    const rec: RendererRecord | undefined = cellRendererMap.get(col.id);
    // If renderer changed or missing, (re)create
    if (!rec || rec.renderer !== renderer) {
      rec?.runtime.destroy();
      const runtime = createRendererRuntime(renderer, rendererParams);
      cell.replaceChildren(runtime.gui);
      cellRendererMap.set(col.id, { renderer, runtime });// Same renderer instance: refresh
      return;
    }

    // Same renderer instance: refresh
    const ok = rec.runtime.refresh(rendererParams);

    // If refresh says "can't update", recreate
    if (ok === false) {
      rec.runtime.destroy();

      const runtime = createRendererRuntime(renderer, rendererParams);

      cell.replaceChildren(runtime.gui);
      rec.runtime = runtime;
    }
  }

  _updateWindow(forcePatch: boolean, scrollSrc?: HTMLDivElement, params?: GridEventRowsChangedParams) {
    const total = this.core.getRowModel().getViewCount();
    const scrollTop = scrollSrc?.scrollTop || 0;

    const syncTargets: HTMLDivElement[] = [];
    if (scrollSrc !== this.leftScroller && this.leftScroller.scrollTop !== scrollTop) {
      syncTargets.push(this.leftScroller);
    }
    if (scrollSrc !== this.scroller && this.scroller.scrollTop !== scrollTop) {
      syncTargets.push(this.scroller);
    }
    if (scrollSrc !== this.rightScroller && this.rightScroller.scrollTop !== scrollTop) {
      syncTargets.push(this.rightScroller);
    }
    if (scrollSrc !== this.vScroll && this.vScroll.scrollTop !== scrollTop) {
      syncTargets.push(this.vScroll);
    }

    this._beginScrollSync(syncTargets);
    for (const target of syncTargets) {
      target.scrollTop = scrollTop;
    }

    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.core.options.rowHeight) - this.core.options.overscanRowCount
    );

    const startIdx = params?.firstRowIndex ?? -1;
    if (!forcePatch && startIndex === startIdx) {
      // only translate to avoid jitter? typically not needed; startIndex stable means nothing to do.
      return;
    }

    // this._startIndex = startIndex;

    const offsetY = startIndex * this.rowHeight;
    this.leftViewport.style.transform = `translateY(${offsetY}px)`;
    this.viewport.style.transform = `translateY(${offsetY}px)`;
    this.rightViewport.style.transform = `translateY(${offsetY}px)`;

    // Patch pooled rows
    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIndex = startIndex + i;
      const slot = this._rowPool[i];

      if (viewIndex >= total) {
        slot.rowEl.style.display = "none";
        if (slot.leftRowEl) slot.leftRowEl.style.display = "none";
        if (slot.rightRowEl) slot.rightRowEl.style.display = "none";
        this._applySelectionToSlot(slot, null);
        continue;
      }

      slot.rowEl.style.display = "flex";
      if (slot.leftRowEl) slot.leftRowEl.style.display = "flex";
      if (slot.rightRowEl) slot.rightRowEl.style.display = "flex";
      const row = this.core.getRowModel().getRowNodeAtViewIndex(viewIndex);
      if (!row) continue;
      slot.rowEl.setAttribute("row-id", row.id);
      slot.rowEl.setAttribute("data-view-idx", String(viewIndex));

      if (slot.leftRowEl) {
        slot.leftRowEl.setAttribute("data-view-idx", String(viewIndex));
      }
      if (slot.rightRowEl) {
        slot.rightRowEl.setAttribute("data-view-idx", String(viewIndex));
      }

      // HOT: write textContent only (no re-render, no diff)
      const leftLeaves = this.core.getColumnModel().getLeftLeaves();
      if (leftLeaves.length > 0 && slot.leftCellEls) {
        slot.leftRowEl?.setAttribute("row-id", row.id);
        for (let c = 0; c < leftLeaves.length; c++) {
          const col = leftLeaves[c];
          this._renderCell(slot.leftCellEls[c], row, col, slot.cellRendererInstances);
        }
      }
      const centerLeaves = this.core.getColumnModel().getCenterLeaves();
      for (let c = 0; c < centerLeaves.length; c++) {
        const col = centerLeaves[c];
        this._renderCell(slot.cellEls[c], row, col, slot.cellRendererInstances);
      }
      const rightLeaves = this.core.getColumnModel().getRightLeaves();
      if (rightLeaves.length > 0 && slot.rightCellEls) {
        slot.rightRowEl?.setAttribute("row-id", row.id);
        for (let c = 0; c < rightLeaves.length; c++) {
          const col = this.core.rightLeaves[c];
          this._renderCell(slot.rightCellEls[c], row, col, slot.cellRendererInstances);
        }
      }
      // this._applySelectionToSlot(slot, viewIndex);
    }
  }

  _patchVisibleCells({ rowIds, colKeys } = {}) {
    // Minimal version: patch the currently visible pool.
    // rowIds/colKeys can be used to skip work if you pass them.
    const total = this._viewIdx.length;
    const startIndex = this._startIndex;

    const colKeySet: Set<string> | null = colKeys ? new Set(colKeys as string[]) : null;

    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIndex = startIndex + i;
      if (viewIndex >= total) continue;

      const row = this.data[this._viewIdx[viewIndex]];
      if (rowIds && !rowIds.has?.(row.id) && !rowIds.includes?.(row.id)) continue;

      const slot = this._rowPool[i];

      const apply = (cells: HTMLDivElement[], cols: Column[]) => {
        for (let c = 0; c < cols.length; c++) {
          const col = cols[c];
          if (colKeySet && !colKeySet.has(col.key)) continue;
          const cell = cells[c];
          if (!cell) continue;
          this._renderCell(cell, row, col);
        }
      };

      apply(slot.leftCellEls, this.core.leftLeaves);
      apply(slot.cellEls, this.core.centerLeaves);
      apply(slot.rightCellEls, this.core.rightLeaves);
    }
  }

  _applySelectionToSlot(slot: RowPoolDef, viewIndex: number | null) {
    const range = this._selectionRange;
    const rowSelected = !!range && viewIndex != null && viewIndex >= range.rowStart && viewIndex <= range.rowEnd;
    const firstRow = viewIndex === 0;
    const lastRow = viewIndex != null ? viewIndex === this._viewIdx.length - 1 : false;

    const apply = (cells: HTMLDivElement[], order: number[]) => {
      if (!cells) return;
      for (let i = 0; i < cells.length; i++) {
        const colIdx = order[i];
        const leafCol = Number.isFinite(colIdx) ? this.core.leaves[colIdx] : null;
        const colId = leafCol?.id;
        const colSelected = colId ? this._selectedColumnIDs.has(colId) : false;

        const rangeSelected = !!rowSelected && range && Number.isFinite(colIdx) && colIdx >= range.colStart && colIdx <= range.colEnd;
        const selected = rangeSelected || colSelected;

        const prevColIdx = order[i - 1];
        const nextColIdx = order[i + 1];
        const prevSelected = (() => {
          if (Number.isFinite(prevColIdx)) {
            if (range && prevColIdx >= range.colStart && prevColIdx <= range.colEnd) return true;
            const prevCol = this.core.leaves[prevColIdx];
            if (prevCol && this._selectedColumnIDs.has(prevCol.id)) return true;
          }
          return false;
        })();
        const nextSelected = (() => {
          if (Number.isFinite(nextColIdx)) {
            if (range && nextColIdx >= range.colStart && nextColIdx <= range.colEnd) return true;
            const nextCol = this.core.leaves[nextColIdx];
            if (nextCol && this._selectedColumnIDs.has(nextCol.id)) return true;
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
    const total = this.core.rowModel.getViewCount();
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
        if (this._selectedColumnIDs.has(col.id)) keep.add(col.id);
        if (col.children) visit(col.children);
      }
    };
    visit(this.core.columns);

    this._selectedColumnIDs = keep;
  }

  _clampSelectionToView() {
    if (!this._selectionRange) return;
    if (this._viewIdx.length === 0 || this._leafColumns.length === 0) {
      this._clearSelection();
      return;
    }

    const maxRow = this._viewIdx.length - 1;
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
    if (location.viewIdx < 0 || location.viewIdx >= this._viewIdx.length) return;
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
    if (this._viewIdx.length === 0 || this._leafColumns.length === 0) {
      this._clearSelection();
      return;
    }

    const maxRow = this._viewIdx.length - 1;
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
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement | null)?.closest(".pte-hcell-resize-handle") as HTMLElement | null;
    if (handle) {
      const header = handle.closest(".pte-hcell") as HTMLDivElement | null;
      if (!header) return;
      const col = this.core.getColumnModel().getById(header.id);
      if (!col || col.hidden) return;
      if (!col.resizable) return;

      const headerRect = header.getBoundingClientRect();
      this._resizingColumn = col.instanceID;
      this._resizeStartX = e.clientX;
      this._resizeStartWidth = headerRect.width;
      this._suppressHeaderClick = true;
      document.body.style.cursor = "col-resize";
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const header = (e.target as HTMLElement | null)?.closest(".pte-hcell") as HTMLDivElement | null;
    if (!header) return;
    const col = this.core.getColumnModel().getById(header.id);
    if (!col || col.hidden) return;
    if ((e.target as HTMLElement | null)?.closest(".pte-hcell-menu-btn")) return;
    const allowDrop = col.movable;
    this._maybeStartColumnDrag(col, header, e, allowDrop);
  }

  _onColumnResizeMouseMove(e: MouseEvent) {
    if (this._resizingColumn === "") return;
    const delta = e.clientX - this._resizeStartX;
    const nextWidth = this._resizeStartWidth + delta;
    this._applyColumnResize(this._resizingColumn, nextWidth);
    e.preventDefault();
  }

  _onColumnResizeMouseUp() {
    if (!this._isResizingColumn) return;
    this._isResizingColumn = false;
    this._resizingColumn = null;
    this._resizeStartX = 0;
    this._resizeStartWidth = 0;
    document.body.style.cursor = "";
    this._suppressHeaderClick = true;
    setTimeout(() => { this._suppressHeaderClick = false; }, 0);
  }

  _maybeStartColumnDrag(col: Column, header: HTMLDivElement, e: MouseEvent, allowDrop = true) {
    const reorderable = this._isColumnReorderable(col);
    if (allowDrop && !reorderable) return;
    this._draggingColumn = col;
    this._dragHeaderEl = header;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragLastX = e.clientX;
    this._dragAllowsDrop = allowDrop && reorderable;
    const meta = this._leafColumnLookup.get(col.id);
    const section = meta?.section ?? (col.pinned === "left" ? "left" : col.pinned === "right" ? "right" : "center");
    this._dragSection = section;
    this._dragHeaderContainer = this._getSectionContainer(section);
    this._dragTargetIndex = this._dragAllowsDrop
      ? this._getReorderableColumns(section).findIndex(c => c.id === col.id)
      : -1;
    this._isDraggingColumn = false;
    this._dragDirection = null;
  }

  _beginColumnDrag() {
    if (!this._draggingColumn) return;
    this._isDraggingColumn = true;
    this._setDragCursor(true, this._dragAllowsDrop);

    if (!this._dragGhostEl) {
      const ghost = document.createElement("div");
      ghost.className = "pte-column-drag-ghost";
      const ghostContent = document.createElement("div");
      ghostContent.className = "pte-column-drag-ghost-content";
      const ghostDragIcon = document.createElement("span");
      ghostDragIcon.className = "pte-column-drag-ghost-icon";
      if (this._dragAllowsDrop) {
        ghostDragIcon.classList.add("icon-drag");
      } else {
        ghostDragIcon.classList.add("icon-not-allowed");
      }
      ghostContent.appendChild(ghostDragIcon);
      const ghostLabel = document.createElement("span");
      ghostLabel.className = "pte-column-drag-ghost-label";
      ghostLabel.textContent = this._draggingColumn.label ?? this._draggingColumn.key;
      ghostContent.appendChild(ghostLabel);
      ghost.appendChild(ghostContent);
      if (this._dragHeaderEl) {
        const rect = this._dragHeaderEl.getBoundingClientRect();
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
      }
      document.body.appendChild(ghost);
      const contentRect = ghostContent.getBoundingClientRect();
      ghost.style.width = `${contentRect.width}px`; // padding
      ghost.style.height = `${contentRect.height}px`;
      this._dragGhostEl = ghost;
    }

    if (this._dragAllowsDrop && !this._dragIndicatorEl && this._dragHeaderContainer) {
      const indicator = document.createElement("div");
      indicator.className = "pte-column-drop-indicator";
      indicator.style.height = `${this.headerWrapper.getBoundingClientRect().height || this.rowHeight * this._maxDepth}px`;
      this._dragHeaderContainer.appendChild(indicator);
      this._dragIndicatorEl = indicator;
    }
  }

  _getSectionContainer(section: "left" | "center" | "right") {
    if (section === "left") return this.leftHeader;
    if (section === "right") return this.rightHeader;
    return this.header;
  }

  _getSectionForPoint(x: number, y: number): "left" | "center" | "right" | null {
    const candidates: Array<{ section: "left" | "center" | "right"; el: HTMLElement }> = [
      { section: "left", el: this.leftHeader },
      { section: "center", el: this.header },
      { section: "right", el: this.rightHeader },
      { section: "left", el: this.leftScroller },
      { section: "center", el: this.scroller },
      { section: "right", el: this.rightScroller },
    ];
    for (const { section, el } of candidates) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return section;
      }
    }
    return null;
  }

  _getReorderableColumns(section: "left" | "center" | "right" = "center"): Column[] {
    const source = section === "left"
      ? this._leftPinnedColumns
      : section === "right"
        ? this._rightPinnedColumns
        : this._centerColumns;
    return source.filter(c => this._isColumnReorderable(c));
  }

  _getReorderableHeaders(section: "left" | "center" | "right" = "center"): Array<{ col: Column; el: HTMLDivElement }> {
    const container = section === "left"
      ? this.leftHeader
      : section === "right"
        ? this.rightHeader
        : this.header;
    const headers = Array.from(container.children) as HTMLDivElement[];
    const output: Array<{ col: Column; el: HTMLDivElement }> = [];
    for (const el of headers) {
      if (!el.classList.contains("pte-hcell")) continue;
      const col = findColumnById(this.columns, el.id);
      if (!col) continue;
      if (col.children.length > 0) {
        const leaves = collectLeaves(col);
        leaves.filter(this._isColumnReorderable).forEach(leaf => {
          output.push({ col: leaf, el: document.getElementById(leaf.id) as HTMLDivElement });
        });
        continue;
      } else if (this._isColumnReorderable(col)) {
        output.push({ col, el });
      }
    }
    return output.filter(h => h.el != null);
  }

  _positionDropIndicator(targetIndex: number, hoverIndex: number, headers: Array<{ col: Column; el: HTMLDivElement }>) {
    if (!this._dragIndicatorEl || headers.length === 0) return;
    if (targetIndex < 0) {
      this._dragIndicatorEl.style.display = "none";
      return;
    }
    const container = this._dragHeaderContainer || this.header;
    const containerRect = container.getBoundingClientRect();
    const prev = targetIndex >= headers.length ? headers[headers.length - 1] : headers[hoverIndex];
    const ref = targetIndex >= headers.length ? headers[headers.length - 1] : headers[targetIndex];
    const rect = ref.el.getBoundingClientRect();
    const x = targetIndex >= headers.length ? rect.right : rect.left;
    const relativeX = x - containerRect.left + container.scrollLeft;
    const clampedX = Math.max(0, Math.min(relativeX, Math.max(0, container.scrollWidth - 2)));
    this._dragIndicatorEl.style.left = `${clampedX}px`;
    this._dragIndicatorEl.style.display = "block";
    // this._dragIndicatorEl.style.height = `${this.headerWrapper.getBoundingClientRect().height || this.rowHeight * this._maxDepth}px`;
    // console.log(ref.el, ref.el.offsetTop, ref.el.getBoundingClientRect().height);
    this._dragIndicatorEl.style.top = prev.el.offsetTop + "px";
    this._dragIndicatorEl.style.height = `${prev.el.getBoundingClientRect().height}px`;
  }

  _onColumnDragMouseMove(e: MouseEvent) {
    if (!this._draggingColumn) return;
    const deltaX = Math.abs(e.clientX - this._dragStartX);
    const deltaY = Math.abs(e.clientY - this._dragStartY);
    if (!this._isDraggingColumn) {
      if (deltaX < COLUMN_DRAG_THRESHOLD_PX && deltaY < COLUMN_DRAG_THRESHOLD_PX) return;
      this._beginColumnDrag();
      this._suppressHeaderClick = true;
    }

    const drift = e.clientX - this._dragStartX;
    if (Math.abs(drift) >= COLUMN_DRAG_THRESHOLD_PX) {
      const nextDir = drift >= 0 ? "right" : "left";
      this._dragDirection = nextDir;
    }

    if (this._dragGhostEl) {
      this._dragGhostEl.style.left = `${e.clientX + 8}px`;
      this._dragGhostEl.style.top = `${e.clientY + 8}px`;
    }

    if (!this._dragAllowsDrop) {
      this._dragTargetIndex = -1;
      e.preventDefault();
      return;
    }

    const sectionAtPointer = this._getSectionForPoint(e.clientX, e.clientY) || this._dragSection || "center";
    if (sectionAtPointer !== this._dragSection) {
      this._dragSection = sectionAtPointer;
      this._dragHeaderContainer = this._getSectionContainer(sectionAtPointer);
      if (this._dragIndicatorEl && this._dragHeaderContainer && this._dragIndicatorEl.parentElement !== this._dragHeaderContainer) {
        this._dragIndicatorEl.remove();
        this._dragHeaderContainer.appendChild(this._dragIndicatorEl);
      }
    }

    const section = this._dragSection || "center";
    const headers = this._getReorderableHeaders(section);
    if (headers.length === 0) {
      this._dragTargetIndex = -1;
      return;
    }

    const originRect = this._dragHeaderEl?.getBoundingClientRect();
    const insideOrigin = originRect
      && e.clientX >= originRect.left
      && e.clientX <= originRect.right
      && e.clientY >= originRect.top
      && e.clientY <= originRect.bottom;
    if (insideOrigin) {
      this._dragTargetIndex = -1;
      this._positionDropIndicator(-1, -1, headers);
      this._dragLastX = e.clientX;
      return;
    }

    let hoverIndex = headers.findIndex(h => {
      const rect = h.el.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right;
    });

    let targetIndex: number;
    const movingRight = this._dragDirection === "right" || (this._dragDirection === null && e.clientX >= this._dragLastX);
    if (hoverIndex === -1) {
      // Outside bounds: snap to start/end
      const firstRect = headers[0].el.getBoundingClientRect();
      if (e.clientX < firstRect.left) {
        targetIndex = 0;
      } else {
        targetIndex = headers.length;
      }
    } else {
      targetIndex = movingRight ? hoverIndex + 1 : hoverIndex;
    }

    this._dragLastX = e.clientX;
    this._dragTargetIndex = targetIndex;
    this._positionDropIndicator(targetIndex, hoverIndex, headers);
    e.preventDefault();
  }

  _applyColumnReorder(col: Column, targetIndex: number, section: "left" | "center" | "right" = this._dragSection || "center") {
    if (targetIndex < 0) return;

    const newLeft = this._leftPinnedColumns.slice();
    const newCenter = this._centerColumns.slice();
    const newRight = this._rightPinnedColumns.slice();

    const targetSection = section === "left" ? newLeft : section === "right" ? newRight : newCenter;
    let targetArr = section === "left" ? this._leftPinnedLeafColumns : section === "right" ? this._rightPinnedColumns : this._centerLeafColumns;
    const appendAtEnd = targetIndex >= targetArr.length;
    const firstRight = targetArr[targetIndex];

    const ancestors = getColumnAncestors(this.columns, col.id);
    let topLevelDrag = col;
    if (ancestors.length > 1) {
      // Find the top-level ancestor that is reorderable
      for (const c of ancestors.slice().reverse()) {
        if ((getVisibleChildren(c)).length > 1) {
          break;
        }
        topLevelDrag = c;
      }
    }
    const splitParent = ancestors.length > 1 && ancestors[0].id != topLevelDrag.id;

    if (splitParent) {
      topLevelDrag = newColumnHierarchy(ancestors, topLevelDrag);
    } else {
      const source = col.pinned === "left" ? newLeft : col.pinned === "right" ? newRight : newCenter;
      const idx = source.findIndex(c => c.id === topLevelDrag.id);
      if (idx >= 0) source.splice(idx, 1);
    }

    targetArr = targetSection.map(c => collectLeaves(c, true)).flat();
    let moveTo = 0;
    if (firstRight) {
      const firstRightAncestors = getColumnAncestors(this.columns, firstRight.id);
      moveTo = targetSection.findIndex(c => c.id === firstRightAncestors[0].id);
      if (firstRightAncestors.length > 1) {
        const [leftTree, rightTree] = splitTreeAtColumn(firstRightAncestors[0], firstRight);
        if (leftTree) {
          targetSection[moveTo] = leftTree;
          moveTo++;
        }
        if (rightTree) {
          targetSection.splice(moveTo, 0, rightTree);
        } else {
          moveTo--;
        }
      }
    } else if (appendAtEnd) {
      moveTo = targetSection.length;
    }

    const movedCol: Column = { ...topLevelDrag, pinned: section === "center" ? null : section };
    if (topLevelDrag.pinned !== movedCol.pinned && movedmovedCol.children.length > 0) {
      // If moving between sections, and has children, we need to adjust the pinned state of children
      const newPinned = section === "center" ? null : section;
      adjustPinned(movedCol.children, newPinned);
    }
    targetSection.splice(moveTo, 0, movedCol);

    const nextLeft = mergeColumns(newLeft);
    const nextCenter = mergeColumns(newCenter);
    const nextRight = mergeColumns(newRight);
    this.setColumns([
      ...nextLeft,
      ...nextCenter,
      ...nextRight,
    ], { preserveWidths: true });
  }

  _animateDragGhostReturn(ghost: HTMLDivElement, header: HTMLDivElement | null) {
    if (!ghost.isConnected) return;
    if (!header) {
      ghost.remove();
      return;
    }
    const headerRect = header.getBoundingClientRect();
    const ghostRect = ghost.getBoundingClientRect();
    const targetLeft = headerRect.left + (headerRect.width - ghostRect.width) / 2;
    const targetTop = headerRect.top + (headerRect.height - ghostRect.height) / 2;
    ghost.style.transition = "left 120ms ease, top 120ms ease";
    ghost.style.transitionDelay = "0s";
    ghost.style.left = `${targetLeft}px`;
    ghost.style.top = `${targetTop}px`;
    const cleanup = () => {
      ghost.removeEventListener("transitionend", cleanup);
      ghost.remove();
    };
    ghost.addEventListener("transitionend", cleanup);
    setTimeout(() => {
      if (ghost.isConnected) ghost.remove();
    }, 180);
  }

  _teardownColumnDrag() {
    const ghost = this._dragGhostEl;
    if (ghost) {
      this._animateDragGhostReturn(ghost, this._dragHeaderEl);
      this._dragGhostEl = null;
    }
    if (this._dragIndicatorEl) {
      this._dragIndicatorEl.remove();
      this._dragIndicatorEl = null;
    }
    this._draggingColumn = null;
    this._dragHeaderEl = null;
    this._dragHeaderContainer = null;
    this._dragSection = null;
    this._isDraggingColumn = false;
    this._dragTargetIndex = -1;
    this._dragAllowsDrop = false;
    this._setDragCursor(false);
  }

  _onColumnDragMouseUp() {
    if (!this._draggingColumn) return;
    const col = this._draggingColumn;
    const targetIndex = this._dragTargetIndex;
    const section = this._dragSection || "center";
    const performedDrag = this._isDraggingColumn;
    const allowDrop = this._dragAllowsDrop;
    this._teardownColumnDrag();
    if (!performedDrag) return;
    if (!allowDrop) {
      this._suppressHeaderClick = true;
      setTimeout(() => { this._suppressHeaderClick = false; }, 0);
      return;
    }
    this._applyColumnReorder(col, targetIndex, section);
    this._suppressHeaderClick = true;
    setTimeout(() => { this._suppressHeaderClick = false; }, 0);
  }

  _isColumnReorderable(col: Column): boolean {
    if (!col) return false;
    if (col.hidden || !col.columnGroupVisible) return false;
    return true;
  }

  _setDragCursor(active: boolean, allowDrop = true) {
    const cursor = active ? (allowDrop ? "move" : "not-allowed") : "";
    document.body.style.setProperty("cursor", cursor, "important");
    if (this.headerWrapper) {
      this.headerWrapper.style.setProperty("cursor", cursor, "important");
    }
    this.root.classList.toggle("pte-column-dragging", active && allowDrop);
    this.root.classList.toggle("pte-column-dragging-not-allowed", active && !allowDrop);
  }

  _onHeaderDoubleClick(e: MouseEvent) {
    const handle = (e.target as HTMLElement | null)?.closest(".pte-hcell-resize-handle") as HTMLElement | null;
    if (!handle) return;
    const header = handle.closest(".pte-hcell") as HTMLDivElement | null;
    if (!header) return;
    this.core.dispatch({
      type: "columnAutosize",
      colId: header.id,
    });
    e.preventDefault();
    e.stopPropagation();
  }

  _applyColumnResize(colId: string, rawWidth: number) {
    this.core.dispatch({
      type: "columnResize",
      colId: colId,
      widthPx: rawWidth,
    });
  }

  _updateAncestorWidths(colID: string) {
    const ancestors = getColumnAncestors(this.columns, colID);
    if (ancestors.length <= 1) return;

    for (let i = ancestors.length - 2; i >= 0; i--) {
      const ancestor = ancestors[i];
      const ancestorInfo = this._columnWidths.get(ancestor.id);
      if (ancestorInfo?.fixed) continue;
      if (!ancestor.children || ancestor.children.length === 0) continue;
      let totalWidth = 0;
      for (const child of ancestor.children) {
        if (isTrue(child.hidden)) continue;
        const childInfo = this._columnWidths.get(child.id);
        if (childInfo) totalWidth += childInfo.width;
      }
      const minWidth = Math.max(this.core.options.minResizeWidth, ancestor.minWidth ?? ancestorInfo?.minWidth ?? this.core.options.minResizeWidth);
      let maxWidth = ancestor.maxWidth ?? ancestorInfo?.maxWidth ?? 420;
      maxWidth = Math.max(maxWidth, totalWidth);
      const width = Math.min(Math.max(totalWidth, minWidth), maxWidth);
      this._columnWidths.set(ancestor.id, {
        width,
        minWidth,
        maxWidth,
        fixed: false,
      });
    }
  }

  _applyColumnSelectionStyles() {
    const leafIndexMap = new Map<string, number>();
    this.core.leaves.forEach((c, idx) => leafIndexMap.set(c.id, idx));

    const selectedLeafIdx = new Set<number>();
    this.core.leaves.forEach((c, idx) => {
      if (this._selectedColumnIDs.has(c.id)) selectedLeafIdx.add(idx);
    });

    const getRange = (col: Column | null): [number, number] | null => {
      if (!col) return null;
      if (col.hidden) return null;
      if (!col.children || col.children.length === 0) {
        const idx = leafIndexMap.get(col.id);
        return idx == null ? null : [idx, idx];
      }
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const visit = (c: Column) => {
        if (isTrue(c.hidden)) return;
        if (!c.children || c.children.length === 0) {
          const idx = leafIndexMap.get(c.id);
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
      const col = this.core.getColumnById(h.id);
      const selected = !!col && this._selectedColumnIDs.has(col.id);
      const range = col ? getRange(col) : null;
      const leftSelected = !!range && selectedLeafIdx.has(range[0] - 1);
      const rightSelected = !!range && selectedLeafIdx.has(range[1] + 1);

      let parent = false;
      if (selected) {
        const tree = this.core.getAncestors(col);
        const treeLen = tree.length;
        if (treeLen > 1) {
          parent = this._selectedColumnIDs.has(tree[treeLen - 2].id);
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
    const col = findColumnById(this.columns, colID);
    if (!col) return;

    const leaves = collectLeaves(col, true);
    const hasChildren = col.children.length > 0;

    if (hasChildren) {
      const ids = new Set<string>();
      for (const leaf of leaves) ids.add(leaf.id);

      const allSelected = Array.from(ids).every(id => this._selectedColumnIDs.has(id));
      if (allSelected) {
        ids.forEach(id => this._selectedColumnIDs.delete(id));
      } else {
        ids.forEach(id => this._selectedColumnIDs.add(id));
      }
    } else {
      if (this._selectedColumnIDs.has(col.id)) {
        this._selectedColumnIDs.delete(col.id);
      } else {
        this._selectedColumnIDs.add(col.id);
      }
    }

    const colsWithSelectedChildren = new Map<string, Column>();
    for (const selectedColID of this._selectedColumnIDs) {
      const col = findColumnById(this.columns, selectedColID);
      if (!col) continue;
      if (col.children.length > 0) colsWithSelectedChildren.set(col.id, col);
      else {
        const tree = getColumnAncestors(this.columns, selectedColID);
        if (tree.length > 1) {
          tree.slice(0, -1).forEach(e => colsWithSelectedChildren.set(e.id, e));
        }
      }
    }

    for (const col of colsWithSelectedChildren.values()) {
      const leaves = collectLeaves(col, true);
      if (leaves.filter(l => this._selectedColumnIDs.has(l.id)).length == leaves.length) {
        this._selectedColumnIDs.add(col.id);
      } else {
        this._selectedColumnIDs.delete(col.id);
      }
    }

    this._applyColumnSelectionStyles();
    this._refreshSelectionStyles();
  }

  _toggleColumnGroupExpanded(colID: string) {
    const col = findColumnById(this.columns, colID);
    if (!col || !col.children || col.children.length === 0) return;
    if (col.groupExpandState == "open") {
      col.groupExpandState = "closed";
    } else {
      col.groupExpandState = "open";
    }
    this.setColumns(this.columns, { preserveWidths: true });
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
      if (!this._filterOverlay.contains(e.target)) this._closeFilter();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._closeFilter();
    });
  }

  _initLoadingOverlay() {
    this._loadingOverlay.className = "pte-loading-overlay hidden";

    const spinner = document.createElement("div");
    spinner.className = "pte-loading-spinner";

    const label = document.createElement("div");
    label.className = "pte-loading-label";
    label.textContent = "Loading data…";

    this._loadingOverlay.appendChild(spinner);
    this._loadingOverlay.appendChild(label);

    this.root.appendChild(this._loadingOverlay);
  }

  _updateLoadingOverlay() {
    const shouldShow = this._serverLoading || this._externalLoading;
    if (shouldShow) {
      this._loadingOverlay.classList.remove("hidden");
    } else {
      this._loadingOverlay.classList.add("hidden");
    }
  }

  _setServerLoading(isLoading: boolean, requestId?: number) {
    if (isLoading) {
      if (this.rowModel !== "serverSide") return;
      this._serverLoading = true;
      this._updateLoadingOverlay();
      return;
    }
    if (requestId != null && requestId !== this._serverRequestSeq) return;
    this._serverLoading = false;
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
    return;
    this._menuColKey = colID;

    const items = this._getMenuItemsForColumn(colID);

    this._hideMenuLevels(0);
    this._menuItemsByLevel[0] = items;
    this._menuParentIds[0] = null;
    this._renderMenuItems(this._menuOverlay, items);

    // Position near button
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.left;
      top = r.bottom + 4;
    } else {
      left = left || 100;
      top = top || 100;
    }
    const bounds = this._getMenuBounds();
    this._menuOverlay.style.visibility = "hidden";
    this._menuOverlay.style.minWidth = "220px";
    this._menuOverlay.style.display = "flex";
    this._menuOverlay.style.left = `${left}px`;
    this._menuOverlay.style.top = `${top}px`;
    const menuRect = this._menuOverlay.getBoundingClientRect();
    this._menuOverlay.style.opacity = "1";
    if (left + menuRect.width > bounds.right) {
      left = bounds.right - menuRect.width;
    }
    if (left < bounds.left) {
      left = bounds.left;
    }
    if (top + menuRect.height > bounds.bottom) {
      top = bounds.bottom - menuRect.height;
    }
    if (top < bounds.top) {
      top = bounds.top;
    }
    this._menuOverlay.style.left = `${left}px`;
    this._menuOverlay.style.top = `${top}px`;
    this._menuOverlay.style.visibility = "visible";
  }

  _openMultiColMenu(left: number, top: number) {
    this._menuColKey = crypto.randomUUID();

    let sortable = true;
    let groupable = true;
    let hideable = true;
    let colTypes: ColumnType | "mixed" | null = null;
    let sortDir: "asc" | "desc" | "mixed" | null = null;
    let selectedCount = 0;
    for (const colID of this._selectedColumnIDs) {
      const col = findColumnById(this.columns, colID);
      if (!col) continue;
      if (col.children.length > 0) continue;
      selectedCount++;
      if (!col.sortable) {
        sortable = false;
      } else if (sortDir !== "mixed") {
        const sort = this._sorts.find(s => s.key === colID);
        if (sort) {
          if (!sortDir) {
            sortDir = sort.dir;
          } else if (sort.dir !== sortDir) {
            sortDir = "mixed";
          }
        }
      }
      if (!col.groupable) groupable = false;
      if (!col.hideable) hideable = false;
      const colType = col.type || ColumnType.STRING;
      if (!colTypes) {
        colTypes = colType;
      } else if (colTypes == "mixed") {
        continue;
      } else if (colType !== colTypes) {
        colTypes = "mixed";
      }
    }

    const items: MenuItem[] = [];
    items.push({
      id: 'clear-selection',
      label: "Clear Column Selection",
      onClick: () => this._clearColumnSelection(),
      left: "icon-clear",
    });
    items.push({ isSeparator: true });
    if (sortable) {
      if (sortDir === "asc") {
        items.push({
          id: 'sort-desc',
          label: "Sort Desc",
          onClick: () => this._sortBySelectedColumns("desc"),
          left: "icon-desc",
        }, {
          id: 'clear-sorts',
          label: "Clear Sorts",
          onClick: () => this._clearSortsForSelectedColumns(),
          left: "icon-sort-clear",
        });
      } else if (sortDir === "desc") {
        items.push({
          id: 'sort-asc',
          label: "Sort Asc",
          onClick: () => this._sortBySelectedColumns("asc"),
          left: "icon-asc",
        }, {
          id: 'clear-sorts',
          label: "Clear Sorts",
          onClick: () => this._clearSortsForSelectedColumns(),
          left: "icon-sort-clear",
        });
      } else {
        items.push({
          id: 'sort-asc',
          label: "Sort Asc",
          onClick: () => this._sortBySelectedColumns("asc"),
          left: "icon-asc",
        });
        items.push({
          id: 'sort-desc',
          label: "Sort Desc",
          onClick: () => this._sortBySelectedColumns("desc"),
          left: "icon-desc",
        });
      }
      items.push({ isSeparator: true });
    }
    if (hideable) {
      items.push({
        id: 'hide-columns',
        label: "Hide Selected Columns",
        onClick: () => this._hideSelectedColumns(),
        left: "icon-col-hide",
      });
      items.push({ isSeparator: true });
    }
    if (groupable) {
      items.push({
        id: 'group-by-columns',
        label: "Group by Selected Columns",
        onClick: () => this._groupBySelectedColumns(),
        left: "icon-group",
      });
    }
    if (colTypes && colTypes !== "mixed") {
      const item: MenuItem = {
        id: 'aggregate',
        label: "Aggregate",
        subMenu: [],
      };
      if (isComputableType(colTypes as ColumnType)) {
        item.subMenu = [{
          id: 'sum',
          label: "Sum",
          onClick: () => this._aggregateSelectedColumns(AggregateType.SUM),
          extra: AggregateType.SUM,
        },
        {
          id: 'avg',
          label: "Average",
          onClick: () => this._aggregateSelectedColumns(AggregateType.AVG),
          extra: AggregateType.AVG,
        },
        {
          id: 'min',
          label: "Min",
          onClick: () => this._aggregateSelectedColumns(AggregateType.MIN),
          extra: AggregateType.MIN,
        },
        {
          id: 'max',
          label: "Max",
          onClick: () => this._aggregateSelectedColumns(AggregateType.MAX),
          extra: AggregateType.MAX,
        },
        {
          id: 'median',
          label: "Median",
          onClick: () => this._aggregateSelectedColumns(AggregateType.MEDIAN),
          extra: AggregateType.MEDIAN,
        }];
      } else {
        item.subMenu = [{
          id: 'min',
          label: "Min",
          onClick: () => this._aggregateSelectedColumns(AggregateType.MIN),
          extra: AggregateType.MIN,
        },
        {
          id: 'max',
          label: "Max",
          onClick: () => this._aggregateSelectedColumns(AggregateType.MAX),
          extra: AggregateType.MAX,
        }];
      }
      items.push(item);
    }
    const exportMenuItems = this._getExportMenuItems(true);
    if (exportMenuItems.length > 0) {
      items.push({ isSeparator: true });
      items.push(...exportMenuItems);
    }
    if (isComputableType(colTypes as ColumnType) && selectedCount > 1) {
      items.push({ isSeparator: true });
      items.push({
        id: 'sparkline',
        label: "Show Sparklines",
        subMenu: [
          {
            id: 'sparkline-line',
            label: "Line Sparkline",
            onClick: () => this._showSparklinesForSelectedColumns("line"),
          },
          {
            id: 'sparkline-bar',
            label: "Bar Sparkline",
            onClick: () => this._showSparklinesForSelectedColumns("bar"),
          },
          {
            id: 'sparkline-column',
            label: "Column Sparkline",
            onClick: () => this._showSparklinesForSelectedColumns("column"),
          },
        ],
      });
    }

    this._hideMenuLevels(0);
    this._menuItemsByLevel[0] = items;
    this._menuParentIds[0] = null;
    this._renderMenuItems(this._menuOverlay, items);

    // Position
    const bounds = this._getMenuBounds();
    this._menuOverlay.style.visibility = "hidden";
    this._menuOverlay.style.minWidth = "220px";
    this._menuOverlay.style.display = "flex";
    this._menuOverlay.style.left = `${left}px`;
    this._menuOverlay.style.top = `${top}px`;
    const menuRect = this._menuOverlay.getBoundingClientRect();
    this._menuOverlay.style.opacity = "1";
    if (left + menuRect.width > bounds.right) {
      left = bounds.right - menuRect.width;
    }
    if (left < bounds.left) {
      left = bounds.left;
    }
    if (top + menuRect.height > bounds.bottom) {
      top = bounds.bottom - menuRect.height;
    }
    if (top < bounds.top) {
      top = bounds.top;
    }
    this._menuOverlay.style.left = `${left}px`;
    this._menuOverlay.style.top = `${top}px`;
    this._menuOverlay.style.visibility = "visible";
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

  _getMenuItemsForColumn(colID: string): MenuItem[] {
    let col = findColumnById(this.columns, colID);
    if (!col) return [];

    const isHidden = !!col.hidden;
    const isPinned = col.pinned === "left" || col.pinned === "right";

    const sort = this._sorts.find(s => s.key === colID);

    let aggregateTypes: MenuItem[] = [
      {
        id: 'min',
        label: "Min",
        onClick: () => this._aggregate(colID, AggregateType.MIN),
        extra: AggregateType.MIN,
      },
      {
        id: 'max',
        label: "Max",
        onClick: () => this._aggregate(colID, AggregateType.MAX),
        extra: AggregateType.MAX,
      },
    ];
    if (col.isComputableType()) {
      aggregateTypes = [
        {
          id: 'sum',
          label: "Sum",
          onClick: () => this._aggregate(colID, AggregateType.SUM),
          extra: AggregateType.SUM,
        },
        {
          id: 'avg',
          label: "Average",
          onClick: () => this._aggregate(colID, AggregateType.AVG),
          extra: AggregateType.AVG,
        },
        ...aggregateTypes,
        {
          id: 'median',
          label: "Median",
          onClick: () => this._aggregate(colID, AggregateType.MEDIAN),
          extra: AggregateType.MEDIAN,
        },
      ]
    }

    if (this._aggregates.has(col.id)) {
      aggregateTypes.push(
        {
          id: 'remove-agg',
          label: "Remove Aggregation",
          onClick: () => this._aggregate(colID, undefined),
        },
      )
    }

    const aggType = this._aggregates.get(col.id);
    if (aggType) {
      aggregateTypes.forEach(e => e.disabled = e.extra == aggType);
    }

    const items: MenuItem[] = [];
    if (col.sortable) {
      if (!sort) {
        items.push({ id: 'sort-asc', label: "Sort Asc", onClick: () => this.setSort({ key: colID, dir: "asc" }), left: "icon-asc" });
        items.push({ id: 'sort-desc', label: "Sort Desc", onClick: () => this.setSort({ key: colID, dir: "desc" }), left: "icon-desc" });
      } else if (sort.dir === "asc") {
        items.push({ id: 'sort-desc', label: "Sort Desc", onClick: () => this.setSort({ key: colID, dir: "desc" }), left: "icon-desc" });
        items.push({ id: 'sort-clear', label: "Clear Sort", onClick: () => this.setSort(sort), left: "icon-clear" });
      } else {
        items.push({ id: 'sort-asc', label: "Sort Asc", onClick: () => this.setSort({ key: colID, dir: "asc" }), left: "icon-asc" });
        items.push({ id: 'sort-clear', label: "Clear Sort", onClick: () => this.setSort(sort), left: "icon-clear" });
      }
      items.push({ isSeparator: true });
    }
    if (col.hideable) {
      items.push({
        id: 'toggle-hidden',
        label: isHidden ? "Show Column" : "Hide Column",
        onClick: () => this._toggleColumnHidden(colID),
        left: !isHidden ? "icon-col-hide" : '',
      });
      items.push({ isSeparator: true });
    }
    if (col.groupable) {
      items.push({
        id: 'group-by',
        label: "Group by " + (col.label || col.key),
        onClick: () => this._groupByColumn(colID),
        left: "icon-group",
      });
    }
    items.push({
      id: 'agg',
      label: "Aggregate",
      subMenu: aggregateTypes,
    });
    items.push({ isSeparator: true });
    items.push({
      id: 'pin-col',
      label: "Pin Column",
      subMenu: [
        {
          id: 'pin-none',
          label: "No pin",
          onClick: () => this._pinColumn(colID, null),
          left: !isPinned ? "icon-check" : '',
        },
        {
          id: 'pin-left',
          label: "Pin Left",
          onClick: () => this._pinColumn(colID, "left"),
          left: col.pinned === "left" ? "icon-check" : '',
        },
        {
          id: 'pin-right',
          label: "Pin Right",
          onClick: () => this._pinColumn(colID, "right"),
          left: col.pinned === "right" ? "icon-check" : '',
        },
      ]
    });
    items.push({ isSeparator: true });
    if (col.resizable) {
      items.push({
        id: 'autosize-col',
        label: "Autosize Column",
        onClick: () => this._updateColumnWidths(findColumnById(this.columns, colID) || null, true),
      });
      items.push({
        id: 'autosize-all',
        label: "Autosize All Columns",
        onClick: () => this._updateColumnWidths(null, true),
      });
      items.push({ isSeparator: true });
    }
    items.push(...this._getExportMenuItems(col.children.length > 0, collectLeaves(col).map(l => l.id)));
    if (items[items.length - 1].isSeparator) {
      items.pop();
    }

    return items;
  }

  _buildFilterMenuDOM(colID: string) {
    let col = this._centerLeafColumns.find(c => c.id === colID);
    if (!col) col = this._leftPinnedLeafColumns.find(c => c.id === colID);
    if (!col) col = this._rightPinnedLeafColumns.find(c => c.id === colID);
    if (!col) return;

    const colType: ColumnType = col.type ?? ColumnType.STRING;
    const current = this._filters.find(f => f.key == colID);
    const isServerSide = this.rowModel.getType() === "serverSide";

    const root = document.createElement("div");
    root.className = "pte-filter-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", `Filter ${col.label ?? col.key}`);

    const typeSelect = document.createElement("select");
    typeSelect.className = "pte-select pte-filter-select";
    typeSelect.name = "filter-type";
    typeSelect.setAttribute("data-focus-first", "1");

    const ops = this._getFilterOpsForType(colType);
    for (const op of ops) {
      const opt = document.createElement("option");
      opt.value = op.value;
      opt.textContent = op.label;
      typeSelect.appendChild(opt);
    }

    const valueInput = document.createElement("input");
    valueInput.className = "pte-filter-input";
    valueInput.name = "filter-value";
    valueInput.placeholder = "Filter";
    valueInput.type = "text";
    if (colType === ColumnType.NUMBER || colType === ColumnType.CURRENCY) {
      valueInput.type = "number";
    } else if (colType === ColumnType.BOOLEAN) {
      valueInput.type = "checkbox";
    } else if (colType === ColumnType.DATE) {
      valueInput.type = "date";
    }
    // for date you might want type="date" or "datetime-local" depending on your data

    // hydrate existing filter
    if (current) {
      typeSelect.value = current.type;
      valueInput.value = current.v ?? "";
    } else {
      typeSelect.value = ops[0]?.value ?? "contains";
    }

    // Apply logic
    const apply = (closeOverlay = isServerSide) => {
      const type = typeSelect.value as FilterType;
      const raw = valueInput.value;

      // If empty => clear filter
      if (raw == null || String(raw).trim() === "") {
        this._filters = this._filters.filter(f => f.key !== colID);
        if (closeOverlay) this._closeFilter();
        this._onFilterModelChanged();
        return;
      }

      const parsed = colType === "number" ? Number(raw) : raw;
      const filterIdx = this._filters.findIndex(f => f.key === colID);
      if (filterIdx >= 0) {
        this._filters[filterIdx] = { key: colID, type, v: parsed };
      } else {
        this._filters.push({ key: colID, type, v: parsed });
      }

      if (closeOverlay) this._closeFilter();
      this._onFilterModelChanged();
    };

    const clear = (closeOverlay = isServerSide) => {
      this._filters = this._filters.filter(f => f.key !== colID);
      if (closeOverlay) this._closeFilter();
      this._onFilterModelChanged();
    };

    let btnRow: HTMLDivElement | null = null;
    if (isServerSide) {
      btnRow = document.createElement("div");
      btnRow.className = "pte-filter-actions";

      const applyBtn = document.createElement("button");
      applyBtn.className = "pte-filter-btn primary";
      applyBtn.textContent = "Apply";

      const clearBtn = document.createElement("button");
      clearBtn.className = "pte-filter-btn";
      clearBtn.textContent = "Clear";

      btnRow.appendChild(clearBtn);
      btnRow.appendChild(applyBtn);

      applyBtn.addEventListener("click", () => apply(true));
      clearBtn.addEventListener("click", () => clear(true));
    } else {
      valueInput.addEventListener("input", () => apply(false));
      typeSelect.addEventListener("change", () => apply(false));
    }

    // Keyboard UX:
    // - Enter in input applies
    // - ArrowDown/ArrowUp moves focus through controls
    // - Esc handled globally
    const focusables = () =>
      Array.from(root.querySelectorAll("select, input, button"))
        .filter(el => !el.disabled);

    const moveFocus = (dir: number) => {
      const els = focusables();
      const i = els.indexOf(document.activeElement);
      if (i === -1) return;
      const next = els[(i + dir + els.length) % els.length];
      next?.focus();
    };

    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && document.activeElement === valueInput) {
        e.preventDefault();
        apply();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(+1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
      }
    });

    // Layout
    const form = document.createElement("div");
    form.className = "pte-filter-form";

    form.appendChild(typeSelect);
    form.appendChild(valueInput);

    root.appendChild(form);
    if (btnRow) root.appendChild(btnRow);

    return root;
  }

  _getFilterOpsForType(colType: ColumnType): { value: string; label: string }[] {
    if (isComputableType(colType)) {
      return [
        { value: "eq", label: "Equal" },
        { value: "neq", label: "Not equal" },
        { value: "gt", label: "Greater than" },
        { value: "gte", label: "Greater than or equal" },
        { value: "lt", label: "Less than" },
        { value: "lte", label: "Less than or equal" },
      ];
    }
    // string
    return [
      { value: "contains", label: "Contains" },
      { value: "eq", label: "Equal" },
      { value: "neq", label: "Not equal" },
      { value: "startsWith", label: "Starts with" },
      { value: "endsWith", label: "Ends with" },
    ];
  }

  // ---------------- Event listeners ----------------
  _headerCellContextMenuHandler(e: MouseEvent) {
    e.preventDefault();
    const header = e.target?.closest(".pte-hcell");
    if (!header) return;
    const col = findColumnById(this.columns, header.id);
    if (!col) return;
    const leaves = collectLeaves(col);
    if (leaves.filter(l => this._selectedColumnIDs.has(l.id)).length != leaves.length) {
      this._selectedColumnIDs.clear();
      this._toggleColumnSelection(col.id);
    }
    if (this._selectedColumnIDs.size > 1) {
      return this._openMultiColMenu(e.clientX, e.clientY);
    }
    this._openColMenu(header.id, { left: e.clientX, top: e.clientY });
  }

  _headerCellClickHandler(e: MouseEvent) {
    const header = e.target?.closest(".pte-hcell");
    if (!header) return;
    const headerExpand = e.target?.closest(".pte-hcell-expander");
    if (headerExpand) {
      this._toggleColumnGroupExpanded(header.id);
      return;
    }
    const headerContent = e.target?.closest(".pte-hcell-content");
    if (headerContent) {
      const col = findColumnById(this.columns, header.id);
      if (!col) return;
      if (e.shiftKey) {
        if (!col.sortable) return;
        if (Array.isArray(col.children) && col.children.length > 0) {
          return this._toggleSort(col);
        }
        return this._toggleSort(col);
      }
      this._toggleColumnSelection(header.id);
      return;
    }
    const btn = e.target?.closest(".pte-hcell-menu-btn");
    if (btn) {
      const isFilter = btn.classList.contains("pte-hcell-menu-filterBtn");
      // this._clearColumnSelection();
      // Based on the btn clicked, render filter/menu UI
      if (!isFilter) {
        this._openColMenu("columnMenuButton", header.id, { anchorEl: btn });
      } else {
        this._openColFilter(header.id, btn);
      }
      return;
    }
  }

  _cellClickHandler(e: MouseEvent) {
    const btn = e.target?.closest(".pte-hcell-menu-btn");
    if (btn) {
      if (btn.parentNode.classList.contains("active")) {
        const activeMenus = this.root.querySelectorAll(".pte-hcell-menu-item.active");
        activeMenus.forEach(m => m != btn.parentNode && m.classList.remove("active"));
        return;
      }
    }
    // close any other active menus
    const activeMenus = this.root.querySelectorAll(".pte-hcell-menu-item.active");
    activeMenus.forEach(m => m.classList.remove("active"));

    const header = e.target?.closest(".pte-hcell");
    if (header) {
      this._headerCellClickHandler(e);
      return;
    }
  }

  async _fetchServerSideRows(_reason: string) {
    if (this.rowModel.getType() !== "serverSide" || !this.rowModel.isValid()) return;
    const success = await this.rowModel.refreshData();
    if (!success) {
      this._setServerLoading(false);
      return;
    }
    this._recomputeView();
    this._updateWindow(true, undefined);
    this._setServerLoading(true);

  }

  _updateFilterIndicators() {
    for (const col of this._centerLeafColumns) {
      const hasFilter = this._filters.find(f => f.key === col.id);
      const hcell = document.getElementById(col.id);
      if (hcell && hcell.id === col.id) {
        const menuBtn = hcell.querySelector(".pte-hcell-menu-filterBtn");
        if (menuBtn) {
          if (hasFilter) {
            menuBtn.classList.add("active");
          } else {
            menuBtn.classList.remove("active");
          }
        }
      }
    }
  }

  _setFilterIndicators() {
    const filteredCols = new Set(this.core.getFilterModel().map(f => f.col.instanceID));
    for (const col of this.core.getColumnModel().getLeaves()) {
      const hcell = document.getElementById(col.instanceID);
      if (!hcell) continue;
      const menuBtn = hcell.querySelector(".pte-hcell-menu-filterBtn");
      if (!menuBtn) continue;
      menuBtn.classList.toggle("active", filteredCols.has(col.instanceID));
    }
  }

  _onFilterModelChanged() {
    this._filterDirty = true;
    this._sortDirty = true; // filter affects sort view
    this._updateFilterIndicators();
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
