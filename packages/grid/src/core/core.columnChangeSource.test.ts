/**
 * `columnsChanged` / `columnWidthsChanged` (and the derived `onSortChanged`) carry `source`:
 * "user" for a column action the renderer dispatched from a gesture (`source: "user"`), "api" for
 * everything else. Also the three option bridges added alongside it: onColumnsChanged,
 * onPaginationChanged and onError.
 */
import { describe, it, expect, vi } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { FilterType } from "../interfaces/filter";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource } from "../interfaces/serverSide";
import type { GridEventColumnsChangedParams, GridEventColumnWidthsChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, sortable: true, groupable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, sortable: true },
  ]);
  return core;
}

function inst(core: GridCore, colId: string): string {
  return core.getColumnModel().getByColId(colId)!.instanceID;
}

function recordColumns(core: GridCore) {
  const columns: GridEventColumnsChangedParams[] = [];
  const widths: GridEventColumnWidthsChangedParams[] = [];
  core.on("columnsChanged", (ev) => columns.push(ev));
  core.on("columnWidthsChanged", (ev) => widths.push(ev));
  return { columns, widths };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("column change source", () => {
  it("defaults to api for column actions dispatched without a source", () => {
    const core = makeGrid();
    const { columns } = recordColumns(core);
    core.dispatch({ type: "columnPin", colIds: [inst(core, "name")], pinned: "left" });
    core.dispatch({ type: "columnVisibility", colIds: [inst(core, "qty")], hidden: true });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "asc" }] });
    expect(columns.map((ev) => [ev.reason, ev.source])).toEqual([
      ["pin", "api"],
      ["visibility", "api"],
      ["sort", "api"],
    ]);
  });

  it("stamps user on every column event a gesture-dispatched action causes", () => {
    const core = makeGrid();
    const { columns } = recordColumns(core);
    core.dispatch({ type: "columnPin", source: "user", colIds: [inst(core, "name")], pinned: "left" });
    core.dispatch({ type: "columnMove", source: "user", colId: inst(core, "qty"), toIndex: 0, toSection: "center" });
    core.dispatch({ type: "headerAction", source: "user", action: "toggleSort", colId: inst(core, "qty") });
    core.dispatch({ type: "rowGroupSet", source: "user", colIds: ["name"] });
    expect(columns.map((ev) => [ev.reason, ev.source])).toEqual([
      ["pin", "user"],
      ["order", "user"],
      ["sort", "user"],
      ["group", "user"],
    ]);
  });

  it("does not leak a user source into later or nested API dispatches", () => {
    const core = makeGrid();
    const { columns } = recordColumns(core);
    // A listener reacting to a user change with an API call reports that call as api.
    let reacted = false;
    core.on("columnsChanged", (ev) => {
      if (ev.source === "user" && !reacted) {
        reacted = true;
        core.dispatch({ type: "columnVisibility", colIds: [inst(core, "qty")], hidden: true });
      }
    });
    core.dispatch({ type: "columnPin", source: "user", colIds: [inst(core, "name")], pinned: "left" });
    core.dispatch({ type: "columnPin", colIds: [inst(core, "name")], pinned: null });
    expect(columns.map((ev) => [ev.reason, ev.source])).toEqual([
      ["pin", "user"],
      ["visibility", "api"],
      ["pin", "api"],
    ]);
  });

  it("restores and defs changes report api", () => {
    const core = makeGrid();
    const { columns } = recordColumns(core);
    core.dispatch({ type: "columnStateSet", state: [{ colId: "name", pinned: "right" }] });
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);
    expect(columns.map((ev) => ev.source)).toEqual(columns.map(() => "api"));
    expect(columns.map((ev) => ev.reason)).toEqual(expect.arrayContaining(["state", "defs"]));
  });

  it("columnWidthsChanged carries the source: resize drag and autosize from the header are user", () => {
    const core = makeGrid();
    const { widths } = recordColumns(core);
    const name = inst(core, "name");
    core.beginColumnResizeDrag();
    core.dispatch({ type: "columnResize", source: "user", colId: name, widthPx: 180 });
    core.dispatch({ type: "columnResize", source: "user", colId: name, widthPx: 190 });
    core.endColumnResizeDrag();
    core.dispatch({ type: "columnAutosize", source: "user", colId: name });
    core.dispatch({ type: "columnResize", colId: name, widthPx: 150 });
    expect(widths.map((ev) => [ev.final, ev.source])).toEqual([
      [false, "user"],
      [false, "user"],
      [true, "user"],
      [true, "user"],
      [true, "api"],
    ]);
  });

  it("withColumnChangeSource scopes a source over direct core calls and restores it", () => {
    const core = makeGrid();
    const { columns } = recordColumns(core);
    const name = core.getColumnModel().getByColId("name")!;
    const item = { col: name, key: name.key, filters: [{ type: FilterType.CONTAINS, values: ["a"] }] };
    core.withColumnChangeSource("user", () => core.addFilterModel(item));
    core.removeFilterModel(name);
    const filterEvents = columns.filter((ev) => ev.reason === "filter");
    expect(filterEvents.map((ev) => ev.source)).toEqual(["user", "api"]);
  });
});

describe("onColumnsChanged / onSortChanged source", () => {
  it("onColumnsChanged forwards every columnsChanged, source included", () => {
    const onColumnsChanged = vi.fn();
    const core = makeGrid({ onColumnsChanged });
    onColumnsChanged.mockClear();
    core.dispatch({ type: "columnPin", source: "user", colIds: [inst(core, "name")], pinned: "left" });
    expect(onColumnsChanged).toHaveBeenCalledTimes(1);
    expect(onColumnsChanged.mock.calls[0][0]).toEqual({
      reason: "pin",
      changedColIds: ["name"],
      changedColInstanceIds: [inst(core, "name")],
      source: "user",
    });
  });

  it("onSortChanged reports the source of the sort", () => {
    const onSortChanged = vi.fn();
    const core = makeGrid({ onSortChanged });
    core.dispatch({ type: "headerAction", source: "user", action: "toggleSort", colId: inst(core, "qty") });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "qty", dir: null }] });
    expect(onSortChanged.mock.calls.map((c) => c[0].source)).toEqual(["user", "api"]);
  });
});

describe("onPaginationChanged", () => {
  it("forwards paginationChanged with getPaginationInfo()", () => {
    const onPaginationChanged = vi.fn();
    const core = makeGrid({ onPaginationChanged, pagination: true, pageSize: 25 });
    onPaginationChanged.mockClear();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: 50 });
    expect(onPaginationChanged).toHaveBeenCalled();
    const last = onPaginationChanged.mock.calls.at(-1)![0];
    expect(last).toEqual(core.getPaginationInfo());
    expect(last).toMatchObject({ pageSize: 50, totalRowCount: 2, paginationEnabled: true });
  });
});

describe("onError", () => {
  it("forwards a failed server-side request as the error event", async () => {
    const onError = vi.fn();
    const failure = new Error("backend down");
    const source: IServerSideDataSource = {
      getRows: ({ error }) => {
        setTimeout(() => error(failure), 0);
      },
    };
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "serverSide", onError });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);
    const viaEvent = vi.fn();
    core.on("error", viaEvent);
    core.setServerSideDataSource(source);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toEqual({ code: "row_model_error", message: "backend down", details: failure });
    // The option is an extra listener, not a replacement: api.on("error") still sees it.
    expect(viaEvent).toHaveBeenCalledTimes(1);
  });
});
