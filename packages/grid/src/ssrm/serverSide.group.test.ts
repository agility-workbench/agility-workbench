import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { AggregateType } from "../interfaces/aggregate";
import { groupNodeId } from "../csrm/rowGroup";
import { IRowNode } from "../interfaces/iRowNode";
import { IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Region → Country → numeric metric; same shape as the client-side grouping tests so grouped
// buckets are predictable. The fake server groups/aggregates it on demand.
const DATA = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "UK", sales: 20 },
  { id: "3", region: "EMEA", country: "France", sales: 5 },
  { id: "4", region: "APAC", country: "Japan", sales: 30 },
  { id: "5", region: "APAC", country: "Japan", sales: 40 },
  { id: "6", region: "APAC", country: "India", sales: 15 },
];

// In-memory data source implementing the server-side grouping contract: filters by the groupKeys
// path, returns group rows (ascending by group value, with count + requested sums) above the leaf
// level and raw leaves at the leaf level. `totals: false` omits totalRows (open-ended listings);
// `delay` defers responses like a real server so request interleavings can be exercised.
function makeDataSource(options: { totals?: boolean; delay?: number } = {}) {
  const includeTotals = options.totals !== false;
  const requests: IServerSideRequest[] = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      const respond = options.delay
        ? (result: any) => setTimeout(() => success(result), options.delay)
        : success;
      const subset = DATA.filter(row =>
        request.groupKeys.every(k => (row as any)[k.key] === k.value));
      let rows: any[];
      if (request.groupKeys.length < request.groupBy.length) {
        const key = request.groupBy[request.groupKeys.length];
        const byValue = new Map<string, any[]>();
        for (const row of subset) {
          const v = String((row as any)[key]);
          if (!byValue.has(v)) byValue.set(v, []);
          byValue.get(v)!.push(row);
        }
        rows = Array.from(byValue.keys()).sort().map((v) => {
          const leaves = byValue.get(v)!;
          const groupRow: any = { [key]: (leaves[0] as any)[key], count: leaves.length };
          for (const agg of request.aggregates) {
            if (agg.type === AggregateType.SUM) {
              groupRow[agg.key] = leaves.reduce((s, r) => s + (r as any)[agg.key], 0);
            }
          }
          return groupRow;
        });
      } else {
        rows = subset;
      }
      const start = request.startRow ?? 0;
      const end = request.endRow ?? rows.length;
      respond({ rows: rows.slice(start, end), totalRows: includeTotals ? rows.length : undefined });
    },
  };
  return { source, requests };
}

// Data-source responses resolve through promise chains only (no timers), so a single macrotask
// drains every chained block fetch.
const flush = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function makeGrid(options: object = {}, dsOptions: { totals?: boolean; delay?: number } = {}) {
  const ds = makeDataSource(dsOptions);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    getGroupChildCount: (row: any) => row.count,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource(ds.source);
  return { core, ds };
}

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) {
    const node = rm.getRowNodeAtViewIndex(i);
    if (node) out.push(node);
  }
  return out;
}

const colInstance = (core: GridCore, key: string) => core.getColumnModel().getByColId(key)!.instanceID;

describe("server-side row grouping", () => {
  it("returns only validated page-local row indices after a page change", async () => {
    const { core } = makeGrid({ pagination: true, pageSize: 2 });
    await flush();
    const firstPageId = viewNodes(core)[0].id;
    expect(core.getViewIndexForRowId(firstPageId)).toBe(0);

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    const page = viewNodes(core);
    expect(page.map(node => node.id)).toEqual(["3", "4"]);
    expect(core.getViewIndexForRowId(page[0].id)).toBe(0);
    expect(core.getViewIndexForRowId(page[1].id)).toBe(1);
    // SSRM retains loaded nodes across requests; the old node's page-local stamp must not be
    // mistaken for the new page's row occupying that same slot.
    expect(core.getViewIndexForRowId(firstPageId)).toBeNull();
  });

  it("flat requests keep the legacy shape (empty groupBy/groupKeys)", async () => {
    const { core, ds } = makeGrid();
    await flush();
    const last = ds.requests[ds.requests.length - 1];
    expect(last.groupBy).toEqual([]);
    expect(last.groupKeys).toEqual([]);
    expect(core.getRowModel().getRowCount()).toBe(6);
    expect(viewNodes(core).every(n => !n.isGroup)).toBe(true);
    expect(core.getPaginationInfo().totalRowCountKnown).toBe(true);
  });

  it("exposes post-filter traversal for the server-owned row order", async () => {
    const { core } = makeGrid();
    await flush();
    const rowModel = core.getRowModel();
    const afterFilter: string[] = [];
    const afterFilterAndSort: string[] = [];

    rowModel.forEachNodeAfterFilter(node => afterFilter.push(node.id));
    rowModel.forEachNodeAfterFilterAndSort(node => afterFilterAndSort.push(node.id));

    expect(afterFilter).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(afterFilterAndSort).toEqual(afterFilter);
  });

  it("grouping requests group rows at the root and shows collapsed group headers", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();

    const last = ds.requests[ds.requests.length - 1];
    expect(last.groupBy).toEqual(["region"]);
    expect(last.groupKeys).toEqual([]);

    const nodes = viewNodes(core);
    expect(nodes.map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(nodes.every(n => n.isGroup && n.level === 0 && !n.isExpanded)).toBe(true);
    // Leaf-descendant badge comes from getGroupChildCount reading the server's count field.
    expect(nodes.map(n => n.childCount)).toEqual([3, 3]);
  });

  it("expanding a group requests its children with the raw-value group path", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    const childRequest = ds.requests[ds.requests.length - 1];
    expect(childRequest.groupBy).toEqual(["region"]);
    expect(childRequest.groupKeys).toEqual([{ key: "region", value: "EMEA" }]);

    const nodes = viewNodes(core);
    expect(nodes.map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
    const emeaId = groupNodeId(["EMEA"]);
    expect(nodes.filter(n => !n.isGroup).every(n => n.parentId === emeaId)).toBe(true);
  });

  it("multi-level grouping drills down one level per request", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    let nodes = viewNodes(core);
    // EMEA's children are country groups, not leaves.
    expect(nodes.map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "France", "UK"]);
    expect(nodes[2].level).toBe(1);

    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA", "UK"]) });
    await flush();

    const leafRequest = ds.requests[ds.requests.length - 1];
    expect(leafRequest.groupKeys).toEqual([
      { key: "region", value: "EMEA" },
      { key: "country", value: "UK" },
    ]);
    nodes = viewNodes(core);
    expect(nodes.map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "France", "UK", "1", "2"]);
  });

  it("per-group aggregates ride the group rows and land keyed by column instance", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.setAggregateModel([{ key: "sales", type: AggregateType.SUM }]);
    await flush();

    const groupRequest = [...ds.requests].reverse().find(r => r.groupKeys.length < r.groupBy.length)!;
    expect(groupRequest.aggregates).toEqual([{ key: "sales", type: AggregateType.SUM }]);

    const salesId = colInstance(core, "sales");
    const byKey = new Map(viewNodes(core).map(n => [n.groupKey, n]));
    expect(byKey.get("EMEA")!.aggregateValues?.[salesId]).toBe(35);
    expect(byKey.get("APAC")!.aggregateValues?.[salesId]).toBe(85);
  });

  it("sorting purges the store but keeps expansion; children reload with the sorts", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    core.setSortModel([{ key: colInstance(core, "sales"), dir: "desc" }]);
    await flush();

    const afterSort = ds.requests.filter(r => r.sorts.length > 0);
    expect(afterSort.length).toBeGreaterThanOrEqual(2);
    expect(afterSort.every(r => r.sorts[0].key === "sales" && r.sorts[0].dir === "desc")).toBe(true);
    // The EMEA subtree is expanded again without user interaction.
    const nodes = viewNodes(core);
    expect(nodes.map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
    expect(nodes[1].isExpanded).toBe(true);
  });

  it("group and leaf rows both count toward pages; counts pin as listings load", async () => {
    const { core } = makeGrid({ pagination: true, pageSize: 2, serverSideBlockSize: 2 });
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 2, totalPageCount: 1, totalRowCountKnown: true });

    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();
    // EMEA's children live past the current page, so its listing is created but not yet counted:
    // the total is provisional (2 group rows + 1 probe slot).
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 3, totalPageCount: 2, totalRowCountKnown: false });

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    // Visiting page 2 loads the EMEA listing; its totalRows pins the flattened count at 5.
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 5, totalPageCount: 3, totalRowCountKnown: true });
  });

  it("open-ended listings probe forward and snap back once the end pins", async () => {
    const { core } = makeGrid(
      { pagination: true, pageSize: 2, serverSideBlockSize: 2 },
      { totals: false },
    );
    await flush();
    // First full block: 2 loaded rows + 1 probe slot, total provisional.
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 3, totalPageCount: 2, totalRowCountKnown: false });

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 5, totalPageCount: 3, totalRowCountKnown: false });

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 2, pageSize: 2 });
    await flush();
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 7, totalPageCount: 4, totalRowCountKnown: false });

    // Page 4 probes past the real end (6 rows): the empty short block pins the count and the core
    // snaps back to the last real page.
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 3, pageSize: 2 });
    await flush();
    expect(core.getPaginationInfo()).toMatchObject({
      pageIndex: 2,
      totalRowCount: 6,
      totalPageCount: 3,
      totalRowCountKnown: true,
    });
  });

  it("refreshServerSideData purge re-requests the store and keeps expansion", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    const before = ds.requests.length;
    void core.refreshServerSideData({ purge: true });
    await flush();

    const fresh = ds.requests.slice(before);
    // Root listing and the expanded EMEA listing both reload.
    expect(fresh.some(r => r.groupKeys.length === 0)).toBe(true);
    expect(fresh.some(r => r.groupKeys.length === 1 && r.groupKeys[0].value === "EMEA")).toBe(true);
    const nodes = viewNodes(core);
    expect(nodes.map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
  });

  it("refreshServerSideData scoped to a group subtree only refetches that subtree", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    const before = ds.requests.length;
    void core.refreshServerSideData({ groupKeys: [{ key: "region", value: "EMEA" }], purge: true });
    await flush();

    const fresh = ds.requests.slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every(r => r.groupKeys[0]?.value === "EMEA")).toBe(true);
    expect(viewNodes(core).map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
  });

  it("soft refresh (no purge) refetches in place without dropping the view", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    const before = ds.requests.length;
    void core.refreshServerSideData();
    // Rows stay rendered synchronously (no purge)…
    expect(viewNodes(core).length).toBe(5);
    await flush();
    // …and the visible blocks were re-requested.
    expect(ds.requests.length).toBeGreaterThan(before);
    expect(viewNodes(core).map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
  });

  it("hides the loading overlay after an expand even when the renderer requests a block mid-flight", async () => {
    // Regression: with a slow server, expanding a group emits rows synchronously, which lets the
    // renderer fire a viewport request before the child block resolves. That bumps the core's
    // request counter, so the expand fetch's completion looked stale and its loading-end (and row
    // repaint) were dropped — stranding the overlay.
    const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const { core, ds } = makeGrid({}, { delay: 5 });
    const overlays: string[] = [];
    core.on("overlayShow", (e: any) => overlays.push(e.overlayType));
    await waitMs(20);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await waitMs(20);

    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    // Simulate the renderer's missing-row scan racing the child fetch.
    core.refreshRows("viewport", { start: 0, end: 5 });
    await waitMs(20);

    expect(overlays[overlays.length - 1]).toBe("none");
    expect(viewNodes(core).map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
    expect(ds.requests.length).toBeGreaterThan(0);
  });

  it("answers subtree spans and ancestor chains for slots whose rows are not loaded", async () => {
    // pageSize/blockSize 2 so EMEA's third child stays unloaded: page 2 (view 2..4) covers child
    // indices 0-1 only. The first block's totalRows pins the count at 3, leaving child 2 counted
    // but unloaded — the case the sticky overlay needs answered without row data.
    const { core } = makeGrid({ pagination: true, pageSize: 2, serverSideBlockSize: 2 });
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();

    const rm = core.getRowModel();
    // Flattened: [APAC, EMEA, c0, c1, c2]; page 2 shows flat 2-3, so flat 4 is view index 2 —
    // past the page, unloaded.
    expect(rm.getRowNodeAtViewIndex(2)).toBeUndefined();
    // Span covers the full counted subtree regardless: last descendant at page-local view 2.
    expect(rm.getSubtreeEndViewIndex!(groupNodeId(["EMEA"]))).toBe(2);
    // The unloaded slot still resolves its ancestor chain (root-first, loaded group nodes).
    const chain = rm.getAncestorChainAtViewIndex!(2);
    expect(chain.map(n => n.id)).toEqual([groupNodeId(["EMEA"])]);
    // A collapsed group's span is its own row.
    const apacView = rm.getRowNode(groupNodeId(["APAC"]))!.viewIndex;
    expect(rm.getSubtreeEndViewIndex!(groupNodeId(["APAC"]))).toBe(apacView);
  });

  it("collapsing hides the subtree without new requests; re-expanding reuses the cache", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();

    const before = ds.requests.length;
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]), expanded: false });
    await flush();
    expect(viewNodes(core).map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA"]);

    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]), expanded: true });
    await flush();
    expect(viewNodes(core).map(n => n.isGroup ? n.groupKey : n.id)).toEqual(["APAC", "EMEA", "1", "2", "3"]);
    expect(ds.requests.length).toBe(before);
  });
});
