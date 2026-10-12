import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridEventActionFrameParams, GridEventEditingChangedParams } from "../events/events";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// A trivial ActionFrame component so `actionFrameOpen` has something to show.
const Form = () => document.createElement("div");

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice" },
    { id: "2", name: "bob" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true, actionFrameComponent: Form },
    { colId: "plain", key: "plain", label: "Plain" }, // no actionFrameComponent
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}


// Emitted CellRefs are normalized: public colId + the internal instance id.
function emittedCell(core: GridCore, rowId: string, key: string) {
  return { rowId, colId: key, colInstanceId: colId(core, key) };
}

describe("GridCore ActionFrame", () => {
  let core: GridCore;
  let frameEvents: GridEventActionFrameParams[];
  let editEvents: GridEventEditingChangedParams[];

  beforeEach(() => {
    core = makeGrid();
    frameEvents = [];
    editEvents = [];
    core.on("actionFrameChanged", (e) => frameEvents.push(e));
    core.on("editingChanged", (e) => editEvents.push(e));
  });

  it("opens a frame and tracks the open cell", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "actionFrameOpen", cell });
    expect(core.getActionFrameCell()).toEqual(emittedCell(core, "1", "name"));
    expect(frameEvents).toEqual([{ state: "opened", cell: emittedCell(core, "1", "name") }]);
  });

  it("does not open on a column without an ActionFrame component", () => {
    const cell = { rowId: "1", colId: colId(core, "plain") };
    core.dispatch({ type: "actionFrameOpen", cell });
    expect(core.getActionFrameCell()).toBeNull();
    expect(frameEvents).toEqual([]);
  });

  it("closes the frame on actionFrameClose", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "actionFrameOpen", cell });
    core.dispatch({ type: "actionFrameClose" });
    expect(core.getActionFrameCell()).toBeNull();
    expect(frameEvents).toEqual([
      { state: "opened", cell: emittedCell(core, "1", "name") },
      { state: "closed", cell: emittedCell(core, "1", "name") },
    ]);
  });

  it("closes an open frame when editing starts (mutual exclusion)", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "actionFrameOpen", cell });
    core.dispatch({ type: "editStart", cell });
    expect(core.getActionFrameCell()).toBeNull();
    expect(core.getEditingCell()).toEqual(emittedCell(core, "1", "name"));
    // Frame closed, then edit started.
    expect(frameEvents).toEqual([
      { state: "opened", cell: emittedCell(core, "1", "name") },
      { state: "closed", cell: emittedCell(core, "1", "name") },
    ]);
    expect(editEvents.at(-1)?.state).toBe("started");
  });

  it("cancels an active edit when a frame opens (mutual exclusion, reverse)", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editStart", cell });
    core.dispatch({ type: "actionFrameOpen", cell });
    expect(core.getEditingCell()).toBeNull();
    expect(core.getActionFrameCell()).toEqual(emittedCell(core, "1", "name"));
    expect(editEvents.at(-1)?.state).toBe("cancelled");
    expect(frameEvents).toEqual([{ state: "opened", cell: emittedCell(core, "1", "name") }]);
  });
});

describe("GridCore ActionFrame on group rows", () => {
  const ROWS = [
    { id: "1", region: "EMEA", name: "alice", revenue: 10 },
    { id: "2", region: "EMEA", name: "bob", revenue: 20 },
    { id: "3", region: "APAC", name: "carol", revenue: 5 },
  ];

  function makeGrouped(options: object = {}) {
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "clientSide",
      defaultColDef: { actionFrameComponent: Form },
      ...options,
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name" },
      { colId: "region", key: "region", label: "Region" },
      { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
    ]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    return core;
  }

  function firstGroup(core: GridCore) {
    const node = core.getRowModel().getRowNodeAtViewIndex(0)!;
    expect(node.isGroup).toBe(true);
    return node;
  }

  it("opens on a group row when groupRowsSelectable is on", () => {
    const core = makeGrouped({ groupRowsSelectable: true });
    const group = firstGroup(core);
    core.dispatch({ type: "actionFrameOpen", cell: { rowId: group.id, colId: colId(core, "revenue") } });
    expect(core.getActionFrameCell()).toEqual(emittedCell(core, group.id, "revenue"));
  });

  it("refuses a group row when groupRowsSelectable is off", () => {
    const core = makeGrouped();
    const group = firstGroup(core);
    core.dispatch({ type: "actionFrameOpen", cell: { rowId: group.id, colId: colId(core, "revenue") } });
    expect(core.getActionFrameCell()).toBeNull();
  });

  it("opens on a pivot group row without groupRowsSelectable", () => {
    const core = makeGrouped();
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    core.dispatch({ type: "pivotModeSet", on: true });
    const group = firstGroup(core);
    const col = core.getColumnModel().getLeaves().find(c => c.actionFrameComponent)!;
    expect(col).toBeTruthy();
    core.dispatch({ type: "actionFrameOpen", cell: { rowId: group.id, colId: col.instanceID } });
    expect(core.getActionFrameCell()?.rowId).toBe(group.id);
    expect(core.getActionFrameCell()?.colInstanceId).toBe(col.instanceID);
  });

  it("in groupRows mode opens only on the nominal column", () => {
    const core = makeGrouped({ groupRowsSelectable: true, groupDisplayType: "groupRows" });
    const group = firstGroup(core);
    const nominal = core.getColumnModel().getFullWidthNominalLeaf()!;
    const other = core.getColumnModel().getLeaves().find(c => c !== nominal && c.actionFrameComponent)!;
    expect(other).toBeTruthy();

    core.dispatch({ type: "actionFrameOpen", cell: { rowId: group.id, colId: other.instanceID } });
    expect(core.getActionFrameCell()).toBeNull();

    core.dispatch({ type: "actionFrameOpen", cell: { rowId: group.id, colId: nominal.instanceID } });
    expect(core.getActionFrameCell()?.colInstanceId).toBe(nominal.instanceID);
  });

  it("still opens on a manually pinned body row", () => {
    const core = makeGrid();
    const pinned = core.getRowModel().getRowNode("1")!;
    core.setDisplayedPinnedRows([pinned], []);
    expect(core.isBodyRowPinned("1")).toBe(true);
    core.dispatch({ type: "actionFrameOpen", cell: { rowId: "1", colId: colId(core, "name") } });
    expect(core.getActionFrameCell()).toEqual(emittedCell(core, "1", "name"));
  });
});
