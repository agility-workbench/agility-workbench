// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { CanvasMeasurer } from "../renderer";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "600px";
  document.body.appendChild(host);
});

const columnDefs = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "amount", key: "amount", label: "Amount", type: ColumnType.NUMBER },
];

const rowData = [
  { id: 1, region: "EMEA", amount: 10 },
  { id: 2, region: "APAC", amount: 20 },
  { id: 3, region: "EMEA", amount: 30 },
];

function mount(extra: Record<string, unknown> = {}) {
  return createGrid(host, { rowIdKey: "id", columnDefs, rowData, ...extra });
}

describe("api.updateGridOptions", () => {
  it("changes only the options supplied, leaving the rest of the runtime slice alone", () => {
    const api = mount();
    const before = api.getCore().getOptions();
    expect(before.rowHover).toBe(true);
    expect(before.moveAfterEdit).toBe(true);

    api.updateGridOptions({ zebraRows: true });

    const after = api.getCore().getOptions();
    expect(after.zebraRows).toBe(true);
    // The renderer must receive the whole runtime slice, so the defaults it was not told about have
    // to survive the round trip — this is the regression the api's read-back-and-merge prevents.
    expect(after.rowHover).toBe(true);
    expect(after.moveAfterEdit).toBe(true);
    expect(after.editTrigger).toBe("doubleClick");
    expect(after.asyncTransactionWaitMs).toBe(16);

    api.destroy();
  });

  it("treats a property present with undefined as a reset, and an absent one as untouched", () => {
    const api = mount();
    api.updateGridOptions({
      getRowStyle: () => ({ opacity: "0.5" }),
      highlightActiveCell: true,
    });
    expect(host.innerHTML).toContain("opacity: 0.5");

    // Present-with-undefined clears the callback; highlightActiveCell is absent, so it stays on.
    api.updateGridOptions({ getRowStyle: undefined });
    expect(host.innerHTML).not.toContain("opacity: 0.5");
    expect(api.getCore().getOptions().highlightActiveCell).toBe(true);

    api.destroy();
  });

  it("adds, reconfigures, and removes renderer-owned widgets", () => {
    const api = mount();
    expect(host.querySelector(".pte-grid-toolbar")).toBeNull();

    api.updateGridOptions({ toolbar: { sorting: true } });
    expect(host.querySelector(".pte-grid-toolbar")).not.toBeNull();

    api.updateGridOptions({ toolbar: undefined });
    expect(host.querySelector(".pte-grid-toolbar")).toBeNull();

    api.updateGridOptions({ quickFilter: { mode: "always", debounceMs: 0 } });
    expect(host.querySelector(".pte-quick-filter-input")).not.toBeNull();

    api.destroy();
  });

  it("toggles pagination and its control layout in place", () => {
    const api = mount({ pageSize: 2 });
    expect(host.querySelector(".pte-pagination-nav")).toBeNull();

    api.updateGridOptions({ pagination: true });
    expect(host.querySelector(".pte-pagination-nav")).not.toBeNull();
    // The default layout carries the page-size control; the compact one below drops it.
    expect(host.querySelector(".pte-pagination-size-control")).not.toBeNull();

    api.updateGridOptions({ paginationControls: { controls: ["previousPage", "nextPage"] } });
    expect(host.querySelector(".pte-pagination-nav")).not.toBeNull();
    expect(host.querySelector(".pte-pagination-size-control")).toBeNull();

    api.updateGridOptions({ pagination: false });
    expect(host.querySelector(".pte-pagination-nav")).toBeNull();

    api.destroy();
  });

  it("swaps the pinned-row bands, and clears one without disturbing the other", () => {
    const api = mount();
    api.updateGridOptions({
      pinnedTopRowData: [{ id: "top", region: "Forecast", amount: 999 }],
      pinnedBottomRowData: [{ id: "bottom", region: "Total", amount: 60 }],
    });
    expect(host.textContent).toContain("Forecast");
    expect(host.textContent).toContain("Total");

    api.updateGridOptions({ pinnedTopRowData: [] });
    expect(host.textContent).not.toContain("Forecast");
    expect(host.textContent).toContain("Total");

    api.destroy();
  });

  it("reconfigures row-group presentation through the core", () => {
    const api = mount();
    api.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(api.getCore().getOptions().groupDisplayType ?? "singleColumn").toBe("singleColumn");

    api.updateGridOptions({ groupDisplayType: "groupRows", groupRowsSelectable: true });
    expect(api.getCore().getOptions().groupDisplayType).toBe("groupRows");
    expect(api.getCore().getOptions().groupRowsSelectable).toBe(true);

    api.updateGridOptions({ groupDisplayType: undefined });
    expect(api.getCore().getOptions().groupDisplayType).toBe("singleColumn");

    api.destroy();
  });

  it("replaces columnDefs as caller-owned, so later row data cannot re-infer the schema", () => {
    const api = mount();
    api.updateGridOptions({
      columnDefs: [{ colId: "region", key: "region", label: "Territory" }],
    });
    expect(host.textContent).toContain("Territory");
    expect(host.textContent).not.toContain("Amount");

    // A row shape with more fields must not resurrect a column: the schema is the caller's.
    api.setRowData([{ id: 9, region: "AMER", amount: 5, extra: "x" }]);
    expect(host.textContent).not.toContain("Amount");
    expect(host.textContent).not.toContain("extra");

    api.destroy();
  });

  it("ignores options that cannot change after creation, and says which", () => {
    const api = mount();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    api.updateGridOptions({ rowHeight: 80, zebraRows: true } as any);

    expect(api.getCore().getOptions().zebraRows).toBe(true);
    expect(api.getCore().getOptions().rowHeight).not.toBe(80);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("rowHeight");

    warn.mockRestore();
    api.destroy();
  });

  it("warns and does nothing when the grid has not been rendered yet", () => {
    const core = new GridCore(new CanvasMeasurer(), {});
    const api = new GridAPI(core);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    api.updateGridOptions({ zebraRows: true });

    expect(warn).toHaveBeenCalledWith(
      "updateGridOptions called before the grid was rendered; ignoring.",
    );
    expect(core.getOptions().zebraRows).not.toBe(true);

    warn.mockRestore();
    core.destroy();
  });
});

describe("api.getGroupNodes", () => {
  it("returns the group nodes at every level, and nothing when the grid is not grouped", () => {
    const api = mount();
    expect(api.getGroupNodes()).toEqual([]);

    api.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groups = api.getGroupNodes();
    expect(groups).toHaveLength(2);
    expect(groups.every(node => node.isGroup)).toBe(true);
    expect(groups.map(node => node.groupKey).sort()).toEqual(["APAC", "EMEA"]);

    // The row-data iterators walk data rows, so group nodes are reachable only through this call.
    const iterated: unknown[] = [];
    api.forEachNodeAfterFilterAndSort(node => iterated.push(node));
    expect(iterated).toHaveLength(3);

    api.destroy();
  });

  it("addresses a group node well enough to pin it", () => {
    const api = mount();
    const amount = api.getColumnModel().getByColId("amount");
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: amount ? [{ key: amount.instanceID, type: AggregateType.SUM }] : [],
    });
    api.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    const emea = api.getGroupNodes().find(node => node.groupKey === "EMEA");
    expect(emea).toBeDefined();
    api.setRowPinned(emea!.id, "bottom");
    expect(host.querySelector(".pte-pinned-row, .pte-pinned-bottom")).not.toBeNull();

    api.destroy();
  });
});
