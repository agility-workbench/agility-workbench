// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

// State ARIA: aria-sort on header cells, aria-selected on cells and
// rows, aria-expanded/aria-level on group rows. The rule throughout is that ARIA mirrors what the
// grid paints, so a state the user can see is a state AT can read.

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
    region: i < Math.ceil(count / 2) ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  }));
}

function mountGrid(rowCount: number, options: Record<string, unknown> = {}, colDefs?: any[]) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs ?? [
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  api.setRowData(buildRows(rowCount));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, root };
}

const colInstanceId = (core: GridCore, colId: string) =>
  core.getColumnModel().getLeaves().find(c => c.colId === colId)!.instanceID;

// Header cells are keyed by the column's instanceID, which is a UUID — unique document-wide, so
// this resolves the right grid even with several mounted.
const headerCell = (_container: HTMLElement, core: GridCore, colId: string) =>
  document.getElementById(colInstanceId(core, colId))!;

function bodyRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row")];
}

function rowAt(container: HTMLElement, viewIdx: number): HTMLElement | undefined {
  return bodyRows(container).find(r => r.getAttribute("data-view-idx") === String(viewIdx));
}

describe("aria-sort", () => {
  it("marks sortable columns as sortable-but-unsorted, and non-sortable ones not at all", () => {
    const { container, core } = mountGrid(20, {}, [
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name", sortable: false },
    ]);
    // "none" is what tells AT the column can be sorted; absent means it cannot.
    expect(headerCell(container, core, "region").getAttribute("aria-sort")).toBe("none");
    expect(headerCell(container, core, "name").hasAttribute("aria-sort")).toBe(false);
  });

  it("reports the direction of the sorted column and clears it when sorting moves", () => {
    const { container, core } = mountGrid(20);
    const region = () => headerCell(container, core, "region");
    const total = () => headerCell(container, core, "total");

    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colInstanceId(core, "region"), dir: "asc" }] } as any);
    expect(region().getAttribute("aria-sort")).toBe("ascending");
    expect(total().getAttribute("aria-sort")).toBe("none");

    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colInstanceId(core, "region"), dir: "desc" }] } as any);
    expect(region().getAttribute("aria-sort")).toBe("descending");

    // setSortModel is additive — a column is only unsorted by naming it with dir: null.
    core.dispatch({
      type: "sortModelSet",
      sortItems: [
        { key: colInstanceId(core, "region"), dir: null },
        { key: colInstanceId(core, "total"), dir: "asc" },
      ],
    } as any);
    expect(region().getAttribute("aria-sort")).toBe("none");
    expect(total().getAttribute("aria-sort")).toBe("ascending");
  });

  it("still reports sort state for a column that renders no sort icon", () => {
    // sortIconVisibility "never" means no icon element exists, so the icon updater bails out early.
    // The column is still sortable, so aria-sort has to come from somewhere else.
    const { container, core } = mountGrid(20, {}, [
      { colId: "region", key: "region", label: "Region", sortIconVisibility: "never" },
      { colId: "name", key: "name", label: "Name" },
    ]);
    expect(headerCell(container, core, "region").querySelector(".pte-hcell-sort")).toBeNull();
    expect(headerCell(container, core, "region").getAttribute("aria-sort")).toBe("none");

    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colInstanceId(core, "region"), dir: "asc" }] } as any);
    expect(headerCell(container, core, "region").getAttribute("aria-sort")).toBe("ascending");
  });
});

describe("aria-selected", () => {
  it("marks the cells of a selected range and nothing outside it", () => {
    const { container, core } = mountGrid(20);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" } as any);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 2, colIdx: 1, mode: "extend" } as any);

    const selected = [...container.querySelectorAll<HTMLElement>(".pte-cell[aria-selected='true']")];
    expect(selected.length).toBeGreaterThan(0);
    // Exactly the painted selection — no more, no less.
    const painted = [...container.querySelectorAll<HTMLElement>(".pte-cell.selected")];
    expect(new Set(selected)).toEqual(new Set(painted));
    for (const cell of selected) {
      const viewIdx = Number(cell.closest(".pte-row")!.getAttribute("data-view-idx"));
      expect(viewIdx).toBeGreaterThanOrEqual(1);
      expect(viewIdx).toBeLessThanOrEqual(2);
      expect(Number(cell.dataset.colIdx)).toBeLessThanOrEqual(1);
    }
  });

  it("drops the attribute entirely when the selection is cleared", () => {
    const { container, core } = mountGrid(20);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" } as any);
    expect(container.querySelector("[aria-selected='true']")).not.toBeNull();

    core.dispatch({ type: "selectionClear", what: "all" } as any);
    // Absent, not "false": an absent attribute already reads as unselected.
    expect(container.querySelectorAll("[aria-selected]").length).toBe(0);
  });

  it("marks the row element itself, not only its cells, when a row is selected", () => {
    const { container, core } = mountGrid(20, { rowSelection: true });
    core.dispatch({ type: "rowSelectSet", viewIdx: 3, mode: "replace" } as any);

    const row = rowAt(container, 3)!;
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.getAttribute("role")).toBe("row");
    // Neighbouring rows stay unmarked.
    expect(rowAt(container, 2)!.hasAttribute("aria-selected")).toBe(false);

    core.dispatch({ type: "selectionClear", what: "all" } as any);
    expect(rowAt(container, 3)!.hasAttribute("aria-selected")).toBe(false);
  });

  it("does not leave selection on a recycled slot that now shows a different row", async () => {
    const { container, core } = mountGrid(500, { rowSelection: true });
    core.dispatch({ type: "rowSelectSet", viewIdx: 0, mode: "replace" } as any);
    const slot = rowAt(container, 0)!;
    expect(slot.getAttribute("aria-selected")).toBe("true");

    const scroller = container.querySelector<HTMLElement>(".pte-scroller")!;
    scroller.scrollTop = 300 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    // Same physical element, different row: the selection must not have come along with it.
    expect(slot.getAttribute("data-view-idx")).not.toBe("0");
    expect(slot.hasAttribute("aria-selected")).toBe(false);
    expect(container.querySelectorAll(".pte-viewport > .pte-row[aria-selected]").length).toBe(0);
  });
});

describe("aria-expanded / aria-level on group rows", () => {
  async function mountGrouped(options: Record<string, unknown> = {}) {
    const mounted = mountGrid(40, { groupDisplayType: "groupRows", ...options });
    mounted.core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
    mounted.api.setAllGroupsExpanded(true);
    await raf();
    return mounted;
  }

  it("puts expand state and depth on the row, keeping the toggle's own copy", async () => {
    const { container } = await mountGrouped();
    const groupRow = rowAt(container, 0)!;
    expect(groupRow.classList.contains("pte-group-row")).toBe(true);
    expect(groupRow.getAttribute("aria-expanded")).toBe("true");
    // aria-level is 1-based; a top-level group is level 1.
    expect(groupRow.getAttribute("aria-level")).toBe("1");

    // Duplicated onto the row, deliberately NOT moved off the chevron: existing tests
    // and client CSS select [aria-expanded] on the toggle.
    const toggle = groupRow.querySelector<HTMLElement>(".pte-group-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("role")).toBe("button");
  });

  it("follows collapse and re-expand", async () => {
    const { container, core } = await mountGrouped();
    const groupId = rowAt(container, 0)!.getAttribute("data-group-id")!;

    core.dispatch({ type: "groupToggleExpand", groupId } as any);
    await raf();
    expect(rowAt(container, 0)!.getAttribute("aria-expanded")).toBe("false");

    core.dispatch({ type: "groupToggleExpand", groupId } as any);
    await raf();
    expect(rowAt(container, 0)!.getAttribute("aria-expanded")).toBe("true");
  });

  it("leaves plain data rows unlabelled rather than claiming a depth they do not have", async () => {
    const { container } = await mountGrouped();
    // A leaf row under a CSRM group reports level 0, indistinguishable from a top-level row, so
    // stamping aria-level here would assert a hierarchy position that is not known to be right.
    const leaf = rowAt(container, 1)!;
    expect(leaf.classList.contains("pte-group-row")).toBe(false);
    expect(leaf.hasAttribute("aria-expanded")).toBe(false);
    expect(leaf.hasAttribute("aria-level")).toBe(false);
  });

  it("clears hierarchy state from slots that empty out", async () => {
    const { container, api } = await mountGrouped();
    api.setRowData(buildRows(2));
    await raf();
    await raf();

    const emptied = bodyRows(container).filter(r => r.style.display === "none");
    expect(emptied.length).toBeGreaterThan(0);
    for (const row of emptied) {
      expect(row.hasAttribute("aria-expanded")).toBe(false);
      expect(row.hasAttribute("aria-level")).toBe(false);
    }
  });
});

describe("aria-multiselectable", () => {
  it("is true when ranges or rows can be multi-selected", () => {
    const { root } = mountGrid(10);
    expect(root.getAttribute("aria-multiselectable")).toBe("true");
  });

  it("is false only when every multi-select route is off", () => {
    const { root } = mountGrid(10, { rangeSelection: false, rowSelection: false, columnSelection: false });
    expect(root.getAttribute("aria-multiselectable")).toBe("false");
  });

  it("is true on row selection alone, even with cell selection off", () => {
    const { root } = mountGrid(10, {
      cellSelection: false, rangeSelection: false, rowSelection: true, columnSelection: false,
    });
    expect(root.getAttribute("aria-multiselectable")).toBe("true");
  });

  it("is false when single-row selection is the only selection route", () => {
    const { root } = mountGrid(10, {
      cellSelection: false,
      rangeSelection: false,
      rowSelection: { mode: "single", checkboxes: true },
      columnSelection: false,
    });
    expect(root.getAttribute("aria-multiselectable")).toBe("false");
  });

  it("is true on column selection alone — which is on by default", () => {
    // Column selection accumulates (a second column adds to the set) and marks every cell of each
    // selected column, so a grid with only this route enabled is still multi-selectable. Reporting
    // false here was a lie in the DEFAULT configuration, since columnSelection defaults to true.
    const { root } = mountGrid(10, { cellSelection: false, rangeSelection: false, rowSelection: false });
    expect(root.getAttribute("aria-multiselectable")).toBe("true");
  });
});
