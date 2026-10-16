/**
 * Every grid event has an `on*` option bridge (findings #142–#144), and the lifecycle/structure
 * events added with them (#143, #145): rowGroupOpened, columnGroupOpened and rowDataUpdated here;
 * firstDataRendered, bodyScroll and the DOM gestures behind the "user" sources are covered with the
 * renderer in renderer/gridEvents.render.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { ColumnType } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource } from "../interfaces/serverSide";
import type {
  GridEventColumnGroupOpenedParams,
  GridEventMap,
  GridEventName,
  GridEventRowDataUpdatedParams,
  GridEventRowGroupOpenedParams,
} from "../events/events";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", headcount: 4 },
  { id: "2", region: "EMEA", country: "France", headcount: 3 },
  { id: "3", region: "APAC", country: "Japan", headcount: 2 },
  { id: "4", region: "APAC", country: "India", headcount: 6 },
];

function makeGrid(options: GridOptions = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING, sortable: true },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING, sortable: true },
    { colId: "headcount", key: "headcount", label: "Headcount", type: ColumnType.NUMBER },
  ]);
  return { core, api: new GridAPI(core) };
}

// A record, so adding an event without listing it here fails to typecheck.
const ALL_EVENTS: { readonly [E in GridEventName]: true } = {
  overlayShow: true, modelUpdated: true, viewportChanged: true, columnsChanged: true,
  columnWidthsChanged: true, cellsChanged: true, rowsChanged: true, aggregateChanged: true,
  selectionChanged: true, focusChanged: true, headerFocusChanged: true, editingChanged: true,
  cellValueChanged: true, historyChanged: true, filterChanged: true, quickFilterFindChanged: true,
  paginationChanged: true, cellClicked: true, rowClicked: true, cellDoubleClicked: true,
  rowDoubleClicked: true, tooltipShow: true, tooltipHide: true, actionFrameChanged: true,
  keyboardNavigationModeChanged: true, pivotChanged: true, pivotColumnLimitReached: true,
  error: true, rowGroupOpened: true, columnGroupOpened: true, firstDataRendered: true,
  rowDataUpdated: true, bodyScroll: true,
};

const optionFor = (event: GridEventName) =>
  `on${event[0].toUpperCase()}${event.slice(1)}` as keyof GridOptions;

describe("on* option bridges", () => {
  // The payload is opaque to a pass-through bridge; the two that reshape it are checked by name.
  const payload = (event: GridEventName) =>
    (event === "cellValueChanged"
      ? { cell: { rowId: "1", colId: "region", colInstanceId: "region" }, oldValue: 1, value: 2, source: "edit" }
      : event === "columnsChanged"
        ? { reason: "state", source: "api" }
        : { marker: event }) as unknown as GridEventMap[GridEventName];

  it.each(Object.keys(ALL_EVENTS) as GridEventName[])("%s reaches its option callback", (event) => {
    const callback = vi.fn();
    const core = new GridCore(measurer, { rowIdKey: "id", [optionFor(event)]: callback } as GridOptions);
    // The callback is copied into the resolved options, where the wrappers' live bridges read it.
    expect(core.options[optionFor(event)]).toBe(callback);
    core.emit(event, payload(event));
    expect(callback).toHaveBeenCalledTimes(1);
    if (event !== "cellValueChanged") expect(callback).toHaveBeenCalledWith(payload(event));
  });
});

describe("rowGroupOpened", () => {
  function grouped() {
    const { core, api } = makeGrid({ groupDefaultExpanded: 0 });
    api.setRowGroupColumns(["region"]);
    const events: GridEventRowGroupOpenedParams[] = [];
    let displayedInHandler = -1;
    core.on("rowGroupOpened", ev => {
      events.push(ev);
      displayedInHandler = api.getDisplayedRowCount();
    });
    const idOf = (key: string) => api.getGroupNodes().find(n => n.groupKey === key)!.id;
    return { core, api, events, idOf, displayed: () => displayedInHandler };
  }

  it("reports a chevron toggle as user, after the rebuild", () => {
    const { core, events, idOf, displayed } = grouped();
    core.dispatch({ type: "groupToggleExpand", groupId: idOf("EMEA"), source: "user" });
    expect(events).toEqual([{ groupIds: [idOf("EMEA")], expanded: true, source: "user" }]);
    // 2 groups + EMEA's 2 leaves: the handler runs on the re-flattened view.
    expect(displayed()).toBe(4);
    core.dispatch({ type: "groupToggleExpand", groupId: idOf("EMEA"), source: "user" });
    expect(events.at(-1)).toEqual({ groupIds: [idOf("EMEA")], expanded: false, source: "user" });
  });

  it("reports the typed API methods as api, one event per call with only the changed ids", () => {
    const { api, events, idOf } = grouped();
    api.setGroupExpanded(idOf("APAC"), true);
    expect(events).toEqual([{ groupIds: [idOf("APAC")], expanded: true, source: "api" }]);

    // APAC is already open: only EMEA changes, in one event.
    api.setAllGroupsExpanded(true);
    expect(events.at(-1)).toEqual({ groupIds: [idOf("EMEA")], expanded: true, source: "api" });

    api.setAllGroupsExpanded(false);
    expect(events.at(-1)!.expanded).toBe(false);
    expect([...events.at(-1)!.groupIds].sort()).toEqual([idOf("APAC"), idOf("EMEA")].sort());
    expect(events).toHaveLength(3);
  });

  it("is silent when nothing changes", () => {
    const { core, api, events, idOf } = grouped();
    api.setAllGroupsExpanded(false);
    core.dispatch({ type: "groupSetExpanded", expanded: false, groupIds: [idOf("EMEA"), "nope"] });
    core.dispatch({ type: "groupToggleExpand", groupId: "nope" });
    expect(events).toEqual([]);
  });

  it("defaults a dispatched action without a source to api", () => {
    const { core, events, idOf } = grouped();
    core.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: [idOf("EMEA")] });
    expect(events).toEqual([{ groupIds: [idOf("EMEA")], expanded: true, source: "api" }]);
  });

  it("fires once per direction on a saved-view restore", () => {
    const { api, events, idOf } = grouped();
    api.setGroupExpanded(idOf("EMEA"), true);
    const view = api.captureViewState();
    api.setGroupExpanded(idOf("EMEA"), false);
    api.setGroupExpanded(idOf("APAC"), true);
    events.length = 0;
    api.applyViewState(view);
    expect(events.map(ev => [ev.groupIds, ev.expanded, ev.source])).toEqual([
      [[idOf("EMEA")], true, "api"],
      [[idOf("APAC")], false, "api"],
    ]);
  });
});

describe("columnGroupOpened", () => {
  function columnGroups() {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "money", label: "Money", children: [
          { colId: "revenue", key: "revenue", label: "Revenue" },
          { colId: "margin", key: "margin", label: "Margin", columnGroupShow: "open" },
        ],
      },
      {
        colId: "geo", label: "Geo", openByDefault: true, children: [
          { colId: "region", key: "region", label: "Region" },
          { colId: "country", key: "country", label: "Country", columnGroupShow: "open" },
        ],
      },
    ]);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData([{ id: "1", name: "A", revenue: 1, margin: 2, region: "APAC", country: "India" }]);
    const events: GridEventColumnGroupOpenedParams[] = [];
    const leavesInHandler: string[][] = [];
    core.on("columnGroupOpened", ev => {
      events.push(ev);
      leavesInHandler.push(core.getColumnModel().getCenterLeaves().map(col => col.colId));
    });
    return { core, api: new GridAPI(core), events, leavesInHandler };
  }

  it("reports the header expander as user, after the header rebuild", () => {
    const { core, events, leavesInHandler } = columnGroups();
    core.dispatch({ type: "headerAction", source: "user", action: "toggleGroupExpand", colId: "money" });
    expect(events).toEqual([{ groupIds: ["money"], expanded: true, source: "user" }]);
    expect(leavesInHandler[0]).toContain("margin");
    core.dispatch({ type: "headerAction", source: "user", action: "toggleGroupExpand", colId: "money" });
    expect(events.at(-1)).toEqual({ groupIds: ["money"], expanded: false, source: "user" });
  });

  it("reports setColumnGroupState as api, once per direction, changed groups only", () => {
    const { api, events } = columnGroups();
    api.setColumnGroupState([{ colId: "money", open: true }, { colId: "geo", open: false }]);
    expect(events).toEqual([
      { groupIds: ["money"], expanded: true, source: "api" },
      { groupIds: ["geo"], expanded: false, source: "api" },
    ]);
    events.length = 0;
    // Already in that state, unknown, or a leaf: nothing changes, nothing fires.
    api.setColumnGroupState([{ colId: "money", open: true }, { colId: "nope", open: true }, { colId: "name", open: false }]);
    expect(events).toEqual([]);
  });
});

describe("rowDataUpdated", () => {
  function recorded(options: GridOptions = {}) {
    const grid = makeGrid(options);
    const events: GridEventRowDataUpdatedParams[] = [];
    grid.core.on("rowDataUpdated", ev => events.push(ev));
    return { ...grid, events };
  }

  it("fires for setRowData, replaced or diffed, with the new count", () => {
    const { core, events } = recorded({ rowDataMode: "reset" });
    core.setRowData(ROWS.slice(0, 3));
    expect(events).toEqual([{ reason: "rowData", rowCount: 3 }]);

    const diffed = recorded({ rowDataMode: "diff" });
    diffed.core.setRowData([...ROWS, { id: "5", region: "AMER", country: "US", headcount: 1 }]);
    expect(diffed.events).toEqual([{ reason: "rowData", rowCount: 5 }]);
  });

  it("fires for applyTransaction, and not for a transaction that changes nothing", () => {
    const { core, events } = recorded();
    core.applyTransaction({ remove: ["1"] });
    expect(events).toEqual([{ reason: "transaction", rowCount: 3 }]);
    core.applyTransaction({ remove: ["nope"] });
    expect(events).toHaveLength(1);
    // An in-place update is still a data change.
    core.applyTransaction({ update: [{ rowId: "2", row: { ...ROWS[1], headcount: 9 } }] });
    expect(events.at(-1)).toEqual({ reason: "transaction", rowCount: 3 });
  });

  it("fires once for a flushed applyTransactionAsync batch", async () => {
    const { core, events } = recorded({ asyncTransactionWaitMs: 0 });
    const a = core.applyTransactionAsync({ add: [{ id: "5", region: "AMER", country: "US", headcount: 1 }] });
    const b = core.applyTransactionAsync({ add: [{ id: "6", region: "AMER", country: "CA", headcount: 1 }] });
    expect(events).toEqual([]);
    await Promise.all([a, b]);
    expect(events).toEqual([{ reason: "transaction", rowCount: 6 }]);
  });

  it("does not fire for sorting, filtering or grouping", () => {
    const { core, api, events } = recorded();
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "headcount", dir: "desc" }] });
    api.setRowGroupColumns(["region"]);
    api.setAllGroupsExpanded(true);
    expect(events).toEqual([]);
  });

  it("fires serverSide for each block load and for a purging refresh", async () => {
    const all = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, n: i }));
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        setTimeout(() => success({
          rows: all.slice(request.startRow ?? 0, request.endRow ?? all.length),
          totalRows: all.length,
        }), 0);
      },
    };
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "serverSide", serverSideBlockSize: 10 });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
    const events: GridEventRowDataUpdatedParams[] = [];
    core.on("rowDataUpdated", ev => events.push(ev));
    const flush = async () => {
      for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
    };

    // The initial fill loads the whole 25-row listing, one event per 10-row block as it lands.
    core.setServerSideDataSource(source);
    await flush();
    expect(events).toEqual([
      { reason: "serverSide", rowCount: 25 },
      { reason: "serverSide", rowCount: 25 },
      { reason: "serverSide", rowCount: 25 },
    ]);

    events.length = 0;
    void core.refreshServerSideData({ purge: true });
    // The purge drops the rows synchronously; the reload lands as another block.
    expect(events.map(ev => ev.reason)).toEqual(["serverSide"]);
    await flush();
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every(ev => ev.reason === "serverSide")).toBe(true);
  });
});
