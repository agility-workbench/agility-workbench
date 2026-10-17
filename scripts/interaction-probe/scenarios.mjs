// Scenarios for `npm run probe:interactions`. Each entry:
//
//   {
//     name,                       // the report name; one run per direction: `${name}-ltr`, `${name}-rtl`
//     directions: ["ltr", "rtl"], // RTL runs get `rtl: true` in the config and t.rtl / t.inl set
//     config,                     // a LayoutMatrixConfig for apps/vanilla-playground/layout-matrix.ts
//     host: [width, height],      // the harness frame (default 1000 × 600) in a 1600 × 1000 window
//     async run(t) { ... },       // a sequence of t.step(label, body) — see run.mjs makeContext
//   }
//
// Inside a step: act through t.page (click/dblclick/rightClick/drag/wheel/press/type/tap/touch,
// all trusted DevTools input), read through t.q("<page-helpers fn>", ...args) and t.api("<expr
// over api>"), assert with t.expect / t.expectEqual. The layout invariants run after every step.
// Directional expectations are written once with t.inl (+1 towards the inline end in physical x:
// right in LTR, left in RTL), so an RTL run asserts the mirrored behaviour of the same gesture.

const HUGE = { columns: "huge", pinned: "both" };
// Global leaf indexes in the flat presets: region, country (pinned left) = 0, 1; account … revenue
// = 2 … 6; c01 … c200 = 7 … 206 (huge); margin, notes (pinned right) = 207, 208 (huge).
const C = n => 6 + n; // global index of cNN
const LAST_HUGE = 208;

/** Asserts the column-virtualization contract on the visible rows; returns the report. */
async function expectVirtualized(t, pinned0, bounded = true) {
  const v = await t.q("virtualization", bounded ? 40 : 0);
  for (const p of v.problems) t.expect(false, `${p.id}: ${p.message}`, p.details);
  t.expect(v.rows > 0, "some centre rows are visible", { rows: v.rows });
  if (bounded) t.expect(v.maxRendered > 0 && v.maxRendered <= 40, `centre rows render a bounded number of cells (${v.maxRendered} of ${v.leaves})`, {});
  else t.expectEqual(v.maxRendered, v.leaves, "with columnVirtualization: false every centre cell is rendered");
  if (pinned0) t.expectEqual(await t.q("pinnedSnapshot"), pinned0, "pinned sections are untouched by horizontal scrolling");
  return v;
}

/** Installs a one-shot scroll listener on the centre scroller timing scroll event → next frame. */
function armFrameTimer(t) {
  return t.page.evaluate(`(() => {
    const s = document.querySelector(".pte-root .pte-body .pte-spacer");
    window.__frameTiming = null;
    s.addEventListener("scroll", () => {
      const t0 = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__frameTiming = performance.now() - t0; }));
    }, { once: true });
    return true;
  })()`);
}

async function centerPoint(t, dy = 80) {
  const box = await t.q("centerBox");
  return { x: (box.left + box.right) / 2, y: box.top + dy };
}

/** Wheels the centre by `px` towards the inline end (negative: towards the start). */
async function wheelInline(t, px, at) {
  await t.page.wheel(at || await centerPoint(t), { deltaX: px * t.inl });
}

async function focused(t) {
  return t.api("api.getFocusedCell()");
}

/**
 * Times a few mounts, then wheels the centre from the inline start to the inline end and back in 700px steps, asserting the
 * virtualization contract after each step and timing it three ways (reported, not asserted).
 */
async function wheelAcross(t, bounded) {
  // Mount cost first (three remounts of the same config; the first mount warmed the caches).
  const mountTask = [];
  for (let i = 0; i < 3; i++) {
    const m0 = await t.metrics();
    await t.call("mount", t.config);
    mountTask.push((await t.metrics()).Task - m0.Task);
  }
  t.bench("mount (400 rows × 209 columns, settled): main-thread task time", mountTask);
  const pinned0 = await t.q("pinnedSnapshot");
  const at = await centerPoint(t);
  const wall = [];
  const frame = [];
  const task = [];
  let v = null;
  await t.step("mount", async () => { v = await expectVirtualized(t, pinned0, bounded); });
  const STEP = 700;
  for (const [leg, sign] of [["toEnd", 1], ["toStart", -1]]) {
    let last = -1;
    for (let n = 0; n < 80; n++) {
      await t.step(`wheel-${leg}#${n}`, async () => {
        await armFrameTimer(t);
        const m0 = await t.metrics();
        const started = Date.now();
        await wheelInline(t, STEP * sign, at);
        await t.settle();
        wall.push(Date.now() - started);
        const m1 = await t.metrics();
        task.push(m1.Task - m0.Task);
        const ft = await t.page.evaluate("window.__frameTiming");
        if (ft != null) frame.push(ft);
        v = await expectVirtualized(t, pinned0, bounded);
      });
      const done = sign > 0 ? v.scrollLeft >= v.maxScroll - 1 : v.scrollLeft <= 0.5;
      if (done || Math.abs(v.scrollLeft - last) < 0.5) break;
      last = v.scrollLeft;
    }
    await t.step(`reached-${leg}`, async () => {
      if (sign > 0) t.expect(v.scrollLeft >= v.maxScroll - 1, "wheeling reaches the inline end", { scrollLeft: v.scrollLeft, max: v.maxScroll });
      else t.expect(v.scrollLeft <= 0.5, "wheeling back reaches the inline start", { scrollLeft: v.scrollLeft });
      const s = await t.q("scrollState");
      t.expect(s.header === s.body, "header scrollLeft equals the body's", s);
    });
  }
  t.bench("wheel step: main-thread task time", task);
  t.bench("wheel step: scroll event → second frame", frame);
  t.bench("wheel step: input → settled (wall, incl. 2×2 frames)", wall);
}

export const SCENARIOS = [
  /* -------------------------------------------------------------- horizontal scroll -------- */
  {
    name: "hscroll-virtualization",
    directions: ["ltr", "rtl"],
    config: HUGE,
    run: t => wheelAcross(t, true),
  },
  {
    // The same walk with every centre cell rendered: the benchmark baseline for the one above.
    name: "hscroll-no-virtualization",
    directions: ["ltr"],
    config: { ...HUGE, columnVirtualization: false },
    run: t => wheelAcross(t, false),
  },

  /* -------------------------------------------------------------- keyboard ----------------- */
  {
    name: "keyboard-navigation",
    directions: ["ltr", "rtl"],
    config: HUGE,
    async run(t) {
      // Start in the middle of the centre so 40 presses fit either way: ArrowRight moves towards
      // the next column in LTR and towards the previous one in RTL (visual movement).
      const startIdx = C(50);
      await t.step("click-start-cell", async () => {
        await t.api(`api.ensureColumnVisible("c50")`);
        await t.settle();
        const p = await t.q("cellPoint", 2, startIdx);
        t.expect(p && p.clipped > 4, "the start cell is rendered and visible", { p });
        await t.page.click(p);
        const a = await t.q("activeCell");
        t.expectEqual([a.viewIdx, a.colIdx], [2, startIdx], "click makes the cell active");
        const f = await focused(t);
        t.expect(f && f.colId === "c50" && f.rowId === "r3", "api.getFocusedCell() names the clicked cell", { f });
        t.expect(await t.page.evaluate(`document.activeElement === document.querySelector(".pte-root")`), "focus is on the grid root", {});
      });
      const dir = t.rtl ? -1 : 1;
      for (let i = 1; i <= 40; i++) {
        await t.step(`ArrowRight#${i}`, async () => {
          await t.page.press("ArrowRight");
          await t.settle();
          const a = await t.q("activeCell");
          const want = startIdx + dir * i;
          t.expect(a.exists, "aria-activedescendant names a cell in the DOM", { a });
          t.expectEqual(a.colIdx, want, `ArrowRight moves to column ${want}`);
          t.expect(a.visible, "the active cell lies inside the visible centre box", { rect: a.rect, box: a.box });
          const f = await focused(t);
          t.expect(f && f.colInstanceId === a.colId && f.rowId === "r3", "api.getFocusedCell() follows the active cell", { f, dom: a.colId });
        });
      }
      await t.step("Home", async () => {
        await t.page.press("Home");
        await t.settle();
        const a = await t.q("activeCell");
        t.expectEqual([a.exists, a.colIdx, a.viewIdx], [true, 0, 2], "Home lands on the first column of the row");
        t.expectEqual((await focused(t))?.colId, "region", "api focus is the first column");
      });
      await t.step("End", async () => {
        await t.page.press("End");
        await t.settle();
        const a = await t.q("activeCell");
        t.expectEqual([a.exists, a.colIdx, a.viewIdx], [true, LAST_HUGE, 2], "End lands on the last column of the row");
        t.expectEqual((await focused(t))?.colId, "notes", "api focus is the last column");
      });
      await t.step("ArrowLeft-from-End", async () => {
        // From the pinned-right last column back into the centre: c200 must be rendered and the
        // centre scrolled to show it (ArrowLeft is towards the start in LTR; in RTL it is ArrowRight).
        await t.page.press(t.rtl ? "ArrowRight" : "ArrowLeft");
        await t.settle();
        const a = await t.q("activeCell");
        t.expectEqual([a.exists, a.colIdx], [true, LAST_HUGE - 1], "the previous column (margin) is active");
        await t.page.press(t.rtl ? "ArrowRight" : "ArrowLeft");
        await t.settle();
        const b = await t.q("activeCell");
        t.expectEqual([b.exists, b.colIdx, b.inCenter], [true, C(200), true], "the last centre column (c200) is active and rendered");
        t.expect(b.visible, "c200 is scrolled into the visible centre box", { rect: b.rect, box: b.box });
        const v = await t.q("virtualization", 40);
        for (const p of v.problems) t.expect(false, `${p.id}: ${p.message}`, p.details);
      });
      await t.step("Shift+ArrowRight extends the range", async () => {
        await t.api(`api.ensureColumnVisible("c50")`);
        await t.settle();
        await t.page.click(await t.q("cellPoint", 2, startIdx));
        await t.page.press("ArrowRight", { modifiers: ["Shift"] });
        await t.settle();
        const sel = await t.api("api.getSelection()");
        const other = startIdx + dir;
        t.expectEqual(
          sel.range && [sel.range.rowStart, sel.range.rowEnd, sel.range.colStart, sel.range.colEnd],
          [2, 2, Math.min(startIdx, other), Math.max(startIdx, other)],
          "Shift+ArrowRight extends the range by one column in the visual direction",
        );
        t.expectEqual(sel.anchor && sel.anchor.colIdx, startIdx, "the range keeps its anchor");
      });
    },
  },

  /* -------------------------------------------------------------- editing ------------------ */
  {
    name: "editing-scroll-out",
    directions: ["ltr", "rtl"],
    config: { ...HUGE, editing: true },
    async run(t) {
      const col = "c03";
      const idx = C(3);
      const cell = { rowId: "r2", colId: col };
      let before = null;
      await t.step("dblclick-opens-editor", async () => {
        before = await t.api(`api.getCellValue(${JSON.stringify(cell)})`);
        await t.api(`api.ensureColumnVisible("${col}")`);
        await t.settle();
        await t.page.dblclick(await t.q("cellPoint", 1, idx));
        await t.settle();
        const e = await t.q("editor");
        t.expect(e.open && e.focused, "double-click opens a focused editor", e);
        // Replace the editor's text: select it all, then type as a person would.
        await t.page.evaluate("document.activeElement.select && document.activeElement.select()");
        await t.page.type("777");
        t.expectEqual((await t.q("editor")).value, "777", "typing goes into the editor");
      });
      await t.step("scroll-editor-out", async () => {
        for (let i = 0; i < 5; i++) await wheelInline(t, 900);
        await t.settle();
        const e = await t.q("editor");
        t.expect(e.open && e.connected, "the editor's cell stays mounted after its column scrolled away", e);
        t.expect(!e.onScreen, "the editor's column is outside the visible centre", e);
        t.expect(e.focused, "focus stays in the editor", e);
        t.expectEqual(e.value, "777", "the editor keeps its text");
        const v = await t.q("virtualization", 50);
        for (const p of v.problems) t.expect(false, `${p.id}: ${p.message}`, p.details);
      });
      await t.step("scroll-back", async () => {
        for (let i = 0; i < 5; i++) await wheelInline(t, -900);
        await t.settle();
        const e = await t.q("editor");
        t.expect(e.open && e.focused && e.onScreen, "the editor is back on screen, still focused", e);
      });
      await t.step("Enter-commits", async () => {
        await t.page.press("Enter");
        await t.settle();
        t.expect(!(await t.q("editor")).open, "Enter closes the editor", {});
        t.expectEqual(await t.api(`api.getCellValue(${JSON.stringify(cell)})`), 777, "the typed value is committed");
        t.expect(before !== 777, "the value changed", { before });
      });
      await t.step("Escape-cancels", async () => {
        await t.page.dblclick(await t.q("cellPoint", 1, idx));
        await t.settle();
        await t.page.evaluate("document.activeElement.select && document.activeElement.select()");
        await t.page.type("555");
        for (let i = 0; i < 3; i++) await wheelInline(t, 900);
        await t.settle();
        await t.page.press("Escape");
        await t.settle();
        t.expect(!(await t.q("editor")).open, "Escape closes the editor", {});
        t.expectEqual(await t.api(`api.getCellValue(${JSON.stringify(cell)})`), 777, "Escape keeps the committed value");
      });
    },
  },

  /* -------------------------------------------------------------- column resize ------------ */
  {
    name: "column-resize",
    directions: ["ltr", "rtl"],
    // 1240px of columns in a 1300px frame: no horizontal overflow until a column grows by 60.
    config: { columns: "flat" },
    host: [1300, 500],
    async run(t) {
      const id = await t.api(`api.getColumn("account").instanceID`);
      const drag = async dx => {
        const h = await t.q("resizeHandleRect", id);
        t.expect(!!h, "the resize handle exists", {});
        const from = { x: h.left + h.width / 2, y: h.top + h.height / 2 };
        await t.page.drag(from, { x: from.x + dx, y: from.y }, { steps: 6 });
        await t.settle();
      };
      const widthOf = async () => (await t.q("columnWidths", id)).header;
      const agree = async () => {
        const w = await t.q("columnWidths", id);
        t.expect(w.cells.length > 0 && w.cells.every(c => Math.abs(c - w.header) <= 0.5), "body cells are as wide as the header leaf", w);
        return w.header;
      };
      let w0 = 0;
      await t.step("baseline", async () => {
        w0 = await widthOf();
        await agree();
        const s = await t.q("stripState");
        t.expect(!s.overflow && !s.shown, "no overflow and no horizontal strip at mount", s);
      });
      await t.step("drag-towards-inline-end-widens", async () => {
        await drag(60 * t.inl);
        t.expectEqual(await widthOf(), w0 + 60, "dragging the handle 60px towards the inline end widens by 60");
        t.expectEqual(await agree(), w0 + 60, "the header leaf is 60px wider");
        const s = await t.q("stripState");
        t.expect(s.overflow && s.shown, "the horizontal strip appears once the columns overflow", s);
      });
      await t.step("drag-back-narrows", async () => {
        await drag(-60 * t.inl);
        t.expectEqual(await widthOf(), w0, "dragging back restores the width");
        await agree();
        const s = await t.q("stripState");
        t.expect(!s.overflow && !s.shown, "the strip disappears again", s);
      });
      await t.step("drag-plus-60px", async () => {
        await drag(60);
        const want = t.rtl ? w0 - 60 : w0 + 60;
        t.expectEqual(await widthOf(), want, `a +60px pointer drag ${t.rtl ? "narrows (RTL)" : "widens (LTR)"} the column by 60`);
        await agree();
      });
    },
  },

  {
    // Width changes while the centre is scrolled: a dragged visible column and an API width on a
    // column inside the leading spacer both have to keep cells, header and `.pte-col-gap` agreed.
    name: "column-resize-virtualized",
    directions: ["ltr", "rtl"],
    config: HUGE,
    async run(t) {
      const id = await t.api(`api.getColumn("c40").instanceID`);
      await t.step("scroll-and-drag", async () => {
        await t.api(`api.ensureColumnVisible("c40")`);
        await t.settle();
        const w0 = (await t.q("columnWidths", id)).header;
        const h = await t.q("resizeHandleRect", id);
        const box = await t.q("centerBox");
        t.expect(h && h.left >= box.left && h.right <= box.right, "c40's resize handle is visible", { h, box });
        const from = { x: h.left + h.width / 2, y: h.top + h.height / 2 };
        await t.page.drag(from, { x: from.x + 50 * t.inl, y: from.y }, { steps: 5 });
        await t.settle();
        const w = await t.q("columnWidths", id);
        t.expectEqual(w.header, w0 + 50, "dragging c40's handle towards the inline end widens it by 50");
        t.expect(w.cells.length > 0 && w.cells.every(c => Math.abs(c - w.header) <= 0.5), "c40's body cells follow", w);
        const v = await t.q("virtualization", 40);
        for (const p of v.problems) t.expect(false, `${p.id}: ${p.message}`, p.details);
      });
      await t.step("api-width-inside-the-gap", async () => {
        const before = await t.q("virtualization", 40);
        await t.api(`api.applyColumnState([{ colId: "c05", width: 290 }])`);
        await t.settle();
        const v = await t.q("virtualization", 40);
        for (const p of v.problems) t.expect(false, `${p.id}: ${p.message}`, p.details);
        t.expect(Math.abs(v.scrollLeft - before.scrollLeft) < 0.5 || v.scrollLeft > 0, "the centre stays scrolled", { before: before.scrollLeft, after: v.scrollLeft });
      });
    },
  },

  /* -------------------------------------------------------------- column move -------------- */
  {
    name: "column-move",
    directions: ["ltr", "rtl"],
    config: { columns: "flat" },
    host: [1300, 500],
    async run(t) {
      const ids = {};
      for (const c of ["account", "owner", "status"]) ids[c] = await t.api(`api.getColumn("${c}").instanceID`);
      const order = () => t.api("api.getColumnState().map(s => s.colId).join(',')");
      // fx: the fraction across a leaf in physical x of its inline-end (fx) / inline-start side.
      const towardsEnd = t.rtl ? 0.2 : 0.8;
      const towardsStart = t.rtl ? 0.8 : 0.2;
      const moveAndCheck = async (src, target, fx, expected, label) => {
        const a = await t.q("leafRect", ids[src]);
        const b = await t.q("leafRect", ids[target]);
        await t.page.drag({ x: a.left + a.width / 2, y: a.top + a.height / 2 }, { x: b.left + b.width * fx, y: b.top + b.height / 2 }, { steps: 10, hold: true });
        await t.settle();
        const ind = await t.page.evaluate(`(() => {
          const el = document.querySelector(".pte-column-drop-indicator");
          const hw = document.querySelector(".pte-root .pte-header-wrapper");
          if (!el || !hw) return null;
          const i = el.getBoundingClientRect(), h = hw.getBoundingClientRect();
          return { shown: getComputedStyle(el).display !== "none" && i.height > 0, i: [i.left, i.top, i.right, i.bottom], h: [h.left, h.top, h.right, h.bottom] };
        })()`);
        t.expect(ind && ind.shown, "a drop indicator shows during the drag", { ind });
        if (ind && ind.shown) {
          t.expect(ind.i[0] >= ind.h[0] - 1 && ind.i[2] <= ind.h[2] + 1 && ind.i[1] >= ind.h[1] - 1 && ind.i[3] <= ind.h[3] + 1,
            "the drop indicator lies inside the header", ind);
        }
        const p = { x: b.left + b.width * fx, y: b.top + b.height / 2 };
        await t.page.mouse("mouseReleased", p.x, p.y, { button: "left", clickCount: 1 });
        await t.settle();
        t.expectEqual(await order(), expected, label);
      };
      const base = "region,country,account,owner,status,units,revenue,margin,notes";
      await t.step("baseline", async () => { t.expectEqual(await order(), base, "initial order"); });
      await t.step("drag-owner-past-status", async () => {
        await moveAndCheck("owner", "status", towardsEnd, "region,country,account,status,owner,units,revenue,margin,notes",
          "dragging owner past status (towards the inline end) moves it after status");
      });
      await t.step("drag-owner-before-account", async () => {
        await moveAndCheck("owner", "account", towardsStart, "region,country,owner,account,status,units,revenue,margin,notes",
          "dragging owner past account (towards the inline start) moves it before account");
      });
    },
  },

  /* -------------------------------------------------------------- range + fill ------------- */
  {
    name: "range-fill",
    directions: ["ltr"],
    config: { columns: "flat", editing: true },
    host: [1300, 600],
    async run(t) {
      const value = (rowId, colId) => t.api(`api.getCellValue({ rowId: "${rowId}", colId: "${colId}" })`);
      // owner = 3, status = 4 (plain text: a fill copies the pattern, no series).
      await t.step("drag-range", async () => {
        const a = await t.q("cellPoint", 1, 3);
        const b = await t.q("cellPoint", 3, 4);
        await t.page.drag(a, b, { steps: 8 });
        await t.settle();
        const sel = await t.api("api.getSelection()");
        t.expectEqual(sel.range && [sel.range.rowStart, sel.range.rowEnd, sel.range.colStart, sel.range.colEnd], [1, 3, 3, 4],
          "press + move two rows down and one column right selects that 3×2 range");
        t.expect(!!(await t.q("fillHandle")), "the fill handle shows on the range", {});
      });
      let src = null;
      await t.step("fill-handle-down-two", async () => {
        src = { o: [await value("r2", "owner"), await value("r3", "owner")], s: [await value("r2", "status"), await value("r3", "status")] };
        const h = await t.q("fillHandle");
        const row5 = await t.q("cellRect", 5, 4);
        await t.page.drag({ x: h.left + h.width / 2, y: h.top + h.height / 2 }, { x: h.left + h.width / 2, y: row5.top + row5.height / 2 }, { steps: 8 });
        await t.settle();
        t.expectEqual([await value("r5", "owner"), await value("r6", "owner")], src.o, "the fill copies the owner pattern into the two rows below");
        t.expectEqual([await value("r5", "status"), await value("r6", "status")], src.s, "the fill copies the status pattern into the two rows below");
        const sel = await t.api("api.getSelection()");
        t.expectEqual(sel.range && [sel.range.rowStart, sel.range.rowEnd], [1, 5], "the selection extends over the filled rows");
      });
      await t.step("ctrl-d-fills-down", async () => {
        const a = await t.q("cellPoint", 7, 3);
        const b = await t.q("cellPoint", 9, 3);
        await t.page.drag(a, b, { steps: 4 });
        const first = await value("r8", "owner");
        await t.page.press("d", { modifiers: ["Control"] });
        await t.settle();
        t.expectEqual([await value("r9", "owner"), await value("r10", "owner")], [first, first], "Ctrl+D copies the first row of the selection down");
      });
    },
  },

  /* -------------------------------------------------------------- menus -------------------- */
  {
    name: "menus",
    directions: ["ltr", "rtl"],
    config: { columns: "flat", pinned: "both" },
    host: [1300, 600],
    async run(t) {
      const vp = await t.q("viewport");
      const inside = r => r.left >= -0.5 && r.top >= -0.5 && r.right <= vp.width + 0.5 && r.bottom <= vp.height + 0.5;
      let at = null;
      await t.step("context-menu", async () => {
        const p = await t.q("cellPoint", 3, 4);
        at = await t.page.rightClick(p);
        await t.page.mouse("mouseMoved", 2, 2);
        await t.settle();
        const m = await t.q("menus");
        t.expect(m.length === 1 && !m[0].submenu, "right-click opens one menu", { menus: m.length });
        if (!m.length) return;
        const r = m[0].rect;
        t.expect(inside(r), "the menu is fully inside the viewport", { r, vp });
        // The menu opens from the pointer towards the inline end: its inline-start edge is there.
        const edge = t.rtl ? r.right : r.left;
        t.expect(Math.abs(edge - at.x) <= 4, `the menu's inline-start (${t.rtl ? "right" : "left"}) edge is at the pointer`, { edge, pointer: at.x });
        t.expect(Math.abs(r.top - at.y) <= 4, "the menu's top is at the pointer", { top: r.top, pointer: at.y });
        t.expectEqual(m[0].dir, t.rtl ? "rtl" : "ltr", "the menu carries the grid's direction");
      });
      await t.step("submenu-by-keyboard", async () => {
        // Walk down to the first item with a submenu, then open it with the inline-end arrow.
        let m = await t.q("menus");
        const target = m[0]?.items.findIndex(i => i.submenu);
        t.expect(target >= 0, "the body menu has an item with a submenu", { items: m[0]?.items.map(i => i.text) });
        if (target < 0) return;
        for (let i = 0; i < 30; i++) {
          await t.page.press("ArrowDown");
          m = await t.q("menus");
          const act = await t.page.evaluate(`(() => { const a = document.activeElement; return a && a.classList.contains("pte-menu-item") ? a.textContent.trim() : null; })()`);
          if (act && act.startsWith(m[0].items[target].text)) break;
        }
        // Keyboard only: the pointer is parked outside the menu so no hover opens anything.
        m = await t.q("menus");
        t.expect(!m.some(x => x.submenu), "no submenu is open before the arrow key", { menus: m.length });
        const activeText = await t.page.evaluate(`(document.activeElement && document.activeElement.textContent || "").trim()`);
        t.expect(activeText.startsWith(m[0].items[target].text), "ArrowDown reached the submenu item", { activeText, want: m[0].items[target].text });
        await t.page.press(t.rtl ? "ArrowRight" : "ArrowLeft");
        await t.settle();
        t.expect(!(await t.q("menus")).some(x => x.submenu), `${t.rtl ? "ArrowRight" : "ArrowLeft"} (towards the inline start) does not open the submenu`, {});
        await t.page.press(t.rtl ? "ArrowLeft" : "ArrowRight");
        await t.settle();
        m = await t.q("menus");
        const sub = m.find(x => x.submenu);
        t.expect(!!sub, `${t.rtl ? "ArrowLeft" : "ArrowRight"} opens the submenu`, { menus: m.map(x => x.submenu) });
        if (!sub) return;
        const parent = m.find(x => !x.submenu).rect;
        t.expect(inside(sub.rect), "the submenu is inside the viewport", { r: sub.rect });
        const onEnd = t.rtl ? sub.rect.right <= parent.left + 8 : sub.rect.left >= parent.right - 8;
        t.expect(onEnd, "the submenu opens on the inline-end side of its parent", { sub: sub.rect, parent });
      });
      await t.step("Escape-closes", async () => {
        await t.page.press("Escape");
        await t.settle();
        let m = await t.q("menus");
        t.expect(!m.some(x => x.submenu), "Escape closes the submenu first", { menus: m.length });
        if (m.length) {
          await t.page.press("Escape");
          await t.settle();
          m = await t.q("menus");
        }
        t.expectEqual(m.length, 0, "Escape closes the menu");
      });
      await t.step("header-menu-button", async () => {
        const id = await t.api(`api.getColumn("status").instanceID`);
        const leaf = await t.q("leafRect", id);
        await t.page.mouse("mouseMoved", leaf.left + leaf.width / 2, leaf.top + leaf.height / 2);
        await t.settle();
        const btn = await t.page.evaluate(`(() => { const b = document.getElementById(${JSON.stringify(id)}).querySelector(".pte-hcell-menu-menuBtn"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, bottom: r.bottom }; })()`);
        t.expect(btn && btn.w > 0, "the header leaf has a menu button", { btn });
        if (!btn) return;
        await t.page.click(btn);
        await t.settle();
        const m = await t.q("menus");
        t.expect(m.length >= 1, "the column menu opens", {});
        if (!m.length) return;
        const r = m[0].rect;
        t.expect(inside(r), "the column menu is inside the viewport", { r });
        // Anchored to the menu button inside the header cell: its top sits just under the button.
        t.expect(r.top >= btn.bottom - 2 && r.top <= Math.max(btn.bottom, leaf.bottom) + 8, "the column menu sits just under the header cell's menu button", { top: r.top, buttonBottom: btn.bottom, headerBottom: leaf.bottom });
        t.expect(r.right > leaf.left && r.left < leaf.right, "the column menu overlaps the header cell horizontally", { r, leaf });
        await t.page.press("Escape");
        await t.settle();
        t.expectEqual((await t.q("menus")).length, 0, "Escape closes the column menu");
      });
    },
  },

  /* -------------------------------------------------------------- bands + sticky ----------- */
  {
    name: "bands-sticky-hscroll",
    directions: ["ltr", "rtl"],
    config: { columns: "many", pinned: "both", pinnedRows: "both", grouping: "sticky" },
    async run(t) {
      await t.step("scroll-body-for-sticky", async () => {
        await t.call("scrollBody", 700);
        const b = await t.q("bandAlignment");
        t.expect(b.stickyShown, "a sticky group row shows after scrolling the body", b);
      });
      for (let i = 1; i <= 4; i++) {
        await t.step(`wheel#${i}`, async () => {
          await wheelInline(t, 400);
          await t.settle();
          const s = await t.q("scrollState");
          t.expect(s.body > 0, "the centre scrolled", s);
          for (const [name, left] of Object.entries(s.bands)) {
            t.expect(Math.abs(left - s.body) <= 0.5, `the ${name} band's centre is at the body's scrollLeft`, s);
          }
          t.expect(Object.keys(s.bands).length >= 2, "pinned top and bottom bands are present", s);
          const b = await t.q("bandAlignment");
          t.expect(b.counted > 0, "band cells are visible in the centre", b);
          for (const p of b.problems) t.expect(false, `${p.id}: ${p.message}`, p.details);
        });
      }
    },
  },

  /* -------------------------------------------------------------- touch -------------------- */
  {
    name: "touch",
    directions: ["ltr"],
    config: { columns: "flat", pinned: "both" },
    async run(t) {
      await t.page.enableTouch(true);
      await t.step("tap-selects", async () => {
        const p = await t.q("cellPoint", 2, 4);
        await t.page.tap(p);
        await t.settle();
        const f = await focused(t);
        t.expect(f && f.rowId === "r3" && f.colId === "status", "a tap makes the cell active", { f });
        const a = await t.q("activeCell");
        t.expectEqual([a.viewIdx, a.colIdx], [2, 4], "aria-activedescendant names the tapped cell");
      });
      await t.step("long-press-menu", async () => {
        const p = await t.q("cellPoint", 4, 3);
        await t.page.tap(p, { hold: 750 });
        await t.settle();
        const m = await t.q("menus");
        t.expect(m.length === 1, "a long press opens the context menu", { menus: m.length });
        await t.page.press("Escape");
        await t.settle();
        t.expectEqual((await t.q("menus")).length, 0, "Escape closes it");
      });
      await t.step("two-finger-pan-scrolls", async () => {
        const before = (await t.q("scrollState")).bodyTop;
        const box = await t.q("centerBox");
        const x = (box.left + box.right) / 2;
        const y0 = box.bottom - 60;
        const fingers = dy => [{ x: x - 30, y: y0 + dy, id: 1 }, { x: x + 30, y: y0 + dy, id: 2 }];
        await t.page.touch("touchStart", fingers(0));
        for (let i = 1; i <= 12; i++) {
          await t.page.touch("touchMove", fingers(-20 * i));
          await t.sleep(16);
        }
        await t.page.touch("touchEnd", []);
        await t.sleep(300);
        await t.settle();
        const after = (await t.q("scrollState")).bodyTop;
        t.expect(after > before + 50, "a two-finger pan scrolls the body", { before, after });
        t.expectEqual((await t.q("menus")).length, 0, "the pan opened no menu");
      });
    },
  },
];
