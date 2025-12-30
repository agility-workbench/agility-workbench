import { MutableRefObject } from "react";
import { computeFilteredIdx, findColumnById } from "./helpers";
import {
  ColumnType,
  FilterDef,
  FilterType,
  formatValue,
  getValue,
  InternalColumn,
  isComputableType,
  MenuItem,
  RowModelType,
  RowPoolDef,
  ServerSideDataSource,
  ServerSideRequest,
  SortDef,
} from "./types";
import { isTrue, validatePageSizes } from "./misc";

interface TableProps {
  columns?: InternalColumn[];
  rowHeight?: number;
  overscan?: number;
  data?: any[];
  height?: number;
  pagination: boolean;
  paginationPageSize: number;
  paginationPageSizes: number[] | boolean;
  rowModel?: RowModelType;
  serverSideDataSource?: ServerSideDataSource;
}

export default class Table {
  container: MutableRefObject<HTMLElement | null>;
  _containerEl: HTMLElement;
  columns: InternalColumn[];
  rowHeight: number;
  height?: number;
  overscan: number;
  data: any[];
  rowModel: RowModelType;
  _filters: FilterDef[];
  _sorts: SortDef[];
  _serverSideDataSource?: ServerSideDataSource;
  _serverSideTotalRows: number;
  _serverRequestSeq: number;
  _serverLoading: boolean;
  _loadingOverlay: HTMLDivElement;

  _maxDepth: number;

  _filteredIdx: number[];
  _sortedIdx: number[];
  _measureCtx: CanvasRenderingContext2D | null;
  _columnWidths: Map<string, {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    fixed?: boolean;
  }>;
  _collator: Intl.Collator | null;
  _sortComparatorCache: Map<string, { fn: (a: any, b: any) => number; dataRef: any[] }>;

  _filterDirty: boolean;
  _sortDirty: boolean;

  // View state
  _viewRows: any[];          // filtered/sorted view (array of row objects)
  _viewIdx: number[];
  _startIndex: number;
  _totalPages: number;
  _pageIdx: number;
  _pagination: boolean;
  _paginationPageSize: number;
  _paginationPageSizes: number[];

  _leafColumns: InternalColumn[];
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

  paginator: HTMLDivElement;
  pageSizeSelect!: HTMLSelectElement;
  pageSelect!: HTMLSelectElement;
  firstPageBtn!: HTMLButtonElement;
  prevPageBtn!: HTMLButtonElement;
  nextPageBtn!: HTMLButtonElement;
  lastPageBtn!: HTMLButtonElement;

  _leftPinnedColumns: InternalColumn[];
  _leftPinnedLeafColumns: InternalColumn[];
  _rightPinnedColumns: InternalColumn[];
  _rightPinnedLeafColumns: InternalColumn[];
  _centerColumns: InternalColumn[];
  _centerLeafColumns: InternalColumn[];

  _menuOverlay: HTMLDivElement;
  _menuColKey: string | null;
  _submenuOverlay: HTMLDivElement;
  _submenuParentId: string | null;
  _currentSubmenuItems: MenuItem[] | null;

  _filterOverlay: HTMLDivElement;
  _filterColID: string | null;

  _poolSize: number;
  _rowPool: RowPoolDef[];

  _rafPending: boolean;
  _measureCache: Map<string, Map<string, number>>;

  constructor(container: MutableRefObject<HTMLElement | null>, {
    columns = [],
    rowHeight = 43,
    overscan = 6,
    data = [],
    height,
    pagination = false,
    paginationPageSize = 100,
    paginationPageSizes = [20, 50, 100],
    rowModel = "clientSide",
    serverSideDataSource,
  }: TableProps) {
    this.container = container;
    if (!container.current) {
      throw new Error("Table container ref is not attached");
    }
    this._containerEl = container.current;
    this.columns = columns;
    this.rowHeight = rowHeight;
    this.height = height;
    this.overscan = overscan;

    this.rowModel = rowModel || "clientSide";
    this._serverSideDataSource = serverSideDataSource;
    this._serverRequestSeq = 0;
    this._serverLoading = false;

    this.data = data ?? [];
    this._serverSideTotalRows = this.data.length;
    if (this.data && this.data.length > 0) {
      this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
      this._sortedIdx = this._filteredIdx;
    } else {
      this._filteredIdx = [];
      this._sortedIdx = [];
    }

    // State
    this._leftPinnedColumns = columns.filter(c => c.pinned === "left");
    this._leftPinnedLeafColumns = [];
    this._rightPinnedColumns = columns.filter(c => c.pinned === "right");
    this._rightPinnedLeafColumns = [];
    this._centerColumns = columns.filter(c => c.pinned !== "left" && c.pinned !== "right");
    this._centerLeafColumns = [];

    this._filters = [];
    this._sorts = [];
    this._measureCtx = null;
    this._measureCache = new Map();
    this._columnWidths = new Map();
    this._collator = null;
    this._sortComparatorCache = new Map();

    this._maxDepth = 0;

    this._filterDirty = true;
    this._sortDirty = true;

    // View state
    this._viewRows = [];          // filtered/sorted view (array of row objects)
    this._viewIdx = [];
    this._startIndex = 0;

    this._pagination = isTrue(pagination);
    this._paginationPageSize = paginationPageSize || 100;
    this._paginationPageSizes = validatePageSizes(paginationPageSizes, [20, 50, 100]);

    this._totalPages = this._pagination ? Math.max(1, Math.ceil(this.data.length / this._paginationPageSize)) : 1;
    this._pageIdx = 0;

    // DOM skeleton
    this.root = document.createElement("div");
    this.root.className = "pte-root";
    this.root.style.position = "relative";
    this.root.style.height = height != null ? `${height}px` : "100%";
    this._containerEl.appendChild(this.root);

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
    if (pagination) this.paginator.classList.add('visible');
    this._buildPaginationControls();

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
    this._submenuParentId = null;
    this._currentSubmenuItems = null;
    this._filterColID = null;

    this._menuOverlay = document.createElement("div");
    this._submenuOverlay = document.createElement("div");
    this._initMenuOverlay();
    this._filterOverlay = document.createElement("div");
    this._initFilterOverlay();
    this._loadingOverlay = document.createElement("div");
    this._initLoadingOverlay();

    // Create a pooled set of row nodes
    this._poolSize = this._computePoolSize();
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    this._buildHeaderDOM();
    this._buildRowPool();

    const setPinSectionMaxWidths = () => {
      this.leftHeader.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.hScrollLeftParent.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.leftScroller.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.rightHeader.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.hScrollRightParent.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
      this.rightScroller.style.maxWidth = `${this.root.clientWidth * 0.35}px`;
    };
    setPinSectionMaxWidths();

    // Events
    this._rafPending = false;
    this.leftScroller.addEventListener("scroll", () => this._scheduleWindowUpdate(this.leftScroller));
    this.scroller.addEventListener("scroll", () => this._scheduleWindowUpdate(this.scroller));
    this.rightScroller.addEventListener("scroll", () => this._scheduleWindowUpdate(this.rightScroller));
    this.vScroll.addEventListener("scroll", () => this._scheduleWindowUpdate(this.vScroll));
    this.leftSpacer.addEventListener("scroll", () => {
      console.log("left spacer scroll");
      this.leftHeader.scrollLeft = this.leftSpacer.scrollLeft;
      this.hScrollLeft.scrollLeft = this.leftSpacer.scrollLeft;
    });
    this.spacer.addEventListener("scroll", () => {
      this.header.scrollLeft = this.spacer.scrollLeft;
      this.hScroll.scrollLeft = this.spacer.scrollLeft;
    });
    this.rightSpacer.addEventListener("scroll", () => {
      this.rightHeader.scrollLeft = this.rightSpacer.scrollLeft;
      this.hScrollRight.scrollLeft = this.rightSpacer.scrollLeft;
    });
    this.hScrollLeft.addEventListener("scroll", () => {
      this.leftSpacer.scrollLeft = this.hScrollLeft.scrollLeft;
      this.leftHeader.scrollLeft = this.hScrollLeft.scrollLeft;
    });
    this.hScroll.addEventListener("scroll", () => {
      this.spacer.scrollLeft = this.hScroll.scrollLeft;
      this.header.scrollLeft = this.hScroll.scrollLeft;
    });
    this.hScrollRight.addEventListener("scroll", () => {
      this.rightSpacer.scrollLeft = this.hScrollRight.scrollLeft;
      this.rightHeader.scrollLeft = this.hScrollRight.scrollLeft;
    });
    this.leftHeader.addEventListener("scroll", () => {
      this.leftSpacer.scrollLeft = this.leftHeader.scrollLeft;
      this.hScrollLeft.scrollLeft = this.leftHeader.scrollLeft;
    });
    this.header.addEventListener("scroll", () => {
      this.spacer.scrollLeft = this.header.scrollLeft;
      this.hScroll.scrollLeft = this.header.scrollLeft;
    });
    this.rightHeader.addEventListener("scroll", () => {
      this.rightSpacer.scrollLeft = this.rightHeader.scrollLeft;
      this.hScrollRight.scrollLeft = this.rightHeader.scrollLeft;
    });
    const resizeObserver = new ResizeObserver(entries => {
      setPinSectionMaxWidths();
      this._maybeUpdatePoolSize();
    });
    resizeObserver.observe(this.root);

    // header sort click delegation
    // this.header.addEventListener("click", (e) => this._headerCellClickHandler(e));

    this.headerWrapper.addEventListener("contextmenu", (e) => this._headerCellContextMenuHandler(e));
    this.body.addEventListener("mousedown", (e) => this._onCellMouseDown(e));
    document.addEventListener("mousemove", (e) => this._onCellMouseMove(e));
    document.addEventListener("mouseup", () => this._onCellMouseUp());
    document.addEventListener("click", (e) => this._cellClickHandler(e));
    document.addEventListener("mouseover", (e) => {
      this.body.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
      const row = e.target.closest(".pte-row");
      if (row) {
        this.body.querySelectorAll(`.pte-row[row-id="${row.getAttribute("row-id")}"]`).forEach(r => r.classList.add("pte-row-hover"));
      }
    });

    // initial
    requestAnimationFrame(() => this._maybeUpdatePoolSize());
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
    if (this.rowModel === "serverSide" && this._serverSideDataSource) {
      this._fetchServerSideRows("init");
    }
  }

  _getBodyHeight() {
    const headerHeight = this.headerWrapper.getBoundingClientRect().height || 0;
    const hScrollHeight = this.hScrollContainer.getBoundingClientRect().height || 0;
    const paginationHeight = this._pagination ? (this.paginator?.getBoundingClientRect().height || 0) : 0;
    const chromeHeight = headerHeight + hScrollHeight + paginationHeight;

    const containerHeight = this._containerEl?.clientHeight ?? 0;
    const fallbackHeight = this.height ?? window.innerHeight ?? 0;

    const availableHeight = Math.max(0, Math.min(Math.max(containerHeight, fallbackHeight), window.innerHeight || fallbackHeight) - chromeHeight);
    if (availableHeight > 0) return availableHeight;

    return this.rowHeight;
  }

  _computePoolSize() {
    const bodyHeight = this._getBodyHeight();
    return Math.max(1, Math.ceil(bodyHeight / this.rowHeight) + this.overscan * 2);
  }

  _maybeUpdatePoolSize() {
    const poolSize = this._computePoolSize();
    if (poolSize === this._poolSize) return;
    this._poolSize = poolSize;
    this._rebuildRowPool();
    this._updateAllColumnWidths();
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
    if (this.rowModel === "serverSide") {
      this._fetchServerSideRows("togglePagination");
    }
  }

  setRowModel(rowModel: RowModelType) {
    const next = rowModel || "clientSide";
    if (this.rowModel === next) return;
    this.rowModel = next;
    this._serverSideTotalRows = this.data.length;
    this._filterDirty = true;
    this._sortDirty = true;
    this._pageIdx = 0;
    this._resetScrollPosition();
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
    if (next === "serverSide") {
      this._fetchServerSideRows("rowModelChanged");
    } else {
      this._setServerLoading(false);
    }
  }

  setServerSideDataSource(dataSource?: ServerSideDataSource) {
    if (this._serverSideDataSource === dataSource) return;
    this._serverSideDataSource = dataSource;
    if (this.rowModel === "serverSide" && dataSource) {
      this._fetchServerSideRows("dataSourceChanged");
    }
  }

  refreshServerSideData() {
    if (this.rowModel !== "serverSide") return;
    this._fetchServerSideRows("manualRefresh");
  }

  setData(data: any[], options: { resetPage?: boolean; totalRows?: number } = {}) {
    this.data = data ?? [];
    this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
    this._sortedIdx = this._filteredIdx.slice();
    this._sortComparatorCache.clear();
    this._columnWidths.clear();
    this._clearSelection();

    const resetPage = options?.resetPage ?? true;
    if (this.rowModel === "serverSide") {
      this._serverSideTotalRows = options?.totalRows ?? this.data.length;
      this._totalPages = this._pagination ? Math.max(1, Math.ceil(this._serverSideTotalRows / this._paginationPageSize)) : 1;
    } else {
      this._totalPages = this._pagination ? Math.max(1, Math.ceil(this.data.length / this._paginationPageSize)) : 1;
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

  setColumns(columns: InternalColumn[]) {
    this.columns = columns ?? [];
    this._maxDepth = 0;
    this._leftPinnedColumns = columns.filter(c => c.pinned === "left");
    this._centerColumns = columns.filter(c => c.pinned !== "left" && c.pinned !== "right");
    this._rightPinnedColumns = columns.filter(c => c.pinned === "right");
    this._columnWidths.clear();
    this._sortComparatorCache.clear();
    this._clearSelection();
    this._clearColumnSelection();
    // Structural change -> rebuild header + pool
    this._buildHeaderDOM();
    this._rebuildRowPool(); // rare operation
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true, undefined);
  }

  setFilters(filters: FilterDef[]) {
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
    if (this.rowModel === "serverSide") {
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

  destroy() {
    this.root.remove();
  }

  // ---------------- Internals: view ----------------
  _toggleSort(key: string) {
    let curr = this._sorts.find(s => s.key === key);
    if (curr) {
      // cycle asc -> desc -> none
      if (curr.dir === "asc") {
        curr.dir = "desc";
      } else {
        // remove sort
        curr = undefined;
        this._sorts = this._sorts.filter(s => s.key !== key);
      }
    } else {
      // add asc sort
      curr = { key, dir: "asc" }
      this._sorts.push(curr);
    }
    this._sortDirty = true;
    if (this.rowModel === "serverSide") {
      this._addSortIndicatorToHeader(key, curr?.dir || '');
      this._fetchServerSideRows("sortChanged");
      return;
    }
    this._recomputeView();
    this._addSortIndicatorToHeader(key, curr?.dir || '');
    this._updateWindow(true, undefined);
  }

  _toggleBatchSort(col: InternalColumn) {
    let curr = this._sorts.find(s => s.key === col.id);
    const dir = curr ? (curr.dir === "asc" ? "desc" : null) : "asc";

    const addSort = (key: string, dir: "asc" | "desc" | null) => {
      const curr = this._sorts.find(s => s.key === key);
      if (curr) {
        if (dir) {
          curr.dir = dir;
        } else {
          // remove sort
          this._sorts = this._sorts.filter(s => s.key !== key);
        }
      } else if (dir) {
        this._sorts.push({ key, dir });
      }
    };

    const colIDs: string[] = [];

    const traverse = (col: InternalColumn) => {
      colIDs.push(col.id);
      addSort(col.id, dir);
      for (const child of col.children || []) {
        traverse(child);
      }
    };

    traverse(col);

    this._sortDirty = true;
    if (this.rowModel === "serverSide") {
      for (const colID of colIDs) {
        this._addSortIndicatorToHeader(colID, dir || '');
      }
      this._fetchServerSideRows("batchSort");
      return;
    }
    this._recomputeView();
    for (const colID of colIDs) {
      this._addSortIndicatorToHeader(colID, dir || '');
    }
    this._updateWindow(true, undefined);
  }

  _toggleColumnHidden(colID: string) {
    const col = findColumnById(this.columns, colID);
    if (!col) return;
    col.hidden = !isTrue(col.hidden);
    this.setColumns(this.columns);
  }

  _recomputeView() {
    if (this.rowModel === "serverSide") {
      const pageSize = Math.max(1, this._paginationPageSize || 1);
      const totalRows = this._serverSideTotalRows ?? this.data.length;
      if (this._pagination) {
        this._totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
        this._pageIdx = Math.min(Math.max(this._pageIdx, 0), this._totalPages - 1);
      } else {
        this._totalPages = 1;
        this._pageIdx = 0;
      }
      this._filterDirty = false;
      this._sortDirty = false;
      this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
      this._sortedIdx = this._filteredIdx.slice();
      this._viewIdx = this._sortedIdx.slice();
    } else {
      let rows = this.data;

      if (this._filterDirty) {
        this._filterDirty = false;
        if (this._filters) {
          this._filteredIdx = computeFilteredIdx(this.data, this._filters, [
            ...this._leftPinnedLeafColumns,
            ...this._centerLeafColumns,
            ...this._rightPinnedLeafColumns,
          ]);
        } else {
          this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
        }
        this._sortDirty = true; // filter affects sort view
      }

      if (this._sortDirty) {
        this._sortDirty = false;
        this._sortedIdx = this._filteredIdx.slice();
        if (this._sorts && this._sorts.length > 0) {
          const comparators = this._sorts
            .map(sort => {
              const { key, dir } = sort;
              const col = findColumnById(this.columns, key);
              if (!col) return null;
              const mult = dir === "desc" ? -1 : 1;
              const cmp = this._getComparatorForColumn(col);
              return (a: any, b: any) => cmp(a, b) * mult;
            })
            .filter(Boolean) as Array<(a: any, b: any) => number>;

          this._sortedIdx.sort((a, b) => {
            for (const cmp of comparators) {
              const result = cmp(rows[a], rows[b]);
              if (result !== 0) return result;
            }
            return 0;
          });
        }
      }

      if (this._pagination) {
        this._applyPagination();
      } else {
        this._viewIdx = this._sortedIdx.slice();
        this._totalPages = 1;
        this._pageIdx = 0;
      }
    }

    this._viewRows = this._viewIdx.map(idx => this.data[idx]);

    // Update total scroll height
    const verticalSize = this._viewIdx.length * this.rowHeight;
    this.leftSpacer.style.height = `${verticalSize}px`;
    this.spacer.style.height = `${verticalSize}px`;
    this.rightSpacer.style.height = `${verticalSize}px`;
    this.vScroller.style.height = `${verticalSize}px`;
    this.vScrollParent.style.display = verticalSize > this.body.clientHeight ? "block" : "none";

    this._updatePaginationControls();
    this._clampSelectionToView();
  }

  _pinColumn(colID: string, pin: "left" | "right" | null) {
    const col = findColumnById(this.columns, colID);
    if (!col) return;
    if (pin === col.pinned) return;

    col.pinned = pin;
    this.setColumns(this.columns);
  }

  // ---------------- Internals: DOM build ----------------
  _getMeasureContext(): CanvasRenderingContext2D | null {
    if (!this._measureCtx) {
      const canvas = document.createElement("canvas");
      this._measureCtx = canvas.getContext("2d");
    }

    const probe = this.header.querySelector(".pte-hcell") || this.container.current;
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

  _getCollator() {
    if (!this._collator) {
      this._collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    }
    return this._collator;
  }

  _getComparatorForColumn(col: InternalColumn) {
    const key = col?.key;
    if (!key) return () => 0;

    const cacheHit = this._sortComparatorCache.get(key);
    if (cacheHit && cacheHit.dataRef === this.data) return cacheHit.fn;

    if (typeof col?.compare === "function") {
      const fn = (a, b) => col.compare(a?.[key], b?.[key], a, b);
      this._sortComparatorCache.set(key, { fn, dataRef: this.data });
      return fn;
    }

    const numericPreferred = col?.type === "number";
    const stringPreferred = col?.type === "string";
    let numericLikely = false;

    if (!stringPreferred) {
      let seen = 0;
      let numericCount = 0;
      for (let i = 0; i < this.data.length && seen < 64; i++) {
        const v = this.data[i]?.[key];
        if (v == null) continue;
        seen++;
        const num = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(num)) numericCount++;
      }
      numericLikely = numericPreferred || (seen > 0 && numericCount === seen);
    }

    const collator = this._getCollator();
    const comparator = numericLikely
      ? (a, b) => {
        const av = a?.[key], bv = b?.[key];
        if (av === bv) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        return (Number(av) - Number(bv));
      }
      : (a, b) => {
        const av = a?.[key], bv = b?.[key];
        if (av === bv) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        // Using collator.compare is still faster than localeCompare for mixed case and numbers
        return collator.compare(String(av), String(bv));
      };

    this._sortComparatorCache.set(key, { fn: comparator, dataRef: this.data });
    return comparator;
  }

  _autoSizeColumn(col: InternalColumn, maxWidth: number): number {
    const headerText = col.label ?? col.key;
    let best = this._measureText(headerText) + 104;
    if (best >= maxWidth) return maxWidth;

    // cache per column
    const colCacheKey = `col:${col.key}`;
    let colCache = this._measureCache.get(colCacheKey);
    if (!colCache) { colCache = new Map(); this._measureCache.set(colCacheKey, colCache); }

    const rows = this.data; // IMPORTANT: raw data order, not sorted view
    const n = rows.length;

    if (n == 0) return best;

    const measureValue = (s: string) => {
      const cached = colCache.get(s);
      if (cached != null) return cached;
      const w = this._measureText(s);
      colCache.set(s, w);
      return w;
    };

    let longestValue = "";
    let rowIdx = 0;
    for (let i = 0; i < n; i++) {
      const v = getValue(rows[i], col);
      if (v != null && String(v).length > longestValue.length) {
        longestValue = String(v);
        rowIdx = i;
      }
    }

    best = Math.max(best, measureValue(formatValue(rows[rowIdx][col.key], rows[rowIdx], col)));
    return Math.min(best, maxWidth);
  }

  _computeColumnWidths(column: InternalColumn | null = null) {
    this._getMeasureContext();
    const computer = (col: InternalColumn, i: number) => {
      if (isTrue(col.hidden)) return;
      if (col.width != null) {
        return { width: col.width, fixed: true };
      }
      if (column && column.key !== col.key) {
        if (this._columnWidths.has(col.id)) {
          return;
        }
      }

      const minWidth = Math.max(10, col.minWidth ?? 10);
      let maxWidth = col.maxWidth ?? 420;

      const autoWidth = this._autoSizeColumn(col, maxWidth);
      let width = Math.min(Math.max(autoWidth, minWidth), maxWidth);

      if (col.children && col.children.length > 0) {
        let childrenWidth = 0;
        for (const child of col.children) {
          computer(child, i);
          childrenWidth += this._columnWidths.get(child.id)?.width || 0;
        }
        if (childrenWidth > width) {
          width = childrenWidth;
          maxWidth = Math.max(maxWidth, width);
        }
      }

      this._columnWidths.set(col.id, { width, minWidth, maxWidth, fixed: false });
    };
    this.columns.map(computer);
  }

  _applyWidthsToChildren(col: InternalColumn, hcell: HTMLElement) {
    const info = this._columnWidths.get(col.id);
    hcell.style.flex = "0 0 auto";
    hcell.style.width = `${info?.width}px`;
    if (!info?.fixed) {
      hcell.style.minWidth = `${info?.minWidth}px`;
      hcell.style.maxWidth = Number.isFinite(info?.maxWidth) ? `${info?.maxWidth}px` : "";
    } else {
      hcell.style.minWidth = "";
      hcell.style.maxWidth = "";
    }
    if (col.children && col.children.length > 0) {
      for (let i = 0; i < col.children.length; i++) {
        const child = col.children[i];
        if (isTrue(child.hidden)) continue;
        const childContainer = document.getElementById(child.id) as HTMLDivElement;
        if (childContainer) {
          this._applyWidthsToChildren(child, childContainer);
        }
      }
    }
  };

  _applyLeftColumnWidths(): number {
    if (!this._columnWidths.size) return 0;

    const headerCells = this.leftHeader.children;
    let idx = -1;
    for (const col of this._leftPinnedColumns) {
      if (isTrue(col.hidden)) continue;
      idx++;
      const info = this._columnWidths.get(col.id);
      const hcell = headerCells[idx];
      if (!hcell || !info) continue;
      this._applyWidthsToChildren(col, hcell as HTMLElement);
    }

    let maxWidth = 0;
    for (const slot of this._rowPool) {
      let totalWidth = 0;
      let c = -1;
      for (const col of this._leftPinnedLeafColumns) {
        if (isTrue(col.hidden)) continue;
        c++;
        const info = this._columnWidths.get(col.id);
        const cell = slot.leftCellEls[c];
        if (!cell || !info) continue;

        cell.style.flex = "0 0 auto";
        cell.style.width = `${info.width}px`;
        totalWidth += info.width;
        if (!info.fixed) {
          cell.style.minWidth = `${info.minWidth}px`;
          cell.style.maxWidth = Number.isFinite(info.maxWidth) ? `${info.maxWidth}px` : "";
        } else {
          cell.style.minWidth = "";
          cell.style.maxWidth = "";
        }
      }
      if (slot.leftRowEl) slot.leftRowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
    }
    this.leftViewport.style.width = `${maxWidth}px`;
    this.hScrollerLeft.style.width = `${maxWidth}px`;
    this.hScrollLeftParent.style.display = maxWidth > 0 ? "block" : "none";
    this.leftHeader.style.width = `${maxWidth}px`;
    this.leftHeader.style.minWidth = `${maxWidth}px`;
    const totalWidth = maxWidth;
    if (maxWidth > 0) {
      this.leftScroller.classList.add("visible");
      this.leftHeader.classList.add("visible");
      if (maxWidth > this.root.clientWidth * 0.35) {
        maxWidth = this.root.clientWidth * 0.35;
        this.leftHeader.style.width = `${maxWidth}px`;
        this.leftHeader.style.minWidth = `${maxWidth}px`;
      }
    } else {
      this.leftScroller.classList.remove("visible");
      this.leftHeader.classList.remove("visible");
    }
    this.hScrollLeftParent.style.width = `${maxWidth}px`;
    this.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
    return totalWidth;
  }

  _applyColumnWidths(): number {
    if (!this._columnWidths.size) return 0;

    const headerCells = this.header.children;
    let idx = -1;
    for (const col of this._centerColumns) {
      if (isTrue(col.hidden)) continue;
      idx++;
      const info = this._columnWidths.get(col.id);
      const hcell = headerCells[idx];
      if (!hcell || !info) continue;
      this._applyWidthsToChildren(col, hcell as HTMLElement);
    }

    let maxWidth = 0;
    for (const slot of this._rowPool) {
      let totalWidth = 0;
      let c = -1;
      for (const col of this._centerLeafColumns) {
        if (isTrue(col.hidden)) continue;
        c++;
        const info = this._columnWidths.get(col.id);
        const cell = slot.cellEls[c];
        if (!cell || !info) continue;

        cell.style.flex = "0 0 auto";
        cell.style.width = `${info.width}px`;
        totalWidth += info.width;
        if (!info.fixed) {
          cell.style.minWidth = `${info.minWidth}px`;
          cell.style.maxWidth = Number.isFinite(info.maxWidth) ? `${info.maxWidth}px` : "";
        } else {
          cell.style.minWidth = "";
          cell.style.maxWidth = "";
        }
      }
      slot.rowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
    }
    this.hScroller.style.width = `${maxWidth}px`;
    if (maxWidth == 0) {
      this.hScrollParent.style.flex = "1 1 auto";
    }
    this.viewport.style.width = `${maxWidth}px`;
    return maxWidth;
  }

  _applyRightColumnWidths(): number {
    if (!this._columnWidths.size) return 0;

    const headerCells = this.rightHeader.children;
    let idx = -1;
    for (const col of this._rightPinnedColumns) {
      if (isTrue(col.hidden)) continue;
      idx++;
      const info = this._columnWidths.get(col.id);
      const hcell = headerCells[idx];
      if (!hcell || !info) continue;
      this._applyWidthsToChildren(col, hcell as HTMLElement);
    }

    let maxWidth = 0;
    for (const slot of this._rowPool) {
      let totalWidth = 0;
      let c = -1;
      for (const col of this._rightPinnedLeafColumns) {
        if (isTrue(col.hidden)) continue;
        c++;
        const info = this._columnWidths.get(col.id);
        const cell = slot.rightCellEls[c];
        if (!cell || !info) continue;

        cell.style.flex = "0 0 auto";
        cell.style.width = `${info.width}px`;
        totalWidth += info.width;
        if (!info.fixed) {
          cell.style.minWidth = `${info.minWidth}px`;
          cell.style.maxWidth = Number.isFinite(info.maxWidth) ? `${info.maxWidth}px` : "";
        } else {
          cell.style.minWidth = "";
          cell.style.maxWidth = "";
        }
      }
      if (slot.rightRowEl) slot.rightRowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
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
      this.rightHeader.style.width = `${maxWidth + 15}px`;
      this.rightHeader.style.minWidth = `${maxWidth + 15}px`;
      maxWidth += this.hScrollLeftParent.clientWidth;
      this.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
    } else {
      this.rightScroller.classList.remove("visible");
      this.rightHeader.classList.remove("visible");
    }
    return totalWidth;
  }

  _updateAllColumnWidths() {
    let totalWidth = 0;
    totalWidth += this._applyLeftColumnWidths();
    totalWidth += this._applyColumnWidths();
    totalWidth += this._applyRightColumnWidths();

    if (totalWidth > this.root.clientWidth) {
      this.hScrollContainer.style.display = "flex";
    } else {
      this.hScrollContainer.style.display = "none";
    }

    const headerHeight = this.headerWrapper.getBoundingClientRect().height;
    const hScrollHeight = this.hScrollContainer.getBoundingClientRect().height;
    const paginationHeight = this._pagination && this.paginator.classList.contains("visible")
      ? (this.paginator.getBoundingClientRect().height || 0)
      : 0;
    const chromeHeight = headerHeight + (this.hScrollContainer.style.display === "flex" ? hScrollHeight : 0) + paginationHeight;
    this.body.style.height = `calc(100% - ${chromeHeight}px)`;
  }

  _updateColumnWidths(column: InternalColumn | null = null) {
    console.time("computeColumnWidths");
    this._computeColumnWidths(column);
    console.timeEnd("computeColumnWidths");

    this._updateAllColumnWidths();
  }

  _computeHeaderDepth() {
    const traverse = (cols: InternalColumn[], depth: number, appendTo: InternalColumn[]) => {
      for (const col of cols) {
        if (isTrue(col.hidden)) {
          continue;
        }
        if (col.children && Array.isArray(col.children)) {
          traverse(col.children, depth + 1, appendTo);
          col.depth = col.children.reduce((max, c) => Math.max(max, c.depth || 1), 1) + 1;
        } else {
          col.depth = 1;
          appendTo.push(col);
        }
        if (col.depth > this._maxDepth) {
          this._maxDepth = col.depth;
        }
      }
    };

    traverse(this._centerColumns, 1, this._centerLeafColumns);
    traverse(this._leftPinnedColumns, 1, this._leftPinnedLeafColumns);
    traverse(this._rightPinnedColumns, 1, this._rightPinnedLeafColumns);
  }

  _updateLeafColumnLookup() {
    this._leafColumns = [];
    this._leafColumnLookup = new Map();
    this._leftLeafOrder = [];
    this._centerLeafOrder = [];
    this._rightLeafOrder = [];

    let globalIndex = 0;

    const addCols = (cols: InternalColumn[], section: "left" | "center" | "right", order: number[]) => {
      for (const col of cols) {
        if (isTrue(col.hidden)) continue;
        this._leafColumns.push(col);
        this._leafColumnLookup.set(col.id, { section, globalIndex, localIndex: order.length });
        order.push(globalIndex);
        globalIndex++;
      }
    };

    addCols(this._leftPinnedLeafColumns, "left", this._leftLeafOrder);
    addCols(this._centerLeafColumns, "center", this._centerLeafOrder);
    addCols(this._rightPinnedLeafColumns, "right", this._rightLeafOrder);
  }

  _buildHeaderCell(col: InternalColumn, maxDepth: number): HTMLDivElement {
    const header = document.createElement("div");
    header.className = "pte-hcell";
    if (!col.children || col.children.length === 0) {
      header.classList.add("pte-hcell-leaf");
    }
    const contentHeight = maxDepth / col.depth!;
    header.style.height = `${this.rowHeight * maxDepth}px`;
    maxDepth--;
    header.id = col.id;
    const headerWrapper = document.createElement("div");
    headerWrapper.className = "pte-hcell-wrapper";
    header.appendChild(headerWrapper);
    const headerResize = document.createElement("div");
    headerResize.className = "pte-hcell-resize-handle";
    headerWrapper.appendChild(headerResize);
    const headerContainer = document.createElement("div");
    headerContainer.className = "pte-hcell-container";
    headerContainer.style.height = `${this.rowHeight * contentHeight}px`;
    if (isComputableType(col.type)) {
      headerContainer.classList.add('pte-hcell-computable');
    }
    headerWrapper.appendChild(headerContainer);
    const headerContent = document.createElement("div");
    headerContent.className = "pte-hcell-content";
    headerContainer.appendChild(headerContent);
    headerContent.textContent = col.label ?? col.key;
    if (col.children && Array.isArray(col.children) && col.children.length > 0) {
      const children = document.createElement("div");
      children.className = "pte-hcell-children";
      header.appendChild(children);
      for (const child of col.children) {
        if (!isTrue(child.hidden)) {
          children.append(this._buildHeaderCell(child, maxDepth));
        }
      }
    }
    const headerMenu = this._getHeaderMenuElement(col);
    headerContainer.appendChild(headerMenu);
    const sort = this._sorts.find(s => s.key === col.id);
    if (sort) {
      this._addSortIndicatorToHeader(col.id, sort.dir);
    }
    return header;
  }

  _buildHeaderDOM() {
    this._centerLeafColumns = [];
    this._leftPinnedLeafColumns = [];
    this._rightPinnedLeafColumns = [];
    this._computeHeaderDepth();
    this._updateLeafColumnLookup();
    const headerHeight = this.rowHeight * this._maxDepth;
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
    for (const col of this._leftPinnedColumns) {
      if (!isTrue(col.hidden)) {
        this.leftHeader.appendChild(this._buildHeaderCell(col, this._maxDepth));
      }
    }
    for (const col of this._centerColumns) {
      if (!isTrue(col.hidden)) {
        this.header.appendChild(this._buildHeaderCell(col, this._maxDepth));
      }
    }
    for (const col of this._rightPinnedColumns) {
      if (!isTrue(col.hidden)) {
        this.rightHeader.appendChild(this._buildHeaderCell(col, this._maxDepth));
      }
    }
    this._applyLeftColumnWidths();
    this._applyColumnWidths();
    this._applyRightColumnWidths();
    this._pruneColumnSelection();
    this._applyColumnSelectionStyles();
  }

  _buildPaginationControls() {
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
    this.pageSizeSelect.className = "pte-pagination-select";
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
      if (this.rowModel === "serverSide") {
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
    this.pageSelect.className = "pte-pagination-select pte-pagination-page-select";
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

    this._populatePageSelect();

    const atFirstPage = this._pageIdx <= 0;
    const atLastPage = this._pageIdx >= Math.max(this._totalPages - 1, 0);
    const hasRows = this._viewIdx.length > 0;

    if (this.firstPageBtn) this.firstPageBtn.disabled = atFirstPage || !hasRows;
    if (this.prevPageBtn) this.prevPageBtn.disabled = atFirstPage || !hasRows;
    if (this.nextPageBtn) this.nextPageBtn.disabled = atLastPage || !hasRows;
    if (this.lastPageBtn) this.lastPageBtn.disabled = atLastPage || !hasRows;
    if (this.pageSelect) this.pageSelect.disabled = this._totalPages <= 1 || !hasRows;
  }

  _goToPage(pageIdx: number) {
    if (!this._pagination) return;
    const totalPages = Math.max(this._totalPages, 1);
    const clamped = Math.min(Math.max(pageIdx, 0), totalPages - 1);
    if (clamped === this._pageIdx) return;
    this._pageIdx = clamped;
    this._resetScrollPosition();
    if (this.rowModel === "serverSide") {
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

  _applyPagination() {
    const pageSize = Math.max(1, this._paginationPageSize || 1);
    const totalRows = this._sortedIdx.length;
    this._totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const clampedPage = Math.min(Math.max(this._pageIdx, 0), this._totalPages - 1);
    const pageChanged = clampedPage !== this._pageIdx;
    this._pageIdx = clampedPage;
    if (pageChanged) {
      this._resetScrollPosition();
    }
    const start = this._pageIdx * pageSize;
    const end = start + pageSize;
    this._viewIdx = this._sortedIdx.slice(start, end);
  }

  _getHeaderMenuElement(col: InternalColumn): HTMLDivElement {
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
        const hasFilter = this._filters.find(f => f.key === col.id);
        if (hasFilter) {
          btn.classList.add("pte-hcell-menu-filter-active");
        }
        wrapper.appendChild(flyout);
      }

      return wrapper;
    };

    if (!col.children || col.children.length === 0) {
      menu.appendChild(buildMenuItem("pte-hcell-menu-filterBtn", "pte-filter-icon", this._getFilterMenuElement()));
    }
    menu.appendChild(buildMenuItem("pte-hcell-menu-menuBtn", "pte-menu-icon", null));
    return menu;
  }

  _getFilterMenuElement(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu-flyout";
    return menu;
  }

  _buildRowPool() {
    this.leftViewport.innerHTML = "";
    this.viewport.innerHTML = "";
    this.rightViewport.innerHTML = "";
    this._rowPool = [];

    const leftOrder = this._leftLeafOrder;
    const centerOrder = this._centerLeafOrder;
    const rightOrder = this._rightLeafOrder;

    for (let i = 0; i < this._poolSize; i++) {
      const row: RowPoolDef = {
        rowEl: document.createElement("div"),
        leftCellEls: [],
        cellEls: [],
        rightCellEls: []
      };

      if (this._leftPinnedLeafColumns.length > 0) {
        row.leftRowEl = document.createElement("div");
        row.leftRowEl.className = "pte-row";
        row.leftRowEl.style.height = `${this.rowHeight}px`;

        let leftIdx = 0;
        for (const col of this._leftPinnedLeafColumns) {
          if (isTrue(col.hidden)) continue;
          const cell = document.createElement("div");
          cell.className = "pte-cell";
          const meta = this._leafColumnLookup.get(col.id);
          if (meta) {
            cell.dataset.colId = col.id;
            cell.dataset.colIdx = String(meta.globalIndex);
          } else if (leftOrder[leftIdx] != null) {
            cell.dataset.colIdx = String(leftOrder[leftIdx]);
          }
          if (isComputableType(col.type)) cell.classList.add('pte-cell-right-aligned');
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
      for (const col of this._centerLeafColumns) {
        if (isTrue(col.hidden)) continue;
        const cell = document.createElement("div");
        cell.className = "pte-cell";
        const meta = this._leafColumnLookup.get(col.id);
        if (meta) {
          cell.dataset.colId = col.id;
          cell.dataset.colIdx = String(meta.globalIndex);
        } else if (centerOrder[centerIdx] != null) {
          cell.dataset.colIdx = String(centerOrder[centerIdx]);
        }
        if (isComputableType(col.type)) cell.classList.add('pte-cell-right-aligned');
        row.rowEl.appendChild(cell);
        row.cellEls.push(cell);
        centerIdx++;
      }

      this.viewport.appendChild(row.rowEl);

      if (this._rightPinnedLeafColumns.length > 0) {
        row.rightRowEl = document.createElement("div");
        row.rightRowEl.className = "pte-row";
        row.rightRowEl.style.height = `${this.rowHeight}px`;

        row.rightCellEls = [];
        let rightIdx = 0;
        for (const col of this._rightPinnedLeafColumns) {
          if (isTrue(col.hidden)) continue;
          const cell = document.createElement("div");
          cell.className = "pte-cell";
          const meta = this._leafColumnLookup.get(col.id);
          if (meta) {
            cell.dataset.colId = col.id;
            cell.dataset.colIdx = String(meta.globalIndex);
          } else if (rightOrder[rightIdx] != null) {
            cell.dataset.colIdx = String(rightOrder[rightIdx]);
          }
          if (isComputableType(col.type)) cell.classList.add('pte-cell-right-aligned');
          row.rightRowEl.appendChild(cell);
          row.rightCellEls.push(cell);
          rightIdx++;
        }

        this.rightViewport.appendChild(row.rightRowEl);
      }

      this._rowPool.push(row);
    }
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
    // const existing = hcell.querySelector(".pte-sort");
    // if (existing) existing.remove();
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

  _updateWindow(forcePatch: boolean, scrollSrc?: HTMLDivElement) {
    const total = this._viewIdx.length;
    const scrollTop = scrollSrc?.scrollTop || 0;
    this.leftScroller.scrollTop = scrollTop;
    this.scroller.scrollTop = scrollTop;
    this.rightScroller.scrollTop = scrollTop;
    this.vScroll.scrollTop = scrollTop;

    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.rowHeight) - this.overscan
    );

    if (!forcePatch && startIndex === this._startIndex) {
      // only translate to avoid jitter? typically not needed; startIndex stable means nothing to do.
      return;
    }

    this._startIndex = startIndex;

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
      const rowIndex = this._viewIdx[viewIndex];
      slot.rowEl.setAttribute("row-id", String(rowIndex));
      slot.rowEl.setAttribute("data-view-idx", String(viewIndex));
      const row = this.data[rowIndex];

      if (slot.leftRowEl) {
        slot.leftRowEl.setAttribute("data-view-idx", String(viewIndex));
      }
      if (slot.rightRowEl) {
        slot.rightRowEl.setAttribute("data-view-idx", String(viewIndex));
      }

      // HOT: write textContent only (no re-render, no diff)
      if (this._leftPinnedLeafColumns.length > 0 && slot.leftCellEls) {
        slot.leftRowEl?.setAttribute("row-id", String(rowIndex));
        for (let c = 0; c < this._leftPinnedLeafColumns.length; c++) {
          const col = this._leftPinnedLeafColumns[c];
          const key = col.key;
          const v = row[key];
          const displayValue = col.valueFormatter ? col.valueFormatter(v, row) : v;
          slot.leftCellEls[c].textContent = displayValue == null ? "" : String(displayValue);
        }
      }
      for (let c = 0; c < this._centerLeafColumns.length; c++) {
        const col = this._centerLeafColumns[c];
        const key = col.key;
        const v = row[key];
        const displayValue = col.valueFormatter ? col.valueFormatter(v, row) : v;
        slot.cellEls[c].textContent = displayValue == null ? "" : String(displayValue);
      }
      if (this._rightPinnedLeafColumns.length > 0 && slot.rightCellEls) {
        slot.rightRowEl?.setAttribute("row-id", String(rowIndex));
        for (let c = 0; c < this._rightPinnedLeafColumns.length; c++) {
          const col = this._rightPinnedLeafColumns[c];
          const key = col.key;
          const v = row[key];
          const displayValue = col.valueFormatter ? col.valueFormatter(v, row) : v;
          slot.rightCellEls[c].textContent = displayValue == null ? "" : String(displayValue);
        }
      }
      this._applySelectionToSlot(slot, viewIndex);
    }
  }

  _patchVisibleCells({ rowIds, colKeys } = {}) {
    // Minimal version: patch the currently visible pool.
    // rowIds/colKeys can be used to skip work if you pass them.
    const total = this._viewIdx.length;
    const startIndex = this._startIndex;

    const colIndexSet = colKeys
      ? new Set(colKeys.map(k => this.columns.findIndex(c => c.key === k)).filter(i => i >= 0))
      : null;

    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIndex = startIndex + i;
      if (viewIndex >= total) continue;

      const row = this.data[this._viewIdx[viewIndex]];
      if (rowIds && !rowIds.has?.(row.id) && !rowIds.includes?.(row.id)) continue;

      const slot = this._rowPool[i];

      if (!colIndexSet) {
        for (let c = 0; c < this.columns.length; c++) {
          const key = this.columns[c].key;
          const v = row[key];
          slot.cellEls[c].textContent = v == null ? "" : String(v);
        }
      } else {
        for (const c of colIndexSet) {
          const key = this.columns[c].key;
          const v = row[key];
          slot.cellEls[c].textContent = v == null ? "" : String(v);
        }
      }
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
        const leafCol = Number.isFinite(colIdx) ? this._leafColumns[colIdx] : null;
        const colId = leafCol?.id;
        const colSelected = colId ? this._selectedColumnIDs.has(colId) : false;

        const rangeSelected = !!rowSelected && range && Number.isFinite(colIdx) && colIdx >= range.colStart && colIdx <= range.colEnd;
        const selected = rangeSelected || colSelected;

        const prevColIdx = order[i - 1];
        const nextColIdx = order[i + 1];
        const prevSelected = (() => {
          if (Number.isFinite(prevColIdx)) {
            if (range && prevColIdx >= range.colStart && prevColIdx <= range.colEnd) return true;
            const prevCol = this._leafColumns[prevColIdx];
            if (prevCol && this._selectedColumnIDs.has(prevCol.id)) return true;
          }
          return false;
        })();
        const nextSelected = (() => {
          if (Number.isFinite(nextColIdx)) {
            if (range && nextColIdx >= range.colStart && nextColIdx <= range.colEnd) return true;
            const nextCol = this._leafColumns[nextColIdx];
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
    const total = this._viewIdx.length;
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
    const visit = (cols: InternalColumn[]) => {
      for (const col of cols) {
        if (this._selectedColumnIDs.has(col.id)) keep.add(col.id);
        if (col.children) visit(col.children);
      }
    };
    visit(this.columns);

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
    this._clearColumnSelection();
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
    this._leafColumns.forEach((c, idx) => leafIndexMap.set(c.id, idx));

    const selectedLeafIdx = new Set<number>();
    this._leafColumns.forEach((c, idx) => {
      if (this._selectedColumnIDs.has(c.id)) selectedLeafIdx.add(idx);
    });

    const getRange = (col: InternalColumn | null): [number, number] | null => {
      if (!col) return null;
      if (isTrue(col.hidden)) return null;
      if (!col.children || col.children.length === 0) {
        const idx = leafIndexMap.get(col.id);
        return idx == null ? null : [idx, idx];
      }
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const visit = (c: InternalColumn) => {
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
      const col = findColumnById(this.columns, h.id);
      const selected = !!col && this._selectedColumnIDs.has(col.id);
      const range = col ? getRange(col) : null;
      const leftSelected = !!range && selectedLeafIdx.has(range[0] - 1);
      const rightSelected = !!range && selectedLeafIdx.has(range[1] + 1);

      h.classList.toggle("selected", selected);
      h.classList.toggle("selected-left", selected && !leftSelected);
      h.classList.toggle("selected-right", selected && !rightSelected);
      h.classList.toggle("selected-top", selected);

      const content = h.querySelector<HTMLElement>(".pte-hcell-content");
      if (content) content.classList.toggle("selected", selected);
    });
  }

  _toggleColumnSelection(colID: string) {
    this._clearSelection();
    const col = findColumnById(this.columns, colID);
    if (!col) return;

    const collectLeaves = (c: InternalColumn, acc: InternalColumn[]) => {
      if (isTrue(c.hidden)) return;
      if (!c.children || c.children.length === 0) {
        acc.push(c);
        return;
      }
      for (const child of c.children) {
        collectLeaves(child, acc);
      }
    };

    const leaves: InternalColumn[] = [];
    collectLeaves(col, leaves);

    const hasChildren = leaves.length > 1 || (leaves.length === 1 && leaves[0].id !== col.id);

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

    this._applyColumnSelectionStyles();
    this._refreshSelectionStyles();
  }

  // ---------------- Menus ----------------
  _initMenuOverlay() {
    this._menuOverlay.className = "pte-menu";
    this._menuOverlay.style.position = "fixed";
    this._menuOverlay.style.zIndex = "9999";
    this._menuOverlay.style.display = "none";

    this._submenuOverlay.className = "pte-menu pte-submenu";
    this._submenuOverlay.style.position = "fixed";
    this._submenuOverlay.style.display = "none";
    this._submenuOverlay.style.zIndex = "10000";
    document.body.appendChild(this._submenuOverlay);

    // Close on click outside
    document.addEventListener("mousedown", (e) => {
      if (this._menuOverlay.style.display === "none") return;
      const insideMenu = this._menuOverlay.contains(e.target);
      const insideSubmenu = this._submenuOverlay.contains(e.target);
      if (!insideMenu && !insideSubmenu) this._closeMenu();
    });

    // Close on Esc
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._closeMenu();
    });

    document.body.appendChild(this._menuOverlay);
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

  _setServerLoading(isLoading: boolean, requestId?: number) {
    if (this.rowModel !== "serverSide") return;
    if (isLoading) {
      this._serverLoading = true;
      this._loadingOverlay.classList.remove("hidden");
    } else {
      if (requestId != null && requestId !== this._serverRequestSeq) return;
      this._serverLoading = false;
      this._loadingOverlay.classList.add("hidden");
    }
  }

  _wireSubmenuBehaviour(mainItems: MenuItem[]) {
    let openTimer = 0;

    const getItemById = (id: string) => mainItems.find(x => x.id === id);

    const menuMouseMoveListener = (e) => {
      const btn = e.target.closest(".pte-menu-item[data-item-id]");
      if (!btn) return;

      const id = btn.getAttribute("data-item-id");
      const item = getItemById(id);

      // If no submenu, close submenu (optional)
      if (!item?.subMenu) {
        this._hideSubmenu();
        return;
      }

      // If already open for this parent, do nothing
      if (this._submenuParentId === id) return;

      // Delay open to avoid flicker while moving mouse
      clearTimeout(openTimer);
      openTimer = setTimeout(() => {
        this._openSubmenu(btn, item.subMenu || []);
        this._submenuParentId = id;
        btn.setAttribute("aria-expanded", "true");
      }, 120);
    };

    const menuClickListener = (e) => {
      const btn = e.target.closest(".pte-menu-item[data-item-id]");
      if (!btn) return;

      const id = btn.getAttribute("data-item-id");
      const item = getItemById(id);

      if (item?.subMenu) {
        // clicking parent just opens submenu
        this._openSubmenu(btn, item.subMenu);
        this._submenuParentId = id;
        return;
      }

      if (item?.onClick && !item.disabled) {
        this._closeMenu();
        console.time("menuOnClick");
        item.onClick();
        console.timeEnd("menuOnClick");
        this._menuOverlay.removeEventListener("click", menuClickListener);
        this._menuOverlay.removeEventListener("mousemove", menuMouseMoveListener);
        this._submenuOverlay.removeEventListener("click", submenuClickListener);
      }
    }

    const submenuClickListener = (e) => {
      const btn = e.target.closest(".pte-menu-item[data-item-id]");
      if (!btn) return;

      const id = btn.getAttribute("data-item-id");
      const item = this._currentSubmenuItems?.find(x => x.id === id);
      if (item?.onClick && !item.disabled) {
        this._closeMenu();
        item.onClick();
        this._menuOverlay.removeEventListener("click", menuClickListener);
        this._menuOverlay.removeEventListener("mousemove", menuMouseMoveListener);
        this._submenuOverlay.removeEventListener("click", submenuClickListener);
      }
    };

    // Click handling (main menu)
    this._menuOverlay.addEventListener("mousemove", menuMouseMoveListener);
    this._menuOverlay.addEventListener("click", menuClickListener);
    // Click handling (submenu)
    this._submenuOverlay.addEventListener("click", submenuClickListener);
  }

  _hideSubmenu() {
    this._submenuOverlay.style.opacity = "0";
    this._submenuOverlay.style.display = "none";
    this._submenuParentId = null;
    this._currentSubmenuItems = null;
  }

  _openSubmenu(parentBtnEl: HTMLElement, submenuItems: MenuItem[]) {
    this._currentSubmenuItems = submenuItems;
    this._renderMenuItems(this._submenuOverlay, submenuItems, { isSubmenu: true });

    const r = parentBtnEl.getBoundingClientRect();
    const W = 220;

    // Default: open to the right
    let left = r.right;
    let top = r.top;

    // If would overflow right edge, open to the left
    if (left + W > window.innerWidth - 8) {
      left = r.left - W;
    }

    // Clamp vertically a bit
    this._submenuOverlay.style.display = "block";
    const submenuRect = this._submenuOverlay.getBoundingClientRect();
    this._submenuOverlay.style.opacity = "1";

    if (top + submenuRect.height > window.innerHeight - 8) {
      top = window.innerHeight - 8 - submenuRect.height;
    }

    this._submenuOverlay.style.left = `${left}px`;
    this._submenuOverlay.style.top = `${top}px`;
    this._submenuOverlay.style.minWidth = `${W}px`;
    this._submenuOverlay.style.display = "block";
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
      text.textContent = item.label;
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

  _openColMenu(colID: string, { anchorEl, left, top }: { anchorEl?: HTMLElement, left?: number, top?: number }) {
    this._menuColKey = colID;

    const items = this._getMenuItemsForColumn(colID);

    this._renderMenuItems(this._menuOverlay, items);
    this._wireSubmenuBehaviour(items);

    // Position near button
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.left;
      top = r.bottom + 4;
    } else {
      left = left || 100;
      top = top || 100;
    }
    this._menuOverlay.style.left = `${Math.min(left, window.innerWidth - 240)}px`;
    this._menuOverlay.style.top = `${Math.min(top, window.innerHeight - 300)}px`;
    this._menuOverlay.style.minWidth = "220px";
    this._menuOverlay.style.display = "flex";
  }

  _openColFilter(colID: string, anchorEl: HTMLElement) {
    this._filterColID = colID;

    // build content
    const content = this._buildFilterMenuDOM(colID);

    this._filterOverlay.innerHTML = "";
    this._filterOverlay.appendChild(content);

    // position
    const r = anchorEl.getBoundingClientRect();
    const W = 180, H = 220;
    this._filterOverlay.style.left = `${Math.min(r.left, window.innerWidth - W - 8)}px`;
    this._filterOverlay.style.top = `${Math.min(r.bottom + 4, window.innerHeight - H - 8)}px`;
    this._filterOverlay.style.minWidth = `${W}px`;
    this._filterOverlay.style.display = "block";

    // focus first control
    const first = this._filterOverlay.querySelector("[data-focus-first]") ||
      this._filterOverlay.querySelector("select, input, button, [tabindex]");
    first?.focus();
  }

  _closeMenu() {
    this._menuColKey = null;
    this._menuOverlay.style.display = "none";
    this._submenuOverlay.style.display = "none";
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

    const items: MenuItem[] = [];
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
    items.push({
      id: 'toggle-hidden',
      label: isHidden ? "Show Column" : "Hide Column",
      onClick: () => this._toggleColumnHidden(colID),
      left: !isHidden ? "icon-col-hide" : '',
    });
    items.push({
      id: 'group-by',
      label: "Group by " + (col.label || col.key),
      onClick: () => this._groupByColumn(colID),
      left: "icon-group",
    });
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
    items.push({
      id: 'autosize-col',
      label: "Autosize Column",
      onClick: () => this._updateColumnWidths(this.columns.find(c => c.key === colID) || null),
    });
    items.push({
      id: 'autosize-all',
      label: "Autosize All Columns",
      onClick: () => this._updateColumnWidths(),
    });
    items.push({ isSeparator: true });
    items.push({
      id: 'export-col',
      label: "Export Column",
      subMenu: [
        { id: 'export-csv', label: "Export as CSV", onClick: () => this._exportColumnCSV(colID) },
        { id: 'export-xlsx', label: "Export as Excel", onClick: () => this._exportColumnXLSX(colID) },
      ]
    });

    return items;
  }

  _buildFilterMenuDOM(colID: string) {
    let col = this._centerLeafColumns.find(c => c.id === colID);
    if (!col) col = this._leftPinnedLeafColumns.find(c => c.id === colID);
    if (!col) col = this._rightPinnedLeafColumns.find(c => c.id === colID);
    if (!col) return;

    const colType: ColumnType = col.type ?? ColumnType.STRING;
    const current = this._filters.find(f => f.key == colID);
    const isServerSide = this.rowModel === "serverSide";

    const root = document.createElement("div");
    root.className = "pte-filter-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", `Filter ${col.label ?? col.key}`);

    const typeSelect = document.createElement("select");
    typeSelect.className = "pte-filter-select";
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
    valueInput.type = colType === "number" ? "number" : "text";
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
    if (colType === "number" || colType === "date" || colType === "currency") {
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
    this._openColMenu(header.id, { left: e.clientX, top: e.clientY });
  }

  _headerCellClickHandler(e: MouseEvent) {
    const header = e.target?.closest(".pte-hcell");
    if (!header) return;
    const headerContent = e.target?.closest(".pte-hcell-content");
    if (headerContent) {
      const col = findColumnById(this.columns, header.id);
      if (!col) return;
      if (e.shiftKey) {
        if (col.children && Array.isArray(col.children) && col.children.length > 0) {
          return this._toggleBatchSort(col);
        }
        return this._toggleSort(header.id);
      }
      this._toggleColumnSelection(header.id);
      return;
    }
    const btn = e.target?.closest(".pte-hcell-menu-btn");
    if (btn) {
      const isFilter = btn.classList.contains("pte-hcell-menu-filterBtn");
      // Based on the btn clicked, render filter/menu UI
      if (!isFilter) {
        this._openColMenu(header.id, { anchorEl: btn });
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
    if (this.rowModel !== "serverSide") return;
    if (!this._serverSideDataSource) {
      console.warn("serverSideDataSource is not configured for serverSide row model.");
      return;
    }

    this._setServerLoading(true);
    const pageSize = this._pagination ? this._paginationPageSize : Math.max(1, this._paginationPageSize || this.data.length || 1);
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

    const req: ServerSideRequest = {
      filters,
      sorts,
      page: this._pagination ? this._pageIdx : 0,
      pageSize,
    };

    const requestId = ++this._serverRequestSeq;
    try {
      const result = await this._serverSideDataSource(req);
      if (requestId !== this._serverRequestSeq) return;
      const rows = result?.rows ?? [];
      const totalRows = result?.totalRows ?? rows.length;
      this.setData(rows, { resetPage: false, totalRows });
    } catch (err) {
      console.error("Failed to fetch server-side rows", err);
    } finally {
      this._setServerLoading(false, requestId);
    }
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

  _onFilterModelChanged() {
    this._filterDirty = true;
    this._sortDirty = true; // filter affects sort view
    this._updateFilterIndicators();
    if (this.rowModel === "serverSide") {
      this._fetchServerSideRows("filterChanged");
      return;
    }
    this._recomputeView();
    this._updateWindow(true, undefined);
  }

}
