// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

// The blank pivot canvas: pivot mode with no row group, no pivot column and no value displays
// nothing at all — not even the auto-group column and its "Total" row — and says so.

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

const ROWS = [
  { id: "1", region: "EMEA", quarter: "Q2", revenue: 10 },
  { id: "2", region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
];

function mountGrid(options: object = {}) {
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
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  api.setRowData(ROWS.map(r => ({ ...r })));
  return { container, core, api };
}

const overlay = (container: HTMLElement) =>
  container.querySelector(".pte-norows-overlay") as HTMLElement;
const headerLabels = (container: HTMLElement) =>
  [...container.querySelectorAll(".pte-hcell-label")].map(el => el.textContent);

describe("blank pivot canvas", () => {
  it("displays no columns and no rows when nothing is configured", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });

    expect(core.isPivotUnconfigured()).toBe(true);
    expect(core.getColumnModel().getLeaves()).toEqual([]);
    expect(core.getRowModel().getViewCount()).toBe(0);
    expect(headerLabels(container)).toEqual([]);
    expect(container.textContent).not.toContain("Total");
  });

  it("shows the blank-pivot message rather than a filter or no-data one", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });

    expect(overlay(container).classList.contains("hidden")).toBe(false);
    expect(overlay(container).textContent)
      .toBe("Add row groups, column labels or values to build the pivot");
  });

  it("honours a custom pivotEmptyMessage", () => {
    const { container, core } = mountGrid({ pivotEmptyMessage: "Drop fields here" });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(overlay(container).textContent).toBe("Drop fields here");
  });

  it("replaces a stale filter message when pivot mode is entered on an empty grid", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "quickFilterSet", text: "nothing-matches-this" } as any);
    expect(overlay(container).textContent).toContain("nothing-matches-this");

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(overlay(container).textContent)
      .toBe("Add row groups, column labels or values to build the pivot");
  });

  it("fills in as soon as a row group is added, and empties again when it is removed", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });

    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(core.isPivotUnconfigured()).toBe(false);
    expect(headerLabels(container).length).toBeGreaterThan(0);
    expect(core.getRowModel().getViewCount()).toBe(2);

    core.dispatch({ type: "rowGroupSet", colIds: [] });
    expect(core.isPivotUnconfigured()).toBe(true);
    expect(core.getColumnModel().getLeaves()).toEqual([]);
    expect(core.getRowModel().getViewCount()).toBe(0);
  });

  it("fills in from a value alone — the ungrouped Total row is a configured pivot", () => {
    const { core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });

    expect(core.isPivotUnconfigured()).toBe(false);
    expect(core.getRowModel().getViewCount()).toBe(1);
  });

  it("fills in from a pivot column alone, keeping the values hint", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });

    expect(core.isPivotUnconfigured()).toBe(false);
    expect(core.getRowModel().getViewCount()).toBe(1);
    const hint = container.querySelector(".pte-header-pivot-hint") as HTMLElement;
    expect(hint.classList.contains("visible")).toBe(true);
  });

  it("hides the no-values header hint while the canvas is blank", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });
    const hint = container.querySelector(".pte-header-pivot-hint") as HTMLElement;
    expect(hint.classList.contains("visible")).toBe(false);
  });

  it("restores the source layout on exit", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({ type: "pivotModeSet", on: false });

    expect(core.isPivotUnconfigured()).toBe(false);
    expect(headerLabels(container)).toEqual(["Region", "Quarter", "Revenue"]);
    expect(core.getRowModel().getViewCount()).toBe(3);
    expect(overlay(container).classList.contains("hidden")).toBe(true);
  });

  it("reports aria-colcount as unknown rather than an invalid 0", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(container.querySelector("[aria-colcount]")?.getAttribute("aria-colcount")).toBe("-1");
  });
});
