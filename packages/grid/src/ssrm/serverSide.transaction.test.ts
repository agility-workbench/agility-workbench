import { afterEach, describe, expect, it, vi } from "vitest";
import { GridAPI } from "../api/api";
import { GridCore } from "../core/core";
import { groupNodeId } from "../csrm/rowGroup";
import { ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowNode } from "../interfaces/iRowNode";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideDataSource, IServerSideRequest, IServerSideResult } from "../interfaces/serverSide";

// Transactions on the server-side row model mirror a change the app has ALREADY made on the
// server. The fake server below holds a mutable dataset: each test edits it first, then applies
// the matching transaction, then checks the store agrees with what the server now answers.

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const BLOCK = 10;

type Row = { id: string; region?: string; country?: string; parent?: string | null; n: number };

interface FakeServer {
  data: Row[];
  requests: IServerSideRequest[];
  pending: Array<{ request: IServerSideRequest; respond: () => void }>;
  source: IServerSideDataSource;
}

// Answers flat, grouped (by request.groupBy over the groupKeys path) and tree (by treeParent)
// requests over `data`. `manual` holds every response in `pending` until the test releases it;
// `totals: false` leaves listings open-ended.
function makeServer(data: Row[], opts: { manual?: boolean; totals?: boolean; tree?: boolean } = {}): FakeServer {
  const server: FakeServer = { data, requests: [], pending: [], source: undefined as any };
  server.source = {
    getRows: ({ request, success }) => {
      server.requests.push(request);
      const answer = (): IServerSideResult => {
        let rows: any[];
        if (opts.tree) {
          rows = server.data.filter(r => (r.parent ?? null) === (request.treeParent?.id ?? null));
        } else {
          const subset = server.data.filter(r => request.groupKeys.every(k => (r as any)[k.key] === k.value));
          if (request.groupKeys.length < request.groupBy.length) {
            const key = request.groupBy[request.groupKeys.length];
            const counts = new Map<string, number>();
            for (const r of subset) counts.set((r as any)[key], (counts.get((r as any)[key]) ?? 0) + 1);
            rows = Array.from(counts.keys()).sort().map(v => ({ [key]: v, count: counts.get(v) }));
          } else {
            rows = subset;
          }
        }
        const start = request.startRow ?? 0;
        return {
          rows: rows.slice(start, request.endRow ?? rows.length).map(r => ({ ...r })),
          totalRows: opts.totals === false ? undefined : rows.length,
        };
      };
      // Manual responses are computed on release, like a server that answers late — but the
      // in-flight test wants the PRE-change answer, so it snapshots at request time.
      const result = answer();
      if (opts.manual) server.pending.push({ request, respond: () => success(result) });
      else success(result);
    },
  };
  return server;
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function makeGrid(server: FakeServer, options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideBlockSize: BLOCK,
    pageSize: BLOCK,
    getGroupChildCount: (row: any) => row.count,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource(server.source);
  return { core, api: new GridAPI(core) };
}

const flatRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i }));

// View-ordered ids (undefined for unloaded slots).
function viewIds(core: GridCore): Array<string | undefined> {
  const rm = core.getRowModel();
  return Array.from({ length: rm.getViewCount() }, (_, i) => rm.getRowNodeAtViewIndex(i)?.id);
}

const scrollTo = (core: GridCore, start: number) =>
  core.refreshRows("viewport", { start, end: start + BLOCK });

// Every loaded node is registered under its id and vice versa, and every listing's block-use
// stamps cover exactly its loaded blocks (the cache cap's accounting).
function expectConsistentStore(core: GridCore) {
  const rm = core.getRowModel() as any;
  const registered = new Set<string>();
  for (const listing of (rm.listings as Map<string, any>).values()) {
    const blocks = new Set<number>();
    for (const [idx, node] of listing.nodes as Map<number, IRowNode>) {
      expect(rm.nodesMap.get(node.id)).toBe(node);
      expect(idx).toBeLessThan(listing.knownCount);
      registered.add(node.id);
      blocks.add(Math.floor(idx / BLOCK) * BLOCK);
    }
    for (const block of blocks) expect(listing.blockUse.has(block)).toBe(true);
  }
  expect(new Set((rm.nodesMap as Map<string, unknown>).keys())).toEqual(registered);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server-side transactions: update", () => {
  it("replaces a loaded row's data on the same node and repaints it in place", async () => {
    const server = makeServer(flatRows(25));
    const { core, api } = makeGrid(server);
    await flush();
    core.selectRowsById(["r2"]);
    const node = core.getRowModel().getRowNode("r2")!;
    const cellsChanged = vi.fn();
    const rowsChanged = vi.fn();
    core.on("cellsChanged", cellsChanged);
    core.on("rowsChanged", rowsChanged);
    const requestsBefore = server.requests.length;

    server.data[2] = { id: "r2", n: 200 };
    const result = api.applyTransaction({
      update: [{ rowId: "r2", row: { id: "r2", n: 200 } }, { rowId: "r24", row: { id: "r24", n: -1 } }],
    });

    // r24 sits in a block that never loaded: skipped, not counted.
    expect(result).toEqual({ added: 0, updated: 1, removed: 0 });
    expect(core.getRowModel().getRowNode("r2")).toBe(node);
    expect(node.data).toEqual({ id: "r2", n: 200 });
    expect(core.getRowModel().getRowNode("r24")).toBeUndefined();
    expect(core.getSelectedRowIds().has("r2")).toBe(true);
    expect(cellsChanged).toHaveBeenCalledTimes(1);
    expect(cellsChanged.mock.calls[0][0]).toMatchObject({ reason: "data", rowIds: ["r2", "r24"] });
    expect(rowsChanged).not.toHaveBeenCalled();
    // Pure updates never refetch.
    await flush();
    expect(server.requests.length).toBe(requestsBefore);
  });

  it("re-reads a group row's server-stamped values and recomputes nothing for its leaves", async () => {
    const server = makeServer([
      { id: "1", region: "EMEA", n: 1 },
      { id: "2", region: "EMEA", n: 2 },
    ]);
    const { core, api } = makeGrid(server, { groupDefaultExpanded: -1 });
    api.setRowGroupColumns(["region"]);
    await flush();
    const groupId = groupNodeId(["EMEA"]);
    const group = core.getRowModel().getRowNode(groupId)!;
    expect(group.childCount).toBe(2);

    api.applyTransaction({ update: [{ rowId: "1", row: { id: "1", region: "EMEA", n: 100 } }] });
    expect(group.childCount).toBe(2);
    api.applyTransaction({ update: [{ rowId: groupId, row: { region: "EMEA", count: 7 } }] });
    expect(core.getRowModel().getRowNode(groupId)).toBe(group);
    expect(group.childCount).toBe(7);
  });
});

describe("server-side transactions: remove", () => {
  it("shifts later rows down, adjusts the count and total, and prunes the selection", async () => {
    const server = makeServer(flatRows(25));
    const { core, api } = makeGrid(server);
    await flush();
    scrollTo(core, 10);
    await flush();
    expect(core.getRowModel().getRowCount()).toBe(25);
    core.selectRowsById(["r3", "r15"]);
    const r15 = core.getRowModel().getRowNode("r15")!;
    const rowsChanged = vi.fn();
    const selectionChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);
    core.on("selectionChanged", selectionChanged);

    server.data.splice(3, 1);
    const result = api.applyTransaction({ remove: ["r3", "r24"] });

    expect(result).toEqual({ added: 0, updated: 0, removed: 1 });
    expect(core.getRowModel().getRowCount()).toBe(24);
    expect(api.getPaginationInfo().totalRowCount).toBe(24);
    // Slot 19 (r20's new index) never loaded: it shows as missing until fetched.
    expect(viewIds(core).slice(0, 20)).toEqual([
      "r0", "r1", "r2", ...Array.from({ length: 16 }, (_, i) => `r${i + 4}`), undefined,
    ]);
    expect(core.getRowModel().getRowNode("r15")).toBe(r15);
    expect(core.getViewIndexForRowId("r15")).toBe(14);
    expect(core.getRowModel().getRowNode("r3")).toBeUndefined();
    expect([...core.getSelectedRowIds()]).toEqual(["r15"]);
    expect(selectionChanged).toHaveBeenCalled();
    expect(rowsChanged).toHaveBeenCalledWith(expect.objectContaining({ reason: "transaction", rowCount: 24 }));

    // The row the removal pulled into the loaded range comes from the server, at its new index.
    scrollTo(core, 20);
    await flush();
    expect(viewIds(core)).toEqual(server.data.map(r => r.id));
    expectConsistentStore(core);
  });

  it("keeps the edit history (a transaction is not a store reset)", async () => {
    const server = makeServer(flatRows(5));
    const { core, api } = makeGrid(server, {});
    core.setColumnDefsFromProps([
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER, editable: true },
    ]);
    await flush();
    api.setCellValue({ rowId: "r1", colId: core.getColumnModel().getByColId("n")!.instanceID }, 99);
    expect(api.canUndo()).toBe(true);
    server.data.splice(4, 1);
    api.applyTransaction({ remove: ["r4"] });
    await flush();
    expect(api.canUndo()).toBe(true);
  });

  it("removing a loaded group row drops its whole loaded subtree", async () => {
    const server = makeServer([
      { id: "1", region: "APAC", country: "Japan", n: 1 },
      { id: "2", region: "APAC", country: "India", n: 2 },
      { id: "3", region: "EMEA", country: "UK", n: 3 },
    ]);
    const { core, api } = makeGrid(server, { groupDefaultExpanded: -1 });
    api.setRowGroupColumns(["region", "country"]);
    await flush();
    const apac = groupNodeId(["APAC"]);
    expect(core.getRowModel().getRowNode("1")).toBeDefined();
    expect(viewIds(core)[0]).toBe(apac);

    server.data = server.data.filter(r => r.region !== "APAC");
    const result = api.applyTransaction({ remove: [apac, "1"] });

    // Both named rows were loaded; the rest of the subtree goes uncounted.
    expect(result.removed).toBe(2);
    const rm = core.getRowModel() as any;
    expect(rm.listings.has(apac)).toBe(false);
    expect(rm.listings.has(groupNodeId(["APAC", "Japan"]))).toBe(false);
    expect(rm.getRowNode("2")).toBeUndefined();
    expect(viewIds(core)).toEqual([groupNodeId(["EMEA"]), groupNodeId(["EMEA", "UK"]), "3"]);
    await flush();
    expectConsistentStore(core);
  });
});

describe("server-side transactions: add", () => {
  it("inserts at addIndex or appends in the root listing, shifting later rows up", async () => {
    const server = makeServer(flatRows(5));
    const { core, api } = makeGrid(server);
    await flush();

    const added = { id: "x", n: 100 };
    server.data.splice(2, 0, added);
    expect(api.applyTransaction({ add: [{ ...added }], addIndex: 2 })).toEqual({ added: 1, updated: 0, removed: 0 });
    expect(viewIds(core)).toEqual(["r0", "r1", "x", "r2", "r3", "r4"]);

    server.data.push({ id: "y", n: 101 });
    expect(api.applyTransaction({ add: [{ id: "y", n: 101 }] }).added).toBe(1);
    expect(viewIds(core)).toEqual(server.data.map(r => r.id));
    expect(core.getRowModel().getRowCount()).toBe(7);

    // An id that is already loaded updates that row, as client-side.
    expect(api.applyTransaction({ add: [{ id: "r0", n: -5 }] })).toEqual({ added: 0, updated: 1, removed: 0 });
    expect(core.getRowModel().getRowNode("r0")!.data.n).toBe(-5);
    expectConsistentStore(core);
  });

  it("adds into a grouped route: leaves under a full path, group rows under a partial one", async () => {
    const server = makeServer([
      { id: "1", region: "EMEA", country: "France", n: 1 },
      { id: "2", region: "EMEA", country: "UK", n: 2 },
    ]);
    const { core, api } = makeGrid(server, { groupDefaultExpanded: -1 });
    api.setRowGroupColumns(["region", "country"]);
    await flush();

    server.data.push({ id: "3", region: "EMEA", country: "UK", n: 3 });
    expect(api.applyTransaction({ add: [{ id: "3", region: "EMEA", country: "UK", n: 3 }], route: ["EMEA", "UK"] }).added).toBe(1);
    const uk = groupNodeId(["EMEA", "UK"]);
    expect(viewIds(core)).toEqual([groupNodeId(["EMEA"]), groupNodeId(["EMEA", "France"]), "1", uk, "2", "3"]);
    expect(core.getRowModel().getRowNode("3")!.parentId).toBe(uk);

    // A new country group at index 0 of EMEA: default-expanded, so its leaves are fetched.
    server.data.push({ id: "4", region: "EMEA", country: "Austria", n: 4 });
    expect(api.applyTransaction({ add: [{ region: "EMEA", country: "Austria", count: 1 }], route: ["EMEA"], addIndex: 0 }).added).toBe(1);
    await flush();
    expect(viewIds(core).slice(0, 3)).toEqual([groupNodeId(["EMEA"]), groupNodeId(["EMEA", "Austria"]), "4"]);

    // A route the store has not loaded (or that does not exist) skips the additions.
    expect(api.applyTransaction({ add: [{ id: "9", n: 9 }], route: ["APAC", "Japan"] }).added).toBe(0);
    expect(api.applyTransaction({ add: [{ id: "9", n: 9 }], route: ["EMEA", "UK", "deeper"] }).added).toBe(0);
    expectConsistentStore(core);
  });

  it("adds under a tree parent named by its row-id route", async () => {
    const server = makeServer([
      { id: "docs", parent: null, n: 0 },
      { id: "spec", parent: "docs", n: 1 },
      { id: "readme", parent: null, n: 2 },
    ], { tree: true });
    const { core, api } = makeGrid(server, {
      groupDefaultExpanded: -1,
      treeData: { mode: "server", hasChildren: (row: any) => row.id === "docs", getLabel: (row: any) => row.id },
    } as Partial<GridOptions>);
    await flush();
    expect(viewIds(core)).toEqual(["docs", "spec", "readme"]);

    server.data.splice(1, 0, { id: "intro", parent: "docs", n: 3 });
    expect(api.applyTransaction({ add: [{ id: "intro", parent: "docs", n: 3 }], route: ["docs"], addIndex: 0 }).added).toBe(1);
    expect(viewIds(core)).toEqual(["docs", "intro", "spec", "readme"]);
    const intro = core.getRowModel().getRowNode("intro")!;
    expect(intro.parentId).toBe("docs");
    expect(intro.level).toBe(1);

    // A row whose id repeats its parent is refused whole, as a fetched block would be.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(api.applyTransaction({ add: [{ id: "docs", parent: "docs", n: 9 }], route: ["docs"] })).toEqual({ added: 0, updated: 1, removed: 0 });
    expectConsistentStore(core);
  });

  it("skips appends to an open-ended listing, whose end it does not know", async () => {
    const server = makeServer(flatRows(25), { totals: false });
    const { core, api } = makeGrid(server);
    await flush();
    expect(core.getRowModel().isTotalRowCountKnown?.()).toBe(false);
    expect(api.applyTransaction({ add: [{ id: "z", n: 0 }] }).added).toBe(0);
    expect(api.applyTransaction({ add: [{ id: "z", n: 0 }], addIndex: 50 }).added).toBe(0);
    // An index inside the known range is fine.
    server.data.splice(1, 0, { id: "z", n: 0 });
    expect(api.applyTransaction({ add: [{ id: "z", n: 0 }], addIndex: 1 }).added).toBe(1);
    expect(viewIds(core).slice(0, 3)).toEqual(["r0", "z", "r1"]);
  });
});

describe("server-side transactions: in-flight fetches and the cache cap", () => {
  it("discards a block fetched before a structural change and re-requests it", async () => {
    const server = makeServer(flatRows(25), { manual: true });
    const { core, api } = makeGrid(server);
    await flush();
    server.pending.shift()!.respond();
    await flush();
    scrollTo(core, 10);
    await flush();
    // Block 10 is in flight with the pre-change answer (r10..r19).
    expect(server.pending.map(p => p.request.startRow)).toEqual([10]);
    const stale = server.pending.shift()!;

    server.data.splice(0, 1);
    expect(api.applyTransaction({ remove: ["r0"] }).removed).toBe(1);
    // The transaction's own request re-asks for the block where the user is looking.
    expect(server.pending.map(p => p.request.startRow)).toEqual([10]);
    stale.respond();
    await flush();
    // The stale rows were dropped: slot 10 is still empty, not r10 at a pre-change index.
    expect(core.getRowModel().getRowNodeAtViewIndex(10)).toBeUndefined();

    server.pending.shift()!.respond();
    await flush();
    // Block 10 refilled at post-change indices; slot 9 (block 0, out of view) waits for a scan.
    expect(viewIds(core).slice(0, 20)).toEqual([
      ...server.data.slice(0, 9).map(r => r.id), undefined, ...server.data.slice(10, 20).map(r => r.id),
    ]);
    expectConsistentStore(core);
  });

  it("keeps a pure update's in-flight fetches", async () => {
    const server = makeServer(flatRows(25), { manual: true });
    const { core, api } = makeGrid(server);
    await flush();
    server.pending.shift()!.respond();
    await flush();
    scrollTo(core, 10);
    await flush();
    api.applyTransaction({ update: [{ rowId: "r0", row: { id: "r0", n: 5 } }] });
    server.pending.shift()!.respond();
    await flush();
    expect(core.getRowModel().getRowNodeAtViewIndex(10)?.id).toBe("r10");
    expect(server.pending).toHaveLength(0);
  });

  it("moves block-use stamps with the rows so the cap evicts the right blocks", async () => {
    const server = makeServer(flatRows(60));
    const { core, api } = makeGrid(server, { serverSideMaxBlocks: 3 });
    await flush();
    for (const start of [10, 20, 30]) {
      scrollTo(core, start);
      await flush();
    }
    // Block 0 was evicted (least recently used); blocks 10–30 remain.
    const rm = core.getRowModel() as any;
    const root = rm.listings.get("");
    const stampOf = (block: number) => root.blockUse.get(block);
    const before = { 10: stampOf(10), 20: stampOf(20), 30: stampOf(30) };
    expect(stampOf(0)).toBeUndefined();

    // Removing r10 moves r11..r19 into 10..18 and r20 into 19 (so block 10 takes block 20's newer
    // stamp), r30 into 29 (block 20 takes block 30's), and r31..r39 stay in block 30 — which the
    // transaction's refill scan of the viewport (30..40) then touches again.
    server.data.splice(10, 1);
    api.applyTransaction({ remove: ["r10"] });
    expect(stampOf(10)).toBe(Math.max(before[10], before[20]));
    expect(stampOf(20)).toBe(Math.max(before[20], before[30]));
    expect(stampOf(30)).toBeGreaterThan(before[30]);
    expectConsistentStore(core);

    // Keep scrolling: the cap still holds and every slot matches the server.
    scrollTo(core, 40);
    await flush();
    let loaded = 0;
    for (const [idx, node] of root.nodes as Map<number, IRowNode>) {
      expect(node.id).toBe(server.data[idx].id);
      loaded++;
    }
    expect(loaded).toBeLessThanOrEqual(3 * BLOCK);
    expectConsistentStore(core);
  });
});

describe("server-side transactions: pagination", () => {
  it("drops the pager total and refills the page from the server", async () => {
    const server = makeServer(flatRows(25));
    const { core, api } = makeGrid(server, { pagination: true, pageSize: 10 });
    await flush();
    expect(viewIds(core)).toEqual(server.data.slice(0, 10).map(r => r.id));

    server.data.splice(0, 2);
    expect(api.applyTransaction({ remove: ["r0", "r1"] }).removed).toBe(2);
    await flush();
    expect(core.getRowModel().getViewTotalCount()).toBe(23);
    expect(viewIds(core)).toEqual(server.data.slice(0, 10).map(r => r.id));
  });
});
