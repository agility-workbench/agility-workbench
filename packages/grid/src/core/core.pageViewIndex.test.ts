/**
 * `getPageViewIndex` translates a node into the current page's view space whatever space its row
 * model stamped on `viewIndex` — the sticky ancestor stack's index space (A2.8): client-side
 * grouped views stamp the whole flattened list, the body's slots are page-relative.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { IServerSideGetRowsParams } from "../interfaces/serverSide";

const measurer = { measure: (text: string) => text.length * 7 };

// 3 groups × 10 rows, all expanded: A(0) a0..a9(1-10) | B(11) b0..b9(12-21) | C(22) c0..c9(23-32).
// Page size 12 → page 2 holds flat 12..23: b0..b9, C, c0.
const ROWS = ["A", "B", "C"].flatMap(group =>
  Array.from({ length: 10 }, (_, i) => ({ id: `${group.toLowerCase()}${i}`, group, name: `${group} ${i}` })));

function makeGrid(options: Record<string, unknown> = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    groupDisplayType: "groupRows",
    pagination: true,
    pageSize: 12,
    pageSizes: [12],
    ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "group", key: "group", label: "Group" },
    { colId: "name", key: "name", label: "Name" },
  ]);
  return core;
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

describe("GridCore getPageViewIndex", () => {
  it("client-side grouped, page 2: the first row's group header from page 1 is just above the page", () => {
    const core = makeGrid();
    core.setRowData(ROWS);
    core.dispatch({ type: "rowGroupSet", colIds: ["group"] });
    core.dispatch({ type: "groupSetExpanded", expanded: true });
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 12 });

    const model = core.getRowModel();
    const first = model.getRowNodeAtViewIndex(0)!;
    expect(first.id).toBe("b0");
    const groupB = model.getRowNode(first.parentId!)!;
    // The stamp is dataset-wide; the page space puts the header one slot above the page.
    expect(groupB.viewIndex).toBe(11);
    expect(core.getPageViewIndex(groupB)).toBe(-1);
    expect(core.getPageViewIndex(first)).toBe(0);
    const groupC = model.getRowNodeAtViewIndex(10)!;
    expect(groupC.isGroup).toBe(true);
    expect(core.getPageViewIndex(groupC)).toBe(10);
    // A row on page 1 is far above; collapsed-away rows hold no slot.
    expect(core.getPageViewIndex(model.getRowNode("a0")!)).toBe(1 - 12);
    core.dispatch({ type: "groupSetExpanded", expanded: false, groupIds: [groupB.id] });
    expect(core.getPageViewIndex(model.getRowNode("b3")!)).toBeUndefined();
  });

  it("client-side flat: the stamp is already page-local", () => {
    const core = makeGrid();
    core.setRowData(ROWS);
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 12 });
    const node = core.getRowModel().getRowNodeAtViewIndex(3)!;
    expect(core.getPageViewIndex(node)).toBe(3);
  });

  it("server-side grouped, page 2: an ancestor on page 1 is negative too", async () => {
    const core = makeGrid({ rowModelType: "serverSide", serverSideBlockSize: 50, groupDefaultExpanded: -1 });
    core.setServerSideDataSource({
      getRows: ({ request, success }: IServerSideGetRowsParams) => {
        const rows = request.groupKeys.length === 0 && request.groupBy.length > 0
          ? ["A", "B", "C"].map(group => ({ group }))
          : ROWS.filter(row => row.group === request.groupKeys[0]?.value);
        success({ rows: rows.slice(request.startRow ?? 0, request.endRow ?? rows.length), totalRows: rows.length });
      },
    });
    core.dispatch({ type: "rowGroupSet", colIds: ["group"] });
    await flush();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 12 });
    await flush();
    const model = core.getRowModel();
    const first = model.getRowNodeAtViewIndex(0)!;
    expect(first.id).toBe("b0");
    expect(core.getPageViewIndex(model.getRowNode(first.parentId!)!)).toBe(-1);
  });
});
