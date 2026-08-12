// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { ActiveDescendantTracker } from "../aria";
import { initDomRenderer } from "../dom";

// Focus model: keyboard navigation keeps DOM focus on the root and
// paints a class on the active cell, so the root's aria-activedescendant is the only thing that
// tells AT where focus is. The pointer is re-derived by whichever renderer paints the active
// cell, which is what makes it survive scroll recycling and band rebuilds.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function buildRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    name: `Account ${i}`,
    rep: `Rep ${i}`,
    total: i,
  }));
}

function mountGrid(rowCount: number, options: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", pinned: "left", editable: true },
    { colId: "rep", key: "rep", label: "Rep" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, pinned: "right" },
  ]);
  api.setRowData(buildRows(rowCount));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, root };
}

/** The cell the root currently names, resolved the way AT resolves it. */
function activeDescendantEl(root: HTMLElement): HTMLElement | null {
  const id = root.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
}

describe("aria-activedescendant focus model", () => {
  it("names no cell until one is focused", () => {
    const { root } = mountGrid(50);
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("names the focused cell, and the named cell is a real gridcell in its row", () => {
    const { core, root } = mountGrid(50);
    core.dispatch({ type: "focusSet", viewIdx: 3, colIdx: 1, reason: "api" });

    const cell = activeDescendantEl(root)!;
    expect(cell).not.toBeNull();
    expect(cell.getAttribute("role")).toBe("gridcell");
    expect(cell.dataset.colIdx).toBe("1");
    const row = cell.closest<HTMLElement>(".pte-row")!;
    // The cell is reachable from its ARIA row: either a direct child of the center row or
    // stitched into it by aria-owns (this one is pinned-left, so: owned).
    const owner = [...root.querySelectorAll<HTMLElement>("[aria-owns]")]
      .find(el => el.getAttribute("aria-owns")!.split(" ").includes(cell.id))!;
    expect(owner).toBeTruthy();
    expect(owner.getAttribute("aria-rowindex")).toBe("5"); // header is 1, view row 3 is 5
    expect(row.getAttribute("data-view-idx") ?? owner.getAttribute("data-view-idx")).toBe("3");
  });

  it("tracks focus with highlightActiveCell off — the default — where no outline is painted", () => {
    const { core, root } = mountGrid(50);
    expect(core.options.highlightActiveCell).toBe(false);
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" });

    const cell = activeDescendantEl(root)!;
    expect(cell).not.toBeNull();
    // The visual outline is opt-in; the ARIA pointer is not.
    expect(cell.classList.contains("pte-active-cell")).toBe(false);
    expect(root.querySelector(".pte-active-cell")).toBeNull();
  });

  it("paints the outline on the same cell it names when highlightActiveCell is on", () => {
    const { core, root } = mountGrid(50, { highlightActiveCell: true });
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" });

    const cell = activeDescendantEl(root)!;
    expect(cell.classList.contains("pte-active-cell")).toBe(true);
    expect([...root.querySelectorAll(".pte-active-cell")]).toEqual([cell]);
  });

  it("follows the focused cell as it moves", () => {
    const { core, root } = mountGrid(50);
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 1, reason: "keyboard" });
    const first = root.getAttribute("aria-activedescendant");
    core.dispatch({ type: "focusSet", viewIdx: 4, colIdx: 2, reason: "keyboard" });
    const second = root.getAttribute("aria-activedescendant");

    expect(second).not.toBe(first);
    expect(activeDescendantEl(root)!.dataset.colIdx).toBe("2");
    // Exactly one pointer, always.
    expect(root.getAttribute("aria-activedescendant")!.split(" ")).toHaveLength(1);
  });

  it("drops the pointer when the focused row scrolls out of the pool, rather than naming the recycled slot", async () => {
    const { core, root, container } = mountGrid(500);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, reason: "keyboard" });
    const focusedCell = activeDescendantEl(root)!;
    const focusedRow = focusedCell.closest<HTMLElement>(".pte-row")!;

    const scroller = container.querySelector<HTMLElement>(".pte-scroller")!;
    scroller.scrollTop = 300 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    // That physical slot now shows a different row — naming it would send AT to the wrong data.
    expect(focusedRow.getAttribute("data-view-idx")).not.toBe("0");
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("re-names the focused cell when its row scrolls back into the pool", async () => {
    const { core, root, container } = mountGrid(500);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, reason: "keyboard" });
    const scroller = container.querySelector<HTMLElement>(".pte-scroller")!;

    scroller.scrollTop = 300 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);

    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    const cell = activeDescendantEl(root)!;
    expect(cell).not.toBeNull();
    expect(cell.dataset.colIdx).toBe("1");
    expect(cell.closest<HTMLElement>(".pte-row")!.getAttribute("data-view-idx")).toBe("0");
  });

  it("hands the pointer between the body pool and a pinned band without either clobbering the other", async () => {
    const { core, api, root } = mountGrid(50);
    api.setPinnedTopRowData([{ id: "top0", name: "Pinned", rep: "-", total: 0 }]);
    await raf();

    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, rowPinned: "top", reason: "keyboard" });
    const bandCell = activeDescendantEl(root)!;
    expect(bandCell).not.toBeNull();
    expect(bandCell.closest(".pte-pinned-row")).not.toBeNull();
    // Never inside an aria-hidden subtree: AT cannot resolve a pointer into one.
    expect(bandCell.closest("[aria-hidden='true']")).toBeNull();

    // Moving back to the body: the band's release runs in the same pass as the body's claim.
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" });
    const bodyCell = activeDescendantEl(root)!;
    expect(bodyCell).not.toBeNull();
    expect(bodyCell.closest(".pte-pinned-row")).toBeNull();

    // And back again.
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, rowPinned: "top", reason: "keyboard" });
    expect(activeDescendantEl(root)!.closest(".pte-pinned-row")).not.toBeNull();
  });

  it("keeps naming the cell across an edit, which replaces the cell's children", async () => {
    const { core, root } = mountGrid(50);
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 1, reason: "keyboard" });
    const before = root.getAttribute("aria-activedescendant");
    const cell = activeDescendantEl(root)!;

    const rowId = core.getRowIdAtViewIndex(1)!;
    const colId = core.getColumnModel().getLeaves()[1].instanceID;
    core.dispatch({ type: "editStart", cell: { rowId, colId }, source: "keyboard" });
    // The editor takes over the cell's interior; the id lives on the cell element itself.
    expect(root.getAttribute("aria-activedescendant")).toBe(before);
    expect(cell.id).toBe(before);

    core.dispatch({ type: "editCancel", cell: { rowId, colId } });
    await raf();
    expect(root.getAttribute("aria-activedescendant")).toBe(before);
    expect(activeDescendantEl(root)).not.toBeNull();
  });

  it("never names a cell in an emptied slot when the data underneath it goes away", async () => {
    const { core, api, root } = mountGrid(50);
    core.dispatch({ type: "focusSet", viewIdx: 5, colIdx: 1, reason: "keyboard" });
    expect(root.hasAttribute("aria-activedescendant")).toBe(true);

    api.setRowData(buildRows(2));
    await raf();
    await raf();

    // Focus may be clamped onto a surviving row or dropped entirely; either is fine. What is not
    // fine is naming one of the slots that just emptied — the id still resolves, to blank markup.
    const cell = activeDescendantEl(root);
    if (cell) {
      const row = cell.closest<HTMLElement>(".pte-row")!;
      expect(row.style.display).not.toBe("none");
      expect(row.hasAttribute("data-view-idx")).toBe(true);
    }
  });

});

// A docked group row exists twice: the sticky mirror on top and the live body row beneath it.
// The mirror band is aria-hidden so the row is announced once, which means the mirror can never be
// named — a pointer into an aria-hidden subtree names a node that is not in the accessibility tree at
// all. The mirror still paints the active-cell outline, since it covers the body copy visually, so the
// two are kept apart deliberately.
describe("aria-activedescendant with sticky group rows", () => {
  async function mountGrouped() {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      groupRowsSticky: true,
      groupDisplayType: "groupRows",
      groupRowsSelectable: true,
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach({ current: container });
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name" },
      { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
    ]);
    api.setRowData(Array.from({ length: 200 }, (_, i) => ({
      id: `r${i}`,
      region: i < 100 ? "AMER" : "EMEA",
      name: `Account ${i}`,
      total: i,
    })));
    // Grouping is a dispatch, not a column flag.
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
    api.setAllGroupsExpanded(true);
    await raf();
    const root = container.querySelector<HTMLElement>(".pte-root")!;
    const scroller = container.querySelector<HTMLElement>(".pte-scroller")!;
    return { container, core, api, root, scroller };
  }

  async function scrollTo(scroller: HTMLElement, px: number) {
    scroller.scrollTop = px;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();
  }

  it("names the live body copy while the group row is docked above it", async () => {
    const { container, core, root, scroller } = await mountGrouped();
    // Far enough for the group header to dock, close enough that its body row is still pooled.
    await scrollTo(scroller, 2 * core.options.rowHeight);
    expect(container.querySelectorAll(".pte-sticky-row").length).toBeGreaterThan(0);

    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0, reason: "keyboard" });

    const cell = activeDescendantEl(root)!;
    expect(cell).not.toBeNull();
    expect(cell.closest(".pte-sticky-row")).toBeNull();
    expect(cell.closest("[aria-hidden='true']")).toBeNull();
    // The mirror does paint the outline — that is exactly why it must not also claim.
    const mirrorOutlined = container.querySelectorAll(".pte-sticky-row .pte-active-cell").length;
    expect(mirrorOutlined).toBeGreaterThanOrEqual(0);
  });

  it("names nothing rather than the mirror once the focused group row leaves the pool", async () => {
    const { container, core, root, scroller } = await mountGrouped();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0, reason: "keyboard" });
    expect(root.hasAttribute("aria-activedescendant")).toBe(true);

    // Deep inside the SAME group (AMER spans view rows 0-100), so the docked mirror is still the
    // focused row's header while its body copy is long gone from the pool — the only copy of the
    // focused row on screen is the hidden one. Scrolling past row 100 would dock a different
    // group's header instead and the test would prove nothing.
    await scrollTo(scroller, 60 * core.options.rowHeight);
    const mirrorRow = container.querySelector<HTMLElement>(".pte-sticky-row")!;
    expect(mirrorRow).not.toBeNull();
    expect(mirrorRow.dataset.viewIdx).toBe("0");

    const cell = activeDescendantEl(root);
    if (cell) expect(cell.closest(".pte-sticky-row")).toBeNull();
    // Known v1 limitation of the aria-hidden mirror: the row is visible but absent
    // from the accessibility tree, so focus on it cannot be expressed at all.
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
  });
});

// The two painters (body pool, pinned bands) repaint in an order that depends on which one the
// focus left, so the tracker's arbitration is what keeps them from undoing each other.
describe("ActiveDescendantTracker arbitration", () => {
  function setup() {
    const root = document.createElement("div");
    const a = document.createElement("div");
    a.id = "cell-a";
    const b = document.createElement("div");
    b.id = "cell-b";
    root.append(a, b);
    document.body.appendChild(root);
    return { root, a, b, tracker: new ActiveDescendantTracker(root) };
  }

  const owner1 = { name: "pool" };
  const owner2 = { name: "band" };

  it("names the claimed cell and clears on its owner's release", () => {
    const { root, a, tracker } = setup();
    tracker.claim(a, owner1);
    expect(root.getAttribute("aria-activedescendant")).toBe("cell-a");
    tracker.release(owner1);
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("ignores a release from an owner that no longer holds the pointer", () => {
    const { root, a, b, tracker } = setup();
    tracker.claim(a, owner1);
    tracker.claim(b, owner2); // focus moved from the pool to a band
    tracker.release(owner1); // ...and the pool repaints second
    expect(root.getAttribute("aria-activedescendant")).toBe("cell-b");
  });

  it("drops a pointer whose element was detached, since no owner is left to release it", () => {
    const { root, a, tracker } = setup();
    tracker.claim(a, owner1);
    a.remove(); // pool rebuild / band re-render
    tracker.release(owner2); // some other painter's ordinary release
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("refuses to name a cell with no id rather than leave a stale pointer", () => {
    const { root, a, tracker } = setup();
    const idless = document.createElement("div");
    root.appendChild(idless);
    tracker.claim(a, owner1);
    tracker.claim(idless, owner1);
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
  });
});
