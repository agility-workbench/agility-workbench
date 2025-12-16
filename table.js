class VirtualTableEnginePatched {
  constructor(container, {
    columns = [],
    rowHeight = 32,
    height = 400,
    overscan = 6,
    data = [],
  } = {}) {
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
    this.filter = "";
    this.sort = null;
    this._measureCtx = null;
    this._columnWidths = [];
    this._collator = null;
    this._sortComparatorCache = new Map();

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

    // Create a pooled set of row nodes
    this._poolSize = Math.ceil(height / rowHeight) + overscan * 2;
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    this._buildHeaderDOM();
    this._buildRowPool();

    // Events
    this._rafPending = false;
    this.scroller.addEventListener("scroll", () => this._scheduleWindowUpdate());

    // header sort click delegation
    this.header.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sort-key]");
      if (!btn) return;
      this._toggleSort(btn.getAttribute("data-sort-key"));
    });

    // initial
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true);
  }

  // ---------------- Public API ----------------
  setData(data) {
    this.data = data ?? [];
    this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
    this._sortedIdx = this._filteredIdx.slice();
    this._sortComparatorCache.clear();
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true);
  }

  setColumns(columns) {
    this.columns = columns ?? [];
    this._sortComparatorCache.clear();
    // Structural change -> rebuild header + pool
    this._buildHeaderDOM();
    this._rebuildRowPool(); // rare operation
    this._recomputeView();
    this._updateColumnWidths();
    this._updateWindow(true);
  }

  setFilter(text) {
    this.filter = text ?? "";
    this._filterDirty = true;
    this._sortDirty = true; // filter affects sort view
    this._recomputeView();
    this._updateWindow(true);
  }

  setSort(sort) {
    this.sort = sort;
    this._sortDirty = true;
    this._recomputeView();
    this._buildHeaderDOM(); // update sort indicators
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
  _toggleSort(key) {
    const curr = this.sort;
    let next = { key, dir: "asc" };
    if (curr?.key === key && curr.dir === "asc") next = { key, dir: "desc" };
    else if (curr?.key === key && curr.dir === "desc") next = null;
    this.setSort(next);
  }

  _recomputeView() {
    // In “psycho mode”, for big data you’d do server-side, not sort/filter here.
    let rows = this.data;

    if (this._filterDirty) {
      this._filterDirty = false;
      if (this.filter.trim()) {
        const q = this.filter.toLowerCase();
        this._filteredIdx = this._filteredIdx.filter(r =>
          this.columns.some(c => String(rows[r][c.key] ?? "").toLowerCase().includes(q))
        );
      } else {
        this._filteredIdx = Array.from({ length: this.data.length }, (_, i) => i);
      }
      this._sortDirty = true; // filter affects sort view
    }

    if (this._sortDirty) {
      this._sortDirty = false;
      if (this.sort?.key) {
        const { key, dir } = this.sort;
        const mult = dir === "desc" ? -1 : 1;
        const col = this.columns.find(c => c.key === key);
        const cmp = this._getComparatorForColumn(col);
        this._sortedIdx.sort((a, b) => cmp(rows[a], rows[b]) * mult);
      } else {
        this._sortedIdx = this._filteredIdx.slice();
      }
    }

    // Update total scroll height
    this.spacer.style.height = `${this._sortedIdx.length * this.rowHeight}px`;
  }

  // ---------------- Internals: DOM build ----------------
  _getMeasureContext() {
    if (!this._measureCtx) {
      const canvas = document.createElement("canvas");
      this._measureCtx = canvas.getContext("2d");
    }

    const probe = this.header.querySelector(".pte-hcell") || this.container;
    const font = getComputedStyle(probe).font || "16px sans-serif";
    if (this._measureCtx.font !== font) {
      this._measureCtx.font = font;
    }
    return this._measureCtx;
  }

  _measureText(ctx, text) {
    const padding = 16; // small breathing room so text is not cramped
    return ctx.measureText(text ?? "").width + padding;
  }

  _getCollator() {
    if (!this._collator) {
      this._collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    }
    return this._collator;
  }

  _getComparatorForColumn(col) {
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

  _autoSizeColumn(col, { sampleSize = 64, randomSize = 64, maxWidth = 420 } = {}) {
    const ctx = this._getMeasureContext();

    const headerText = col.label ?? col.key;
    let best = this._measureText(ctx, headerText);

    // cache per column
    const cache = (this._measureCache ??= new Map());
    const colCacheKey = `col:${col.key}`;
    let colCache = cache.get(colCacheKey);
    if (!colCache) { colCache = new Map(); cache.set(colCacheKey, colCache); }

    const rows = this.data; // IMPORTANT: raw data order, not sorted view
    const n = rows.length;

    const measureValue = (v) => {
      const s = v == null ? "" : String(v);
      const cached = colCache.get(s);
      if (cached != null) return cached;
      const w = this._measureText(ctx, s);
      colCache.set(s, w);
      return w;
    };

    // 1) first sampleSize rows
    for (let i = 0; i < Math.min(sampleSize, n); i++) {
      const w = measureValue(rows[i][col.key]);
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
      const w = measureValue(rows[idx][col.key]);
      if (w > best) best = w;
      if (best >= maxWidth) return maxWidth;
    }

    return Math.min(best, maxWidth);
  }


  _computeColumnWidths() {
    const ctx = this._getMeasureContext();
    this._columnWidths = this.columns.map(col => {
      if (col.width != null) {
        return { width: col.width, fixed: true };
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

  _updateColumnWidths() {
    console.time("computeColumnWidths");
    this._computeColumnWidths();
    console.timeEnd("computeColumnWidths");
    this._applyColumnWidths();
  }

  _buildHeaderDOM() {
    this.header.innerHTML = "";
    for (const col of this.columns) {
      const btn = document.createElement("div");
      btn.className = "pte-hcell";
      btn.setAttribute("data-sort-key", col.key);
      btn.textContent = col.label ?? col.key;

      if (this.sort?.key === col.key) {
        const s = document.createElement("span");
        s.className = "pte-sort";
        s.textContent = this.sort.dir === "asc" ? " ▲" : " ▼";
        btn.appendChild(s);
      }

      this.header.appendChild(btn);
    }
    this._applyColumnWidths();
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

  // ---------------- Internals: hot path ----------------
  _scheduleWindowUpdate() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._updateWindow(false);
    });
  }

  _updateWindow(forcePatch) {
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
        const key = this.columns[c].key;
        const v = row[key];
        slot.cellEls[c].textContent = v == null ? "" : String(v);
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
}
