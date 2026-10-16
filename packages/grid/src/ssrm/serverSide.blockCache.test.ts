import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { groupNodeId } from "../csrm/rowGroup";
import { IServerSideDataSource, IServerSideRequest, IServerSideResult } from "../interfaces/serverSide";
import { resolveMaxBlocks, selectBlocksToEvict } from "./blockCache";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const BLOCK = 10;

// 100 flat rows; 30 groups of 15 leaves when grouped by "grp"; a tree whose "big" folder holds 50
// files. Block size 10 everywhere, so "scrolling through 10 blocks" is 100 rows.
const ROWS = Array.from({ length: 100 }, (_, i) => ({
  id: `r${i}`,
  grp: `g${String(Math.floor(i / 15) % 30).padStart(2, "0")}`,
  n: i,
}));
const GROUPED = Array.from({ length: 30 * 15 }, (_, i) => ({
  id: `l${i}`,
  grp: `g${String(Math.floor(i / 15)).padStart(2, "0")}`,
  n: i,
}));
const TREE = [
  { id: "big", parent: null as string | null, name: "big" },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `top${i}`, parent: null as string | null, name: `top${i}` })),
  ...Array.from({ length: 50 }, (_, i) => ({ id: `f${i}`, parent: "big", name: `f${i}` })),
];

type Mode = "flat" | "grouped" | "tree";

// The fake server answers synchronously unless `manual`, in which case every response waits in
// `pending` until the test releases it — so in-flight states can be held open deliberately.
function makeDataSource(mode: Mode, manual = false) {
  const requests: IServerSideRequest[] = [];
  const pending: Array<{ request: IServerSideRequest; respond: () => void }> = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      let rows: any[];
      if (mode === "tree") {
        rows = TREE.filter(n => n.parent === (request.treeParent?.id ?? null)).map(n => ({ ...n }));
      } else if (mode === "grouped" && request.groupKeys.length < request.groupBy.length) {
        rows = Array.from(new Set(GROUPED.map(r => r.grp))).sort().map(grp => ({ grp }));
      } else {
        const data = mode === "grouped" ? GROUPED : ROWS;
        rows = data.filter(r => request.groupKeys.every(k => (r as any)[k.key] === k.value)).map(r => ({ ...r }));
      }
      const result: IServerSideResult = {
        rows: rows.slice(request.startRow ?? 0, request.endRow ?? rows.length),
        totalRows: rows.length,
      };
      if (manual) pending.push({ request, respond: () => success(result) });
      else success(result);
    },
  };
  return { source, requests, pending };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function makeGrid(mode: Mode, options: object = {}, manual = false) {
  const ds = makeDataSource(mode, manual);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideBlockSize: BLOCK,
    pageSize: BLOCK,
    ...(mode === "tree"
      ? { treeData: { mode: "server", hasChildren: (row: any) => row.id === "big", getLabel: (row: any) => row.name } }
      : {}),
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "grp", key: "grp", label: "Group", type: ColumnType.STRING },
    { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource(ds.source);
  return { core, ds };
}

// The renderer's missing-row scan: one block-aligned viewport request per window position.
const scrollTo = (core: GridCore, flatStart: number) =>
  core.refreshRows("viewport", { start: flatStart, end: flatStart + BLOCK });

// Loaded blocks per listing, read off the store (listing id → sorted block starts).
function loadedBlocks(core: GridCore): Map<string, number[]> {
  const listings: Map<string, { nodes: Map<number, unknown> }> = (core.getRowModel() as any).listings;
  const out = new Map<string, number[]>();
  for (const [id, listing] of listings) {
    const starts = new Set<number>();
    for (const idx of listing.nodes.keys()) starts.add(Math.floor(idx / BLOCK) * BLOCK);
    if (starts.size) out.set(id, Array.from(starts).sort((a, b) => a - b));
  }
  return out;
}
const blockCount = (core: GridCore) =>
  Array.from(loadedBlocks(core).values()).reduce((sum, starts) => sum + starts.length, 0);

// Every loaded node is registered under its id, every registered id points at a loaded node, and
// each slot holds the row the server has at that index.
function expectConsistentStore(core: GridCore, expectedAt: (listingId: string, idx: number) => string) {
  const rm = core.getRowModel() as any;
  const registered = new Set<string>();
  for (const [listingId, listing] of rm.listings as Map<string, any>) {
    for (const [idx, node] of listing.nodes as Map<number, any>) {
      expect(rm.nodesMap.get(node.id)).toBe(node);
      expect(node.id).toBe(expectedAt(listingId, idx));
      registered.add(node.id);
    }
  }
  expect(new Set((rm.nodesMap as Map<string, unknown>).keys())).toEqual(registered);
}

describe("server-side block cache cap (serverSideMaxBlocks)", () => {
  it("resolves the option: unset/non-finite is unbounded, finite values floor to at least 1", () => {
    expect(resolveMaxBlocks(undefined)).toBeUndefined();
    expect(resolveMaxBlocks(Number.NaN)).toBeUndefined();
    expect(resolveMaxBlocks(3.7)).toBe(3);
    expect(resolveMaxBlocks(0)).toBe(1);
  });

  it("evicts least-recently-used unpinned blocks and exceeds the cap rather than a pinned one", () => {
    const blocks = [
      { listingId: "", start: 0, lastUse: 1, pinned: true },
      { listingId: "", start: 10, lastUse: 2, pinned: false },
      { listingId: "", start: 20, lastUse: 5, pinned: false },
      { listingId: "", start: 30, lastUse: 3, pinned: false },
    ];
    expect(selectBlocksToEvict(blocks, 2).map(b => b.start)).toEqual([10, 30]);
    expect(selectBlocksToEvict(blocks, 0).map(b => b.start)).toEqual([10, 30, 20]);
    expect(selectBlocksToEvict(blocks, 4)).toEqual([]);
  });

  it("keeps every block when the option is unset", async () => {
    const { core } = makeGrid("flat");
    await flush();
    for (let b = 1; b < 10; b++) {
      scrollTo(core, b * BLOCK);
      await flush();
    }
    expect(loadedBlocks(core).get("")).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("holds at most the cap after scrolling through 10 blocks, with counts and total unchanged", async () => {
    const { core } = makeGrid("flat", { serverSideMaxBlocks: 3 });
    await flush();
    for (let b = 1; b < 10; b++) {
      scrollTo(core, b * BLOCK);
      await flush();
      expect(blockCount(core)).toBeLessThanOrEqual(3);
    }
    // The most recently used blocks survive; the viewport (block 90) and its neighbour among them.
    expect(loadedBlocks(core).get("")).toEqual([70, 80, 90]);
    const rm = core.getRowModel();
    expect(rm.getRowCount()).toBe(100);
    expect(rm.isTotalRowCountKnown!()).toBe(true);
    expect(core.getPaginationInfo().totalRowCountKnown).toBe(true);
    expect(rm.getRowNode("r5")).toBeUndefined();
    expect(rm.getRowNodeAtViewIndex(5)).toBeUndefined();
    expect(rm.getRowNodeAtViewIndex(95)!.id).toBe("r95");
    expectConsistentStore(core, (_l, idx) => `r${idx}`);
  });

  it("refetches an evicted range when it is scrolled back to", async () => {
    const { core, ds } = makeGrid("flat", { serverSideMaxBlocks: 3 });
    await flush();
    for (let b = 1; b < 10; b++) {
      scrollTo(core, b * BLOCK);
      await flush();
    }
    const before = ds.requests.length;
    scrollTo(core, 0);
    await flush();
    expect(ds.requests.slice(before).map(r => r.startRow)).toEqual([0]);
    const rm = core.getRowModel();
    expect(rm.getRowNodeAtViewIndex(0)!.id).toBe("r0");
    expect(rm.getRowNodeAtViewIndex(9)!.id).toBe("r9");
    expect(blockCount(core)).toBeLessThanOrEqual(3);
    expect(loadedBlocks(core).get("")).toContain(0);
    expectConsistentStore(core, (_l, idx) => `r${idx}`);
  });

  it("never evicts a loaded block whose refetch is in flight", async () => {
    const { core, ds } = makeGrid("flat", { serverSideMaxBlocks: 2 }, true);
    const release = (startRow: number) => {
      const i = ds.pending.findIndex(p => p.request.startRow === startRow);
      ds.pending.splice(i, 1)[0].respond();
    };
    await flush();
    release(0);
    await flush();
    scrollTo(core, 50);
    release(50);
    await flush();
    scrollTo(core, 90);
    release(90);
    await flush();
    expect(loadedBlocks(core).get("")).toEqual([50, 90]);

    // A soft refresh refetches in place: 50 and 90 stay loaded while their requests are open.
    void core.refreshServerSideData({ purge: false });
    await flush();
    release(90);
    release(0);
    await flush();
    // Three loaded, cap two. 90 is the viewport; 50 is the least recently used but its refetch is
    // still open, so the only evictable block is 0 — fresher, yet the one that goes.
    expect(loadedBlocks(core).get("")).toEqual([50, 90]);
    release(50);
    await flush();
    expect(loadedBlocks(core).get("")).toEqual([50, 90]);
    expect(core.getRowModel().getRowNodeAtViewIndex(55)!.id).toBe("r55");
    while (ds.pending.length) ds.pending.shift()!.respond();
    await flush();
    expectConsistentStore(core, (_l, idx) => `r${idx}`);
  });

  it("keeps a block holding an expanded group while its children are loaded", async () => {
    const { core } = makeGrid("grouped", { serverSideMaxBlocks: 2 });
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["grp"] });
    await flush();
    const g02 = groupNodeId(["g02"]);
    core.dispatch({ type: "groupToggleExpand", groupId: g02 });
    await flush();
    const rm = core.getRowModel();
    const total = rm.getRowCount();
    expect(total).toBe(30 + 15);

    // Flat: g00..g02 (0-2), g02's 15 children (3-17), g03..g29 (18-44). Scroll to the bottom and
    // through g02's second child block.
    for (const flat of [10, 20, 30, 40]) {
      scrollTo(core, flat);
      await flush();
      if (flat === 20) {
        // Over the cap with g02's two child blocks loaded: root block 0 (holding g02) stays.
        expect(loadedBlocks(core).get(g02)).toEqual([0, 10]);
        expect(loadedBlocks(core).get("")).toContain(0);
      }
    }
    const blocks = loadedBlocks(core);
    // Root block 0 holds the expanded g02: kept although the viewport is far below and the cap is
    // exceeded by it.
    expect(blocks.get("")).toEqual([0, 10, 20]);
    // g02's own child blocks, far from the viewport and expanding nothing, were evicted; the
    // listing's count and the group's span survive.
    expect(blocks.get(g02)).toBeUndefined();
    expect(rm.getRowNode(g02)!.isExpanded).toBe(true);
    expect(rm.getRowCount()).toBe(total);
    expect(rm.getSubtreeEndViewIndex!(g02)).toBe(17);

    // Scrolling back up refetches g02's evicted children under the kept parent.
    scrollTo(core, 0);
    await flush();
    expect(rm.getRowNodeAtViewIndex(3)!.id).toBe("l30");
    expect(rm.getRowNodeAtViewIndex(3)!.parentId).toBe(g02);
  });

  it("keeps the selection by id across eviction and refetch", async () => {
    const { core } = makeGrid("flat", { serverSideMaxBlocks: 2, rowSelection: true });
    await flush();
    core.selectRowsById(["r3", "r4"]);
    for (let b = 1; b < 10; b++) {
      scrollTo(core, b * BLOCK);
      await flush();
    }
    expect(core.getRowModel().getRowNode("r3")).toBeUndefined();
    expect(core.getSelectedRowIds()).toEqual(new Set(["r3", "r4"]));
    scrollTo(core, 0);
    await flush();
    expect(core.getSelectedNodes().map(n => n.id).sort()).toEqual(["r3", "r4"]);
  });

  it("applies the same rule to server tree-data listings", async () => {
    const { core, ds } = makeGrid("tree", { serverSideMaxBlocks: 2 });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "big" });
    await flush();
    const rm = core.getRowModel();
    expect(rm.getRowCount()).toBe(10 + 50);

    // Flat: big (0), its 50 files (1-50), top0..top8 (51-59).
    for (let flat = 10; flat < 60; flat += BLOCK) {
      scrollTo(core, flat);
      await flush();
    }
    const blocks = loadedBlocks(core);
    // Root block 0 holds the expanded "big" and is kept. Of big's five blocks, the three left are
    // all within one block of the viewport (flat 40-60 reaches child 29): over the cap of two, but
    // every one protected. The early ones went.
    expect(blocks.get("")).toEqual([0]);
    expect(blocks.get("big")).toEqual([20, 30, 40]);
    expect(rm.getRowNode("f0")).toBeUndefined();
    expect(rm.getRowCount()).toBe(60);

    const before = ds.requests.length;
    scrollTo(core, 0);
    await flush();
    const refetch = ds.requests.slice(before);
    expect(refetch.map(r => [r.treeParent?.id, r.startRow])).toEqual([["big", 0]]);
    expect(rm.getRowNodeAtViewIndex(1)!.id).toBe("f0");
    expectConsistentStore(core, (listingId, idx) => listingId === "big"
      ? `f${idx}`
      : TREE.filter(n => n.parent === null)[idx].id);
  });

  it("keeps a collapsed parent whose child fetch is in flight, and ingests that late response", async () => {
    const { core, ds } = makeGrid("grouped", { serverSideMaxBlocks: 1 }, true);
    const flushAll = async () => {
      for (let i = 0; i < 6 && ds.pending.length; i++) {
        ds.pending.shift()!.respond();
        await flush();
      }
    };
    await flush();
    await flushAll();
    core.dispatch({ type: "rowGroupSet", colIds: ["grp"] });
    await flush();
    await flushAll();
    const g01 = groupNodeId(["g01"]);
    core.dispatch({ type: "groupToggleExpand", groupId: g01 });
    await flush();
    // g01's child fetch is open; collapse it and load far-away root blocks so root block 0 is the
    // least recently used.
    const childFetch = ds.pending.findIndex(p => p.request.groupKeys.length === 1);
    expect(childFetch).toBeGreaterThanOrEqual(0);
    const child = ds.pending.splice(childFetch, 1)[0];
    while (ds.pending.length) ds.pending.shift()!.respond();
    core.dispatch({ type: "groupToggleExpand", groupId: g01, expanded: false });
    await flush();
    for (const flat of [20]) {
      scrollTo(core, flat);
      await flush();
      await flushAll();
    }
    const rm = core.getRowModel();
    expect(rm.getRowNode(g01)).toBeDefined();
    expect(loadedBlocks(core).get("")).toContain(0);

    // The late response ingests cleanly; with its fetch settled nothing protects root block 0
    // any more, so this completion's own eviction pass may take g01 (and the children it just
    // received) along. Either way the store stays coherent.
    child.respond();
    await flush();
    expectConsistentStore(core, (listingId, idx) => listingId === ""
      ? groupNodeId([`g${String(idx).padStart(2, "0")}`])
      : `l${15 * Number(listingId.slice(-2)) + idx}`);

    // Back at the top the root block refetches, g01 returns collapsed, and expanding it loads its
    // children again.
    scrollTo(core, 0);
    await flush();
    await flushAll();
    expect(rm.getRowNode(g01)!.isExpanded).toBe(false);
    core.dispatch({ type: "groupToggleExpand", groupId: g01, expanded: true });
    await flush();
    await flushAll();
    expect(rm.getRowNodeAtViewIndex(2)!.id).toBe("l15");
    expectConsistentStore(core, (listingId, idx) => listingId === ""
      ? groupNodeId([`g${String(idx).padStart(2, "0")}`])
      : `l${15 * Number(listingId.slice(-2)) + idx}`);
  });

  it("stays consistent when many delayed blocks complete out of order", async () => {
    const { core, ds } = makeGrid("flat", { serverSideMaxBlocks: 3 }, true);
    await flush();
    ds.pending.shift()!.respond();
    await flush();
    for (let b = 1; b < 10; b++) scrollTo(core, b * BLOCK);
    await flush();
    // Release in a scrambled order: every completion runs an eviction pass over a store whose
    // other blocks are still open.
    const order = [4, 0, 7, 2, 8, 1, 5, 3, 6];
    const queued = ds.pending.splice(0);
    for (const i of order) {
      queued[i].respond();
      await flush();
    }
    expect(blockCount(core)).toBeLessThanOrEqual(3);
    expect(core.getRowModel().getRowCount()).toBe(100);
    expectConsistentStore(core, (_l, idx) => `r${idx}`);

    scrollTo(core, 40);
    await flush();
    while (ds.pending.length) ds.pending.shift()!.respond();
    await flush();
    expect(core.getRowModel().getRowNodeAtViewIndex(45)!.id).toBe("r45");
    expectConsistentStore(core, (_l, idx) => `r${idx}`);
  });

  // A cap smaller than the first load window (pageSize 100 = 10 blocks, cap 3): the fill must not
  // evict blocks it is still loading, or each completion re-requests what its own pass dropped.
  // The data source stops answering after a hard bound, so a regression fails instead of spinning
  // the (synchronous) fetch chain in microtasks forever.
  it("fills a load window larger than the cap without re-requesting evicted blocks", async () => {
    const ds = makeDataSource("flat");
    const inner = ds.source.getRows;
    const LIMIT = 200;
    ds.source.getRows = (params) => {
      if (ds.requests.length >= LIMIT) return;
      return inner(params);
    };
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      serverSideBlockSize: BLOCK,
      pageSize: 100,
      serverSideMaxBlocks: 3,
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
    core.setServerSideDataSource(ds.source);
    await flush();

    // Each of the window's 10 blocks was asked for exactly once: nothing evicted mid-fill came back.
    const starts = ds.requests.map(r => r.startRow);
    expect(ds.requests.length).toBeLessThan(LIMIT);
    expect(starts.slice().sort((a, b) => a! - b!)).toEqual(Array.from({ length: 10 }, (_, i) => i * BLOCK));
    // Once the window is satisfied the cap applies again: the viewport's blocks (0 and 10) plus
    // the freshest one stay, the cold rest are evicted — and nothing refetches them.
    expect(blockCount(core)).toBe(3);
    expect(loadedBlocks(core).get("")).toEqual([0, 10, 90]);
    await flush();
    expect(ds.requests.length).toBe(10);
    expectConsistentStore(core, (_l, idx) => `r${idx}`);

    // Scrolling on keeps the cap, and the evicted rows refetch on demand.
    scrollTo(core, 50);
    await flush();
    expect(core.getRowModel().getRowNodeAtViewIndex(50)!.id).toBe("r50");
    expect(blockCount(core)).toBeLessThanOrEqual(3);
    expect(ds.requests.length).toBeLessThan(LIMIT);
  });

  it("fills a large window with delayed, out-of-order responses and still settles", async () => {
    const { core, ds } = makeGrid("flat", { pageSize: 100, serverSideMaxBlocks: 2 }, true);
    // Release responses newest-first until the chain stops asking; bounded so a loop fails.
    for (let i = 0; i < 100 && ds.pending.length > 0; i++) {
      ds.pending.pop()!.respond();
      await flush();
    }
    expect(ds.pending).toHaveLength(0);
    const starts = ds.requests.map(r => r.startRow!);
    expect(new Set(starts).size).toBe(starts.length);
    expect(starts).toHaveLength(10);
    expect(blockCount(core)).toBeLessThanOrEqual(3);
    expectConsistentStore(core, (_l, idx) => `r${idx}`);
  });
});
