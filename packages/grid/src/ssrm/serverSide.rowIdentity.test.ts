import { afterEach, describe, expect, it, vi } from "vitest";
import { GridAPI } from "../api/api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { GridEventHistoryChangedParams } from "../events/events";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";

// Row identity across refetches on the server-side row model: a grid without a row id strategy is
// warned about once, and edit history never outlives the rows it was recorded against.

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const DATA = [
  { id: "1", name: "alice", qty: 3 },
  { id: "2", name: "bob", qty: 7 },
  { id: "3", name: "carol", qty: 5 },
];

function makeDataSource() {
  const requests: IServerSideRequest[] = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      let rows = DATA.map(r => ({ ...r }));
      const sort = request.sorts[0];
      if (sort) {
        rows = rows.sort((a, b) => {
          const av = (a as any)[sort.key];
          const bv = (b as any)[sort.key];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sort.dir === "desc" ? -cmp : cmp;
        });
      }
      const start = request.startRow ?? 0;
      const end = request.endRow ?? rows.length;
      success({ rows: rows.slice(start, end), totalRows: rows.length });
    },
  };
  return { source, requests };
}

const flush = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function makeGrid(options: Partial<GridOptions> = { rowIdKey: "id" }) {
  const ds = makeDataSource();
  const core = new GridCore(measurer, { rowModelType: "serverSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ]);
  core.setServerSideDataSource(ds.source);
  return { core, api: new GridAPI(core), ds };
}

const cell = (core: GridCore, rowId: string, colId: string) =>
  ({ rowId, colId: core.getColumnModel().getByColId(colId)!.instanceID });

const EMPTY = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server-side row id strategy warning", () => {
  const isIdWarning = (args: unknown[]) => String(args[0]).includes("getRowId or rowIdKey");

  it("warns once when no getRowId/rowIdKey is set, however many blocks load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { core } = makeGrid({});
    await flush();
    await core.refreshServerSideData({ purge: true });
    await flush();
    expect(warn.mock.calls.filter(isIdWarning)).toHaveLength(1);
  });

  it("stays silent with rowIdKey or getRowId", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    makeGrid({ rowIdKey: "id" });
    makeGrid({ getRowId: (row: any) => row.id });
    await flush();
    expect(warn.mock.calls.filter(isIdWarning)).toHaveLength(0);
  });
});

describe("server-side undo history across refetches", () => {
  async function editedGrid() {
    const grid = makeGrid();
    await flush();
    grid.api.setCellValue(cell(grid.core, "1", "name"), "ALICE");
    expect(grid.api.canUndo()).toBe(true);
    const events: GridEventHistoryChangedParams[] = [];
    grid.core.on("historyChanged", ev => events.push(ev));
    return { ...grid, events };
  }

  it("clears history when a purge refresh discards the rows", async () => {
    const { core, api, events } = await editedGrid();
    await core.refreshServerSideData({ purge: true });
    await flush();
    expect(api.canUndo()).toBe(false);
    expect(api.getHistoryState()).toEqual(EMPTY);
    expect(events).toEqual([{ reason: "clear", ...EMPTY }]);
    // Undo cannot write the stale value into the fresh server row.
    api.undo();
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("alice");
  });

  it("clears history when a sort change reloads the store", async () => {
    const { core, api, ds, events } = await editedGrid();
    const before = ds.requests.length;
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: core.getColumnModel().getByColId("qty")!.instanceID });
    await flush();
    expect(ds.requests.length).toBeGreaterThan(before);
    expect(api.getHistoryState()).toEqual(EMPTY);
    expect(events.map(e => e.reason)).toEqual(["clear"]);
  });

  it("keeps history on a soft refresh that refetches the edited row in place", async () => {
    const { core, api, events } = await editedGrid();
    await core.refreshServerSideData();
    await flush();
    expect(api.canUndo()).toBe(true);
    expect(events).toEqual([]);
  });
});
