import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { BeforeCellCommitParams, GridOptions, REJECT } from "../interfaces/gridOptions";
import { GridEventCellValueChangedParams, GridEventEditingChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    {
      colId: "qty",
      key: "qty",
      label: "Qty",
      type: ColumnType.NUMBER,
      editable: true,
      valueParser: ({ value, oldValue }) => {
        const n = Number(value);
        return Number.isNaN(n) ? oldValue : n;
      },
    },
  ]);
  return core;
}

function instanceId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}

describe("onBeforeCellCommit (A5)", () => {
  it("sees the stored (post-valueParser) form with full context", () => {
    const calls: BeforeCellCommitParams[] = [];
    const core = makeGrid({ onBeforeCellCommit: (p) => { calls.push(p); } });
    core.dispatch({ type: "editCommit", cell: { rowId: "2", colId: instanceId(core, "qty") }, value: "99" });

    expect(calls).toEqual([{
      rowId: "2",
      colId: "qty",
      colInstanceId: instanceId(core, "qty"),
      data: core.getRowModel().getRowNode("2")!.data,
      value: 99, // parsed, not "99"
      oldValue: 7,
      source: "edit",
    }]);
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(99);
  });

  it("returning a value stores it in place of the proposed one (coerce)", () => {
    const core = makeGrid({
      onBeforeCellCommit: (p) => Math.min(p.value as number, 10),
    });
    core.dispatch({ type: "editCommit", cell: { rowId: "2", colId: instanceId(core, "qty") }, value: "42" });
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(10);
  });

  it("returning undefined accepts the proposed value unchanged", () => {
    const core = makeGrid({ onBeforeCellCommit: () => undefined });
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: instanceId(core, "name") }, value: "ALICE" });
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("ALICE");
  });

  it("REJECT keeps the old value, emits editingChanged rejected, no cellValueChanged, no undo entry", () => {
    const editingEvents: GridEventEditingChangedParams[] = [];
    const valueEvents: GridEventCellValueChangedParams[] = [];
    const core = makeGrid({ onBeforeCellCommit: () => REJECT });
    core.on("editingChanged", (e) => editingEvents.push(e));
    core.on("cellValueChanged", (e) => valueEvents.push(e));
    let cellsChanged = 0;
    core.on("cellsChanged", () => cellsChanged++);

    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: instanceId(core, "name") }, value: "MALLORY" });

    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("alice");
    expect(editingEvents).toEqual([{
      state: "rejected",
      cell: { rowId: "1", colId: "name", colInstanceId: instanceId(core, "name") },
      value: "MALLORY",
      oldValue: "alice",
    }]);
    expect(valueEvents).toEqual([]);
    expect(cellsChanged).toBe(0);
    expect(core.canUndo()).toBe(false);
    expect(core.getEditingCell()).toBeNull();
  });

  it("runs per cell in a cellsCommit batch; vetoed cells drop out, the rest commit", () => {
    const valueEvents: GridEventCellValueChangedParams[] = [];
    const core = makeGrid({
      onBeforeCellCommit: (p) => (p.rowId === "1" ? REJECT : undefined),
    });
    core.on("cellValueChanged", (e) => valueEvents.push(e));
    const qty = instanceId(core, "qty");
    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: { rowId: "1", colId: qty }, value: "11" },
        { cell: { rowId: "2", colId: qty }, value: "22" },
      ],
    });

    expect(core.getRowModel().getRowNode("1")!.data.qty).toBe(3); // vetoed
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(22);
    expect(valueEvents).toEqual([{
      cell: { rowId: "2", colId: "qty", colInstanceId: qty },
      oldValue: 7,
      value: 22,
      source: "paste",
    }]);
    // Only the surviving cell enters the undo step.
    core.dispatch({ type: "undo" });
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(7);
    expect(core.getRowModel().getRowNode("1")!.data.qty).toBe(3);
  });

  it("reports clipboard sources (cut/clear) and maps reason api to source edit", () => {
    const sources: string[] = [];
    const core = makeGrid({ onBeforeCellCommit: (p) => { sources.push(p.source); } });
    const name = instanceId(core, "name");
    core.dispatch({ type: "cellsCommit", reason: "cut", edits: [{ cell: { rowId: "1", colId: name }, value: "" }] });
    core.dispatch({ type: "cellsCommit", reason: "clear", edits: [{ cell: { rowId: "2", colId: name }, value: "" }] });
    core.dispatch({ type: "cellsCommit", reason: "api", edits: [{ cell: { rowId: "1", colId: name }, value: "x" }] });
    expect(sources).toEqual(["cut", "clear", "edit"]);
  });

  it("does not run for undo/redo (history replays already-accepted values)", () => {
    let calls = 0;
    const core = makeGrid({ onBeforeCellCommit: () => { calls++; } });
    const cell = { rowId: "1", colId: instanceId(core, "name") };
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });
    expect(calls).toBe(1);

    core.dispatch({ type: "undo" });
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("alice");
    core.dispatch({ type: "redo" });
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("ALICE");
    expect(calls).toBe(1);
  });
});
