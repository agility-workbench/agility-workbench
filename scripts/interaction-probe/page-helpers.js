/*
 * Browser half of the interaction probe: geometry and state reads over the grid's DOM contract.
 * Plain script, no imports; scripts/interaction-probe/run.mjs injects it into the layout-matrix
 * harness page and calls `window.__probe.<fn>(...)`. Everything returns plain JSON.
 *
 * Section scoping matters: a body row is split into one `.pte-row` per section (leading, left,
 * centre, right) that share `data-view-idx`, and the pinned-row bands and the sticky overlay
 * carry rows of their own, so every body lookup is confined to `.pte-body` and to rows outside
 * the bands and the overlay.
 */
(function (global) {
  "use strict";

  var BAND_SEL = ".pte-pinned-rows-top, .pte-pinned-rows-bottom, .pte-sticky-rows";

  function root() { return document.querySelector(".lm-host .pte-root") || document.querySelector(".pte-root"); }
  function rtl() { var r = root(); return !!r && r.getAttribute("dir") === "rtl"; }
  function rect(el) {
    if (!el) return null;
    var b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height, x: b.x, y: b.y };
  }
  function inBand(el) { return !!(el && el.closest(BAND_SEL)); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function body() { return root().querySelector(".pte-body"); }
  function spacer() { return root().querySelector(".pte-body .pte-spacer"); }
  function centerHeader() { return root().querySelector(".pte-header"); }

  /** The visible part of the centre section in viewport px: the centre scroller's client box
   *  horizontally, the body's client box vertically. */
  function centerBox() {
    var s = spacer();
    var b = body();
    var sb = s.getBoundingClientRect();
    var bb = b.getBoundingClientRect();
    var left = sb.left + s.clientLeft;
    return { left: left, right: left + s.clientWidth, top: bb.top + b.clientTop, bottom: bb.top + b.clientTop + b.clientHeight };
  }

  /** Body row fragments of one section that are at least partly inside the body's visible box. */
  function visibleRows(container) {
    var box = centerBox();
    var rows = container ? container.querySelectorAll(".pte-row[data-view-idx]") : [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (inBand(row) || row.classList.contains("pte-full-width-row")) continue;
      if (row.style.display === "none" || row.offsetParent === null) continue;
      var b = row.getBoundingClientRect();
      if (b.bottom <= box.top + 1 || b.top >= box.bottom - 1) continue;
      out.push(row);
    }
    return out;
  }

  /** Centre header leaves in inline order (start → end), with their boxes. */
  function centerLeaves() {
    var leaves = Array.prototype.slice.call(centerHeader().querySelectorAll(".pte-hcell-leaf"));
    var list = leaves.map(function (el) { return { id: el.id, el: el, b: el.getBoundingClientRect() }; });
    var isRtl = rtl();
    list.sort(function (a, b) { return isRtl ? b.b.right - a.b.right : a.b.left - b.b.left; });
    return list;
  }

  /** Centre cells of a row fragment that carry a column (excludes the full-width host and gaps). */
  function centerCells(row) {
    return Array.prototype.slice.call(row.querySelectorAll(":scope > .pte-cell[data-col-id]"))
      .filter(function (c) { return c.style.display !== "none"; });
  }

  /**
   * Column virtualization contract on every visible centre row:
   *  - every centre header leaf that intersects the visible centre box has a body cell with its id,
   *    at its x and width (so no visible gap);
   *  - the rendered cells together cover the visible box;
   *  - each `.pte-col-gap` is as wide as the run of unrendered columns it stands for;
   *  - the header scrolls with the body; the rendered cell count stays bounded.
   */
  function virtualization(maxCells) {
    var problems = [];
    var box = centerBox();
    var leaves = centerLeaves();
    var rows = visibleRows(spacer());
    var maxRendered = 0;
    var tol = 0.6;
    var s = spacer();
    var h = centerHeader();
    if (Math.abs(Math.abs(s.scrollLeft) - Math.abs(h.scrollLeft)) > 0.5) {
      problems.push({ id: "header-scroll", message: "header scrollLeft " + h.scrollLeft + " != body " + s.scrollLeft });
    }
    rows.forEach(function (row) {
      var view = row.getAttribute("data-view-idx");
      var cells = centerCells(row);
      if (cells.length > maxRendered) maxRendered = cells.length;
      var byId = {};
      cells.forEach(function (c) { byId[c.dataset.colId] = c; });
      // 1. visible leaves have aligned cells.
      for (var i = 0; i < leaves.length; i++) {
        var leaf = leaves[i];
        if (leaf.b.right <= box.left + tol || leaf.b.left >= box.right - tol || leaf.b.width < 1) continue;
        var cell = byId[leaf.id];
        if (!cell) {
          problems.push({ id: "missing-cell", message: "row " + view + ": visible column " + i + " has no rendered cell", details: { leaf: [r1(leaf.b.left), r1(leaf.b.right)], box: [r1(box.left), r1(box.right)] } });
          return;
        }
        var cb = cell.getBoundingClientRect();
        if (Math.abs(cb.left - leaf.b.left) > tol || Math.abs(cb.width - leaf.b.width) > tol) {
          problems.push({ id: "cell-x", message: "row " + view + ": column " + i + " cell is off its header leaf", details: { leaf: [r1(leaf.b.left), r1(leaf.b.width)], cell: [r1(cb.left), r1(cb.width)] } });
          return;
        }
      }
      // 2. coverage: walk the visible box with the rendered cells.
      var spans = cells.map(function (c) { var b = c.getBoundingClientRect(); return [b.left, b.right]; })
        .filter(function (sp) { return sp[1] > box.left && sp[0] < box.right; })
        .sort(function (a, b) { return a[0] - b[0]; });
      var reach = box.left;
      for (var k = 0; k < spans.length; k++) {
        if (spans[k][0] > reach + tol) break;
        reach = Math.max(reach, spans[k][1]);
      }
      // The last column may end before the box (content narrower than the viewport): only flag a
      // hole that a header leaf covers.
      var lastLeafEdge = leaves.length ? Math.max.apply(null, leaves.map(function (l) { return l.b.right; })) : box.right;
      var firstLeafEdge = leaves.length ? Math.min.apply(null, leaves.map(function (l) { return l.b.left; })) : box.left;
      if (reach < Math.min(box.right, lastLeafEdge) - tol && !(firstLeafEdge > reach + tol)) {
        problems.push({ id: "coverage", message: "row " + view + ": rendered cells stop at " + r1(reach) + " inside the visible box", details: { box: [r1(box.left), r1(box.right)] } });
        return;
      }
      // 3. gaps: each attached gap equals the unrendered run before the next rendered cell.
      var expected = [];
      var run = 0;
      for (var j = 0; j < leaves.length; j++) {
        if (byId[leaves[j].id]) {
          if (run > 0) expected.push(run);
          run = 0;
        } else {
          run += leaves[j].b.width;
        }
      }
      var gaps = Array.prototype.slice.call(row.querySelectorAll(":scope > .pte-col-gap"))
        .map(function (g) { return g.getBoundingClientRect().width; })
        .filter(function (w) { return w > 0; });
      var same = gaps.length === expected.length && gaps.every(function (w, n) { return Math.abs(w - expected[n]) <= 1; });
      if (!same) {
        problems.push({ id: "gap-width", message: "row " + view + ": .pte-col-gap widths do not match the unrendered columns", details: { gaps: gaps.map(r1), expected: expected.map(r1) } });
      }
    });
    if (maxCells && maxRendered > maxCells) {
      problems.push({ id: "cells-bounded", message: "a centre row renders " + maxRendered + " cells (bound " + maxCells + ")" });
    }
    return {
      problems: problems,
      scrollLeft: Math.abs(s.scrollLeft),
      maxScroll: s.scrollWidth - s.clientWidth,
      rows: rows.length,
      maxRendered: maxRendered,
      leaves: leaves.length,
    };
  }

  /** Boxes (root-relative) of the pinned sections' header leaves and first visible body row cells. */
  function pinnedSnapshot() {
    var r = root().getBoundingClientRect();
    var out = {};
    ["left", "right", "leading"].forEach(function (side) {
      var header = root().querySelector(".pte-header-" + side);
      var sec = root().querySelector(".pte-body .pte-spacer-" + side);
      if (!header || !sec) return;
      var rows = visibleRows(sec);
      var cells = rows.length ? centerCells(rows[0]) : [];
      var leaves = Array.prototype.slice.call(header.querySelectorAll(".pte-hcell-leaf"));
      out[side] = leaves.concat(cells).map(function (el) {
        var b = el.getBoundingClientRect();
        return [r1(b.left - r.left), r1(b.top - r.top), r1(b.width)].join("/") + ":" + (el.textContent || "").trim().slice(0, 20);
      }).join(" ");
    });
    return out;
  }

  /** The body cell element for (viewIdx, column) — column by data-col-idx (number) or col id. */
  function cellEl(viewIdx, col) {
    var sel = typeof col === "number" ? '.pte-cell[data-col-idx="' + col + '"]' : '.pte-cell[data-col-id="' + col + '"]';
    var rows = body().querySelectorAll('.pte-row[data-view-idx="' + viewIdx + '"]');
    for (var i = 0; i < rows.length; i++) {
      if (inBand(rows[i])) continue;
      var c = rows[i].querySelector(":scope > " + sel);
      if (c) return c;
    }
    return null;
  }

  function cellRect(viewIdx, col) { return rect(cellEl(viewIdx, col)); }

  /** The visible-box-clipped centre of a body cell, so a click lands on its visible part. */
  function cellPoint(viewIdx, col) {
    var c = cellEl(viewIdx, col);
    if (!c) return null;
    var b = c.getBoundingClientRect();
    var box = c.closest(".pte-spacer") ? centerBox() : null;
    var left = box ? Math.max(b.left, box.left) : b.left;
    var right = box ? Math.min(b.right, box.right) : b.right;
    return { x: (left + right) / 2, y: (b.top + b.bottom) / 2, clipped: right - left };
  }

  /** The aria-activedescendant cell: whether it exists, its column/row, and if it is fully visible. */
  function activeCell() {
    var r = root();
    var id = r.getAttribute("aria-activedescendant");
    var el = id ? document.getElementById(id) : null;
    if (!el) return { id: id, exists: false };
    var b = el.getBoundingClientRect();
    var box = centerBox();
    var row = el.closest(".pte-row");
    var inCenter = !!el.closest(".pte-spacer");
    return {
      id: id,
      exists: true,
      colIdx: Number(el.dataset.colIdx),
      colId: el.dataset.colId,
      viewIdx: row ? Number(row.getAttribute("data-view-idx")) : null,
      inCenter: inCenter,
      visible: !inCenter || (b.left >= box.left - 0.6 && b.right <= box.right + 0.6 && b.top >= box.top - 0.6 && b.bottom <= box.bottom + 0.6),
      rect: rect(el),
      box: box,
    };
  }

  /** Column instance ids of the centre header leaves in inline order. */
  function centerLeafIds() { return centerLeaves().map(function (l) { return l.id; }); }

  function leafRect(id) { return rect(document.getElementById(id)); }

  /** The header leaf's resize handle box. */
  function resizeHandleRect(id) {
    var leaf = document.getElementById(id);
    return rect(leaf && leaf.querySelector(".pte-hcell-resize-handle"));
  }

  /** Width of a column's header leaf and of its body cells in the visible rows (must agree). */
  function columnWidths(id) {
    var leaf = document.getElementById(id);
    var cells = Array.prototype.slice.call(body().querySelectorAll('.pte-cell[data-col-id="' + id + '"]'))
      .filter(function (c) { return !inBand(c); });
    return { header: leaf ? r1(leaf.getBoundingClientRect().width) : null, cells: cells.map(function (c) { return r1(c.getBoundingClientRect().width); }) };
  }

  /** The horizontal strip (shown iff a section overflows) and whether the centre overflows. */
  function stripState() {
    var wrap = root().querySelector(".pte-scroller-horizontal-container-wrapper");
    var s = spacer();
    var shown = !!wrap && wrap.offsetParent !== null && getComputedStyle(wrap).display !== "none" && wrap.getBoundingClientRect().height > 0;
    return { shown: shown, overflow: s.scrollWidth - s.clientWidth > 0.5, scrollWidth: s.scrollWidth, clientWidth: s.clientWidth };
  }

  /** Open menus (`.pte-menu`, top level first) with their boxes and item labels. */
  function menus() {
    return Array.prototype.slice.call(document.querySelectorAll(".pte-menu")).filter(function (m) {
      return m.offsetParent !== null || getComputedStyle(m).position === "fixed";
    }).map(function (m) {
      var items = Array.prototype.slice.call(m.querySelectorAll(":scope .pte-menu-item")).map(function (i) {
        return { text: (i.querySelector(".pte-menu-item-text") || i).textContent.trim(), submenu: i.classList.contains("has-submenu"), active: i.classList.contains("active") || i === document.activeElement || i.getAttribute("aria-selected") === "true" };
      });
      return { submenu: m.classList.contains("pte-submenu"), rect: rect(m), dir: m.closest("[dir]") ? m.closest("[dir]").getAttribute("dir") : null, items: items };
    });
  }

  function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }

  /** The open editor: the editing cell, whether focus is inside it, and the editor's value. */
  function editor() {
    var cell = root().querySelector(".pte-cell-editing");
    var active = document.activeElement;
    var input = cell ? cell.querySelector("input, textarea, select, [contenteditable]") : null;
    var b = cell ? cell.getBoundingClientRect() : null;
    var box = centerBox();
    return {
      open: !!cell,
      connected: !!cell && cell.isConnected,
      colId: cell ? cell.dataset.colId : null,
      focused: !!cell && !!active && cell.contains(active),
      value: input ? (input.value !== undefined ? input.value : input.textContent) : null,
      onScreen: !!b && b.right > box.left && b.left < box.right,
    };
  }

  function fillHandle() { return rect(root().querySelector(".pte-fill-handle")); }

  function scrollState() {
    var s = spacer();
    var b = body();
    var out = { body: Math.abs(s.scrollLeft), header: Math.abs(centerHeader().scrollLeft), bodyTop: b.scrollTop, bands: {} };
    ["top", "bottom"].forEach(function (name) {
      var band = root().querySelector(".pte-pinned-rows-" + name + " .pte-pinned-rows-center");
      if (band) out.bands[name] = Math.abs(band.scrollLeft);
    });
    var sticky = root().querySelector(".pte-sticky-rows .pte-pinned-rows-center");
    if (sticky) out.bands.sticky = Math.abs(sticky.scrollLeft);
    return out;
  }

  /**
   * Band (pinned rows / sticky overlay) centre cells versus the centre header leaves: every
   * rendered band cell lines up with its header leaf. Bands are fully rendered (no virtualization).
   */
  function bandAlignment() {
    var problems = [];
    var leaves = {};
    centerLeaves().forEach(function (l) { leaves[l.id] = l.b; });
    var box = centerBox();
    var counted = 0;
    root().querySelectorAll(".pte-pinned-rows-center .pte-cell[data-col-id]").forEach(function (cell) {
      var band = cell.closest(BAND_SEL);
      if (!band || band.offsetParent === null) return;
      var leaf = leaves[cell.dataset.colId];
      if (!leaf) return;
      var b = cell.getBoundingClientRect();
      if (b.right <= box.left || b.left >= box.right) return;
      counted++;
      if (Math.abs(b.left - leaf.left) > 0.6 || Math.abs(b.width - leaf.width) > 0.6) {
        problems.push({ id: "band-cell-x", message: band.className + " cell is off its header leaf", details: { leaf: [r1(leaf.left), r1(leaf.width)], cell: [r1(b.left), r1(b.width)] } });
      }
    });
    return { problems: problems.slice(0, 5), counted: counted, stickyShown: !!root().querySelector(".pte-sticky-rows .pte-row") };
  }

  global.__probe = {
    root: function () { return !!root(); }, rtl: rtl, centerBox: centerBox, virtualization: virtualization,
    pinnedSnapshot: pinnedSnapshot, cellRect: cellRect, cellPoint: cellPoint, activeCell: activeCell,
    centerLeafIds: centerLeafIds, leafRect: leafRect, resizeHandleRect: resizeHandleRect, columnWidths: columnWidths,
    stripState: stripState, menus: menus, viewport: viewport, editor: editor, fillHandle: fillHandle,
    scrollState: scrollState, bandAlignment: bandAlignment,
  };
})(typeof window !== "undefined" ? window : globalThis);
