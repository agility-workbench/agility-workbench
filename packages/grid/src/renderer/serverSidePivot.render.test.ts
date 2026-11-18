// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource, IServerSidePivotField } from "../interfaces/serverSide";
import { initDomRenderer } from "./dom";

// Server-side pivot, painted end to end: the header the server's pivotFields declare, group rows
// carrying the server's values, and no chevron on the deepest level — the same paint as the
// client-side pivot, from a data source.

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

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

// Pre-aggregated, as a server would answer: EMEA Q1 = 20, Q2 = 10; APAC Q1 = 5, Q2 = 40.
const FIELDS: IServerSidePivotField[] = [
  { field: "q2_sum", pivotKeys: ["Q2"], valueKey: "revenue", aggregate: "sum" },
  { field: "q1_sum", pivotKeys: ["Q1"], valueKey: "revenue", aggregate: "sum" },
];
const GROUP_ROWS = [
  { region: "EMEA", q1_sum: 20, q2_sum: 10 },
  { region: "APAC", q1_sum: 5, q2_sum: 40 },
];

const source: IServerSideDataSource = {
  getRows: ({ request, success }) => {
    if (!request.pivot) {
      success({ rows: [], totalRows: 0 });
      return;
    }
    success({ rows: GROUP_ROWS.map(r => ({ ...r })), totalRows: GROUP_ROWS.length, pivotFields: FIELDS });
  },
};

async function mountPivotedGrid() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "serverSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource(source);
  await flush();
  core.dispatch({ type: "pivotModeSet", on: true });
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
  core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
  await flush();
  return container;
}

function bodyRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row")]
    .filter(r => r.getAttribute("data-view-idx") != null);
}

const headerTexts = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>(".pte-hcell-label")].map(el => el.textContent ?? "");

describe("server-side pivot rendering", () => {
  it("paints the declared header in the grid's order and the server's values on group rows", async () => {
    const container = await mountPivotedGrid();

    const titles = headerTexts(container);
    expect(titles.indexOf("Q1")).toBeGreaterThan(-1);
    expect(titles.indexOf("Q1")).toBeLessThan(titles.indexOf("Q2"));
    expect(titles.filter(t => t === "Revenue")).toHaveLength(2);
    expect(titles).not.toContain("Region");

    const rows = bodyRows(container);
    expect(rows).toHaveLength(2);
    const [emea, apac] = rows;
    expect(emea.textContent).toContain("EMEA");
    expect(emea.textContent).toMatch(/20.*10/);
    expect(apac.textContent).toContain("APAC");
    expect(apac.textContent).toMatch(/5.*40/);
  });

  it("draws no chevron on the deepest level", async () => {
    const container = await mountPivotedGrid();
    for (const row of bodyRows(container)) {
      expect(row.querySelector(".pte-group-toggle")).toBeNull();
      expect(row.hasAttribute("aria-expanded")).toBe(false);
    }
  });
});
