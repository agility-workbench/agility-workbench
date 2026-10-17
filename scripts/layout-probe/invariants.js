/*
 * Layout invariants for a mounted Agility Workbench grid, measured in a real browser.
 *
 * Plain script, no imports: the vanilla harness page (apps/vanilla-playground/layout-matrix.ts)
 * imports it for its side effect, and scripts/layout-probe/run.mjs injects the same source into the
 * other playground pages over the DevTools protocol. It installs `window.__layoutInvariants`:
 *
 *   check(root)  -> { violations: [{ id, severity, message, details }], summary }
 *   checkAll()   -> one report per `.pte-root` in the document
 *
 * What it asserts, in one sentence each — every one of these held at the default size and broke
 * under a resize in a real bug, or is the same shape of claim:
 *   section-box / section-orphan   header, aggregate, scrollbar-lane and pinned-band sections sit
 *                                  exactly over the body section of the same side
 *   cell-x / cell-count / cell-width-row   every column's cells (body rows, aggregate, bands) start
 *                                  where its header cell starts and are as wide
 *   row-y / band-row-y             a row's fragments in the four sections share top and height
 *   hcell-clipped / hcell-gap      header cells fit the wrapper exactly; leaves reach its bottom
 *   group-width                    a group header is as wide as its visible leaves together
 *   scroll-sync                    the parallel scrollers of a side agree on scrollLeft
 *   gutter-*                       the vertical-scrollbar lane is reserved exactly where the body
 *                                  shows one, in every box that mirrors the body
 *   row-start / row-gap / row-end  the sections of each band are contiguous and fill it
 *   stack-*                        the root's vertical stack is contiguous and fills the root
 *   hscroll-missing / hscroll-stale / hscroll-content-width   the horizontal strip shows exactly
 *                                  when a section overflows, and its lanes mirror the content widths
 *   clamp-*                        no pinned side exceeds 35% of the root
 *   full-width-row-width           full-width rows span the viewport (group rows: the content)
 *   root-overflow (warn)           nothing pokes out of the root
 */
(function (global) {
  "use strict";

  var CELL_TOL = 0.51;
  var BOX_TOL = 1.01;
  var SECTIONS = ["leading", "left", "center", "right"];
  var SEL = {
    header: { wrapper: ".pte-header-wrapper", leading: ".pte-header-leading", left: ".pte-header-left", center: ".pte-header", right: ".pte-header-right" },
    body: { wrapper: ".pte-body", leading: ".pte-spacer-leading", left: ".pte-spacer-left", center: ".pte-spacer", right: ".pte-spacer-right" },
    viewport: { leading: ".pte-viewport-leading", left: ".pte-viewport-left", center: ".pte-viewport", right: ".pte-viewport-right" },
    aggregate: { wrapper: ".pte-aggregate-row", leading: ".pte-aggregate-leading", left: ".pte-aggregate-left", center: ".pte-aggregate-center", right: ".pte-aggregate-right" },
    lane: { wrapper: ".pte-scroller-horizontal-container-wrapper", leading: ".pte-scroller-horizontal-leading-container", left: ".pte-scroller-horizontal-left-container", center: ".pte-scroller-horizontal-container", right: ".pte-scroller-horizontal-right-container" },
    band: { leading: ".pte-pinned-rows-leading", left: ".pte-pinned-rows-left", center: ".pte-pinned-rows-center", right: ".pte-pinned-rows-right", vertical: ".pte-pinned-rows-vertical" },
  };

  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  function r2(n) {
    return Math.round(n * 100) / 100;
  }

  function near(a, b, tol) {
    return Math.abs(a - b) <= tol;
  }

  function find(root, map) {
    var out = {};
    for (var key in map) out[key] = root.querySelector(map[key]);
    return out;
  }

  function displayed(el) {
    if (!el || !el.isConnected) return false;
    var s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function list(nodes) {
    return Array.prototype.filter.call(nodes, displayed);
  }

  /* A horizontal section counts as present when it takes width, whatever its height: a body
   * spacer with no rows is 0px tall and still decides where the header above it goes. */
  function present(el) {
    if (!el || !el.isConnected) return false;
    var s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    return el.getBoundingClientRect().width > 0;
  }

  function box(el) {
    var r = el.getBoundingClientRect();
    var s = getComputedStyle(el);
    return {
      el: el,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      padLeft: num(s.paddingLeft), padRight: num(s.paddingRight), padTop: num(s.paddingTop), padBottom: num(s.paddingBottom),
      // The inline-axis paddings: the vertical-scrollbar lane is reserved at the inline END, which
      // is the left edge in a right-to-left grid (its scrollbar sits on the left there).
      padStart: s.direction === "rtl" ? num(s.paddingRight) : num(s.paddingLeft),
      padEnd: s.direction === "rtl" ? num(s.paddingLeft) : num(s.paddingRight),
      bLeft: num(s.borderLeftWidth), bRight: num(s.borderRightWidth), bTop: num(s.borderTopWidth), bBottom: num(s.borderBottomWidth),
      position: s.position,
    };
  }

  /* The edges parallel boxes must share: border-box edges less padding. Padding is how a box
   * reserves the vertical-scrollbar lane (the right header, the aggregate row, the scrollbar strip)
   * and the boxes beside it carry none, so the padded edge is the one to compare. */
  function innerLeft(b) { return b.left + b.padLeft; }
  function innerRight(b) { return b.right - b.padRight; }

  /* A scroll container's content area in viewport coordinates: inside its border and padding, and
   * short of its own scrollbar. */
  function clientBox(el) {
    var r = el.getBoundingClientRect();
    var s = getComputedStyle(el);
    return {
      left: r.left + el.clientLeft + num(s.paddingLeft),
      right: r.left + el.clientLeft + el.clientWidth - num(s.paddingRight),
      top: r.top + el.clientTop + num(s.paddingTop),
      bottom: r.top + el.clientTop + el.clientHeight - num(s.paddingBottom),
    };
  }

  function label(el) {
    if (!el) return "?";
    var cls = (el.className && typeof el.className === "string") ? el.className.split(/\s+/).filter(Boolean) : [];
    return cls.length ? "." + cls[0] : el.tagName.toLowerCase();
  }

  function cellLabel(cell) {
    var text = (cell.textContent || "").trim().replace(/\s+/g, " ");
    return text.length > 24 ? text.slice(0, 24) + "…" : text;
  }

  function rowCells(row) {
    return Array.prototype.filter.call(row.children, function (c) {
      return c.classList.contains("pte-cell") && !c.classList.contains("pte-full-width-cell") && displayed(c);
    });
  }

  /* Data rows of a viewport, lowest view index first, full-width rows excluded. */
  function dataRows(container) {
    if (!container) return [];
    var rows = list(container.querySelectorAll(".pte-row[data-view-idx]"));
    // A full-width row's blank pinned fragments keep their place in the flow but hold no cells.
    rows = rows.filter(function (row) {
      return !row.classList.contains("pte-full-width-row") && !row.classList.contains("pte-full-width-fragment");
    });
    rows.sort(function (a, b) { return Number(a.dataset.viewIdx) - Number(b.dataset.viewIdx); });
    return rows;
  }

  function check(root) {
    var violations = [];
    var maxDrift = 0;
    function add(id, severity, message, details) {
      violations.push({ id: id, severity: severity, message: message, details: details || {} });
    }
    function err(id, message, details) { add(id, "error", message, details); }
    function warn(id, message, details) { add(id, "warn", message, details); }

    // A host that gives the grid no room (a demo page squeezed by its own chrome) is not a grid
    // finding; report it and skip the checks, which would all be noise.
    if (root.clientHeight < 60 || root.clientWidth < 120) {
      warn("root-too-small", "root is " + root.clientWidth + "×" + root.clientHeight + "px; layout checks skipped");
      return { violations: violations, summary: { root: { width: root.clientWidth, height: root.clientHeight } } };
    }

    var header = find(root, SEL.header);
    var body = find(root, SEL.body);
    var viewport = find(root, SEL.viewport);
    var aggregate = find(root, SEL.aggregate);
    var lane = find(root, SEL.lane);
    var bands = {
      top: root.querySelector(".pte-pinned-rows-top"),
      bottom: root.querySelector(".pte-pinned-rows-bottom"),
      sticky: root.querySelector(".pte-sticky-rows"),
    };
    var rootBox = box(root);

    if (!header.wrapper || !body.wrapper) {
      err("structure", "header wrapper or body not found under the root");
      return { violations: violations, summary: { root: { width: r2(rootBox.width), height: r2(rootBox.height) } } };
    }

    var bodyEl = body.wrapper;
    var gutter = bodyEl.offsetWidth - bodyEl.clientWidth;
    var aggVisible = displayed(aggregate.wrapper);
    var laneVisible = displayed(lane.wrapper);
    var presentIn = {};
    SECTIONS.forEach(function (s) { presentIn[s] = present(body[s]); });

    /* ---- 1. parallel section boxes over the body sections ---- */
    SECTIONS.forEach(function (s) {
      var members = [
        { kind: "header", el: header[s] },
        { kind: "aggregate", el: aggVisible ? aggregate[s] : null },
        { kind: "lane", el: laneVisible ? lane[s] : null },
      ];
      ["top", "bottom", "sticky"].forEach(function (name) {
        var band = bands[name];
        members.push({ kind: "band-" + name, el: band && displayed(band) ? band.querySelector(SEL.band[s]) : null });
      });
      if (!presentIn[s]) {
        members.forEach(function (m) {
          if (m.el && present(m.el) && box(m.el).width > BOX_TOL) {
            err("section-orphan", s + " " + m.kind + " section is shown while the body has no " + s + " section",
              { width: r2(box(m.el).width) });
          }
        });
        return;
      }
      var ref = box(body[s]);
      members.forEach(function (m) {
        if (!m.el || !present(m.el)) return;
        var b = box(m.el);
        if (!near(innerLeft(b), innerLeft(ref), BOX_TOL) || !near(innerRight(b), innerRight(ref), BOX_TOL)) {
          err("section-box", s + " " + m.kind + " section does not sit over the body section", {
            body: [r2(innerLeft(ref)), r2(innerRight(ref))],
            box: [r2(innerLeft(b)), r2(innerRight(b))],
          });
        }
      });
    });

    /* ---- 2. cells: header cell x/width versus every mirror of that column ---- */
    function compareCells(s, kind, headerCells, cells, rowIndex) {
      if (headerCells.length !== cells.length) {
        err("cell-count", s + " " + kind + " has " + cells.length + " cells for " + headerCells.length + " header cells",
          { row: rowIndex });
      }
      var n = Math.min(headerCells.length, cells.length);
      for (var i = 0; i < n; i++) {
        var hb = box(headerCells[i]);
        var cb = box(cells[i]);
        var drift = Math.max(Math.abs(hb.left - cb.left), Math.abs(hb.width - cb.width));
        if (drift > maxDrift) maxDrift = drift;
        if (drift > CELL_TOL) {
          err("cell-x", s + " " + kind + " cell " + i + " (" + cellLabel(headerCells[i]) + ") is off its header cell", {
            header: [r2(hb.left), r2(hb.width)],
            cell: [r2(cb.left), r2(cb.width)],
            row: rowIndex,
          });
          return;
        }
      }
    }

    /* Body rows are matched to the header by column id (`data-col-id` ↔ the leaf header cell's id),
     * because column virtualization renders only the centre columns near the viewport: a body row
     * may hold fewer cells than the header. Every header cell whose box intersects the section's
     * visible area must have a body cell that lines up with it; columns outside it may be absent.
     * A body cell with no header cell is always an error. Falls back to the positional comparison
     * when the cells carry no ids. */
    function compareBodyCells(s, headerCells, cells, rowIndex, visible) {
      var byId = {};
      for (var i = 0; i < cells.length; i++) {
        var id = cells[i].dataset.colId;
        if (!id) return compareCells(s, "body row", headerCells, cells, rowIndex);
        byId[id] = cells[i];
      }
      var matched = 0;
      for (var h = 0; h < headerCells.length; h++) {
        var hcell = headerCells[h];
        var hb = box(hcell);
        var cell = byId[hcell.id];
        if (!cell) {
          var inView = hb.right > visible.left + CELL_TOL && hb.left < visible.right - CELL_TOL;
          if (inView) {
            err("cell-count", s + " body row has no cell for visible column (" + cellLabel(hcell) + ")", {
              row: rowIndex, header: [r2(hb.left), r2(hb.width)], visible: [r2(visible.left), r2(visible.right)],
            });
            return;
          }
          continue;
        }
        matched++;
        var cb = box(cell);
        var drift = Math.max(Math.abs(hb.left - cb.left), Math.abs(hb.width - cb.width));
        if (drift > maxDrift) maxDrift = drift;
        if (drift > CELL_TOL) {
          err("cell-x", s + " body row cell (" + cellLabel(hcell) + ") is off its header cell", {
            header: [r2(hb.left), r2(hb.width)],
            cell: [r2(cb.left), r2(cb.width)],
            row: rowIndex,
          });
          return;
        }
      }
      if (matched !== cells.length) {
        err("cell-count", s + " body row has " + (cells.length - matched) + " cells with no header cell", { row: rowIndex });
      }
    }

    var rowsRendered = 0;
    // Centre header leaves vs. the first centre body row's cells: under column virtualization the
    // body holds a window of the columns.
    var centerCells = { header: 0, body: 0 };
    SECTIONS.forEach(function (s) {
      if (!presentIn[s] || !header[s]) return;
      var headerCells = list(header[s].querySelectorAll(".pte-hcell-leaf"));
      var headerById = {};
      headerCells.forEach(function (h) { if (h.id) headerById[h.id] = h; });
      var rows = dataRows(viewport[s]);
      if (s === "center") {
        rowsRendered = rows.length;
        centerCells = { header: headerCells.length, body: rows.length ? rowCells(rows[0]).length : 0 };
      }
      if (rows.length) {
        var visible = body[s] ? clientBox(body[s]) : { left: -Infinity, right: Infinity };
        compareBodyCells(s, headerCells, rowCells(rows[0]), Number(rows[0].dataset.viewIdx), visible);
        // Every pooled row shares the column widths; one divergent row is a stale slot.
        for (var i = 1; i < rows.length; i++) {
          var cells = rowCells(rows[i]);
          for (var c = 0; c < cells.length; c++) {
            var hc = cells[c].dataset.colId ? headerById[cells[c].dataset.colId] : headerCells[c];
            if (!hc) continue; // reported for the first row already
            if (!near(box(cells[c]).width, box(hc).width, CELL_TOL)) {
              err("cell-width-row", s + " row " + rows[i].dataset.viewIdx + " cell " + c + " width differs from its header",
                { header: r2(box(hc).width), cell: r2(box(cells[c]).width) });
              i = rows.length;
              break;
            }
          }
        }
      }
      if (aggVisible && aggregate[s] && present(aggregate[s])) {
        compareCells(s, "aggregate", headerCells, list(aggregate[s].querySelectorAll(".pte-aggregate-cell")), -1);
      }
      ["top", "bottom", "sticky"].forEach(function (name) {
        var band = bands[name];
        if (!band || !displayed(band)) return;
        var section = band.querySelector(SEL.band[s]);
        var bandRows = section ? list(section.querySelectorAll(".pte-row[data-view-idx]")).filter(function (row) {
          return !row.classList.contains("pte-full-width-row") && !row.classList.contains("pte-full-width-fragment");
        }) : [];
        if (bandRows.length) {
          compareCells(s, "band-" + name, headerCells, rowCells(bandRows[0]), Number(bandRows[0].dataset.viewIdx));
        }
      });
    });

    /* ---- 3. rows: the fragments of one row share top and height across sections ---- */
    function compareRowFragments(kind, containers) {
      var center = containers.center;
      if (!center) return;
      var byIdx = {};
      dataRows(center).forEach(function (row) { byIdx[row.dataset.viewIdx] = box(row); });
      ["leading", "left", "right"].forEach(function (s) {
        var container = containers[s];
        if (!container || !displayed(container)) return;
        var rows = dataRows(container);
        for (var i = 0; i < rows.length; i++) {
          var ref = byIdx[rows[i].dataset.viewIdx];
          if (!ref) continue;
          var b = box(rows[i]);
          if (!near(b.top, ref.top, CELL_TOL) || !near(b.height, ref.height, CELL_TOL)) {
            err(kind, s + " row " + rows[i].dataset.viewIdx + " is not level with its centre fragment", {
              center: [r2(ref.top), r2(ref.height)],
              fragment: [r2(b.top), r2(b.height)],
            });
            return;
          }
        }
      });
    }
    compareRowFragments("row-y", viewport);
    ["top", "bottom", "sticky"].forEach(function (name) {
      var band = bands[name];
      if (!band || !displayed(band)) return;
      compareRowFragments("band-row-y", {
        leading: band.querySelector(SEL.band.leading),
        left: band.querySelector(SEL.band.left),
        center: band.querySelector(SEL.band.center),
        right: band.querySelector(SEL.band.right),
      });
    });

    /* ---- 3b. the row pool covers the visible body (a pool sized for a shorter grid leaves a
     * blank band at the bottom after the grid grows) ---- */
    if (viewport.center) {
      var bc = clientBox(bodyEl);
      var contentBottom = box(body.center).bottom;
      var visibleBottom = Math.min(bc.bottom, contentBottom);
      var centerRows = list(viewport.center.querySelectorAll(".pte-row[data-view-idx]"));
      if (centerRows.length && visibleBottom - bc.top > 1) {
        var maxBottom = -Infinity, minTop = Infinity;
        centerRows.forEach(function (row) {
          var rb = box(row);
          if (rb.bottom > maxBottom) maxBottom = rb.bottom;
          if (rb.top < minTop) minTop = rb.top;
        });
        if (maxBottom < visibleBottom - BOX_TOL) {
          err("rows-short", "rendered rows end " + r2(visibleBottom - maxBottom) + "px above the visible body bottom", {
            lastRowBottom: r2(maxBottom), visibleBottom: r2(visibleBottom), rows: centerRows.length,
          });
        }
        if (minTop > bc.top + BOX_TOL && bodyEl.scrollTop > 0) {
          err("rows-late", "rendered rows start " + r2(minTop - bc.top) + "px below the visible body top", {
            firstRowTop: r2(minTop), visibleTop: r2(bc.top), rows: centerRows.length,
          });
        }
      }
    }

    /* ---- 4. header heights ---- */
    var wb = box(header.wrapper);
    var wrapperTop = wb.top + wb.bTop + wb.padTop;
    // The wrapper's declared height includes its 1px bottom border and the leaf cells are as tall as
    // that declared height, so their last pixel row sits under the border by design. Cells may run
    // to the border-box edge; anything past it is clipped.
    var wrapperBottom = wb.bottom - wb.padBottom;
    var hcells = list(header.wrapper.querySelectorAll(".pte-hcell"));
    for (var h = 0; h < hcells.length; h++) {
      var hb = box(hcells[h]);
      if (hb.bottom > wrapperBottom + CELL_TOL || hb.top < wrapperTop - CELL_TOL) {
        err("hcell-clipped", "header cell (" + cellLabel(hcells[h]) + ") extends past the header wrapper", {
          cell: [r2(hb.top), r2(hb.bottom)], wrapper: [r2(wrapperTop), r2(wrapperBottom)],
        });
        break;
      }
    }
    var leaves = list(header.wrapper.querySelectorAll(".pte-hcell-leaf"));
    for (var l = 0; l < leaves.length; l++) {
      var lb = box(leaves[l]);
      if (!near(lb.bottom, wrapperBottom, BOX_TOL)) {
        err("hcell-gap", "leaf header cell (" + cellLabel(leaves[l]) + ") does not reach the wrapper's bottom", {
          cellBottom: r2(lb.bottom), wrapperBottom: r2(wrapperBottom),
        });
        break;
      }
      var container = leaves[l].querySelector(".pte-hcell-container") || leaves[l];
      if (container.scrollHeight > container.clientHeight + 1) {
        warn("hcell-content-overflow", "leaf header content (" + cellLabel(leaves[l]) + ") is taller than its cell", {
          content: container.scrollHeight, cell: container.clientHeight,
        });
      }
    }
    var groups = list(header.wrapper.querySelectorAll(".pte-hcell:not(.pte-hcell-leaf)"));
    for (var g = 0; g < groups.length; g++) {
      var groupLeaves = list(groups[g].querySelectorAll(".pte-hcell-leaf"));
      var sum = 0;
      for (var gl = 0; gl < groupLeaves.length; gl++) sum += box(groupLeaves[gl]).width;
      if (!near(sum, box(groups[g]).width, BOX_TOL)) {
        err("group-width", "group header (" + cellLabel(groups[g].querySelector(".pte-hcell-label") || groups[g]) + ") is not as wide as its leaves", {
          group: r2(box(groups[g]).width), leaves: r2(sum), count: groupLeaves.length,
        });
        break;
      }
    }

    /* ---- 5. horizontal scroll sync per side ---- */
    SECTIONS.forEach(function (s) {
      if (!presentIn[s]) return;
      var scrollers = [{ kind: "header", el: header[s] }, { kind: "body", el: body[s] }];
      if (aggVisible) scrollers.push({ kind: "aggregate", el: aggregate[s] });
      if (laneVisible && lane[s]) scrollers.push({ kind: "lane", el: lane[s].querySelector(".pte-scroller-horizontal-spacer") });
      ["top", "bottom", "sticky"].forEach(function (name) {
        var band = bands[name];
        if (band && displayed(band)) scrollers.push({ kind: "band-" + name, el: band.querySelector(SEL.band[s]) });
      });
      var values = scrollers.filter(function (x) { return x.el && present(x.el); }).map(function (x) {
        return { kind: x.kind, scrollLeft: r2(x.el.scrollLeft) };
      });
      var min = Infinity, max = -Infinity;
      values.forEach(function (v) { min = Math.min(min, v.scrollLeft); max = Math.max(max, v.scrollLeft); });
      if (values.length > 1 && max - min > CELL_TOL) {
        err("scroll-sync", s + " scrollers disagree on scrollLeft", { values: values });
      }
    });

    /* ---- 6. vertical-scrollbar gutter ---- */
    var activeVar = num(getComputedStyle(root).getPropertyValue("--pte-scrollbar-gutter-active"));
    if (!near(activeVar, gutter, CELL_TOL)) {
      err("gutter-var", "--pte-scrollbar-gutter-active is " + activeVar + "px but the body's scrollbar takes " + gutter + "px");
    }
    // Inline-END padding throughout: the lane is on the right in LTR and on the left in RTL.
    var headerPadBox = presentIn.right && header.right ? box(header.right) : box(header.center);
    if (!near(headerPadBox.padEnd, gutter, CELL_TOL)) {
      err("gutter-header", "header reserves " + r2(headerPadBox.padEnd) + "px for a " + gutter + "px body scrollbar",
        { on: label(headerPadBox.el) });
    }
    if (presentIn.right && header.center && box(header.center).padEnd > CELL_TOL) {
      err("gutter-header", "centre header carries scrollbar padding although the right section owns the lane",
        { padding: r2(box(header.center).padEnd) });
    }
    if (laneVisible && !near(box(lane.wrapper).padEnd, gutter, CELL_TOL)) {
      err("gutter-lane", "scrollbar strip reserves " + r2(box(lane.wrapper).padEnd) + "px for a " + gutter + "px body scrollbar");
    }
    if (aggVisible && !near(box(aggregate.wrapper).padEnd, gutter, CELL_TOL)) {
      err("gutter-aggregate", "aggregate row reserves " + r2(box(aggregate.wrapper).padEnd) + "px for a " + gutter + "px body scrollbar");
    }

    /* ---- 7. each horizontal band is contiguous and fills its container ---- */
    /* Compared along the inline axis, in DOM (= logical) order: in a right-to-left grid the first
     * section is the rightmost, so x is mirrored (`-right` is the start edge) and the same "starts at
     * the container's start, abuts its predecessor, ends at the container's end" rule applies. */
    var rtlRoot = getComputedStyle(root).direction === "rtl";
    function inlineBox(b) {
      return rtlRoot ? { left: -b.right, right: -b.left } : { left: b.left, right: b.right };
    }
    function checkRow(name, container, items) {
      if (!container || !present(container)) return;
      var cb = inlineBox(clientBox(container));
      var shown = items.filter(function (i) { return i.el && present(i.el); }).map(function (i) {
        return { name: i.name, b: inlineBox(box(i.el)) };
      });
      if (!shown.length) return;
      if (!near(shown[0].b.left, cb.left, BOX_TOL)) {
        err("row-start", name + ": " + shown[0].name + " does not start at the container's edge",
          { section: r2(shown[0].b.left), container: r2(cb.left) });
      }
      for (var i = 1; i < shown.length; i++) {
        if (!near(shown[i].b.left, shown[i - 1].b.right, BOX_TOL)) {
          err("row-gap", name + ": " + shown[i].name + " starts " + r2(shown[i].b.left - shown[i - 1].b.right) + "px from where " + shown[i - 1].name + " ends");
        }
      }
      var last = shown[shown.length - 1];
      if (!near(last.b.right, cb.right, BOX_TOL)) {
        err("row-end", name + ": " + last.name + " ends " + r2(cb.right - last.b.right) + "px short of the container's edge",
          { section: r2(last.b.right), container: r2(cb.right) });
      }
    }
    function sectionItems(map, scope) {
      return SECTIONS.map(function (s) { return { name: s, el: scope ? scope.querySelector(map[s]) : map[s] }; });
    }
    checkRow("header", header.wrapper, sectionItems(header));
    checkRow("body", body.wrapper, sectionItems(body));
    if (aggVisible) checkRow("aggregate", aggregate.wrapper, sectionItems(aggregate));
    if (laneVisible) checkRow("scrollbar strip", lane.wrapper, sectionItems(lane));
    ["top", "bottom", "sticky"].forEach(function (name) {
      var band = bands[name];
      if (!band || !displayed(band)) return;
      var items = sectionItems(SEL.band, band);
      items.push({ name: "vertical lane", el: band.querySelector(SEL.band.vertical) });
      checkRow("band-" + name, band, items);
    });

    /* ---- 8. the root's vertical stack ---- */
    var rc = clientBox(root);
    var stack = Array.prototype.filter.call(root.children, function (el) {
      if (!displayed(el)) return false;
      var s = getComputedStyle(el);
      if (s.position === "absolute" || s.position === "fixed") return false;
      if (el.classList.contains("pte-sr-only")) return false;
      // Only full-width children belong to the column stack; a side rail does not.
      return box(el).width >= (rc.right - rc.left) - 2;
    });
    for (var k = 0; k < stack.length; k++) {
      var kb = box(stack[k]);
      if (k === 0) {
        if (!near(kb.top, rc.top, BOX_TOL)) err("stack-start", label(stack[k]) + " does not start at the root's top", { top: r2(kb.top), root: r2(rc.top) });
      } else {
        var pb = box(stack[k - 1]);
        if (!near(kb.top, pb.bottom, BOX_TOL)) {
          err("stack-gap", label(stack[k]) + " starts " + r2(kb.top - pb.bottom) + "px from where " + label(stack[k - 1]) + " ends");
        }
      }
      if (k === stack.length - 1) {
        if (kb.bottom > rc.bottom + BOX_TOL) err("stack-overflow", label(stack[k]) + " ends " + r2(kb.bottom - rc.bottom) + "px below the root");
        else if (kb.bottom < rc.bottom - BOX_TOL) err("stack-short", label(stack[k]) + " ends " + r2(rc.bottom - kb.bottom) + "px above the root's bottom");
      }
    }
    var bodyFrame = root.querySelector(".pte-body-frame");
    if (bodyFrame && rootBox.height > wb.height + 120 && box(bodyFrame).height < 1) {
      err("body-collapsed", "body frame has no height although the root has room for rows");
    }

    /* ---- 8b. pinned-band height cap: max(rowHeight, 30% of the root), re-decided on resize ---- */
    var bandHeights = {};
    ["top", "bottom"].forEach(function (name) {
      var band = bands[name];
      if (!band || !displayed(band)) return;
      var bb = box(band);
      bandHeights[name] = r2(bb.height);
      // The centre fragment: the leading section comes first in the DOM and is 0px wide (and so
      // 0px tall) when there are no row numbers or checkboxes.
      var bandRow = band.querySelector(SEL.band.center + " .pte-row[data-view-idx]")
        || band.querySelector(".pte-row[data-view-idx]");
      var rowHeight = bandRow ? box(bandRow).height : 0;
      if (!rowHeight && viewport.center) {
        var bodyRow = viewport.center.querySelector(".pte-row[data-view-idx]");
        rowHeight = bodyRow ? box(bodyRow).height : 0;
      }
      var capHeight = Math.max(rowHeight, Math.floor(root.clientHeight * 0.3));
      if (rowHeight > 0 && bb.height > capHeight + BOX_TOL + bb.bTop + bb.bBottom) {
        err("band-cap", name + " pinned band is " + r2(bb.height) + "px tall, over its cap of " + capHeight + "px (30% of the root)", {
          band: r2(bb.height), cap: capHeight, root: root.clientHeight,
        });
      }
    });
    if (bands.sticky && displayed(bands.sticky)) bandHeights.sticky = r2(box(bands.sticky).height);

    /* ---- 9. the horizontal scrollbar strip ---- */
    var overflowing = SECTIONS.filter(function (s) {
      return presentIn[s] && viewport[s] && box(viewport[s]).width > body[s].clientWidth + CELL_TOL;
    });
    if (overflowing.length && !laneVisible) {
      err("hscroll-missing", "columns overflow (" + overflowing.join(", ") + ") but the horizontal scrollbar strip is hidden");
    }
    if (!overflowing.length && laneVisible) {
      warn("hscroll-stale", "horizontal scrollbar strip is shown although nothing overflows");
    }
    if (laneVisible) {
      SECTIONS.forEach(function (s) {
        if (!presentIn[s] || !lane[s] || !displayed(lane[s]) || !viewport[s]) return;
        var content = lane[s].querySelector(".pte-scroller-horizontal");
        if (content && !near(box(content).width, box(viewport[s]).width, BOX_TOL)) {
          err("hscroll-content-width", s + " scrollbar lane content is " + r2(box(content).width) + "px for " + r2(box(viewport[s]).width) + "px of columns");
        }
      });
    }

    /* ---- 10. the pinned clamp ---- */
    var cap = root.clientWidth * 0.35;
    if (presentIn.left) {
      if (box(body.left).width > cap + BOX_TOL) err("clamp-left", "left body section exceeds 35% of the root", { width: r2(box(body.left).width), cap: r2(cap) });
      if (header.left && present(header.left) && box(header.left).width > cap + BOX_TOL) err("clamp-left-header", "left header exceeds 35% of the root", { width: r2(box(header.left).width), cap: r2(cap) });
    }
    if (presentIn.right) {
      if (box(body.right).width > cap + BOX_TOL) err("clamp-right", "right body section exceeds 35% of the root", { width: r2(box(body.right).width), cap: r2(cap) });
      if (header.right && present(header.right)) {
        var hr = box(header.right);
        // Less the scrollbar lane it reserves, on whichever side that is (padEnd).
        if (hr.width - hr.padEnd > cap + BOX_TOL) err("clamp-right-header", "right header exceeds 35% of the root", { width: r2(hr.width - hr.padEnd), cap: r2(cap) });
      }
    }

    /* ---- 11. full-width rows ---- */
    if (viewport.center) {
      var fullRows = list(viewport.center.querySelectorAll(".pte-full-width-row"));
      for (var f = 0; f < fullRows.length; f++) {
        var expected = fullRows[f].classList.contains("pte-group-row") ? box(viewport.center).width : body.center.clientWidth;
        if (!near(box(fullRows[f]).width, expected, BOX_TOL)) {
          err("full-width-row-width", "full-width row " + fullRows[f].dataset.viewIdx + " is " + r2(box(fullRows[f]).width) + "px wide, expected " + r2(expected));
          break;
        }
      }
    }

    /* ---- 12. nothing pokes out of the root ---- */
    if (root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1) {
      warn("root-overflow", "root has scrollable overflow", {
        scroll: [root.scrollWidth, root.scrollHeight], client: [root.clientWidth, root.clientHeight],
      });
    }

    var summary = {
      root: { width: r2(rootBox.width), height: r2(rootBox.height) },
      header: r2(wb.height),
      gutter: gutter,
      sections: {
        leading: presentIn.leading ? r2(box(body.leading).width) : 0,
        left: presentIn.left ? r2(box(body.left).width) : 0,
        center: r2(box(body.center).width),
        right: presentIn.right ? r2(box(body.right).width) : 0,
      },
      strip: laneVisible,
      aggregate: aggVisible,
      bands: bandHeights,
      rowsRendered: rowsRendered,
      centerCells: centerCells,
      scrollLeft: r2(body.center.scrollLeft),
      maxCellDrift: r2(maxDrift),
    };
    return { violations: violations, summary: summary };
  }

  function checkAll() {
    return Array.prototype.map.call(document.querySelectorAll(".pte-root"), check);
  }

  global.__layoutInvariants = { check: check, checkAll: checkAll, version: 1 };
})(typeof window !== "undefined" ? window : globalThis);
