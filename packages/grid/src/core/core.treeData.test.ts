import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { FilterType } from "../interfaces/filter";
import { IRowNode } from "../interfaces/iRowNode";
import { TreeDataOptions } from "../interfaces/gridOptions";

const measurer = { measure: (text: string) => text.length * 7 };

function createTree<Row extends object>(
  treeData: TreeDataOptions<Row>,
  rows: Row[],
  options: Record<string, unknown> = {},
) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    treeData,
    ...options,
  });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  });
  core.setRowData(rows);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, editable: true },
    { colId: "value", key: "value", label: "Value", type: ColumnType.NUMBER },
  ]);
  return core;
}

function view(core: GridCore): IRowNode[] {
  const model = core.getRowModel();
  return Array.from({ length: model.getViewCount() }, (_, index) =>
    model.getRowNodeAtViewIndex(index)!,
  );
}

describe("GridCore tree data", () => {
  it("builds path trees with deterministic synthetic ancestors and a generated tree column", () => {
    const core = createTree(
      {
        mode: "path",
        getPath: (row: any) => row.path,
        columnDef: { label: "Location", width: 300 },
      },
      [
        { id: "paris", name: "Paris", path: ["World", "Europe", "France", "Paris"] },
        { id: "berlin", name: "Berlin", path: ["World", "Europe", "Germany", "Berlin"] },
      ],
      { groupDefaultExpanded: -1 },
    );

    expect(core.getColumnModel().getAutoGroupColumns()).toHaveLength(0);
    const hierarchy = core.getColumnModel().getHierarchyColumn();
    expect(hierarchy?.label).toBe("Location");
    expect(hierarchy?.width).toBe(300);
    expect(hierarchy?.pinned).toBeNull();
    expect(hierarchy?.isInternal()).toBe(false);
    expect(hierarchy?.sortable).toBe(true);
    expect(hierarchy?.hideable).toBe(true);
    expect(view(core).map(node => node.treeKey)).toEqual([
      "World", "Europe", "France", "Paris", "Germany", "Berlin",
    ]);
    expect(view(core).map(node => node.level)).toEqual([0, 1, 2, 3, 2, 3]);
    expect(view(core).find(node => node.id === "paris")?.isGroup).toBe(false);
  });

  it("allows a real path row to be a data-bearing editable parent", () => {
    const core = createTree(
      { mode: "path", getPath: (row: any) => row.path },
      [
        { id: "europe", name: "Europe record", value: 10, path: ["World", "Europe"] },
        { id: "france", name: "France", value: 20, path: ["World", "Europe", "France"] },
      ],
      { groupDefaultExpanded: -1 },
    );

    const europe = core.getRowModel().getRowNode("europe")!;
    expect(europe.isGroup).toBe(false);
    expect(europe.isTreeData).toBe(true);
    expect(europe.children?.map(child => child.id)).toEqual(["france"]);

    const nameCol = core.getColumnModel().getByColId("name")!;
    core.dispatch({ type: "editStart", cell: { rowId: "europe", colId: nameCol.instanceID } });
    expect(core.getEditingCell()).toEqual({ rowId: "europe", colId: nameCol.instanceID });
  });

  it("builds parent-reference trees independently of input order and sorts siblings locally", () => {
    const core = createTree(
      {
        mode: "parent",
        getParentId: (row: any) => row.parentId,
        getLabel: (row: any) => row.name,
      },
      [
        { id: "b", parentId: "root", name: "Beta", value: 2 },
        { id: "root", parentId: null, name: "Root", value: 0 },
        { id: "a", parentId: "root", name: "Alpha", value: 1 },
      ],
      { groupDefaultExpanded: -1, initialSort: [{ colId: "name", dir: "asc" }] },
    );

    expect(view(core).map(node => node.id)).toEqual(["root", "a", "b"]);
    expect(core.getRowModel().getRowNode("a")?.parentId).toBe("root");
  });

  it("flattens nested-children input while keeping every row addressable by id", () => {
    const roots = [{
      id: "root",
      name: "Root",
      children: [
        { id: "child", name: "Child", children: [{ id: "leaf", name: "Leaf", children: [] }] },
      ],
    }];
    const core = createTree(
      {
        mode: "children",
        getChildren: (row: any) => row.children,
        getLabel: (row: any) => row.name,
      },
      roots,
      { groupDefaultExpanded: -1 },
    );

    expect(view(core).map(node => node.id)).toEqual(["root", "child", "leaf"]);
    expect(core.getRowModel().getRowNode("leaf")?.level).toBe(2);
    expect(core.getRowModel().getRowCount()).toBe(3);
  });

  it("retains the ancestors of matching filtered rows", () => {
    const core = createTree(
      { mode: "parent", getParentId: (row: any) => row.parentId },
      [
        { id: "root", parentId: null, name: "Root" },
        { id: "branch", parentId: "root", name: "Branch" },
        { id: "needle", parentId: "branch", name: "Needle" },
        { id: "other", parentId: "root", name: "Other" },
      ],
      { groupDefaultExpanded: -1 },
    );
    const name = core.getColumnModel().getByColId("name")!;
    core.setFilterModel([{
      col: name,
      key: name.key,
      filters: [{ type: FilterType.CONTAINS, values: ["Needle"] }],
    }]);

    expect(view(core).map(node => node.id)).toEqual(["root", "branch", "needle"]);
  });

  it("preserves expansion across refreshes and rejects cycles", () => {
    const options = {
      mode: "parent" as const,
      getParentId: (row: any) => row.parentId,
    };
    const rows = [
      { id: "root", parentId: null, name: "Root" },
      { id: "child", parentId: "root", name: "Child" },
    ];
    const core = createTree(options, rows);
    core.toggleGroupExpand("root", true);
    expect(view(core).map(node => node.id)).toEqual(["root", "child"]);
    core.setRowData(rows.map(row => ({ ...row })));
    expect(core.getRowModel().getRowNode("root")?.isExpanded).toBe(true);

    expect(() => createTree(options, [
      { id: "a", parentId: "b", name: "A" },
      { id: "b", parentId: "a", name: "B" },
    ])).toThrow(/parent cycle/);
  });

  it("expands/collapses all groups in one pass with a single repaint", () => {
    const core = createTree(
      {
        mode: "parent",
        getParentId: (row: any) => row.parentId,
        getLabel: (row: any) => row.name,
      },
      [
        { id: "root", parentId: null, name: "Root" },
        { id: "a", parentId: "root", name: "A" },
        { id: "a1", parentId: "a", name: "A1" },
        { id: "b", parentId: "root", name: "B" },
        { id: "b1", parentId: "b", name: "B1" },
      ],
      { groupDefaultExpanded: -1 },
    );

    // Batching must not repaint per node: collapsing all three groups costs exactly as many
    // rowsChanged emits as toggling a single node.
    const repaints = vi.fn();
    core.on("rowsChanged", repaints);
    core.dispatch({ type: "groupToggleExpand", groupId: "a", expanded: false });
    const perToggleEmits = repaints.mock.calls.length;

    repaints.mockClear();
    core.dispatch({ type: "groupSetExpanded", expanded: false });
    expect(repaints).toHaveBeenCalledTimes(perToggleEmits);
    expect(view(core).map(node => node.id)).toEqual(["root"]);
    for (const node of core.getRowModel().getGroupNodes()) {
      expect(node.isExpanded).toBe(false);
    }

    core.dispatch({ type: "groupSetExpanded", expanded: true });
    expect(view(core).map(node => node.id)).toEqual(["root", "a", "a1", "b", "b1"]);

    // Explicit id batch: collapse only one subtree.
    core.dispatch({ type: "groupSetExpanded", expanded: false, groupIds: ["a"] });
    expect(view(core).map(node => node.id)).toEqual(["root", "a", "b", "b1"]);
  });

  it("clamps pagination and rebuilds the visible page when collapsing removes later pages", () => {
    const core = createTree(
      {
        mode: "parent",
        getParentId: (row: any) => row.parentId,
        getLabel: (row: any) => row.name,
      },
      [
        { id: "root", parentId: null, name: "Root" },
        { id: "one", parentId: "root", name: "One" },
        { id: "two", parentId: "root", name: "Two" },
        { id: "three", parentId: "root", name: "Three" },
      ],
      { groupDefaultExpanded: -1, pagination: true, pageSize: 2 },
    );

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(view(core).map(node => node.id)).toEqual(["two", "three"]);

    core.dispatch({ type: "groupToggleExpand", groupId: "root", expanded: false });

    expect(core.getPaginationInfo()).toMatchObject({
      pageIndex: 0,
      totalPageCount: 1,
      totalRowCount: 1,
    });
    expect(view(core).map(node => node.id)).toEqual(["root"]);
  });

  it("switches keyboard modes and navigates the hierarchy across pagination pages", () => {
    const core = createTree(
      {
        mode: "parent",
        getParentId: (row: any) => row.parentId,
        getLabel: (row: any) => row.name,
        keyboardNavigationMode: "grid",
        enableKeyboardNavigationModeSwitch: true,
      },
      [
        { id: "root", parentId: null, name: "Root" },
        { id: "one", parentId: "root", name: "One" },
        { id: "two", parentId: "root", name: "Two" },
        { id: "three", parentId: "root", name: "Three" },
      ],
      { groupDefaultExpanded: -1, pagination: true, pageSize: 2 },
    );
    const changes: any[] = [];
    core.on("keyboardNavigationModeChanged", event => changes.push(event));
    const hierarchyIndex = core.getColumnModel().getLeaves().findIndex(col => col.isTreeColumn());

    core.dispatch({
      type: "keyboardNavigationModeSet",
      mode: "hierarchy",
      source: "shortcut",
    });
    expect(core.getKeyboardNavigationMode()).toBe("hierarchy");
    expect(changes).toEqual([{
      mode: "hierarchy",
      previousMode: "grid",
      source: "shortcut",
    }]);

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: hierarchyIndex, reason: "keyboard" });
    expect(view(core)[0].id).toBe("two");

    core.dispatch({ type: "treeNavigate", command: "parent" });
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: hierarchyIndex });
    expect(view(core)[0].id).toBe("root");

    core.dispatch({ type: "treeNavigate", command: "collapse" });
    expect(core.getRowModel().getRowNode("root")?.isExpanded).toBe(false);
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: hierarchyIndex });
    core.dispatch({ type: "treeNavigate", command: "expand" });
    expect(core.getRowModel().getRowNode("root")?.isExpanded).toBe(true);
  });

  it("uses collapse as parent navigation for leaves and already-collapsed parents", () => {
    const core = createTree(
      {
        mode: "parent",
        getParentId: (row: any) => row.parentId,
        keyboardNavigationMode: "hierarchy",
      },
      [
        { id: "root", parentId: null, name: "Root" },
        { id: "branch", parentId: "root", name: "Branch" },
        { id: "leaf", parentId: "branch", name: "Leaf" },
      ],
      { groupDefaultExpanded: -1 },
    );
    const hierarchyIndex = core.getColumnModel().getLeaves().findIndex(col => col.isTreeColumn());

    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: hierarchyIndex, reason: "keyboard" });
    core.dispatch({ type: "treeNavigate", command: "collapse" });
    expect(core.getActiveCell()).toEqual({ row: 1, colIdx: hierarchyIndex });

    core.dispatch({ type: "treeNavigate", command: "collapse" });
    expect(core.getRowModel().getRowNode("branch")?.isExpanded).toBe(false);
    expect(core.getActiveCell()).toEqual({ row: 1, colIdx: hierarchyIndex });

    core.dispatch({ type: "treeNavigate", command: "collapse" });
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: hierarchyIndex });
  });

  it("renders missing-parent rows as roots with a diagnostic", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const core = createTree(
      { mode: "parent", getParentId: (row: any) => row.parentId },
      [{ id: "orphan", parentId: "missing", name: "Orphan" }],
      { groupDefaultExpanded: -1 },
    );
    expect(view(core).map(node => node.id)).toEqual(["orphan"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('parent "missing"'));
    warn.mockRestore();
  });

  it("rebuilds relationships after parent/path transactions", () => {
    const core = createTree(
      { mode: "parent", getParentId: (row: any) => row.parentId },
      [
        { id: "left", parentId: null, name: "Left" },
        { id: "right", parentId: null, name: "Right" },
        { id: "child", parentId: "left", name: "Child" },
      ],
      { groupDefaultExpanded: -1 },
    );

    core.applyTransaction({
      update: [{ rowId: "child", row: { id: "child", parentId: "right", name: "Moved" } }],
      add: [{ id: "new", parentId: "right", name: "New" }],
    });
    expect(core.getRowModel().getRowNode("child")?.parentId).toBe("right");
    expect(core.getRowModel().getRowNode("right")?.children?.map(node => node.id)).toEqual([
      "child", "new",
    ]);
  });

  it("rejects duplicate paths and nested object cycles", () => {
    expect(() => createTree(
      { mode: "path", getPath: (row: any) => row.path },
      [
        { id: "a", path: ["same"] },
        { id: "b", path: ["same"] },
      ],
    )).toThrow(/duplicate path/);

    const cyclic: any = { id: "cycle", name: "Cycle", children: [] };
    cyclic.children.push(cyclic);
    expect(() => createTree(
      { mode: "children", getChildren: (row: any) => row.children },
      [cyclic],
    )).toThrow(/cycle in nested children/);
  });
});
