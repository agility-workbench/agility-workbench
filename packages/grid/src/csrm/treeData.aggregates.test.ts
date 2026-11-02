/**
 * Client-side tree data: aggregation on tree parents (#82) and `filterIncludesDescendants` (#83).
 *
 * A parent — a real data row with children or a synthetic path prefix — aggregates every column
 * with a configured aggregate over the leaves of the FILTERED tree under it (kept rows with no kept
 * children), through the same calculator as row groups. In an aggregated column the aggregate
 * replaces the parent's own value on every read (`getGroupCellValue`, `getNodeCellValue`,
 * `api.getCellValue`); other columns keep the row's own data.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { GridAPI } from "../api/api";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import { FilterType } from "../interfaces/filter";
import type { GridOptions, TreeDataOptions } from "../interfaces/gridOptions";
import type { IRowNode } from "../interfaces/iRowNode";
import { buildTreeData } from "./treeData";
import { serializeNodesToTSV } from "../renderer/clipboard/tsv";

const measurer = { measure: (text: string) => text.length * 7 };

const COLUMNS: ColDef[] = [
  { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  { colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER, aggFunc: "sum" },
  { colId: "owner", key: "owner", label: "Owner", type: ColumnType.STRING },
];

function createTree(
  treeData: TreeDataOptions,
  rows: object[],
  options: Partial<GridOptions> = {},
  columns: ColDef[] = COLUMNS,
) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    groupDefaultExpanded: -1,
    treeData,
    ...options,
  } as GridOptions);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(structuredClone(rows));
  core.setColumnDefsFromProps(columns);
  return core;
}

const col = (core: GridCore, colId: string) => core.getColumnModel().getByColId(colId)!;
const node = (core: GridCore, id: string) => core.getRowModel().getRowNode(id)!;
const size = (core: GridCore, id: string) => core.getNodeCellValue(col(core, "size"), node(core, id));

function view(core: GridCore): IRowNode[] {
  const model = core.getRowModel();
  return Array.from({ length: model.getViewCount() }, (_, i) => model.getRowNodeAtViewIndex(i)!);
}

function filterName(core: GridCore, text: string) {
  const name = col(core, "name");
  core.setFilterModel([{ col: name, key: name.key, filters: [{ type: FilterType.CONTAINS, values: [text] }] }]);
}

// Docs (synthetic) > Work (real, own size 100) > a (10), b (20); Docs > c (5).
const PATH_ROWS = [
  { id: "work", name: "Work", size: 100, owner: "ann", path: ["Docs", "Work"] },
  { id: "a", name: "alpha", size: 10, owner: "bob", path: ["Docs", "Work", "a"] },
  { id: "b", name: "beta", size: 20, owner: "cy", path: ["Docs", "Work", "b"] },
  { id: "c", name: "gamma", size: 5, owner: "dee", path: ["Docs", "c"] },
];
const PATH: TreeDataOptions = { mode: "path", getPath: (row: any) => row.path };
const DOCS = "t:path:Docs";

const PARENT_ROWS = [
  { id: "docs", parentId: null, name: "Docs", size: 1 },
  { id: "work", parentId: "docs", name: "Work", size: 100 },
  { id: "a", parentId: "work", name: "alpha", size: 10 },
  { id: "b", parentId: "work", name: "beta", size: 20 },
  { id: "c", parentId: "docs", name: "gamma", size: 5 },
];

const CHILDREN_ROWS = [
  {
    id: "docs", name: "Docs", size: 1, children: [
      { id: "work", name: "Work", size: 100, children: [
        { id: "a", name: "alpha", size: 10 },
        { id: "b", name: "beta", size: 20 },
      ] },
      { id: "c", name: "gamma", size: 5 },
    ],
  },
];

describe("tree data: aggregates on parents", () => {
  it("path mode: synthetic prefixes and real parents aggregate their leaves only", () => {
    const core = createTree(PATH, PATH_ROWS);
    // Work's own 100 is replaced by its leaves' sum; Docs sums the leaves a, b, c — not Work.
    expect(size(core, "work")).toBe(30);
    expect(size(core, DOCS)).toBe(35);
    expect(node(core, DOCS).isGroup).toBe(true);
    expect(node(core, "work").isGroup).toBe(false);
    // Leaves keep their own value and carry no aggregates.
    expect(size(core, "a")).toBe(10);
    expect(node(core, "a").aggregateValues).toBeUndefined();
    // A column without an aggregate keeps the parent's own data.
    expect(core.getNodeCellValue(col(core, "owner"), node(core, "work"))).toBe("ann");
    expect(core.getNodeCellValue(col(core, "owner"), node(core, DOCS))).toBeUndefined();
  });

  it("parent mode: real parents at every level", () => {
    const core = createTree({ mode: "parent", getParentId: (row: any) => row.parentId }, PARENT_ROWS);
    expect(size(core, "docs")).toBe(35);
    expect(size(core, "work")).toBe(30);
    expect(size(core, "c")).toBe(5);
  });

  it("children mode: real parents at every level", () => {
    const core = createTree({ mode: "children", getChildren: (row: any) => row.children }, CHILDREN_ROWS);
    expect(size(core, "docs")).toBe(35);
    expect(size(core, "work")).toBe(30);
  });

  it("a tree of leaves only carries no aggregates", () => {
    const core = createTree({ mode: "parent", getParentId: () => null }, [
      { id: "x", name: "x", size: 1 },
      { id: "y", name: "y", size: 2 },
    ]);
    expect(view(core).every(n => n.aggregateValues === undefined)).toBe(true);
    expect(size(core, "x")).toBe(1);
  });

  it("carries nothing when no column has an aggregate", () => {
    const core = createTree(PATH, PATH_ROWS, {}, COLUMNS.map(c => ({ ...c, aggFunc: undefined })));
    expect(node(core, "work").aggregateValues).toBeUndefined();
    expect(size(core, "work")).toBe(100);
  });

  it("follows the aggregate model: a new function, then none", () => {
    const core = createTree(PATH, PATH_ROWS);
    core.setAggregateModel([{ key: col(core, "size").instanceID, type: AggregateType.MAX }]);
    expect(size(core, "work")).toBe(20);
    expect(size(core, DOCS)).toBe(20);
    core.setAggregateModel([]);
    expect(size(core, "work")).toBe(100);
    expect(node(core, DOCS).aggregateValues).toBeUndefined();
  });

  it("counts, first and last follow the display order", () => {
    const core = createTree(PATH, PATH_ROWS, {}, [
      COLUMNS[0],
      { colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER, aggFunc: "first" },
      { colId: "owner", key: "owner", label: "Owner", type: ColumnType.STRING, aggFunc: "count" },
    ]);
    expect(size(core, "work")).toBe(10);
    expect(core.getNodeCellValue(col(core, "owner"), node(core, DOCS))).toBe(3);
    core.setSortModel([{ key: "size", dir: "desc" }]);
    expect(size(core, "work")).toBe(20);
  });

  it("runs custom aggFuncs with the leaf nodes", () => {
    const seen: string[][] = [];
    const core = createTree(PATH, PATH_ROWS, {
      aggFuncs: {
        range: ({ values, rows }) => {
          seen.push(rows.map(r => r.id));
          const nums = values as number[];
          return Math.max(...nums) - Math.min(...nums);
        },
      },
    }, [
      COLUMNS[0],
      { colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER, aggFunc: "range" },
    ]);
    expect(size(core, "work")).toBe(10);
    expect(size(core, DOCS)).toBe(15);
    expect(seen).toContainEqual(["a", "b"]);
    expect(seen).toContainEqual(["a", "b", "c"]);
  });

  it("excludes leaves the filters drop, and a matching parent with no kept children counts itself", () => {
    const core = createTree(PATH, PATH_ROWS);
    filterName(core, "alpha");
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work", "a"]);
    expect(size(core, "work")).toBe(10);
    expect(size(core, DOCS)).toBe(10);

    // Only Work matches: its children are dropped, so it is a leaf of the filtered tree with its
    // own value, and Docs totals that.
    filterName(core, "Work");
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work"]);
    expect(node(core, "work").aggregateValues).toBeUndefined();
    expect(size(core, "work")).toBe(100);
    expect(size(core, DOCS)).toBe(100);

    core.setFilterModel([]);
    expect(size(core, DOCS)).toBe(35);
  });

  it("recomputes on transactions and new row data", () => {
    const core = createTree(PATH, PATH_ROWS);
    core.applyTransaction({
      update: [{ rowId: "b", row: { ...PATH_ROWS[2], size: 25 } }],
      add: [{ id: "d", name: "delta", size: 7, path: ["Docs", "Work", "d"] }],
    });
    expect(size(core, "work")).toBe(42);
    expect(size(core, DOCS)).toBe(47);
    core.applyTransaction({ remove: ["a"] });
    expect(size(core, "work")).toBe(32);
    core.setRowData(PATH_ROWS.map(r => ({ ...r })));
    expect(size(core, "work")).toBe(30);
  });

  it("the footer aggregate row totals the filtered tree's leaves, like the root parents", () => {
    const core = createTree(PATH, PATH_ROWS);
    core.setAggregateScope("all");
    const footer = () => core.getRowModel().getAggregateValues().get(col(core, "size").instanceID);
    expect(footer()).toBe(35);
    filterName(core, "alpha");
    expect(footer()).toBe(10);
  });

  it("reads the same through getGroupCellValue and api.getCellValue", () => {
    const core = createTree(PATH, PATH_ROWS, {}, [
      COLUMNS[0],
      {
        colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER, aggFunc: "sum",
        valueFormatter: ({ value }) => (value == null ? "" : `${value} KB`),
      },
      COLUMNS[2],
    ]);
    const api = new GridAPI(core);
    expect(core.getGroupCellValue(col(core, "size"), node(core, "work"))).toEqual({ value: 30, formatted: "30 KB" });
    expect(api.getCellValue({ rowId: "work", colId: "size" })).toBe(30);
    expect(api.getCellValue({ rowId: DOCS, colId: "size" })).toBe(35);
    expect(api.getCellValue({ rowId: "work", colId: "owner" })).toBe("ann");
    expect(api.getCellValue({ rowId: "a", colId: "size" })).toBe(10);
  });
});

describe("tree data: other surfaces read a parent's aggregate", () => {
  // Needs renderer/clipboard/tsv.ts `cellText` to branch on `readsGroupCellValue(col, node)`
  // instead of `node.isGroup` (clipboard-owned file); unskip once that lands.
  it("a copy of a parent's aggregated cell writes the aggregate", () => {
    const core = createTree(PATH, PATH_ROWS);
    const cols = [col(core, "name"), col(core, "size"), col(core, "owner")];
    const tsv = serializeNodesToTSV(
      cols, [node(core, "work"), node(core, "a")], false, (c, n) => core.getGroupCellValue(c, n),
    );
    expect(tsv.split("\n")[0].split("\t").slice(1)).toEqual(["30", "ann"]);
    expect(tsv.split("\n")[1].split("\t").slice(1)).toEqual(["10", "bob"]);
  });

  it("find matches the aggregate a parent shows, not its hidden own value", () => {
    const core = createTree(PATH, PATH_ROWS, { quickFilter: { behavior: "find" } });
    core.dispatch({ type: "quickFilterSet", text: "100" });
    expect(core.getFindState().matchCount).toBe(0);
    core.dispatch({ type: "quickFilterSet", text: "30" });
    const match = core.findNext();
    expect(match && `${match.rowId}:${match.colId}`).toBe("work:size");
  });
});

describe("tree data: filterIncludesDescendants", () => {
  const WITH = { ...PATH, filterIncludesDescendants: true } as TreeDataOptions;

  it("off (default): a matching parent keeps only its matching children", () => {
    const core = createTree(PATH, PATH_ROWS);
    filterName(core, "Work");
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work"]);
  });

  it("on: a matching parent keeps its whole subtree, and the kept rows feed its aggregates", () => {
    const core = createTree(WITH, PATH_ROWS);
    filterName(core, "Work");
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work", "a", "b"]);
    expect(size(core, "work")).toBe(30);
    expect(size(core, DOCS)).toBe(30);

    // A leaf match is unchanged by the option.
    filterName(core, "beta");
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work", "b"]);
    expect(size(core, DOCS)).toBe(20);
  });

  it("on: kept descendants follow the active sort and the expansion rules", () => {
    const core = createTree(WITH, PATH_ROWS, { groupDefaultExpanded: 1 });
    core.setSortModel([{ key: "size", dir: "desc" }]);
    filterName(core, "Work");
    // Work (level 1) is collapsed by groupDefaultExpanded: 1, so its kept children are hidden.
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work"]);
    core.toggleGroupExpand("work", true);
    expect(view(core).map(n => n.id)).toEqual([DOCS, "work", "b", "a"]);
  });

  it("on, in parent mode: descendants at every depth come back", () => {
    const core = createTree(
      { mode: "parent", getParentId: (row: any) => row.parentId, filterIncludesDescendants: true },
      PARENT_ROWS,
    );
    filterName(core, "Docs");
    expect(view(core).map(n => n.id)).toEqual(["docs", "work", "a", "b", "c"]);
    expect(size(core, "docs")).toBe(35);
  });
});

describe("buildTreeData: computeAggregates", () => {
  const leaf = (id: string, path: string[], value: number): IRowNode => ({
    id, data: { path, value }, viewIndex: -1, selected: false, type: "leaf", level: 0, isExpanded: false,
  } as IRowNode);

  it("hands each kept parent its filtered-tree leaves in display order", () => {
    const nodes = [leaf("p", ["P"], 1), leaf("q", ["P", "Q"], 2), leaf("r", ["P", "R"], 3), leaf("s", ["S", "T"], 4)];
    const calls: Record<string, string[]> = {};
    const { roots } = buildTreeData({
      nodes,
      options: { mode: "path", getPath: (row: any) => row.path },
      nestedParents: new Map(),
      includedIds: new Set(["q", "r", "s"]),
      sortRank: new Map([["r", 0], ["q", 1], ["s", 2]]),
      expansion: new Map(),
      defaultExpanded: 0,
      computeAggregates: leaves => ({ ids: leaves.map(l => l.id).join(",") }),
    });
    const walk = (n: IRowNode) => {
      if (n.aggregateValues) calls[n.id] = n.aggregateValues.ids.split(",");
      n.children?.forEach(walk);
    };
    roots.forEach(walk);
    expect(calls).toEqual({ p: ["r", "q"], "t:path:S": ["s"] });
  });
});
