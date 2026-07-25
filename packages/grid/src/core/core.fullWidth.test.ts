/**
 * Full-width row support: the core `isFullWidthNode` predicate and resolution of the new
 * `isFullWidthRow` / `fullWidthCellRenderer` options.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { GridOptions, InternalGridOptions } from "../interfaces/gridOptions";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", sales: 10 },
  { id: "2", region: "EMEA", sales: 20 },
  { id: "3", region: "APAC", sales: 30 },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  return core;
}

function groupNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) {
    const n = rm.getRowNodeAtViewIndex(i)!;
    if (n.isGroup) out.push(n);
  }
  return out;
}
function leafNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) {
    const n = rm.getRowNodeAtViewIndex(i)!;
    if (!n.isGroup) out.push(n);
  }
  return out;
}

describe("option resolution", () => {
  const resolved = (o: GridOptions = {}): InternalGridOptions =>
    new GridCore(measurer, o).getOptions() as InternalGridOptions;

  it("defaults isFullWidthRow / fullWidthCellRenderer to undefined", () => {
    const o = resolved();
    expect(o.isFullWidthRow).toBeUndefined();
    expect(o.fullWidthCellRenderer).toBeUndefined();
  });

  it("passes through the callbacks when supplied", () => {
    const isFullWidthRow = (n: IRowNode) => !!n.data?.spacer;
    const fullWidthCellRenderer = () => "x";
    const o = resolved({ isFullWidthRow, fullWidthCellRenderer });
    expect(o.isFullWidthRow).toBe(isFullWidthRow);
    expect(o.fullWidthCellRenderer).toBe(fullWidthCellRenderer);
  });
});

describe("isFullWidthNode", () => {
  it("is false for a null node", () => {
    const core = makeGrid();
    expect(core.isFullWidthNode(null)).toBe(false);
  });

  it("treats group rows as full-width only in groupRows display mode", () => {
    const single = makeGrid({ groupDisplayType: "singleColumn" });
    single.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(groupNodes(single).every(n => single.isFullWidthNode(n))).toBe(false);

    const groupRows = makeGrid({ groupDisplayType: "groupRows" });
    groupRows.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groups = groupNodes(groupRows);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every(n => groupRows.isFullWidthNode(n))).toBe(true);
    // Leaf rows are never full-width from grouping alone.
    groupRows.dispatch({ type: "groupToggleExpand", groupId: groups[0].id });
    expect(leafNodes(groupRows).every(n => !groupRows.isFullWidthNode(n))).toBe(true);
  });

  it("honors the isFullWidthRow callback for leaf rows", () => {
    const core = makeGrid({ isFullWidthRow: (n: IRowNode) => n.data?.region === "APAC" });
    const leaves = leafNodes(core);
    const apac = leaves.filter(n => core.isFullWidthNode(n));
    expect(apac.length).toBe(1);
    expect(apac[0].data.region).toBe("APAC");
  });
});
