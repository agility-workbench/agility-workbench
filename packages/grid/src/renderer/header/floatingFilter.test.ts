// @vitest-environment happy-dom
/**
 * The floating filter row (`GridOptions.floatingFilter`): one control per filterable leaf under the
 * header levels, bound to the filter model in both directions, laid out like the header cells and
 * counted as the second ARIA header row.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../../createGrid";
import { FilterType } from "../../interfaces/filter";
import type { IGridAPI } from "../../interfaces/iGridAPI";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
let api: IGridAPI | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "900px";
  document.body.appendChild(host);
});

afterEach(() => {
  api?.destroy();
  api = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const rowData = [
  { id: 1, name: "Alpha", qty: 5, born: "2020-01-02", active: true, region: "North" },
  { id: 2, name: "Beta", qty: 10, born: "2021-03-04", active: false, region: "South" },
  { id: 3, name: "Gamma", qty: 15, born: "2022-05-06", active: true, region: "North" },
  { id: 4, name: "Alphabet", qty: 20, born: "2023-07-08", active: false, region: "East" },
];

const columnDefs = [
  { colId: "name", key: "name", label: "Name", width: 150 },
  { colId: "qty", key: "qty", label: "Qty", type: "number", width: 100 },
  { colId: "born", key: "born", label: "Born", type: "date", width: 120 },
  { colId: "active", key: "active", label: "Active", type: "boolean", width: 90 },
  { colId: "region", key: "region", label: "Region", filter: "set", width: 130 },
];

function mount(extra: Record<string, unknown> = {}) {
  api = createGrid(host, {
    rowIdKey: "id",
    columnDefs,
    rowData,
    floatingFilter: true,
    filterDebounceMs: 200,
    ...extra,
  } as any);
  return api;
}

const row = () => host.querySelector<HTMLElement>(".pte-floating-filter-row")!;
const section = (cls: string) => host.querySelector<HTMLElement>(`.${cls}`)!;
const cellFor = (colId: string) => {
  const col = api!.getColumn(colId) as any;
  return host.querySelector<HTMLElement>(`.pte-floating-filter-cell[data-col-id="${col.instanceID}"]`);
};
const inputFor = (colId: string) => cellFor(colId)!.querySelector<HTMLInputElement>("input, select")!;
const summaryFor = (colId: string) => cellFor(colId)!.querySelector<HTMLButtonElement>(".pte-floating-filter-summary")!;
const sectionColIds = (cls: string) =>
  [...section(cls).querySelectorAll<HTMLElement>(".pte-floating-filter-cell")]
    .map(el => (api!.getColumns() as any[]).find(c => c.instanceID === el.dataset.colId)?.colId);

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(target: HTMLElement, k: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
}

describe("floating filter row — shape and option", () => {
  it("is off by default: no visible row, no cells, header height unchanged", () => {
    mount({ floatingFilter: undefined });
    expect(row().classList.contains("pte-floating-filter-row-visible")).toBe(false);
    expect(host.querySelectorAll(".pte-floating-filter-cell")).toHaveLength(0);
    expect(host.querySelector<HTMLElement>(".pte-header-wrapper")!.style.height).toBe("43px");
  });

  it("adds a row as tall as the leaf header level under the levels", () => {
    mount();
    expect(row().classList.contains("pte-floating-filter-row-visible")).toBe(true);
    const wrapper = host.querySelector<HTMLElement>(".pte-header-wrapper")!;
    expect(wrapper.style.height).toBe("86px");
    // The header sections keep the levels' height; the row starts one pixel above their bottom.
    expect(section("pte-header").style.height).toBe("43px");
    expect(row().style.top).toBe("42px");
    expect(row().style.height).toBe("44px");
    const root = host.querySelector<HTMLElement>(".pte-root")!;
    expect(root.style.getPropertyValue("--pte-rendered-header-height")).toBe("86px");
    expect(host.querySelector<HTMLElement>(".pte-body-frame")!.style.height).toContain("86px");
  });

  it("follows --pte-floating-filter-height when the theme sets it", () => {
    mount({ floatingFilter: false });
    const root = host.querySelector<HTMLElement>(".pte-root")!;
    root.style.setProperty("--pte-floating-filter-height", "30px");
    api!.updateGridOptions({ floatingFilter: true });
    expect(host.querySelector<HTMLElement>(".pte-header-wrapper")!.style.height).toBe("73px");
    expect(row().style.height).toBe("31px");
  });

  it("shows and hides live with updateGridOptions", () => {
    mount({ floatingFilter: false });
    const wrapper = host.querySelector<HTMLElement>(".pte-header-wrapper")!;
    expect(wrapper.style.height).toBe("43px");
    api!.updateGridOptions({ floatingFilter: true });
    expect(row().classList.contains("pte-floating-filter-row-visible")).toBe(true);
    expect(host.querySelectorAll(".pte-floating-filter-cell")).toHaveLength(5);
    expect(wrapper.style.height).toBe("86px");
    api!.updateGridOptions({ floatingFilter: false });
    expect(row().classList.contains("pte-floating-filter-row-visible")).toBe(false);
    expect(host.querySelectorAll(".pte-floating-filter-cell")).toHaveLength(0);
    expect(wrapper.style.height).toBe("43px");
  });

  it("gives every visible leaf a cell sized like its header cell", () => {
    mount();
    expect(sectionColIds("pte-floating-filter")).toEqual(["name", "qty", "born", "active", "region"]);
    for (const id of ["name", "qty", "born", "active", "region"]) {
      const col = api!.getColumn(id) as any;
      expect(cellFor(id)!.style.width).toBe(`${col.computedWidth}px`);
    }
  });

  it("follows hide, pin, move and width changes", () => {
    mount();
    api!.setColumnVisible("born", false);
    expect(cellFor("born")).toBeNull();
    expect(sectionColIds("pte-floating-filter")).toEqual(["name", "qty", "active", "region"]);

    api!.setColumnPinned("name", "left");
    api!.setColumnPinned("region", "right");
    expect(sectionColIds("pte-floating-filter-left")).toEqual(["name"]);
    expect(sectionColIds("pte-floating-filter-right")).toEqual(["region"]);
    expect(sectionColIds("pte-floating-filter")).toEqual(["qty", "active"]);
    // The pinned sections mirror the header sections' boxes.
    expect(section("pte-floating-filter-left").style.width).toBe(section("pte-header-left").style.width);
    expect(section("pte-floating-filter-left").classList.contains("visible")).toBe(true);
    expect(section("pte-floating-filter-right").style.width).toBe(section("pte-header-right").style.width);

    api!.moveColumn("active", 1);
    expect(sectionColIds("pte-floating-filter")).toEqual(["active", "qty"]);

    api!.setColumnWidth("qty", 222);
    expect(cellFor("qty")!.style.width).toBe("222px");
  });

  it("leaves utility columns and floatingFilter: false columns empty", () => {
    mount({
      rowNumbers: true,
      columnDefs: [...columnDefs.slice(0, 1), { ...columnDefs[1], floatingFilter: false }, { colId: "x", key: "x", filter: false }],
    });
    const leading = section("pte-floating-filter-leading").querySelectorAll(".pte-floating-filter-cell");
    expect(leading).toHaveLength(1);
    expect(leading[0].classList.contains("pte-floating-filter-cell-empty")).toBe(true);
    expect(leading[0].querySelector("input, select, button")).toBeNull();
    expect(cellFor("qty")!.classList.contains("pte-floating-filter-cell-empty")).toBe(true);
    expect(cellFor("qty")!.querySelector("input")).toBeNull();
    expect(cellFor("x")!.querySelector("input")).toBeNull();
    expect(cellFor("name")!.querySelector("input")).not.toBeNull();
  });
});

describe("floating filter row — controls and the filter model", () => {
  it("picks a control per filter kind", () => {
    mount();
    expect(inputFor("name").type).toBe("text");
    expect(inputFor("name").placeholder).toBe("Contains");
    expect(inputFor("qty").type).toBe("number");
    expect(inputFor("qty").placeholder).toBe("Equal");
    expect(inputFor("born").type).toBe("date");
    const select = inputFor("active") as unknown as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect([...select.options].map(o => o.value)).toEqual(["", "true", "false"]);
    expect(cellFor("region")!.querySelector("input, select")).toBeNull();
    expect(summaryFor("region").textContent).toBe("All");
  });

  it("applies typed text after filterDebounceMs", () => {
    vi.useFakeTimers();
    mount();
    type(inputFor("name"), "alpha");
    vi.advanceTimersByTime(150);
    expect(api!.getFilterModel()).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(api!.getFilterModel()).toEqual([
      { colId: "name", join: "and", filters: [{ type: FilterType.CONTAINS, values: ["alpha"] }] },
    ]);
    expect(api!.getDisplayedRowCount()).toBe(2);
  });

  it("applies at once on Enter, and an emptied input removes the filter", () => {
    vi.useFakeTimers();
    mount();
    const input = inputFor("qty");
    type(input, "10");
    key(input, "Enter");
    expect(api!.getFilterModel()[0].filters).toEqual([{ type: FilterType.EQ, values: ["10"] }]);
    expect(api!.getDisplayedRowCount()).toBe(1);
    type(input, "");
    vi.advanceTimersByTime(300);
    expect(api!.getFilterModel()).toEqual([]);
    expect(api!.getDisplayedRowCount()).toBe(4);
  });

  it("applies a boolean choice and a date at once", () => {
    mount();
    const select = inputFor("active") as unknown as HTMLSelectElement;
    select.value = "true";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(api!.getFilterModel()).toEqual([
      { colId: "active", join: "and", filters: [{ type: FilterType.EQ, values: ["true"] }] },
    ]);
    const date = inputFor("born");
    date.value = "2021-03-04";
    date.dispatchEvent(new Event("change", { bubbles: true }));
    expect(api!.getFilterModel().find(f => f.colId === "born")!.filters)
      .toEqual([{ type: FilterType.EQ, values: ["2021-03-04"] }]);
  });

  it("shows a model set from the API, keeping its operator", () => {
    vi.useFakeTimers();
    mount();
    api!.setFilterModel([{ colId: "name", filters: [{ type: FilterType.STARTS_WITH, values: ["Al"] }] }]);
    expect(inputFor("name").value).toBe("Al");
    expect(inputFor("name").placeholder).toBe("Starts with");
    // Typing keeps the model's operator.
    type(inputFor("name"), "Alphab");
    vi.advanceTimersByTime(250);
    expect(api!.getFilterModel()[0].filters).toEqual([{ type: FilterType.STARTS_WITH, values: ["Alphab"] }]);
    api!.setFilterModel([]);
    expect(inputFor("name").value).toBe("");
    expect(inputFor("name").placeholder).toBe("Contains");
  });

  it("follows a saved view applied with applyViewState, both ways", () => {
    mount();
    api!.setFilterModel([{ colId: "name", filters: [{ type: FilterType.EQ, values: ["Beta"] }] }]);
    const saved = api!.captureViewState();
    api!.setFilterModel([]);
    expect(inputFor("name").value).toBe("");
    api!.applyViewState(saved);
    expect(inputFor("name").value).toBe("Beta");
    expect(inputFor("name").placeholder).toBe("Equal");
    api!.applyViewState({ ...saved, filterModel: [] });
    expect(inputFor("name").value).toBe("");
  });

  it("keeps a value still waiting for its debounce across a column rebuild", () => {
    vi.useFakeTimers();
    mount();
    type(inputFor("name"), "gam");
    api!.setColumnWidth("qty", 180);
    api!.setColumnVisible("born", false);
    expect(inputFor("name").value).toBe("gam");
    vi.advanceTimersByTime(250);
    expect(api!.getFilterModel()[0].filters).toEqual([{ type: FilterType.CONTAINS, values: ["gam"] }]);
  });

  it("shows a model the input cannot edit as read-only text until it is cleared", () => {
    mount();
    api!.setFilterModel([{
      colId: "qty",
      join: "or",
      filters: [{ type: FilterType.LT, values: ["6"] }, { type: FilterType.GT, values: ["19"] }],
    }]);
    expect(inputFor("qty").hidden).toBe(true);
    expect(summaryFor("qty").hidden).toBe(false);
    expect(summaryFor("qty").textContent).toBe("Less than 6 OR Greater than 19");
    expect(cellFor("qty")!.classList.contains("pte-floating-filter-readonly")).toBe(true);

    api!.setFilterModel([{ colId: "qty", filters: [{ type: FilterType.IN_RANGE, values: ["5", "10"] }] }]);
    expect(summaryFor("qty").textContent).toBe("Between 5 – 10");

    api!.removeFilterModel("qty");
    expect(inputFor("qty").hidden).toBe(false);
    expect(summaryFor("qty").hidden).toBe(true);
    expect(inputFor("qty").value).toBe("");
  });

  it("summarises a set filter and opens the full filter from the summary", () => {
    mount();
    api!.setFilterModel([{ colId: "region", filters: [{ type: FilterType.IN, values: ["North", "South"] }] }]);
    expect(summaryFor("region").textContent).toBe("(2) North, South");
    api!.setFilterModel([{ colId: "region", filters: [{ type: FilterType.NOT_IN, values: ["East"] }] }]);
    expect(summaryFor("region").textContent).toBe("All except (1) East");
    summaryFor("region").click();
    expect(document.querySelector(".pte-filter-root")).not.toBeNull();
  });

  it("opens the full filter from the operator button", () => {
    mount();
    const button = cellFor("name")!.querySelector<HTMLButtonElement>(".pte-floating-filter-button")!;
    expect(button.getAttribute("aria-label")).toBe("Open Name filter");
    expect(button.tabIndex).toBe(-1);
    button.click();
    expect(document.querySelector(".pte-filter-root")).not.toBeNull();
  });

  it("marks the button of a filtered column", () => {
    mount();
    const button = () => cellFor("name")!.querySelector(".pte-floating-filter-button")!;
    expect(button().classList.contains("pte-floating-filter-button-active")).toBe(false);
    api!.addFilterModel({ colId: "name", filters: [{ type: FilterType.CONTAINS, values: ["a"] }] });
    expect(button().classList.contains("pte-floating-filter-button-active")).toBe(true);
  });
});

describe("floating filter row — ARIA and keyboard", () => {
  it("is the second header row and shifts the body rows by one", () => {
    mount();
    const root = host.querySelector<HTMLElement>(".pte-root")!;
    expect(section("pte-header").getAttribute("aria-rowindex")).toBe("1");
    const center = section("pte-floating-filter");
    expect(center.getAttribute("role")).toBe("row");
    expect(center.getAttribute("aria-rowindex")).toBe("2");
    const cells = [...host.querySelectorAll<HTMLElement>(".pte-floating-filter-cell")];
    expect(center.getAttribute("aria-owns")!.split(" ")).toEqual(cells.map(c => c.id));
    expect(cells.map(c => c.getAttribute("role"))).toEqual(cells.map(() => "gridcell"));
    expect(cells.map(c => c.getAttribute("aria-colindex"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(inputFor("name").getAttribute("aria-label")).toBe("Name filter");

    const firstRow = host.querySelector<HTMLElement>(".pte-viewport .pte-row[data-view-idx='0']")!;
    expect(firstRow.getAttribute("aria-rowindex")).toBe("3");
    expect(root.getAttribute("aria-rowcount")).toBe("6");

    api!.updateGridOptions({ floatingFilter: false });
    expect(host.querySelector(".pte-viewport .pte-row[data-view-idx='0']")!.getAttribute("aria-rowindex")).toBe("2");
    expect(root.getAttribute("aria-rowcount")).toBe("5");
  });

  it("keeps keys typed in the row away from the grid, and Escape returns to the column header", () => {
    mount();
    const root = host.querySelector<HTMLElement>(".pte-root")!;
    const input = inputFor("qty");
    input.focus();
    const rootKeys = vi.fn();
    root.addEventListener("keydown", rootKeys);
    key(input, "ArrowLeft");
    expect(rootKeys).not.toHaveBeenCalled();
    key(input, "Escape");
    expect(document.activeElement).toBe(root);
    const header = host.querySelector<HTMLElement>(".pte-hcell-active");
    expect(header?.id).toBe((api!.getColumn("qty") as any).instanceID);
  });

  it("ArrowDown from the header cursor enters the floating input; ArrowUp comes back", () => {
    mount();
    const root = host.querySelector<HTMLElement>(".pte-root")!;
    root.focus();
    // Focus entering the root seeds the header cursor on the first column.
    key(root, "ArrowDown");
    expect(document.activeElement).toBe(inputFor("name"));
    key(inputFor("name"), "ArrowUp");
    expect(document.activeElement).toBe(root);
    expect(host.querySelector(".pte-hcell-active")?.id).toBe((api!.getColumn("name") as any).instanceID);
  });

  it("Alt+ArrowDown in an input opens the full filter", () => {
    mount();
    key(inputFor("name"), "ArrowDown", { altKey: true });
    expect(document.querySelector(".pte-filter-root")).not.toBeNull();
  });

  it("puts the controls in the grid's direction", () => {
    mount({ enableRtl: true });
    expect(inputFor("name").dir).toBe("rtl");
    expect(summaryFor("region").dir).toBe("rtl");
  });

  it("orders the controls for Tab in column order across sections", () => {
    mount({ columnDefs: columnDefs.map(c => c.colId === "region" ? { ...c, pinned: "left" } : c) });
    const focusables = [...host.querySelectorAll<HTMLElement>(".pte-floating-filter-row input, .pte-floating-filter-row select, .pte-floating-filter-row button")]
      .filter(el => el.tabIndex >= 0 && !(el as HTMLInputElement).hidden);
    const order = focusables.map(el => (api!.getColumns() as any[])
      .find(c => c.instanceID === el.closest<HTMLElement>(".pte-floating-filter-cell")!.dataset.colId)?.colId);
    expect(order).toEqual(["region", "name", "qty", "born", "active"]);
  });
});
