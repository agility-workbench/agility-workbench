import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import {
  IServerSideAggregationParams,
  IServerSideAggregationRequest,
  IServerSideDataSource,
  IServerSideGetRowsParams,
  IServerSidePivotField,
  IServerSideRequest,
} from "../interfaces/serverSide";
import { PIVOT_TOTAL_GROUP_ID } from "../csrm/pivot";
import { BLANK_GROUP_KEY } from "../csrm/rowGroup";
import { pivotLeafColId } from "../interfaces/pivot";
import { ExportRenderer } from "../renderer/exportRenderer";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Region › Country × Quarter, revenue sums:
//   EMEA/UK: Q1 = 20, Q2 = 10    EMEA/DE: Q2 = 7    APAC/JP: Q1 = 5, Q2 = 40, (blank) = 1
const DATA = [
  { id: 1, region: "EMEA", country: "UK", quarter: "Q2", revenue: 10 },
  { id: 2, region: "EMEA", country: "UK", quarter: "Q1", revenue: 20 },
  { id: 3, region: "EMEA", country: "DE", quarter: "Q2", revenue: 7 },
  { id: 4, region: "APAC", country: "JP", quarter: "Q1", revenue: 5 },
  { id: 5, region: "APAC", country: "JP", quarter: "Q2", revenue: 40 },
  { id: 6, region: "APAC", country: "JP", quarter: null, revenue: 1 },
];

const COLUMN_DEFS = [
  { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
  { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
  { colId: "quarter", key: "quarter", label: "Quarter", type: ColumnType.STRING },
  { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
];

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

const aggregate = (type: string, values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sum = values.reduce((a, b) => a + b, 0);
  if (type === "sum") return sum;
  if (type === "avg") return sum / values.length;
  if (type === "max") return Math.max(...values);
  if (type === "count") return values.length;
  throw new Error(`fake server: no ${type}`);
};

// The server's own field naming, deliberately nothing like the grid's colIds.
const fieldName = (keys: any[], valueKey: string, type: string) =>
  `${keys.map(k => k ?? "~blank").join(">")}::${type}(${valueKey})`;

interface PivotServerOptions {
  /** Leave pivotFields off root responses. */
  omitFields?: boolean;
  /** Extra entries appended to pivotFields as returned. */
  extraFields?: IServerSidePivotField[];
}

// A tiny in-memory pivot server: groups by the requested level, stamps one value per declared
// field on each group row, declares every field of the filtered set on root responses (in REVERSE
// header order, so the tests show the grid orders the header itself), and sorts group rows by a
// group key or by a pivot field.
function makePivotServer(options: PivotServerOptions = {}) {
  const requests: IServerSideRequest[] = [];
  const aggregationRequests: IServerSideAggregationRequest[] = [];

  const declaredFields = (request: { pivot?: IServerSideRequest["pivot"] }, rows: typeof DATA) => {
    const pivot = request.pivot!;
    const paths = new Map<string, any[]>();
    for (const row of rows) {
      const keys = pivot.pivotBy.map(key => (row as any)[key]);
      paths.set(JSON.stringify(keys), keys);
    }
    const fields: IServerSidePivotField[] = [];
    for (const keys of paths.values()) {
      for (const value of pivot.values) {
        fields.push({ field: fieldName(keys, value.key, value.type), pivotKeys: keys, valueKey: value.key, aggregate: value.type });
      }
    }
    return fields;
  };

  const stampValues = (out: any, request: { pivot?: IServerSideRequest["pivot"] }, rows: typeof DATA) => {
    for (const field of declaredFields(request, rows)) {
      const matching = rows.filter(row =>
        request.pivot!.pivotBy.every((key, i) => (row as any)[key] === field.pivotKeys[i]));
      out[field.field] = aggregate(field.aggregate, matching.map(row => (row as any)[field.valueKey]));
    }
    return out;
  };

  const source: IServerSideDataSource = {
    getRows: ({ request, success }: IServerSideGetRowsParams) => {
      requests.push(structuredClone(request));
      const rows = DATA.filter(row => request.groupKeys.every(k => (row as any)[k.key] === k.value));
      if (!request.pivot) {
        success({ rows: rows.slice(request.startRow, request.endRow), totalRows: rows.length });
        return;
      }
      let groupRows: any[];
      if (request.groupBy.length === 0) {
        groupRows = [stampValues({}, request, rows)];
      } else {
        const key = request.groupBy[request.groupKeys.length];
        const buckets = new Map<any, typeof DATA>();
        for (const row of rows) {
          const v = (row as any)[key];
          if (!buckets.has(v)) buckets.set(v, []);
          buckets.get(v)!.push(row);
        }
        groupRows = Array.from(buckets, ([value, leaves]) => stampValues({ [key]: value }, request, leaves));
        for (const sort of request.sorts.slice().reverse()) {
          groupRows.sort((a, b) => {
            const av = a[sort.key] ?? -Infinity;
            const bv = b[sort.key] ?? -Infinity;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sort.dir === "desc" ? -cmp : cmp;
          });
        }
      }
      const root = request.groupKeys.length === 0;
      success({
        rows: groupRows.slice(request.startRow, request.endRow),
        totalRows: groupRows.length,
        ...(root && !options.omitFields
          ? { pivotFields: [...declaredFields(request, DATA).reverse(), ...(options.extraFields ?? [])] }
          : {}),
      });
    },
    getAggregates: ({ request, success }: IServerSideAggregationParams) => {
      aggregationRequests.push(structuredClone(request));
      success({ values: request.pivot ? stampValues({}, request, DATA) : {} });
    },
  };
  return { source, requests, aggregationRequests };
}

function makeGrid(source: IServerSideDataSource, options: object = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideBlockSize: 50,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps(COLUMN_DEFS.map(d => ({ ...d })));
  core.setServerSideDataSource(source);
  return core;
}

function enterPivot(core: GridCore, groups: string[] = ["region"], pivotBy: string[] = ["quarter"]) {
  core.dispatch({ type: "rowGroupSet", colIds: groups });
  core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
  core.dispatch({ type: "pivotColumnsSet", colIds: pivotBy });
  core.dispatch({ type: "pivotModeSet", on: true });
}

const leafColIds = (core: GridCore) => core.getColumnModel().getLeaves().map(c => c.colId);

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) {
    const node = rm.getRowNodeAtViewIndex(i);
    if (node) out.push(node);
  }
  return out;
}

// A generated column's value on a row, addressed by colId.
function cell(core: GridCore, node: IRowNode, colId: string): any {
  const col = core.getColumnModel().getLeaves().find(c => c.colId === colId);
  return col ? node.aggregateValues?.[col.instanceID] : undefined;
}

const lastRequest = (requests: IServerSideRequest[]) => requests[requests.length - 1];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server-side pivot", () => {
  it("is supported on the server-side row model, but not with server tree data", () => {
    expect(makeGrid(makePivotServer().source).isPivotSupported()).toBe(true);
    const tree = makeGrid(makePivotServer().source, { treeData: { mode: "server", hasChildren: () => false } });
    expect(tree.isPivotSupported()).toBe(false);
  });

  it("sends the pivot on the request and keeps the measures off `aggregates`", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source, { maxPivotColumns: 40 });
    await flush();
    enterPivot(core);
    await flush();

    const request = lastRequest(requests);
    expect(request.groupBy).toEqual(["region"]);
    expect(request.groupKeys).toEqual([]);
    expect(request.aggregates).toEqual([]);
    expect(request.pivot).toEqual({
      pivotBy: ["quarter"],
      values: [{ key: "revenue", type: "sum" }],
      maxPivotColumns: 40,
    });
  });

  it("builds the generated columns from pivotFields, in the grid's own header order", async () => {
    const { source } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();

    // Declared in reverse; ordered by the pivot column's collator, blanks last — as client-side.
    expect(leafColIds(core)).toEqual([
      "__pte_group__",
      "pv:Q1|revenue|sum",
      "pv:Q2|revenue|sum",
      pivotLeafColId([BLANK_GROUP_KEY], "revenue", "sum"),
    ]);
    expect(core.getPivotResultColumns().map(c => c.label)).toHaveLength(3);
  });

  it("stamps each group row's cells from its fields", async () => {
    const { source } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();

    const rows = viewNodes(core);
    expect(rows.map(n => n.groupKey)).toEqual(["EMEA", "APAC"]);
    const [emea, apac] = rows;
    expect(cell(core, emea, "pv:Q1|revenue|sum")).toBe(20);
    expect(cell(core, emea, "pv:Q2|revenue|sum")).toBe(17);
    expect(cell(core, apac, "pv:Q1|revenue|sum")).toBe(5);
    expect(cell(core, apac, "pv:Q2|revenue|sum")).toBe(40);
  });

  it("never expands the deepest row-group level, so no leaf rows are ever requested", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core, ["region", "country"]);
    await flush();

    const [emea] = viewNodes(core);
    expect(emea.expandable).toBeUndefined();
    core.dispatch({ type: "groupToggleExpand", groupId: emea.id, expanded: true });
    await flush();

    const children = viewNodes(core).filter(n => n.level === 1);
    expect(children.map(n => n.groupKey)).toEqual(["UK", "DE"]);
    expect(children.every(n => n.expandable === false && !n.isExpanded)).toBe(true);
    expect(cell(core, children[0], "pv:Q1|revenue|sum")).toBe(20);
    // The child request carries the pivot too.
    expect(lastRequest(requests).groupKeys).toEqual([{ key: "region", value: "EMEA" }]);
    expect(lastRequest(requests).pivot?.pivotBy).toEqual(["quarter"]);

    const before = requests.length;
    core.dispatch({ type: "groupToggleExpand", groupId: children[0].id, expanded: true });
    await flush();
    expect(requests.length).toBe(before);
    expect(requests.filter(r => r.pivot).every(r => r.groupKeys.length < r.groupBy.length)).toBe(true);
  });

  it("an ungrouped pivot asks for one grand-total row and shows it as Total", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core, []);
    await flush();

    expect(lastRequest(requests).groupBy).toEqual([]);
    const rows = viewNodes(core);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PIVOT_TOTAL_GROUP_ID);
    expect(rows[0].groupKey).toBe("Total");
    expect(rows[0].expandable).toBe(false);
    expect(cell(core, rows[0], "pv:Q1|revenue|sum")).toBe(25);
    expect(cell(core, rows[0], "pv:Q2|revenue|sum")).toBe(57);
    // The Total row is the grand total: the footer reuses it without asking the server.
    const q2 = core.getColumnModel().getLeaves().find(c => c.colId === "pv:Q2|revenue|sum")!;
    expect(core.getRowModel().getAggregateValues().get(q2.instanceID)).toBe(57);
  });

  it("sorts a generated column by the server's field name", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();

    const q2 = core.getColumnModel().getLeaves().find(c => c.colId === "pv:Q2|revenue|sum")!;
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: q2.instanceID, dir: "desc" }] });
    await flush();

    expect(lastRequest(requests).sorts).toEqual([{ key: fieldName(["Q2"], "revenue", "sum"), dir: "desc" }]);
    expect(viewNodes(core).map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    // The sorted column survived the reload it caused.
    expect(leafColIds(core)).toContain("pv:Q2|revenue|sum");
  });

  it("a measure change refetches and regenerates the columns; a scope change does not refetch", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();

    const before = requests.length;
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }, { key: "revenue", type: AggregateType.MAX }],
    });
    await flush();
    expect(requests.length).toBeGreaterThan(before);
    expect(lastRequest(requests).pivot?.values).toEqual([
      { key: "revenue", type: "sum" },
      { key: "revenue", type: "max" },
    ]);
    expect(leafColIds(core)).toContain("pv:Q2|revenue|max");
    const [emea] = viewNodes(core);
    expect(cell(core, emea, "pv:Q2|revenue|max")).toBe(10);

    const afterMeasures = requests.length;
    core.setAggregateScope("none");
    await flush();
    expect(requests.length).toBe(afterMeasures);
  });

  it("caps the generated columns at maxPivotColumns and stamps only the kept ones", async () => {
    const { source } = makePivotServer();
    const limits: number[] = [];
    const core = makeGrid(source, { maxPivotColumns: 1 });
    core.on("pivotColumnLimitReached", ev => limits.push(ev.truncatedColumnCount));
    await flush();
    enterPivot(core);
    await flush();

    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum"]);
    expect(limits).toEqual([2]);
    const [emea] = viewNodes(core);
    expect(Object.keys(emea.aggregateValues ?? {})).toHaveLength(1);
  });

  it("keeps the columns and warns once when a root response carries no pivotFields", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { source } = makePivotServer({ omitFields: true });
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();
    core.refreshServerSideData({ purge: true });
    await flush();

    expect(leafColIds(core)).toEqual(["__pte_group__"]);
    const pivotWarnings = warn.mock.calls.filter(([msg]) => String(msg).includes("no pivotFields"));
    expect(pivotWarnings).toHaveLength(1);
  });

  it("ignores fields for measures that were not requested or with the wrong key count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { source } = makePivotServer({
      extraFields: [
        { field: "x", pivotKeys: ["Q9"], valueKey: "revenue", aggregate: "avg" },
        { field: "y", pivotKeys: ["Q9", "extra"], valueKey: "revenue", aggregate: "sum" },
      ],
    });
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();

    expect(leafColIds(core).some(id => id.includes("Q9"))).toBe(false);
    expect(warn.mock.calls.some(([msg]) => String(msg).includes("ignored 2 pivotFields entries"))).toBe(true);
  });

  it("asks getAggregates for per-field grand totals while grouped", async () => {
    const { source, aggregationRequests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();
    core.setAggregateScope("all");
    await flush();

    const request = aggregationRequests[aggregationRequests.length - 1];
    expect(request.aggregates).toEqual([]);
    expect(request.pivot?.pivotBy).toEqual(["quarter"]);
    const q2 = core.getColumnModel().getLeaves().find(c => c.colId === "pv:Q2|revenue|sum")!;
    expect(core.getRowModel().getAggregateValues().get(q2.instanceID)).toBe(57);
  });

  it("does not re-ask for the grand totals when an expansion loads more group rows", async () => {
    const { source, aggregationRequests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core, ["region", "country"]);
    await flush();
    const asked = aggregationRequests.length;
    expect(asked).toBeGreaterThan(0);

    const [emea] = viewNodes(core);
    core.dispatch({ type: "groupToggleExpand", groupId: emea.id, expanded: true });
    await flush();

    expect(viewNodes(core).some(n => n.level === 1)).toBe(true);
    expect(aggregationRequests).toHaveLength(asked);
  });

  it("leaves the footer empty while grouped without an aggregation source", async () => {
    const { source } = makePivotServer();
    const core = makeGrid({ getRows: source.getRows });
    await flush();
    enterPivot(core);
    await flush();

    expect(viewNodes(core)).toHaveLength(2);
    expect(core.getRowModel().getAggregateValues().size).toBe(0);
  });

  it("asks the server nothing while the pivot has no role filled", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    const before = requests.length;
    core.dispatch({ type: "pivotModeSet", on: true });
    await flush();

    expect(core.isPivotUnconfigured()).toBe(true);
    expect(requests.length).toBe(before);
    expect(core.getRowModel().getViewCount()).toBe(0);
  });

  it("exiting pivot mode goes back to plain requests and the source columns", async () => {
    const { source, requests } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    // Roles assigned while pivoted belong to the pivot layer, so exiting restores the flat grid.
    core.dispatch({ type: "pivotModeSet", on: true });
    enterPivot(core);
    await flush();
    expect(lastRequest(requests).pivot).toBeDefined();
    core.dispatch({ type: "pivotModeSet", on: false });
    await flush();

    expect(lastRequest(requests).pivot).toBeUndefined();
    expect(lastRequest(requests).groupBy).toEqual([]);
    expect(leafColIds(core)).toEqual(["region", "country", "quarter", "revenue"]);
    expect(viewNodes(core)).toHaveLength(6);
    expect(viewNodes(core).every(n => !n.isGroup)).toBe(true);
  });

  it("exports the loaded pivot table under its nested generated header", async () => {
    const { source } = makePivotServer();
    const core = makeGrid(source);
    await flush();
    enterPivot(core);
    await flush();

    const exporter = new ExportRenderer({
      core,
      leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
      columnWidths: () => new Map(),
      selectionRange: () => core.getSelectionRange(),
      selectedColumnIDs: () => core.getSelectedColumnIds(),
    });
    const lines = exporter.getDataAsCsv()!.split("\n");
    expect(lines[0].split(",").slice(1)).toEqual(["Q1", "Q2", "(Blanks)"]);
    expect(lines).toContain("EMEA,20,17,");
    expect(lines).toContain("APAC,5,40,1");
  });
});
