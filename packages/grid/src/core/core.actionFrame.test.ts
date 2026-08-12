import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridEventActionFrameParams, GridEventEditingChangedParams } from "../events/events";

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
