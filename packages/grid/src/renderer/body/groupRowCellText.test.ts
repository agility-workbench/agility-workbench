// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * A group row's non-label cell paints the group cell value rule as text: the aggregate, else the
 * column's groupValueGetter result formatted by the column. The label column keeps its label.
 */

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

const columnDefs: ColDef[] = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "name", key: "name", label: "Name" },
  {
    colId: "target", key: "target", label: "Target", type: ColumnType.NUMBER,
    groupValueGetter: ({ node }) => (node.groupKey === "EMEA" ? 1200 : 300),
    valueFormatter: ({ value }) => (value == null ? "" : `$${value}`),
  },
];

function mountGrid() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(columnDefs);
  api.setRowData([
    { id: "1", region: "EMEA", name: "A", target: 1 },
    { id: "2", region: "EMEA", name: "B", target: 2 },
    { id: "3", region: "APAC", name: "C", target: 3 },
  ]);
  api.setRowGroupColumns(["region"]);
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { core, root };
}

function cell(root: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  // A row slot renders one element per column section; the cell lives in exactly one of them.
  const rowEls = root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
  for (let i = 0; i < rowEls.length; i++) {
    const found = rowEls[i].querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
    if (found) return found;
  }
  throw new Error(`no cell at ${viewIdx}/${colIdx}`);
}

describe("group row cell text", () => {
  it("shows a column's formatted groupValueGetter value, and the label on the auto-group column", () => {
    const { core, root } = mountGrid();
    const leaves = core.getColumnModel().getLeaves();
    const autoIdx = leaves.findIndex(c => c.isAutoGroupColumn());
    const targetIdx = leaves.findIndex(c => c.colId === "target");
    const nameIdx = leaves.findIndex(c => c.colId === "name");
    const rm = core.getRowModel();
    const emeaIdx = Array.from({ length: rm.getViewCount() }, (_, i) => rm.getRowNodeAtViewIndex(i)!)
      .findIndex(n => n.isGroup && n.groupKey === "EMEA");
    expect(emeaIdx).toBeGreaterThanOrEqual(0);

    expect(cell(root, emeaIdx, targetIdx).textContent).toBe("$1200");
    expect(cell(root, emeaIdx, autoIdx).textContent).toContain("EMEA (2)");
    // A column with neither an aggregate nor a getter stays blank.
    expect(cell(root, emeaIdx, nameIdx).textContent).toBe("");
  });
});
