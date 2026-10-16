/**
 * Duplicate ids and duplicate paths in client-side tree data (finding A2.3) warn and keep going —
 * the grid never throws over them. The FIRST row keeps the id / path; a later duplicate id is
 * dropped (nested-children: its children stay, under the kept row); a later duplicate path is a
 * leaf beside the first row. One warning per load names the offending ids / paths and the count.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { TreeDataOptions } from "../interfaces/gridOptions";

const measurer = { measure: (text: string) => text.length * 7 };

function createTree<Row extends object>(treeData: TreeDataOptions<Row>, rows: Row[]) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    treeData,
    groupDefaultExpanded: -1,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  ]);
  return core;
}

function view(core: GridCore): IRowNode[] {
  const model = core.getRowModel();
  return Array.from({ length: model.getViewCount() }, (_, i) => model.getRowNodeAtViewIndex(i)!);
}

/** `id@level` per displayed row, with the row's `name` for data rows. */
function outline(core: GridCore): string[] {
  return view(core).map(n => `${n.isGroup ? n.id : `${n.id}:${(n.data as any).name}`}@${n.level}`);
}

/** Re-sort by name descending: a full tree rebuild over the same row nodes. */
function sortByName(core: GridCore) {
  const name = core.getColumnModel().getLeaves().find(c => c.key === "name")!;
  core.dispatch({ type: "sortModelSet", sortItems: [{ key: name.instanceID, dir: "desc" }] });
}

const warnings = () => (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]));

afterEach(() => vi.restoreAllMocks());

describe("client tree data: duplicate ids", () => {
  it("parent mode: keeps the first row, drops the later one, warns once naming the id and count", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = createTree(
      { mode: "parent", getParentId: (row: any) => row.parentId },
      [
        { id: "root", name: "Root" },
        { id: "a", name: "first a", parentId: "root" },
        { id: "a", name: "second a", parentId: "root" },
        { id: "a", name: "third a" },
        { id: "child", name: "Child", parentId: "a" },
      ],
    );
    expect(outline(core)).toEqual(["root:Root@0", "a:first a@1", "child:Child@2"]);
    expect(core.getRowModel().getRowNode("a")?.data.name).toBe("first a");
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/2 row\(s\) with a duplicate id: "a"/);
  });

  it("path mode: a repeated id is dropped before its path is read", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = createTree(
      { mode: "path", getPath: (row: any) => row.path },
      [
        { id: "x", name: "first", path: ["P"] },
        { id: "x", name: "second", path: ["Q"] },
      ],
    );
    expect(outline(core)).toEqual(["x:first@0"]);
    expect(warnings()[0]).toMatch(/duplicate id: "x"/);
  });

  it("children mode: the later row is dropped and its children stay, under the kept row", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = createTree(
      { mode: "children", getChildren: (row: any) => row.children },
      [
        { id: "a", name: "first a", children: [{ id: "a1", name: "A1" }] },
        { id: "a", name: "second a", children: [{ id: "a2", name: "A2" }] },
      ],
    );
    expect(outline(core)).toEqual(["a:first a@0", "a1:A1@1", "a2:A2@1"]);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/1 row\(s\) with a duplicate id: "a"/);
  });

  it("children mode: the same row object listed twice is one duplicate, walked once", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const shared = { id: "s", name: "Shared", children: [{ id: "s1", name: "S1" }] };
    const core = createTree(
      { mode: "children", getChildren: (row: any) => row.children },
      [shared, { id: "p", name: "P", children: [shared] }],
    );
    expect(outline(core)).toEqual(["s:Shared@0", "s1:S1@1", "p:P@0"]);
    expect(warnings()[0]).toMatch(/duplicate id: "s"/);
  });

  it("warns again on the next setRowData that carries duplicates, not on rebuilds", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = [{ id: "a", name: "one" }, { id: "a", name: "two" }];
    const core = createTree({ mode: "parent", getParentId: () => undefined }, rows);
    expect(warnings()).toHaveLength(1);
    sortByName(core);
    expect(warnings()).toHaveLength(1);
    core.setRowData(rows.map(r => ({ ...r })));
    expect(warnings()).toHaveLength(2);
  });
});

describe("client tree data: duplicate paths", () => {
  it("keeps the first row as the path's owner; the later one is a leaf beside it; warns naming the path", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = createTree(
      { mode: "path", getPath: (row: any) => row.path },
      [
        { id: "a", name: "first", path: ["Top", "Same"] },
        { id: "b", name: "second", path: ["Top", "Same"] },
        { id: "c", name: "child", path: ["Top", "Same", "Leaf"] },
      ],
    );
    expect(() => outline(core)).not.toThrow();
    const rows = view(core);
    const top = rows[0];
    expect(top.isGroup).toBe(true);
    expect(outline(core)).toEqual([`${top.id}@0`, "a:first@1", "c:child@2", "b:second@1"]);
    // The first row owns the path and its descendants; the duplicate is childless, same parent.
    const model = core.getRowModel();
    expect(model.getRowNode("c")?.parentId).toBe("a");
    expect(model.getRowNode("b")?.children).toBeUndefined();
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/1 row\(s\) with a duplicate path: \["Top","Same"\] \(row "b", first held by row "a"\)/);
  });

  it("does not repeat the warning on a rebuild over the same rows", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = createTree(
      { mode: "path", getPath: (row: any) => row.path },
      [
        { id: "a", name: "first", path: ["Same"] },
        { id: "b", name: "second", path: ["Same"] },
      ],
    );
    const count = warnings().length;
    expect(count).toBe(1);
    sortByName(core);
    // The rebuild happened (the order follows the new sort) and stayed quiet.
    expect(outline(core)).toEqual(["b:second@0", "a:first@0"]);
    expect(warnings()).toHaveLength(count);
  });

  it("a transaction that introduces a duplicate path warns for it and does not throw", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = createTree(
      { mode: "path", getPath: (row: any) => row.path },
      [{ id: "a", name: "first", path: ["Same"] }],
    );
    expect(warnings()).toHaveLength(0);
    expect(() => core.applyTransaction({ add: [{ id: "b", name: "second", path: ["Same"] }] })).not.toThrow();
    expect(outline(core)).toEqual(["a:first@0", "b:second@0"]);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/\["Same"\] \(row "b", first held by row "a"\)/);
  });
});
