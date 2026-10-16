import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { AggregateType } from "../interfaces/aggregate";
import { GRAND_TOTAL_ROW_ID, groupFooterNodeId, groupNodeId } from "../csrm/rowGroup";
import { IRowNode } from "../interfaces/iRowNode";
import { GridOptions } from "../interfaces/gridOptions";
import { IServerSideDataSource } from "../interfaces/serverSide";

/**
 * Group footer rows (`groupTotalRow`) and the grand-total row (`grandTotalRow`) in the client-side
 * view list: where they sit, what they share with their group, and how pagination, sort, filter,
 * expansion and selection treat them.
 */

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "UK", sales: 20 },
  { id: "3", region: "EMEA", country: "France", sales: 5 },
  { id: "4", region: "APAC", country: "Japan", sales: 30 },
  { id: "5", region: "APAC", country: "Japan", sales: 40 },
  { id: "6", region: "APAC", country: "India", sales: 15 },
];

function makeGrid(options: Partial<GridOptions> = {}, groupBy: string[] = ["region"]) {
  const core = new GridCore(measurer, { rowIdKey: "id", groupDefaultExpanded: -1, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  core.setAggregateModel([{ key: salesId(core), type: AggregateType.SUM }]);
  if (groupBy.length) core.dispatch({ type: "rowGroupSet", colIds: groupBy });
  return core;
}

const salesId = (core: GridCore) => core.getColumnModel().getByColId("sales")!.instanceID;

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!);
  return out;
}

// A compact picture of the view: group headers as "G:key", footers as "F:key", the grand total as
// "GT", leaves by id.
const shape = (core: GridCore) => viewNodes(core).map(n =>
  n.grandTotal ? "GT" : n.footer ? `F:${n.groupKey}` : n.isGroup ? `G:${n.groupKey}` : n.id);

afterEach(() => vi.restoreAllMocks());

describe("group footer rows: the view list", () => {
  it("puts a bottom footer after the group's last row, sharing its key, level and aggregates", () => {
    const core = makeGrid({ groupTotalRow: "bottom" });
    expect(shape(core)).toEqual(["G:APAC", "4", "5", "6", "F:APAC", "G:EMEA", "1", "2", "3", "F:EMEA"]);
    const nodes = viewNodes(core);
    const apac = nodes[0];
    const footer = nodes[4];
    expect(footer).toMatchObject({
      id: groupFooterNodeId(apac.id),
      isGroup: true,
      footer: true,
      level: apac.level,
      groupKey: "APAC",
      expandable: false,
      parentId: apac.id,
    });
    expect(footer.groupNode).toBe(apac);
    // The same object, not a copy: a re-aggregation updates header and footer together.
    expect(footer.aggregateValues).toBe(apac.aggregateValues);
    expect(footer.aggregateValues?.[salesId(core)]).toBe(85);
    expect(footer.children).toBeUndefined();
  });

  it("puts a top footer directly under the header", () => {
    const core = makeGrid({ groupTotalRow: "top" });
    expect(shape(core)).toEqual(["G:APAC", "F:APAC", "4", "5", "6", "G:EMEA", "F:EMEA", "1", "2", "3"]);
  });

  it("gives every expanded level its own footer in a nested grouping", () => {
    const core = makeGrid({ groupTotalRow: "bottom" }, ["region", "country"]);
    expect(shape(core)).toEqual([
      "G:APAC", "G:India", "6", "F:India", "G:Japan", "4", "5", "F:Japan", "F:APAC",
      "G:EMEA", "G:France", "3", "F:France", "G:UK", "1", "2", "F:UK", "F:EMEA",
    ]);
    const japanFooter = viewNodes(core).find(n => n.footer && n.groupKey === "Japan")!;
    expect(japanFooter.level).toBe(1);
    expect(japanFooter.id).toBe(groupFooterNodeId(groupNodeId(["APAC", "Japan"])));
  });

  it("shows no footer for a collapsed group, and brings it back on expand", () => {
    const core = makeGrid({ groupTotalRow: "bottom" });
    const apacId = groupNodeId(["APAC"]);
    core.dispatch({ type: "groupToggleExpand", groupId: apacId, expanded: false });
    expect(shape(core)).toEqual(["G:APAC", "G:EMEA", "1", "2", "3", "F:EMEA"]);
    expect(core.getRowModel().getViewIndexInFullView!(groupFooterNodeId(apacId))).toBeUndefined();
    core.dispatch({ type: "groupToggleExpand", groupId: apacId, expanded: true });
    expect(shape(core)).toContain("F:APAC");
  });

  it("ignores expansion requests aimed at a footer", () => {
    const core = makeGrid({ groupTotalRow: "bottom" });
    const before = shape(core);
    core.dispatch({ type: "groupToggleExpand", groupId: groupFooterNodeId(groupNodeId(["APAC"])) });
    expect(shape(core)).toEqual(before);
    // setAllGroupsExpanded walks the group set, which holds no footers.
    expect(core.getRowModel().getGroupNodes().some(n => n.footer)).toBe(false);
  });

  it("counts footers in pagination and resolves their full-view index", () => {
    const core = makeGrid({ groupTotalRow: "bottom", pagination: true, pageSize: 4 });
    expect(core.getRowModel().getRowCount()).toBe(10);
    expect(core.getPaginationInfo().totalPageCount).toBe(3);
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 4 });
    // Page 2 = flat rows 4..7: F:APAC, G:EMEA, 1, 2.
    expect(shape(core)).toEqual(["F:APAC", "G:EMEA", "1", "2"]);
    const footerId = groupFooterNodeId(groupNodeId(["APAC"]));
    expect(core.getRowModel().getViewIndexInFullView!(footerId)).toBe(4);
    expect(core.getViewIndexForRowId(footerId)).toBe(0);
    expect(core.getRowModel().getRowNode(footerId)?.footer).toBe(true);
  });

  it("moves footers with their groups when the groups re-sort", () => {
    const core = makeGrid({ groupTotalRow: "bottom", groupColumnDef: { sortable: true } });
    const auto = core.getColumnModel().getHierarchyColumn()!;
    core.setSortModel([{ key: auto.instanceID, dir: "desc" }]);
    expect(shape(core)).toEqual(["G:EMEA", "1", "2", "3", "F:EMEA", "G:APAC", "4", "5", "6", "F:APAC"]);
  });

  it("follows the filter: a filtered-out group loses its footer, totals cover the matching rows", () => {
    const core = makeGrid({ groupTotalRow: "bottom", grandTotalRow: "bottom" });
    core.setQuickFilter("UK");
    expect(shape(core)).toEqual(["G:EMEA", "1", "2", "F:EMEA", "GT"]);
    const footer = viewNodes(core).find(n => n.footer && !n.grandTotal)!;
    expect(footer.aggregateValues?.[salesId(core)]).toBe(30);
    expect(viewNodes(core).at(-1)!.aggregateValues?.[salesId(core)]).toBe(30);
  });

  it("places the grand total first or last, over every filtered leaf regardless of the page", () => {
    const bottom = makeGrid({ grandTotalRow: "bottom", pagination: true, pageSize: 3 });
    expect(bottom.getRowModel().getRowCount()).toBe(9);
    bottom.dispatch({ type: "paginationSet", enabled: true, pageIndex: 2, pageSize: 3 });
    const last = viewNodes(bottom).at(-1)!;
    expect(last).toMatchObject({ id: GRAND_TOTAL_ROW_ID, footer: true, grandTotal: true, level: 0 });
    expect(last.groupNode).toBeUndefined();
    expect(last.aggregateValues?.[salesId(bottom)]).toBe(120);

    const top = makeGrid({ grandTotalRow: "top" });
    expect(shape(top)[0]).toBe("GT");
    expect(shape(top)).toHaveLength(9);
  });

  it("adds nothing without a row grouping, nor under tree data", () => {
    const flat = makeGrid({ groupTotalRow: "bottom", grandTotalRow: "bottom" }, []);
    expect(shape(flat)).toEqual(["1", "2", "3", "4", "5", "6"]);
    const tree = new GridCore(measurer, {
      rowIdKey: "id",
      groupTotalRow: "bottom",
      grandTotalRow: "top",
      groupDefaultExpanded: -1,
      treeData: { mode: "path", getPath: (row: any) => row.path },
    });
    tree.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
    tree.setRowData([{ id: "a", path: ["a"], n: 1 }, { id: "b", path: ["a", "b"], n: 2 }]);
    expect(viewNodes(tree).some(n => n.footer)).toBe(false);
  });

  it("keeps footers out of leaf iteration and the hierarchy", () => {
    const core = makeGrid({ groupTotalRow: "bottom", grandTotalRow: "top" });
    const visited: string[] = [];
    core.getRowModel().forEachDataNodeInDisplayOrder!(n => visited.push(n.id));
    expect(visited).toEqual(["4", "5", "6", "1", "2", "3"]);
    const roots = core.getRowModel().getHierarchyRoots!();
    const walk = (nodes: IRowNode[]): boolean => nodes.some(n => n.footer || walk(n.children ?? []));
    expect(walk(roots)).toBe(false);
  });
});

describe("group footer rows: labels", () => {
  it("labels footers 'Total <group>' without the count, and the grand total 'Grand Total'", () => {
    const core = makeGrid({ groupTotalRow: "bottom", grandTotalRow: "bottom" });
    const nodes = viewNodes(core);
    expect(core.getGroupRowLabel(nodes[0])).toBe("APAC (3)");
    expect(core.getGroupRowLabel(nodes.find(n => n.footer && !n.grandTotal)!)).toBe("Total APAC");
    expect(core.getGroupRowLabel(nodes.at(-1)!)).toBe("Grand Total");
    // groupChildCount describes the header row only.
    const counted = makeGrid({ groupTotalRow: "bottom", groupChildCount: () => 99 });
    expect(core.getGroupRowLabel(viewNodes(counted).find(n => n.footer)!)).toBe("Total APAC");
  });

  it("uses groupTotalRowLabel, with the group, the default text and the aggregates by colId", () => {
    const calls: any[] = [];
    const core = makeGrid({
      groupTotalRow: "bottom",
      grandTotalRow: "bottom",
      groupTotalRowLabel: params => {
        calls.push(params);
        return params.grandTotal ? "All regions" : `${params.groupLabel} subtotal: ${params.aggregates.sales}`;
      },
    });
    const nodes = viewNodes(core);
    const footer = nodes.find(n => n.footer && !n.grandTotal)!;
    expect(core.getGroupRowLabel(footer)).toBe("APAC subtotal: 85");
    expect(core.getGroupRowLabel(nodes.at(-1)!)).toBe("All regions");
    const footerCall = calls.find(c => c.node === footer);
    expect(footerCall).toMatchObject({ groupNode: nodes[0], grandTotal: false, defaultLabel: "Total APAC" });
    const auto = core.getColumnModel().getHierarchyColumn()!;
    expect(core.getGroupCellValue(auto, footer).formatted).toBe("APAC subtotal: 85");
  });

  it("reads a footer cell as its group's aggregate", () => {
    const core = makeGrid({ groupTotalRow: "bottom" });
    const nodes = viewNodes(core);
    const sales = core.getColumnModel().getByColId("sales")!;
    const footer = nodes.find(n => n.footer)!;
    expect(core.getGroupCellValue(sales, footer)).toEqual(core.getGroupCellValue(sales, nodes[0]));
    expect(core.getNodeCellValue(sales, footer)).toBe(85);
  });
});

describe("group footer rows: selection and editing", () => {
  it("never checks a footer, and leaves footers out of subtree and select-all targets", () => {
    const core = makeGrid({
      groupTotalRow: "bottom",
      grandTotalRow: "bottom",
      groupSelectsChildren: true,
      rowSelection: { mode: "multiple", checkboxes: true },
    });
    const nodes = viewNodes(core);
    const footerIdx = nodes.findIndex(n => n.footer && !n.grandTotal);
    expect(core.isSubtreeSelectionRow(footerIdx)).toBe(false);
    expect(core.getRowSelectionTargetsAtViewIndex(footerIdx)).toBeNull();
    expect(core.getRowSelectionTargetsAtViewIndex(0)!.sort()).toEqual(["4", "5", "6"]);
    core.selectAllRows();
    expect([...core.getSelectedRowIds()].sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    core.selectRowsById([nodes[footerIdx].id, GRAND_TOTAL_ROW_ID], "add");
    expect(core.getSelectedRowIds().has(nodes[footerIdx].id)).toBe(false);
    expect(core.getSelectedRows()).toHaveLength(6);
  });

  it("stops the cell cursor on footers exactly where it stops on group rows", () => {
    const skip = makeGrid({ groupTotalRow: "bottom" });
    // Row 3 is APAC's last leaf; down skips the footer and the EMEA header to leaf "1".
    skip.dispatch({ type: "focusSet", viewIdx: 3, colIdx: 1, reason: "api" } as any);
    skip.dispatch({ type: "navigate", dir: "down" } as any);
    expect(skip.getRowIdAtViewIndex(skip.getActiveCell()!.row)).toBe("1");

    const stop = makeGrid({ groupTotalRow: "bottom", groupRowsSelectable: true });
    stop.dispatch({ type: "focusSet", viewIdx: 3, colIdx: 1, reason: "api" } as any);
    stop.dispatch({ type: "navigate", dir: "down" } as any);
    expect(stop.getRowModel().getRowNodeAtViewIndex(stop.getActiveCell()!.row)?.footer).toBe(true);
  });

  it("never edits a footer cell", () => {
    const core = makeGrid({ groupTotalRow: "bottom", groupRowsSelectable: true });
    const footer = viewNodes(core).find(n => n.footer)!;
    const sales = core.getColumnModel().getByColId("sales")!;
    core.dispatch({ type: "editStart", cell: { rowId: footer.id, colId: sales.instanceID } } as any);
    expect(core.getEditingCell?.() ?? null).toBeNull();
  });
});

describe("group footer rows: options", () => {
  it("can be switched at runtime, keeping expansion and row selection", () => {
    const core = makeGrid({}, ["region"]);
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]), expanded: false });
    core.selectRowsById(["4"]);
    expect(shape(core).some(s => s.startsWith("F:"))).toBe(false);

    core.setGroupTotalRows({ groupTotalRow: "bottom", grandTotalRow: "top" });
    expect(shape(core)).toEqual(["GT", "G:APAC", "4", "5", "6", "F:APAC", "G:EMEA"]);
    expect([...core.getSelectedRowIds()]).toEqual(["4"]);

    // Presence-based: omitting grandTotalRow keeps it.
    core.setGroupTotalRows({ groupTotalRow: "top" });
    expect(shape(core)).toEqual(["GT", "G:APAC", "F:APAC", "4", "5", "6", "G:EMEA"]);
    core.setGroupTotalRows({ groupTotalRow: undefined, grandTotalRow: undefined });
    expect(shape(core)).toEqual(["G:APAC", "4", "5", "6", "G:EMEA"]);
  });

  it("treats an unknown position as no footer", () => {
    const core = makeGrid({ groupTotalRow: "middle" as any });
    expect(core.getOptions().groupTotalRow).toBeUndefined();
    expect(shape(core).some(s => s.startsWith("F:"))).toBe(false);
  });

  it("warns once on the server-side row model and ignores the options", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        const rows = request.groupKeys.length < request.groupBy.length
          ? [{ region: "APAC" }, { region: "EMEA" }]
          : ROWS.filter(r => request.groupKeys.every(k => (r as any)[k.key] === k.value));
        success({ rows: rows.map(r => ({ ...r })), totalRows: rows.length });
      },
    };
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      serverSideDataSource: source,
      groupTotalRow: "bottom",
      grandTotalRow: "bottom",
    });
    core.setColumnDefsFromProps([{ colId: "region", key: "region", label: "Region", type: ColumnType.STRING }]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.setGroupTotalRows({ groupTotalRow: "top" });
    const footerWarnings = warn.mock.calls.filter(call => String(call[0]).includes("groupTotalRow"));
    expect(footerWarnings).toHaveLength(1);
    for (let i = 0; i < core.getRowModel().getViewCount(); i++) {
      expect(core.getRowModel().getRowNodeAtViewIndex(i)?.footer).toBeFalsy();
    }
  });
});
