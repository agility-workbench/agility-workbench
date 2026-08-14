// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridAnnouncer, describeSelection, describeSort } from "./announcer";
import { initDomRenderer } from "./dom";

// Live region: a second, permanently sr-only region that announces
// sort/selection/loading. The visible keyboard-navigation toast is left alone — see 4.1.

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
/** Announcements coalesce over 150ms, so settle past that before reading the region. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 250));

function buildRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
    name: `Account ${i}`,
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
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  api.setRowData(buildRows(rowCount));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const srRegion = root.querySelector<HTMLElement>(".pte-grid-sr-announcer")!;
  return { container, core, api, root, srRegion, renderer };
}

/**
 * Count announcements written into the live region — how many separate things AT would be asked
 * to read. Counts *added* nodes only: replacing existing text also reports a removal, which is
 * the same single announcement.
 */
function countWrites(el: HTMLElement) {
  let count = 0;
  const observer = new MutationObserver(records => {
    for (const record of records) if (record.addedNodes.length > 0) count++;
  });
  observer.observe(el, { childList: true, characterData: true, subtree: true });
  return { count: () => count, stop: () => observer.disconnect() };
}

const colInstanceId = (core: GridCore, colId: string) =>
  core.getColumnModel().getLeaves().find(c => c.colId === colId)!.instanceID;

describe("describeSelection", () => {
  it("counts rows and columns, pluralising", () => {
    expect(describeSelection({ rows: 1, columns: 0, range: null })).toBe("1 row selected");
    expect(describeSelection({ rows: 4, columns: 0, range: null })).toBe("4 rows selected");
    expect(describeSelection({ rows: 0, columns: 2, range: null })).toBe("2 columns selected");
  });

  it("reports a range by its dimensions", () => {
    expect(describeSelection({ rows: 0, columns: 0, range: { rows: 3, columns: 2 } }))
      .toBe("3 rows by 2 columns selected");
  });

  it("says nothing for a single cell, which activedescendant already announces", () => {
    expect(describeSelection({ rows: 0, columns: 0, range: { rows: 1, columns: 1 } })).toBeNull();
    expect(describeSelection({ rows: 0, columns: 0, range: null })).toBeNull();
  });
});

describe("describeSort", () => {
  it("names the column and direction, and chains multi-sort in priority order", () => {
    expect(describeSort([])).toBe("Sorting cleared");
    expect(describeSort([{ label: "Country", dir: "desc" }])).toBe("Sorted by Country descending");
    expect(describeSort([{ label: "Country", dir: "desc" }, { label: "Region", dir: "asc" }]))
      .toBe("Sorted by Country descending, then Region ascending");
  });
});

describe("GridAnnouncer", () => {
  function setup() {
    const root = document.createElement("div");
    document.body.appendChild(root);
    return { root, announcer: new GridAnnouncer(root) };
  }

  it("mounts an sr-only polite status region", () => {
    const { announcer } = setup();
    const el = announcer.getElement();
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.getAttribute("aria-atomic")).toBe("true");
    expect(el.className).toBe("pte-grid-sr-announcer");
    announcer.destroy();
  });

  it("coalesces a burst into a single write, not a trail of stale ones", async () => {
    const { announcer } = setup();
    const writes = countWrites(announcer.getElement());
    // What a drag-extend looks like: one dispatch per mousemove.
    announcer.announce("1 row by 1 column selected");
    announcer.announce("2 rows by 1 column selected");
    announcer.announce("3 rows by 2 columns selected");
    await settle();

    expect(announcer.getElement().textContent).toBe("3 rows by 2 columns selected");
    // The count is the point: writing each intermediate size would leave AT reading a trail long
    // after the drag ended, even though it lands on the same final text.
    expect(writes.count()).toBe(1);
    writes.stop();
    announcer.destroy();
  });

  it("does not rewrite the region when the message is unchanged", async () => {
    const { announcer } = setup();
    const el = announcer.getElement();
    announcer.announce("2 rows selected");
    await settle();
    let writes = 0;
    const observer = new MutationObserver(() => { writes++; });
    observer.observe(el, { childList: true, characterData: true, subtree: true });

    announcer.announce("2 rows selected");
    await settle();
    expect(writes).toBe(0);

    announcer.announce("3 rows selected");
    await settle();
    expect(writes).toBeGreaterThan(0);
    observer.disconnect();
    announcer.destroy();
  });

  it("announces a cleared selection only when there was one to clear", async () => {
    const { announcer } = setup();
    const el = announcer.getElement();

    // Clicking empty space in a grid that never had a selection: stay quiet.
    announcer.selectionChanged({ rows: 0, columns: 0, range: null });
    await settle();
    expect(el.textContent).toBe("");

    announcer.selectionChanged({ rows: 2, columns: 0, range: null });
    await settle();
    expect(el.textContent).toBe("2 rows selected");

    announcer.selectionChanged({ rows: 0, columns: 0, range: null });
    await settle();
    expect(el.textContent).toBe("Selection cleared");
    announcer.destroy();
  });

  it("drops a pending announcement on destroy instead of writing after teardown", async () => {
    const { announcer } = setup();
    const el = announcer.getElement();
    announcer.announce("4 rows selected");
    announcer.destroy();
    await settle();
    expect(el.textContent).toBe("");
  });
});

describe("grid announcements", () => {
  it("keeps the visible nav-mode toast and the sr-only region as separate elements", () => {
    const { root, srRegion } = mountGrid(20);
    const toast = root.querySelector<HTMLElement>(".pte-grid-announcer")!;
    expect(toast).not.toBe(srRegion);
    expect(srRegion).not.toBeNull();
    // The toast is untouched: still a status region, still the visible one.
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.className).toBe("pte-grid-announcer");
  });

  it("announces sort changes with the column's label", async () => {
    const { core, srRegion } = mountGrid(20);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colInstanceId(core, "region"), dir: "asc" }] } as any);
    await settle();
    expect(srRegion.textContent).toBe("Sorted by Region ascending");

    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colInstanceId(core, "region"), dir: null }] } as any);
    await settle();
    expect(srRegion.textContent).toBe("Sorting cleared");
  });

  it("announces how much is selected", async () => {
    const { core, srRegion } = mountGrid(20, { rowSelection: true });
    core.dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "replace" } as any);
    await settle();
    expect(srRegion.textContent).toBe("1 row selected");

    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" } as any);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 3, colIdx: 1, mode: "extend" } as any);
    await settle();
    expect(srRegion.textContent).toBe("3 rows by 2 columns selected");
  });

  it("stays silent when focus moves cell to cell", async () => {
    const { core, srRegion } = mountGrid(20);
    await settle();
    // Mounting loads data, which announces — so compare against that, not against empty.
    const afterMount = srRegion.textContent;

    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 1, reason: "keyboard" } as any);
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" } as any);
    await settle();
    // activedescendant already carries the user to the cell; a "1 cell selected" on every arrow
    // keypress would talk over it.
    expect(srRegion.textContent).toBe(afterMount);
  });

  it("lets the sort message win when sorting also clears the selection", async () => {
    const { core, srRegion } = mountGrid(20, { rowSelection: true });
    core.dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "replace" } as any);
    await settle();
    expect(srRegion.textContent).toBe("1 row selected");

    // Sorting clears the selection first, so selectionChanged and columnsChanged arrive together.
    // Coalescing means AT hears the sort, not "Selection cleared" followed by the sort.
    const writes = countWrites(srRegion);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colInstanceId(core, "region"), dir: "asc" }] } as any);
    await settle();
    expect(srRegion.textContent).toBe("Sorted by Region ascending");
    expect(writes.count()).toBe(1);
    writes.stop();
  });

  it("announces loading, then the row count it finished with", async () => {
    const { core, srRegion } = mountGrid(20);
    await settle();

    core.dispatch({ type: "overlayShow", overlayType: "loading" } as any);
    await settle();
    expect(srRegion.textContent).toBe("Loading data");

    core.dispatch({ type: "overlayShow", overlayType: "none" } as any);
    await settle();
    expect(srRegion.textContent).toBe("20 rows loaded");
  });

  it("collapses a load that starts and finishes inside one coalescing window", async () => {
    // Client-side setRowData runs the whole loading cycle synchronously. Coalescing means AT hears
    // the outcome once rather than "Loading data" immediately overwritten by the count.
    const { api, srRegion } = mountGrid(20);
    await settle();
    const writes = countWrites(srRegion);
    api.setRowData(buildRows(7));
    await raf();
    await settle();
    expect(srRegion.textContent).toBe("7 rows loaded");
    expect(writes.count()).toBe(1);
    writes.stop();
  });
});
