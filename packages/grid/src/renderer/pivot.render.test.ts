// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

// Pivot mode, painted end to end: the generated header (nested pivot-value groups over value
// leaves), group rows carrying pivot cells via aggregateValues[instanceID], no chevron on the
// non-expandable deepest level, and a clean exit back to the source layout.

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
  { id: "4", region: "APAC", quarter: "Q2", revenue: 40 },
];

function mountGrid() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id" });
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

function enterPivot(core: GridCore) {
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  core.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
  });
  core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
  core.dispatch({ type: "pivotModeSet", on: true });
}

function bodyRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row")]
    .filter(r => r.getAttribute("data-view-idx") != null);
}

const headerTexts = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>(".pte-hcell-label")].map(el => el.textContent ?? "");

describe("pivot rendering", () => {
  it("paints the generated header and pivot values on group rows", () => {
    const { container, core } = mountGrid();
    enterPivot(core);

    // Header: auto-group column + Q1/Q2 pivot-value groups, each holding a Revenue leaf.
    const titles = headerTexts(container);
    expect(titles).toContain("Q1");
    expect(titles).toContain("Q2");
    expect(titles.filter(t => t === "Revenue")).toHaveLength(2);
    expect(titles).not.toContain("Region"); // non-participating source columns hidden

    // Body: two group rows, values under the generated leaves.
    const rows = bodyRows(container);
    expect(rows).toHaveLength(2);
    const [apac, emea] = rows;
    expect(apac.textContent).toContain("APAC (2)");
    expect(apac.textContent).toContain("5");
    expect(apac.textContent).toContain("40");
    expect(emea.textContent).toContain("EMEA (2)");
    expect(emea.textContent).toContain("20");
    expect(emea.textContent).toContain("10");
  });

  it("renders no chevron on the non-expandable deepest level and no row aria-expanded", () => {
    const { container, core } = mountGrid();
    enterPivot(core);
    const rows = bodyRows(container);
    for (const row of rows) {
      expect(row.querySelector(".pte-group-toggle")).toBeNull();
      expect(row.querySelector(".pte-tree-toggle-spacer")).not.toBeNull();
      expect(row.hasAttribute("aria-expanded")).toBe(false);
      expect(row.getAttribute("aria-level")).toBe("1");
    }
  });

  it("keeps upper group levels expandable while pivoted", () => {
    const { container, core } = mountGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "quarter"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({ type: "groupSetExpanded", expanded: true });

    const rows = bodyRows(container);
    // 2 regions × (1 header + 2 quarter subgroups) = 6 rows, no leaves.
    expect(rows).toHaveLength(6);
    const level0 = rows.filter(r => r.getAttribute("aria-level") === "1");
    expect(level0).toHaveLength(2);
    for (const row of level0) {
      expect(row.querySelector(".pte-group-toggle")).not.toBeNull();
      expect(row.getAttribute("aria-expanded")).toBe("true");
    }
    const level1 = rows.filter(r => r.getAttribute("aria-level") === "2");
    expect(level1).toHaveLength(4);
    for (const row of level1) {
      expect(row.querySelector(".pte-group-toggle")).toBeNull();
      expect(row.hasAttribute("aria-expanded")).toBe(false);
    }
  });

  it("exits pivot back to the source header and leaf rows", () => {
    const { container, core } = mountGrid();
    enterPivot(core);
    core.dispatch({ type: "pivotModeSet", on: false });
    core.dispatch({ type: "rowGroupSet", colIds: [] });

    const titles = headerTexts(container);
    expect(titles).toEqual(expect.arrayContaining(["Region", "Quarter", "Revenue"]));
    expect(titles).not.toContain("Q1");
    expect(bodyRows(container)).toHaveLength(4);
  });
});
