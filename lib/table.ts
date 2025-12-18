import { MutableRefObject } from "react";
import { computeFilteredIdx } from "./helpers";
import { ColumnDef, FilterDef, MenuItem, SortDef } from "./types";
import { bool } from "prop-types";

interface TableProps {
  columns?: ColumnDef[];
  rowHeight?: number;
  height?: number;
  overscan?: number;
  data?: any[];
}

export default class Table {
  container: MutableRefObject<null>;
  columns: ColumnDef[];
  rowHeight: number;
  height: number;
  overscan: number;
  data: any[];
  _filters: FilterDef[];
  _sorts: SortDef[];

  _maxDepth: number;

  _filteredIdx: number[];
  _sortedIdx: number[];
  _measureCtx: CanvasRenderingContext2D | null;
  _columnWidths: Array<{
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
  _startIndex: number;

  // DOM elements
  root: HTMLDivElement;
  header: HTMLDivElement;
  scroller: HTMLDivElement;
  spacer: HTMLDivElement;
  viewport: HTMLDivElement;

  _menuOverlay: HTMLDivElement;
  _menuColKey: string | null;
  _submenuOverlay: HTMLDivElement;
  _submenuParentId: string | null;

  _poolSize: number;
  _rowPool: Array<{
    rowEl: HTMLDivElement;
    cellEls: HTMLDivElement[];
  }>;

  _rafPending: boolean;
  _measureCache: Map<string, Map<string, number>>;

  constructor(container: MutableRefObject<null>, {
    columns = [],
    rowHeight = 43,
    height = 400,
    overscan = 6,
    data = [],
  }: TableProps) {
    this.container = container;
    this.columns = columns;
    this.rowHeight = rowHeight;
    this.height = height;
    this.overscan = overscan;

    this.data = data ?? [];
    if (this.data && this.data.length > 0) {
      this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
      this._sortedIdx = this._filteredIdx;
    } else {
      this._filteredIdx = [];
      this._sortedIdx = [];
    }

    // State
    this._filters = [];
    this._sorts = [];
    this._measureCtx = null;
    this._measureCache = new Map();
    this._columnWidths = [];
    this._collator = null;
    this._sortComparatorCache = new Map();

    this._maxDepth = 0;

    this._filterDirty = true;
    this._sortDirty = true;

    // View state
    this._viewRows = [];          // filtered/sorted view (array of row objects)
    this._startIndex = 0;

    // DOM skeleton
    this.root = document.createElement("div");
    this.root.className = "pte-root";
    container.appendChild(this.root);

    this.header = document.createElement("div");
    this.header.className = "pte-header";
    this.root.appendChild(this.header);

    this.scroller = document.createElement("div");
    this.scroller.className = "pte-scroller";
    this.scroller.style.height = `${height}px`;
    this.root.appendChild(this.scroller);

    this.spacer = document.createElement("div");
    this.spacer.className = "pte-spacer";
    this.scroller.appendChild(this.spacer);

    this.viewport = document.createElement("div");
    this.viewport.className = "pte-viewport";
    this.spacer.appendChild(this.viewport);

    this._initMenuOverlay();

    // Create a pooled set of row nodes
    this._poolSize = Math.ceil(height / rowHeight) + overscan * 2;
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    this._buildHeaderDOM();
    this._buildRowPool();

    // Events
    this._rafPending = false;
    this.scroller.addEventListener("scroll", () => this._scheduleWindowUpdate());

    // header sort click delegation
    // this.header.addEventListener("click", (e) => this._headerCellClickHandler(e));

    document.addEventListener("click", (e) => this._cellClickHandler(e));

    // initial
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true);
  }

  // ---------------- Public API ----------------
  setData(data: any[]) {
    this.data = data ?? [];
    this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
    this._sortedIdx = this._filteredIdx.slice();
    this._sortComparatorCache.clear();
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true);
  }

  setColumns(columns: ColumnDef[]) {
    this.columns = columns ?? [];
    this._sortComparatorCache.clear();
    // Structural change -> rebuild header + pool
    this._buildHeaderDOM();
    this._rebuildRowPool(); // rare operation
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true);
  }

  setFilters(filters: FilterDef[]) {
    this._filters = filters ?? [];
    this._filterDirty = true;
    this._sortDirty = true; // filter affects sort view
    this._recomputeView();
    this._updateWindow(true);
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
    this._recomputeView();
    this._addSortIndicatorToHeader(sort.key, removed ? '' : sort.dir);
    this._updateWindow(true);
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
    this._recomputeView();
    this._addSortIndicatorToHeader(key, curr?.dir || '');
    this._updateWindow(true);
  }

  _recomputeView() {
    // In “psycho mode”, for big data you’d do server-side, not sort/filter here.
    let rows = this.data;

    if (this._filterDirty) {
      this._filterDirty = false;
      if (this._filters) {
        this._filteredIdx = computeFilteredIdx(this.data, this._filters);
      } else {
        this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
      }
      this._sortDirty = true; // filter affects sort view
    }

    if (this._sortDirty) {
      this._sortDirty = false;
      this._sortedIdx = this._filteredIdx.slice();
      if (this._sorts && this._sorts.length > 0) {
        for (const sort of this._sorts) {
          const { key, dir } = sort;
          const mult = dir === "desc" ? -1 : 1;
          const col = this.columns.find(c => c.key === key);
          if (!col) continue;
          const cmp = this._getComparatorForColumn(col);
          this._sortedIdx.sort((a, b) => cmp(rows[a], rows[b]) * mult);
        }
      }

    }

    // Update total scroll height
    this.spacer.style.height = `${this._sortedIdx.length * this.rowHeight}px`;
  }

  // ---------------- Internals: DOM build ----------------
  _getMeasureContext(): CanvasRenderingContext2D | null {
    if (!this._measureCtx) {
      const canvas = document.createElement("canvas");
      this._measureCtx = canvas.getContext("2d");
    }

    const probe = this.header.querySelector(".pte-hcell") || this.container;
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

  _getComparatorForColumn(col: ColumnDef) {
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

  _autoSizeColumn(col: ColumnDef, { sampleSize = 64, randomSize = 64, maxWidth = 420 } = {}) {
    const headerText = col.label ?? col.key;
    let best = this._measureText(headerText) + 84;

    // cache per column
    const colCacheKey = `col:${col.key}`;
    let colCache = this._measureCache.get(colCacheKey);
    if (!colCache) { colCache = new Map(); this._measureCache.set(colCacheKey, colCache); }

    const rows = this.data; // IMPORTANT: raw data order, not sorted view
    const n = rows.length;

    const measureValue = (v: string, row: any) => {
      const dv = col.valueFormatter ? col.valueFormatter(v, row) : v;
      const s = dv == null ? "" : String(dv);
      const cached = colCache.get(s);
      if (cached != null) return cached;
      const w = this._measureText(s);
      colCache.set(s, w);
      return w;
    };

    // 1) first sampleSize rows
    for (let i = 0; i < Math.min(sampleSize, n); i++) {
      const w = measureValue(rows[i][col.key], rows[i]);
      if (w > best) best = w;
      if (best >= maxWidth) return maxWidth;
    }

    // 2) deterministic random sampling across dataset (stable)
    // Use a simple LCG seeded by col.key length (or a real hash)
    let seed = 2166136261;
    for (let i = 0; i < col.key.length; i++) seed = (seed ^ col.key.charCodeAt(i)) * 16777619;

    const pick = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };

    for (let k = 0; k < Math.min(randomSize, n); k++) {
      const idx = pick();
      const w = measureValue(rows[idx][col.key], rows[idx]);
      if (w > best) best = w;
      if (best >= maxWidth) return maxWidth;
    }

    return Math.min(best, maxWidth);
  }

  _computeColumnWidths(column: ColumnDef | null = null) {
    const ctx = this._getMeasureContext();
    this._columnWidths = this.columns.map((col, i) => {
      if (col.width != null) {
        return { width: col.width, fixed: true };
      }
      if (column && column.key !== col.key) {
        if (this._columnWidths && !!this._columnWidths[i]) {
          return this._columnWidths?.[i];
        }
      }

      const minWidth = Math.max(10, col.minWidth ?? 10);
      const maxWidth = col.maxWidth ?? 420;

      const autoWidth = this._autoSizeColumn(col, { maxWidth });
      const width = Math.min(Math.max(autoWidth, minWidth), maxWidth);

      return { width, minWidth, maxWidth, fixed: false };
    });
  }

  _applyColumnWidths() {
    if (!this._columnWidths?.length) return;

    const headerCells = this.header.children;
    for (let i = 0; i < this.columns.length; i++) {
      const info = this._columnWidths[i];
      const hcell = headerCells[i];
      if (!hcell || !info) continue;

      hcell.style.flex = "0 0 auto";
      hcell.style.width = `${info.width}px`;
      if (!info.fixed) {
        hcell.style.minWidth = `${info.minWidth}px`;
        hcell.style.maxWidth = Number.isFinite(info.maxWidth) ? `${info.maxWidth}px` : "";
      } else {
        hcell.style.minWidth = "";
        hcell.style.maxWidth = "";
      }
    }

    for (const slot of this._rowPool) {
      for (let c = 0; c < this.columns.length; c++) {
        const info = this._columnWidths[c];
        const cell = slot.cellEls[c];
        if (!cell || !info) continue;

        cell.style.flex = "0 0 auto";
        cell.style.width = `${info.width}px`;
        if (!info.fixed) {
          cell.style.minWidth = `${info.minWidth}px`;
          cell.style.maxWidth = Number.isFinite(info.maxWidth) ? `${info.maxWidth}px` : "";
        } else {
          cell.style.minWidth = "";
          cell.style.maxWidth = "";
        }
      }
    }
  }

  _updateColumnWidths(column: ColumnDef | null = null) {
    console.time("computeColumnWidths");
    this._computeColumnWidths(column);
    console.timeEnd("computeColumnWidths");
    this._applyColumnWidths();
  }

  _computeHeaderDepth() {
    const traverse = (cols: ColumnDef[], depth: number) => {
      for (const col of cols) {
        if (col.children && Array.isArray(col.children)) {
          traverse(col.children, depth + 1);
          col.depth = col.children.reduce((max, c) => Math.max(max, c.depth || 1), 1);
        } else {
          if (depth > this._maxDepth) {
            this._maxDepth = depth;
          }
          col.depth = 1;
        }
      }
    };

    traverse(this.columns, 1);
  }

  _buildHeaderDOM() {
    this._computeHeaderDepth();
    this.header.innerHTML = "";
    for (const col of this.columns) {
      const header = document.createElement("div");
      header.className = "pte-hcell";
      header.style.height = `${this.rowHeight}px`;
      header.setAttribute("data-sort-key", col.key);
      const headerContent = document.createElement("div");
      headerContent.className = "pte-hcell-content";
      header.appendChild(headerContent);
      headerContent.textContent = col.label ?? col.key;
      const headerMenu = this._getHeaderMenuElement();
      header.appendChild(headerMenu);

      const sort = this._sorts.find(s => s.key === col.key);
      if (sort) {
        this._addSortIndicatorToHeader(col.key, sort.dir);
      }

      this.header.appendChild(header);
    }
    this._applyColumnWidths();
  }

  _getHeaderMenuElement(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu";

    const buildMenuItem = (btnClass: string, iconClass: string, flyout: HTMLDivElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pte-hcell-menu-item";

      const btn = document.createElement("div");
      btn.className = `pte-hcell-menu-btn ${btnClass}`;
      const icon = document.createElement("span");
      icon.className = iconClass;
      btn.appendChild(icon);
      wrapper.appendChild(btn);
      wrapper.appendChild(flyout);

      return wrapper;
    };

    menu.appendChild(buildMenuItem("pte-hcell-menu-filterBtn", "pte-filter-icon", this._getFilterMenuElement()));
    menu.appendChild(buildMenuItem("pte-hcell-menu-menuBtn", "pte-menu-icon", this._getMenuMenuElement()));
    return menu;
  }

  _getFilterMenuElement(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu-flyout";
    menu.textContent = "Filter menu";
    return menu;
  }

  _getMenuMenuElement(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu-flyout";
    menu.textContent = "Header menu";
    return menu;
  }

  _buildRowPool() {
    this.viewport.innerHTML = "";
    this._rowPool = [];

    for (let i = 0; i < this._poolSize; i++) {
      const rowEl = document.createElement("div");
      rowEl.className = "pte-row";
      rowEl.style.height = `${this.rowHeight}px`;
      rowEl.style.display = "flex";

      const cellEls = [];
      for (const col of this.columns) {
        const cell = document.createElement("div");
        cell.className = "pte-cell";
        cell.style.flex = "0 0 auto";
        cell.style.whiteSpace = "nowrap";
        cell.style.overflow = "hidden";
        cell.style.textOverflow = "ellipsis";
        rowEl.appendChild(cell);
        cellEls.push(cell);
      }

      this.viewport.appendChild(rowEl);
      this._rowPool.push({ rowEl, cellEls });
    }
  }

  _rebuildRowPool() {
    // If columns change frequently, you’d do smarter diffing.
    this._buildRowPool();
  }

  _addSortIndicatorToHeader(key: string, dir: "asc" | "desc" | '') {
    const headerCells = this.header.children;
    for (let i = 0; i < headerCells.length; i++) {
      const hcell = headerCells[i];
      if (hcell.getAttribute("data-sort-key") === key) {
        const hcellContent = hcell.querySelector(".pte-hcell-content");
        if (!hcellContent) continue;
        // remove existing
        // const existing = hcell.querySelector(".pte-sort");
        // if (existing) existing.remove();
        hcellContent.classList.remove("pte-sorted-asc", "pte-sorted-desc");

        // add new
        if (dir === '') return;
        hcellContent.classList.add("pte-sorted-" + dir);
        break;
      }
    }
  }

  // ---------------- Internals: hot path ----------------
  _scheduleWindowUpdate() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._updateWindow(false);
    });
  }

  _updateWindow(forcePatch: boolean) {
    const total = this._sortedIdx.length;
    const scrollTop = this.scroller.scrollTop;

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
    this.viewport.style.transform = `translateY(${offsetY}px)`;

    // Patch pooled rows
    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIndex = startIndex + i;
      const slot = this._rowPool[i];

      if (viewIndex >= total) {
        slot.rowEl.style.display = "none";
        continue;
      }

      slot.rowEl.style.display = "flex";
      const row = this.data[this._sortedIdx[viewIndex]];

      // HOT: write textContent only (no re-render, no diff)
      for (let c = 0; c < this.columns.length; c++) {
        const col = this.columns[c];
        const key = col.key;
        const v = row[key];
        const displayValue = col.valueFormatter ? col.valueFormatter(v, row) : v;
        slot.cellEls[c].textContent = displayValue == null ? "" : String(displayValue);
      }
    }
  }

  _patchVisibleCells({ rowIds, colKeys } = {}) {
    // Minimal version: patch the currently visible pool.
    // rowIds/colKeys can be used to skip work if you pass them.
    const total = this._sortedIdx.length;
    const startIndex = this._startIndex;

    const colIndexSet = colKeys
      ? new Set(colKeys.map(k => this.columns.findIndex(c => c.key === k)).filter(i => i >= 0))
      : null;

    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIndex = startIndex + i;
      if (viewIndex >= total) continue;

      const row = this.data[this._sortedIdx[viewIndex]];
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

  // ---------------- Menus ----------------
  _initMenuOverlay() {
    this._menuOverlay = document.createElement("div");
    this._menuOverlay.className = "pte-menu";
    this._menuOverlay.style.position = "fixed";
    this._menuOverlay.style.zIndex = "9999";
    this._menuOverlay.style.display = "none";

    this._submenuOverlay = document.createElement("div");
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

  _wireSubmenuBehaviour(mainItems: MenuItem[]) {
    let openTimer = null;

    const getItemById = (id) => mainItems.find(x => x.id === id);

    this._menuOverlay.addEventListener("mousemove", (e) => {
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
        this._openSubmenu(btn, item.subMenu);
        this._submenuParentId = id;
        btn.setAttribute("aria-expanded", "true");
      }, 120);
    });

    // Click handling (main menu)
    this._menuOverlay.addEventListener("click", (e) => {
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
        item.onClick();
      }
    });

    // Click handling (submenu)
    this._submenuOverlay.addEventListener("click", (e) => {
      const btn = e.target.closest(".pte-menu-item[data-item-id]");
      if (!btn) return;

      const id = btn.getAttribute("data-item-id");
      const item = this._currentSubmenuItems?.find(x => x.id === id);
      if (item?.onClick && !item.disabled) {
        this._closeMenu();
        item.onClick();
      }
    });
  }

  _hideSubmenu() {
    this._submenuOverlay.style.display = "none";
    this._submenuParentId = null;
    this._currentSubmenuItems = null;
  }

  _openSubmenu(parentBtnEl: HTMLElement, submenuItems: any[]) {
    this._currentSubmenuItems = submenuItems;
    this._renderMenuItems(this._submenuOverlay, submenuItems, { isSubmenu: true });

    const r = parentBtnEl.getBoundingClientRect();
    const W = 220;

    // Default: open to the right
    let left = r.right + 4;
    let top = r.top;

    // If would overflow right edge, open to the left
    if (left + W > window.innerWidth - 8) {
      left = r.left - W - 4;
    }

    // Clamp vertically a bit
    top = Math.min(top, window.innerHeight - 260);

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
      if (item.label === "—") {
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

  _openColMenu(colKey: string, anchorEl: HTMLElement) {
    this._menuColKey = colKey;

    const items = this._getMenuItemsForColumn(colKey);

    this._renderMenuItems(this._menuOverlay, items);
    this._wireSubmenuBehaviour(items);

    // Position near button
    const r = anchorEl.getBoundingClientRect();
    this._menuOverlay.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
    this._menuOverlay.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 300)}px`;
    this._menuOverlay.style.minWidth = "220px";
    this._menuOverlay.style.display = "flex";
  }

  _closeMenu() {
    this._menuColKey = null;
    this._menuOverlay.style.display = "none";
    this._submenuOverlay.style.display = "none";
    this._submenuParentID = null;
  }

  _getMenuItemsForColumn(colKey: string): MenuItem[] {
    const col = this.columns.find(c => c.key === colKey);
    if (!col) return [];

    const isHidden = !!col.hidden;
    const isPinned = col.pinned === "left" || col.pinned === "right";

    const sort = this._sorts.find(s => s.key === colKey);

    const items = [];
    if (!sort) {
      items.push({ label: "Sort Asc", onClick: () => this.setSort({ key: colKey, dir: "asc" }), left: "icon-asc" });
      items.push({ label: "Sort Desc", onClick: () => this.setSort({ key: colKey, dir: "desc" }), left: "icon-desc" });
    } else if (sort.dir === "asc") {
      items.push({ label: "Sort Desc", onClick: () => this.setSort({ key: colKey, dir: "desc" }), left: "icon-desc" });
      items.push({ label: "Clear Sort", onClick: () => this.setSort(sort), left: "icon-clear" });
    } else {
      items.push({ label: "Sort Asc", onClick: () => this.setSort({ key: colKey, dir: "asc" }), left: "icon-asc" });
      items.push({ label: "Clear Sort", onClick: () => this.setSort(sort), left: "icon-clear" });
    }
    items.push({ label: "—", disabled: true, onClick: () => { } }); // separator (or render <hr>)
    items.push({
      label: isHidden ? "Show Column" : "Hide Column",
      onClick: () => this._toggleColumnHidden(colKey),
      left: !isHidden ? "icon-col-hide" : undefined,
    });
    items.push({
      label: "Group by " + (col.label || col.key),
      onClick: () => this._groupByColumn(colKey),
      left: "icon-group",
    });
    items.push({
      label: "Pin Column",
      subMenu: [
        {
          label: "No pin",
          onClick: () => this._pinColumn(colKey, null),
          left: !isPinned ? "icon-check" : undefined,
        },
        {
          label: "Pin Left",
          onClick: () => this._pinColumn(colKey, "left"),
          left: col.pinned === "left" ? "icon-check" : undefined,
        },
        {
          label: "Pin Right",
          onClick: () => this._pinColumn(colKey, "right"),
          left: col.pinned === "right" ? "icon-check" : undefined,
        },
      ]
    });
    items.push({ label: "—", disabled: true, onClick: () => { } }); // separator (or render <hr>)
    items.push({
      label: "Autosize Column",
      onClick: () => this._updateColumnWidths(this.columns.find(c => c.key === colKey) || null),
    });
    items.push({
      label: "Autosize All Columns",
      onClick: () => this._updateColumnWidths(),
    });
    items.push({ label: "—", disabled: true, onClick: () => { } }); // separator (or render <hr>)
    items.push({
      label: "Export Column",
      subMenu: [
        { label: "Export as CSV", onClick: () => this._exportColumnCSV(colKey) },
        { label: "Export as Excel", onClick: () => this._exportColumnJSON(colKey) },
      ]
    });

    return items;
  }

  // ---------------- Event listeners ----------------
  _headerCellClickHandler(e: MouseEvent) {
    const header = e.target?.closest("[data-sort-key]");
    if (!header) return;
    const headerContent = e.target?.closest(".pte-hcell-content");
    if (headerContent) {
      this._toggleSort(header.getAttribute("data-sort-key"));
      return;
    }
    const btn = e.target?.closest(".pte-hcell-menu-btn");
    if (btn) {
      const isFilter = btn.classList.contains("pte-hcell-menu-filterBtn");
      // Based on the btn clicked, render filter/menu UI
      if (!isFilter) {
        this._openColMenu(header.getAttribute("data-sort-key") || "", btn);
      }
      // btn.parentNode.classList.add("active");
      console.log("Header menu button clicked", isFilter ? "filter" : "menu");
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

    const header = e.target?.closest("[data-sort-key]");
    if (header) {
      this._headerCellClickHandler(e);
      return;
    }

    // Add class 'selected' to a cell when clicked
    const cell = e.target?.closest(".pte-cell");
    if (!cell) return;

    // Remove 'selected' class from all cells
    const allCells = this.root.querySelectorAll(".pte-cell");
    allCells.forEach(c => c.classList.remove("selected"));

    // Add 'selected' class to the clicked cell
    cell.classList.add("selected");
  }
}
