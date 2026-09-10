import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// A ragged file tree: folders and files are SIBLINGS at every level, depth varies per branch, and
// only the server knows who has children. Nothing here is a group bucket — every row is a data row
// with its own id, which is what server tree mode is for.
//
//   docs/            (folder, 3 children)
//     spec.md        (file)
//     images/        (folder, 1 child)
//       logo.png     (file)
//     notes/         (folder, 1 child)
//       q1.txt       (file)
//   readme.md        (file)          <- leaf beside a parent at the root
//   src/             (folder, 1 child)
//     index.ts       (file)
type Node = { id: string; name: string; kind: "folder" | "file"; parent: string | null; size: number };

const TREE: Node[] = [
  { id: "docs", name: "docs", kind: "folder", parent: null, size: 0 },
  { id: "readme", name: "readme.md", kind: "file", parent: null, size: 12 },
  { id: "src", name: "src", kind: "folder", parent: null, size: 0 },
  { id: "spec", name: "spec.md", kind: "file", parent: "docs", size: 40 },
  { id: "images", name: "images", kind: "folder", parent: "docs", size: 0 },
  { id: "notes", name: "notes", kind: "folder", parent: "docs", size: 0 },
  { id: "logo", name: "logo.png", kind: "file", parent: "images", size: 90 },
  { id: "q1", name: "q1.txt", kind: "file", parent: "notes", size: 7 },
  { id: "index", name: "index.ts", kind: "file", parent: "src", size: 55 },
];

const hasChildren = (row: any) => TREE.some(n => n.parent === row.id);

/**
 * In-memory implementation of the tree contract: children of `treeParent.id` (or the roots when
 * the request carries no `treeParent`), sliced to the requested block. `totals: false` omits
 * totalRows so the listing stays open-ended; `delay` defers responses like a real server.
 */
function makeDataSource(options: { totals?: boolean; delay?: number } = {}) {
  const includeTotals = options.totals !== false;
  const requests: IServerSideRequest[] = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      const respond = options.delay
        ? (result: any) => setTimeout(() => success(result), options.delay)
        : success;
      const parentId = request.treeParent?.id ?? null;
      let rows = TREE.filter(n => n.parent === parentId);
      // Honor whichever sort the grid sent, including one on the hierarchy column's own key.
      const sort = request.sorts[0];
      if (sort) {
        const field = sort.key === "__pte_tree__" ? "name" : sort.key;
        const dir = sort.dir === "desc" ? -1 : 1;
        rows = rows.slice().sort((a, b) => {
          const av = (a as any)[field];
          const bv = (b as any)[field];
          return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
        });
      }
      const start = request.startRow ?? 0;
      const end = request.endRow ?? rows.length;
      respond({
        rows: rows.slice(start, end).map(row => ({ ...row })),
        totalRows: includeTotals ? rows.length : undefined,
      });
    },
  };
  return { source, requests };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function makeGrid(options: object = {}, dsOptions: { totals?: boolean; delay?: number } = {}) {
  const ds = makeDataSource(dsOptions);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    treeData: { mode: "server", hasChildren, getLabel: (row: any) => row.name },
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "kind", key: "kind", label: "Kind", type: ColumnType.STRING },
    { colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER },
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

const ids = (core: GridCore) => viewNodes(core).map(n => n.id);

describe("server-side tree data", () => {
  it("loads the root listing with no treeParent and no grouping fields", async () => {
    const { core, ds } = makeGrid();
    await flush();

    expect(ds.requests).toHaveLength(1);
    const root = ds.requests[0];
    expect(root.treeParent).toBeUndefined();
    expect("treeParent" in root).toBe(false);
    expect(root.groupBy).toEqual([]);
    expect(root.groupKeys).toEqual([]);
    expect(root.aggregates).toEqual([]);
    expect(ids(core)).toEqual(["docs", "readme", "src"]);
    expect(core.getPaginationInfo().totalRowCountKnown).toBe(true);
  });

  it("marks parents expandable and leaves not, and labels both in the tree column", async () => {
    const { core } = makeGrid();
    await flush();

    const [docs, readme] = viewNodes(core);
    expect(docs).toMatchObject({
      id: "docs",
      isGroup: false,
      isTreeData: true,
      type: "leaf",
      expandable: true,
      isExpanded: false,
      level: 0,
      treeKey: "docs",
    });
    // A leaf carries no `expandable` at all: absent means "derive it", and with no children there
    // is nothing to derive from. Only a parent needs the explicit flag.
    expect(readme.expandable).toBeUndefined();
    expect(readme.isTreeData).toBe(true);
    expect(readme.treeKey).toBe("readme.md");
    // The generated hierarchy column exists on this model too.
    expect(core.getColumnModel().getHierarchyColumn()?.key).toBe("__pte_tree__");
  });

  it("expanding a parent requests exactly its children and splices them in", async () => {
    const { core, ds } = makeGrid();
    await flush();
    const before = ds.requests.length;

    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();

    const fresh = ds.requests.slice(before);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].treeParent).toEqual({
      id: "docs",
      path: ["docs"],
      data: expect.objectContaining({ id: "docs", name: "docs" }),
    });
    expect(fresh[0].groupBy).toEqual([]);
    expect(fresh[0].groupKeys).toEqual([]);
    expect(ids(core)).toEqual(["docs", "spec", "images", "notes", "readme", "src"]);
  });

  it("flattens ragged siblings in order with per-row level and parentId", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "images" });
    await flush();

    expect(ids(core)).toEqual(["docs", "spec", "images", "logo", "notes", "readme", "src"]);
    const byId = new Map(viewNodes(core).map(n => [n.id, n]));
    // A leaf (spec) sits between two parents at level 1; the grandchild is level 2.
    expect(byId.get("spec")).toMatchObject({ level: 1, parentId: "docs", expandable: undefined });
    expect(byId.get("images")).toMatchObject({ level: 1, parentId: "docs", expandable: true });
    expect(byId.get("logo")).toMatchObject({ level: 2, parentId: "images" });
    expect(byId.get("readme")).toMatchObject({ level: 0, parentId: undefined });
    // The deep request's path is the row-id chain, root first.
    const deep = ds.requests[ds.requests.length - 1];
    expect(deep.treeParent?.path).toEqual(["docs", "images"]);
  });

  it("collapsing issues no request and re-expanding reuses the cached block", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();
    const before = ds.requests.length;

    core.dispatch({ type: "groupToggleExpand", groupId: "docs", expanded: false });
    await flush();
    expect(ids(core)).toEqual(["docs", "readme", "src"]);
    expect(ds.requests.length).toBe(before);

    core.dispatch({ type: "groupToggleExpand", groupId: "docs", expanded: true });
    await flush();
    expect(ids(core)).toEqual(["docs", "spec", "images", "notes", "readme", "src"]);
    expect(ds.requests.length).toBe(before);
  });

  it("groupDefaultExpanded -1 fans the whole tree out on load", async () => {
    const { core } = makeGrid({ groupDefaultExpanded: -1 });
    await flush();

    expect(ids(core)).toEqual([
      "docs", "spec", "images", "logo", "notes", "q1", "readme", "src", "index",
    ]);
    expect(core.getPaginationInfo().totalRowCountKnown).toBe(true);
  });

  it("groupDefaultExpanded N stops at that depth", async () => {
    const { core } = makeGrid({ groupDefaultExpanded: 1 });
    await flush();

    // Level 0 parents open; their level-1 children stay closed.
    expect(ids(core)).toEqual(["docs", "spec", "images", "notes", "readme", "src", "index"]);
    const byId = new Map(viewNodes(core).map(n => [n.id, n]));
    expect(byId.get("docs")!.isExpanded).toBe(true);
    expect(byId.get("images")!.isExpanded).toBe(false);
  });

  it("an open-ended child listing probes forward and pins on a short block", async () => {
    // Pagination + a tiny block size keeps the loaded frontier inside the tree, which is what
    // makes an uncounted listing observable: without totalRows every listing ends at a phantom
    // slot the renderer then asks for.
    const { core } = makeGrid({ pagination: true, pageSize: 2, serverSideBlockSize: 2 }, { totals: false });
    await flush();
    // Root block 0: 2 loaded rows + the probe slot, so the total is provisional.
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 3, totalRowCountKnown: false });

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    // Page 2 pulls root block 2, which comes back short (1 row) and pins the root at 3.
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 3, totalRowCountKnown: true });

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: 2 });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();
    // docs' children are open-ended in turn: 2 loaded + its own probe slot past them.
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 6, totalRowCountKnown: false });
    expect(ids(core)).toEqual(["docs", "spec"]);

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    expect(core.getPaginationInfo()).toMatchObject({ totalRowCount: 6, totalRowCountKnown: true });
    expect(ids(core)).toEqual(["images", "notes"]);
  });

  it("sorting purges the store, keeps expansion, and reloads subtrees with the sort", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();

    const sizeCol = core.getColumnModel().getByColId("size")!;
    core.setSortModel([{ key: sizeCol.instanceID, dir: "desc" }]);
    await flush();

    const sorted = ds.requests.filter(r => r.sorts.length > 0);
    expect(sorted.length).toBeGreaterThanOrEqual(2);
    expect(sorted.every(r => r.sorts[0].key === "size" && r.sorts[0].dir === "desc")).toBe(true);
    // Root order follows the server's sort (folders report size 0), and the expanded subtree came
    // back without a click.
    expect(ids(core)).toEqual(["readme", "docs", "spec", "images", "notes", "src"]);
    expect(core.getRowModel().getRowNode("docs")!.isExpanded).toBe(true);
  });

  it("sorts the hierarchy column under the tree column's own key", async () => {
    const { core, ds } = makeGrid();
    await flush();
    const tree = core.getColumnModel().getHierarchyColumn()!;

    core.setSortModel([{ key: tree.instanceID, dir: "desc" }]);
    await flush();

    const last = ds.requests[ds.requests.length - 1];
    expect(last.sorts).toEqual([{ key: "__pte_tree__", dir: "desc" }]);
  });

  it("sorts the hierarchy column under the configured columnDef key", async () => {
    const { core, ds } = makeGrid({
      treeData: {
        mode: "server",
        hasChildren,
        getLabel: (row: any) => row.name,
        // Naming the server's own field is what lets the server sort/filter the hierarchy column.
        columnDef: { key: "name", label: "File" },
      },
    });
    await flush();
    const tree = core.getColumnModel().getHierarchyColumn()!;
    expect(tree.label).toBe("File");

    core.setSortModel([{ key: tree.instanceID, dir: "desc" }]);
    await flush();

    const last = ds.requests[ds.requests.length - 1];
    expect(last.sorts).toEqual([{ key: "name", dir: "desc" }]);
    expect(ids(core)).toEqual(["src", "readme", "docs"]);
  });

  it("refreshServerSideData({ rowId }) purge reloads only that subtree", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "images" });
    await flush();

    const before = ds.requests.length;
    await core.refreshServerSideData({ rowId: "docs", purge: true });
    await flush();

    const fresh = ds.requests.slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    // docs' own children plus the still-expanded images subtree; never the root listing.
    expect(fresh.every(r => r.treeParent != null)).toBe(true);
    expect(new Set(fresh.map(r => r.treeParent!.id))).toEqual(new Set(["docs", "images"]));
    expect(ids(core)).toEqual(["docs", "spec", "images", "logo", "notes", "readme", "src"]);
  });

  it("refreshServerSideData({ rowId }) soft-refreshes in place without dropping rows", async () => {
    const { core, ds } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();

    const before = ds.requests.length;
    void core.refreshServerSideData({ rowId: "docs" });
    // No purge: the rows stay on screen through the refetch.
    expect(ids(core)).toEqual(["docs", "spec", "images", "notes", "readme", "src"]);
    await flush();

    const fresh = ds.requests.slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every(r => r.treeParent?.id === "docs")).toBe(true);
    expect(ids(core)).toEqual(["docs", "spec", "images", "notes", "readme", "src"]);
  });

  it("refreshServerSideData reports false for a row whose children are not loaded", async () => {
    const { core } = makeGrid();
    await flush();

    // "src" is a parent, but collapsed: nothing below it has ever been fetched.
    await expect(core.refreshServerSideData({ rowId: "src", purge: true })).resolves.toBe(false);
    await expect(core.refreshServerSideData({ rowId: "nope" })).resolves.toBe(false);
  });

  it("warns and ignores rowId when groupKeys is passed too", async () => {
    const { core } = makeGrid();
    await flush();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await core.refreshServerSideData({ groupKeys: [{ key: "kind", value: "folder" }], rowId: "docs" });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("groupKeys or rowId"));
    warn.mockRestore();
  });

  it("answers subtree spans and ancestor chains for unloaded child slots", async () => {
    // Block size 2 leaves docs' third child (notes) counted but unloaded on page 1.
    const { core } = makeGrid({ pagination: true, pageSize: 2, serverSideBlockSize: 2 });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();

    const rm = core.getRowModel();
    // Flattened: [docs, spec, images, notes, readme, src]; page 1 shows flat 0-1.
    expect(rm.getRowCount()).toBe(6);
    // docs' subtree ends at its last child (flat 3).
    expect(rm.getSubtreeEndViewIndex!("docs")).toBe(3);
    // A collapsed parent's span is its own row.
    expect(rm.getSubtreeEndViewIndex!("images")).toBe(rm.getRowNode("images")!.viewIndex);
    // A plain leaf has no subtree at all.
    expect(rm.getSubtreeEndViewIndex!("readme")).toBeUndefined();

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    // Page 2 covers flat 2-3; child index 2 (notes) belongs to a block page 2 did request, so
    // check the chain through the page-local slot regardless of load state.
    const chain = rm.getAncestorChainAtViewIndex!(0);
    expect(chain.map(n => n.id)).toEqual(["docs"]);
  });

  it("forEachNode visits parents and their loaded descendants", async () => {
    const { core } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "images" });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "images", expanded: false });
    await flush();

    const seen: string[] = [];
    core.getRowModel().forEachNode(node => seen.push(node.id));
    // Document order, collapsed subtrees included (images is collapsed but its child is loaded).
    expect(seen).toEqual(["docs", "spec", "images", "logo", "notes", "readme", "src"]);
  });

  it("reports loaded tree parents as the hierarchy nodes, leaves excluded", async () => {
    // The set saved views capture and restore expansion against. Tree mode has no synthetic group
    // rows, so this is the loaded parents — matching what the client-side tree model reports.
    const { core } = makeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();

    const rm = core.getRowModel();
    expect(rm.getGroupNodes().map(n => n.id).sort()).toEqual(["docs", "images", "notes", "src"]);
    expect(rm.getHierarchyRoots!().map(n => n.id)).toEqual(["docs", "readme", "src"]);
  });

  it("drops a client-side tree mode configured on the server-side row model", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      treeData: { mode: "parent", getParentId: (row: any) => row.parent },
    });

    expect(core.getOptions().treeData).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Tree data mode "parent" requires the client-side row model'));
    warn.mockRestore();
  });

  it("drops server tree mode configured on the client-side row model", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      treeData: { mode: "server", hasChildren },
    });

    expect(core.getOptions().treeData).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Tree data mode "server" requires rowModelType "serverSide"'));
    warn.mockRestore();
  });
});
