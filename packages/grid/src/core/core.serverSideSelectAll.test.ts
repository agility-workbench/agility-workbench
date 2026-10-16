import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";
import type { GridEventSelectionChangedParams } from "../events/events";

/**
 * Server-side select-all as "every row minus exclusions" (finding #87). The server-side model
 * cannot enumerate rows it has not loaded, so select-all in the default filtered scope stores
 * `{ selectAll: true, toggledRowIds: [] }` instead of the loaded ids; row gestures move rows into
 * or out of the exclusions; the id-returning reads (getSelectedRowIds/Rows/Nodes, the snapshot)
 * report the LOADED selected rows. The client-side model keeps its explicit ids.
 */

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const BLOCK = 10;
const ROWS = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, n: i, name: `Row ${i}` }));

function makeDataSource() {
  const requests: IServerSideRequest[] = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      const text = request.quickFilter?.text ?? "";
      const rows = ROWS.filter(r => !text || r.name.includes(text)).map(r => ({ ...r }));
      success({
        rows: rows.slice(request.startRow ?? 0, request.endRow ?? rows.length),
        totalRows: rows.length,
      });
    },
  };
  return { source, requests };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function makeGrid(options: object = {}) {
  const ds = makeDataSource();
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideBlockSize: BLOCK,
    pageSize: BLOCK,
    rowSelection: { checkboxes: true },
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  ]);
  core.setServerSideDataSource(ds.source);
  const api = new GridAPI(core);
  const events: GridEventSelectionChangedParams[] = [];
  core.on("selectionChanged", ev => events.push(ev));
  return { core, api, ds, events };
}

const loadBlock = (core: GridCore, start: number) =>
  core.refreshRows("viewport", { start, end: start + BLOCK });
const sorted = (ids: Iterable<string>) => [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `r${from + i}`);

describe("server-side select-all", () => {
  it("selects every row as a select-all state, not the loaded ids", async () => {
    const { core, api, events } = makeGrid();
    await flush();
    expect(core.getRowModel().getRowNode("r0")).toBeTruthy();
    expect(core.getRowModel().getRowNode("r15")).toBeUndefined();

    api.selectAllRows();
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: [] });
    expect(api.areAllRowsSelected()).toBe(true);
    // The loaded rows only — rows the server has not sent cannot be listed.
    expect(sorted(core.getSelectedRowIds())).toEqual(range(0, 10));
    expect(api.getSelectedRows()).toHaveLength(10);
    expect(api.getSelectedNodes().map(n => n.id)).toEqual(range(0, 10));
    const snapshot = api.getSelection();
    expect(snapshot.kind).toBe("row");
    expect(snapshot.selectAll).toBe(true);
    expect(snapshot.toggledRowIds).toEqual([]);
    expect(events.at(-1)!.snapshot.selectAll).toBe(true);
    expect(events.at(-1)!.delta.added).toHaveLength(10);

    // A block that loads later is covered without any further selection gesture.
    loadBlock(core, 20);
    await flush();
    expect(core.getRowModel().getRowNode("r25")).toBeTruthy();
    expect(core.isRowSelected("r25")).toBe(true);
    expect(sorted(core.getSelectedRowIds())).toEqual([...range(0, 10), ...range(20, 30)]);
    // Rows not loaded yet are covered too ("all minus exclusions").
    expect(core.isRowSelected("r45")).toBe(true);
  });

  it("toggles rows into and out of the exclusions", async () => {
    const { core, api } = makeGrid();
    await flush();
    api.selectAllRows();
    core.dispatch({ type: "rowSelectSet", viewIdx: 2, mode: "toggle" });
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r2"] });
    expect(core.isRowSelected("r2")).toBe(false);
    expect(core.getSelectedRowIds().has("r2")).toBe(false);
    expect(api.areAllRowsSelected()).toBe(false);
    expect(core.hasRowSelection()).toBe(true);

    core.dispatch({ type: "rowSelectSet", viewIdx: 2, mode: "toggle" });
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: [] });
    expect(api.areAllRowsSelected()).toBe(true);

    // A plain replace click is a new explicit selection of that row.
    core.dispatch({ type: "rowSelectSet", viewIdx: 4, mode: "replace" });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r4"] });
  });

  it("header un-check / deselectAllRows returns to an empty explicit selection", async () => {
    const { core, api } = makeGrid();
    await flush();
    api.selectAllRows();
    core.dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "toggle" });
    // The header checkbox with exclusions shows "some"; a click on it selects all again.
    core.dispatch({ type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "mouse" });
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: [] });
    core.dispatch({ type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "mouse" });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: [] });
    expect(core.hasRowSelection()).toBe(false);
    expect(api.getSelection().selectAll).toBeUndefined();

    api.selectAllRows();
    api.deselectAllRows();
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: [] });
    expect(api.getSelection().kind).toBe("none");
  });

  it("round-trips setRowSelectionState", async () => {
    const { core, api, events } = makeGrid();
    await flush();
    api.setRowSelectionState({ selectAll: true, toggledRowIds: ["r3", "r40"] });
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r3", "r40"] });
    expect(core.isRowSelected("r3")).toBe(false);
    expect(core.isRowSelected("r4")).toBe(true);
    expect(core.isRowSelected("r40")).toBe(false);
    expect(events.at(-1)!.reason).toBe("api");
    expect(events.at(-1)!.snapshot.toggledRowIds).toEqual(["r3", "r40"]);

    // Explicit ids of unloaded rows are kept verbatim, as selectRowsById does.
    api.setRowSelectionState({ selectAll: false, toggledRowIds: ["r1", "r33"] });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r1", "r33"] });
    expect(core.isRowSelected("r33")).toBe(true);
  });

  it("keeps selectRowsById working in select-all mode", async () => {
    const { api } = makeGrid();
    await flush();
    api.selectAllRows();
    api.selectRowsById(["r1", "r2", "r44"], "remove");
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r1", "r2", "r44"] });
    api.selectRowsById(["r2"], "add");
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r1", "r44"] });
    api.selectRowsById(["r5", "r6"], "set");
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r5", "r6"] });
  });

  it("counts rows isRowSelectable refuses as unselected without storing them", async () => {
    const { core, api } = makeGrid({ isRowSelectable: (node: any) => node.data.n % 2 === 0 });
    await flush();
    api.selectAllRows();
    expect(core.isRowSelected("r1")).toBe(false);
    expect(core.isRowSelected("r2")).toBe(true);
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r2", "r4", "r6", "r8"]);
    // A refused row's checkbox gesture is a no-op, and API ids of loaded refused rows are dropped.
    core.dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "toggle" });
    api.selectRowsById(["r3"], "remove");
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: [] });
    api.setRowSelectionState({ selectAll: true, toggledRowIds: ["r5", "r6"] });
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r6"] });
  });

  it("keeps explicit page ids under selectAllScope: \"page\"", async () => {
    const { core, api } = makeGrid({ selectAllScope: "page", pagination: true });
    await flush();
    api.selectAllRows();
    const state = api.getRowSelectionState();
    expect(state.selectAll).toBe(false);
    expect(sorted(state.toggledRowIds)).toEqual(range(0, 10));
    expect(core.areAllRowsSelected()).toBe(true);
  });

  it("keeps explicit ids in single selection mode", async () => {
    const { api } = makeGrid({ rowSelection: { mode: "single", checkboxes: true } });
    await flush();
    api.selectAllRows();
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r0"] });
    api.setRowSelectionState({ selectAll: true, toggledRowIds: ["r0"] });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r1"] });
  });

  it("spans pages", async () => {
    const { core, api } = makeGrid({ pagination: true });
    await flush();
    api.selectAllRows();
    core.applyPagination(2, BLOCK);
    await flush();
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: [] });
    expect(core.isRowSelected("r25")).toBe(true);
    expect(core.getSelectedRowIds().has("r25")).toBe(true);
  });

  it("ends on a quick-filter change, even under selectionPersistence: \"keep\"", async () => {
    for (const selectionPersistence of ["clear", "keep"] as const) {
      const { core, api } = makeGrid({ selectionPersistence });
      await flush();
      api.selectAllRows();
      core.setQuickFilter("Row 1");
      await flush();
      expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: [] });
    }
    // "keep" still keeps an explicit selection.
    const { core, api } = makeGrid({ selectionPersistence: "keep" });
    await flush();
    api.selectRowsById(["r1"]);
    core.setQuickFilter("Row 1");
    await flush();
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r1"] });
  });

  it("follows selectionPersistence on a sort change, and survives refreshServerSideData", async () => {
    const kept = makeGrid({ selectionPersistence: "keep" });
    await flush();
    kept.api.selectAllRows();
    kept.api.selectRowsById(["r1"], "remove");
    kept.api.setSortModel([{ colId: "n", dir: "desc" }]);
    await flush();
    expect(kept.api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r1"] });

    const cleared = makeGrid();
    await flush();
    cleared.api.selectAllRows();
    cleared.api.setSortModel([{ colId: "n", dir: "desc" }]);
    await flush();
    expect(cleared.api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: [] });

    const refreshed = makeGrid();
    await flush();
    refreshed.api.selectAllRows();
    refreshed.api.selectRowsById(["r1"], "remove");
    await refreshed.core.refreshServerSideData({ purge: true });
    await flush();
    expect(refreshed.api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r1"] });
    expect(refreshed.core.isRowSelected("r2")).toBe(true);
  });

  it("ends when the data source is replaced", async () => {
    const { core, api } = makeGrid();
    await flush();
    api.selectAllRows();
    core.setServerSideDataSource(makeDataSource().source);
    await flush();
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: [] });
  });

  it("prunes ids a server-side caller reports removed", async () => {
    const { core, api } = makeGrid();
    await flush();
    api.selectAllRows();
    api.selectRowsById(["r1", "r2"], "remove");
    (core as any).pruneRemovedRowSelection(["r1"]);
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r2"] });
    // Without ids the server-side model still prunes nothing (an absent node means "not loaded").
    (core as any).pruneRemovedRowSelection();
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r2"] });
  });

  it("leaves single mode with the loaded first row when the mode switches", async () => {
    const { core, api } = makeGrid();
    await flush();
    api.selectAllRows();
    core.setRowSelectionOptions({ mode: "single", checkboxes: true });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r0"] });
  });
});

describe("client-side model", () => {
  it("never enters select-all mode", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowSelection: { checkboxes: true } });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
    core.setRowData(ROWS.slice(0, 5));
    const api = new GridAPI(core);
    api.selectAllRows();
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: range(0, 5) });
    expect(api.getSelection().selectAll).toBeUndefined();
    expect(api.getSelection().toggledRowIds).toBeUndefined();

    // A select-all state resolves at once to the filtered set minus the exclusions; unknown ids go.
    api.setRowSelectionState({ selectAll: true, toggledRowIds: ["r1", "nope"] });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r0", "r2", "r3", "r4"] });
    api.setRowSelectionState({ selectAll: false, toggledRowIds: ["r3", "nope"] });
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: ["r3"] });
  });

  it("does not warn when exporting or copying", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const core = new GridCore(measurer, { rowIdKey: "id" });
    core.warnLoadedOnlySelection("export");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("server-side select-all with groupSelectsChildren", () => {
  it("keeps the loaded-only subtree rule: a parent toggles its loaded rows into the exclusions", async () => {
    type Node = { id: string; name: string; kind: string; parent: string | null };
    const TREE: Node[] = [
      { id: "alpha", name: "alpha", kind: "folder", parent: null },
      { id: "loose", name: "loose", kind: "file", parent: null },
      ...Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, name: `a${i}`, kind: "file", parent: "alpha" })),
    ];
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        const rows = TREE.filter(n => n.parent === (request.treeParent?.id ?? null));
        success({ rows: rows.map(r => ({ ...r })), totalRows: rows.length });
      },
    };
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      rowSelection: { checkboxes: true },
      groupSelectsChildren: true,
      treeData: { mode: "server", hasChildren: (row: any) => row.kind === "folder", getLabel: (row: any) => row.name },
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([{ colId: "kind", key: "kind", label: "Kind", type: ColumnType.STRING }]);
    core.setServerSideDataSource(source);
    await flush();
    const api = new GridAPI(core);
    api.selectAllRows();
    core.toggleGroupExpand("alpha", true);
    await flush();
    expect(core.getRowModel().getViewCount()).toBe(5);
    expect(core.getRowSelectionStateAtViewIndex(0)).toBe("all");
    core.dispatch({ type: "rowSelectSet", viewIdx: 0, mode: "toggle" });
    expect(new Set(api.getRowSelectionState().toggledRowIds)).toEqual(new Set(["alpha", "a0", "a1", "a2"]));
    expect(api.getRowSelectionState().selectAll).toBe(true);
    expect(core.getRowSelectionStateAtViewIndex(0)).toBe("none");
    expect(core.isRowSelected("loose")).toBe(true);
  });
});
