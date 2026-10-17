/**
 * api.setColumnPinned / setColumnsVisible / setColumnVisible / moveColumn / moveColumns: the typed
 * doors for the `columnPin` / `columnVisibility` / column-move actions (finding #134).
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import type { ColDef } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridEventColumnsChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

const col = (id: string, extra: Partial<ColDef> = {}): ColDef => ({ colId: id, key: id, label: id, ...extra });

function makeGrid(defs: ColDef[] = [col("a"), col("b"), col("c"), col("d"), col("e")], extra: Record<string, unknown> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", rowNumbers: true, ...extra } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps(defs);
  core.setRowData([{ id: "1" }]);
  return { core, api: new GridAPI(core) as IGridAPI };
}

function record(api: IGridAPI): GridEventColumnsChangedParams[] {
  const events: GridEventColumnsChangedParams[] = [];
  api.on("columnsChanged", e => events.push(e));
  return events;
}

const order = (api: IGridAPI) => api.getColumnState().map(s => s.colId);

describe("api.setColumnPinned", () => {
  it("pins one column or several, emitting what the menu's Pin items emit", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.setColumnPinned("c", "left");
    expect(api.getColumnState().find(s => s.colId === "c")!.pinned).toBe("left");
    expect(events).toEqual([expect.objectContaining({ reason: "pin", changedColIds: ["c"], source: "api" })]);

    api.setColumnPinned(["d", "e"], "right");
    expect(order(api)).toEqual(["c", "a", "b", "d", "e"]);
    api.setColumnPinned(["c", "d", "e"], null);
    expect(api.getColumnState().every(s => s.pinned == null)).toBe(true);
  });

  it("skips unknown and unpinnable columns, emitting nothing when none is left", () => {
    const { api, core } = makeGrid();
    const events = record(api);
    const rowNumber = core.getColumnModel().getLeadingLeaves()[0];
    api.setColumnPinned([rowNumber.instanceID, "nope"], "right");
    expect(events).toEqual([]);
    expect(rowNumber.pinned).toBe("left");
  });

  it("pins a lockPosition column to the edge of the new section", () => {
    const { api } = makeGrid([col("a"), col("b"), col("lock", { lockPosition: true })]);
    api.setColumnPinned("a", "left");
    api.setColumnPinned("lock", "left");
    expect(order(api)).toEqual(["lock", "a", "b"]);
  });
});

describe("api.setColumnsVisible / setColumnVisible", () => {
  it("hides and shows, emitting a visibility change", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.setColumnsVisible(["b", "c"], false);
    expect(api.getColumnState().filter(s => s.hidden).map(s => s.colId)).toEqual(["b", "c"]);
    expect(events).toEqual([expect.objectContaining({ reason: "visibility", changedColIds: ["b", "c"], source: "api" })]);
    api.setColumnVisible("b", true);
    expect(api.getColumnState().filter(s => s.hidden).map(s => s.colId)).toEqual(["c"]);
  });

  it("never hides a hideable: false column, but shows one", () => {
    const { api } = makeGrid([col("a"), col("keep", { hideable: false }), col("shy", { hideable: false, hidden: true })]);
    const events = record(api);
    api.setColumnsVisible(["keep"], false);
    expect(events).toEqual([]);
    expect(api.getColumnState().find(s => s.colId === "keep")!.hidden).toBe(false);
    api.setColumnVisible("shy", true);
    expect(api.getColumnState().find(s => s.colId === "shy")!.hidden).toBe(false);
  });

  it("emits nothing when every column is already in the requested state", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.setColumnsVisible(["a", "b"], true);
    expect(events).toEqual([]);
  });
});

describe("api.moveColumn / moveColumns", () => {
  it("moves to an index of getColumnState() order with one order event", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.moveColumn("e", 1);
    expect(order(api)).toEqual(["a", "e", "b", "c", "d"]);
    expect(events).toEqual([expect.objectContaining({ reason: "order", changedColIds: ["e"], source: "api" })]);
    api.moveColumn("a", 4);
    expect(order(api)).toEqual(["e", "b", "c", "d", "a"]);
    api.moveColumn("b", 99);
    expect(order(api)).toEqual(["e", "c", "d", "a", "b"]);
  });

  it("moves several columns as a block in the order given", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.moveColumns(["e", "a"], 1);
    expect(order(api)).toEqual(["b", "e", "a", "c", "d"]);
    expect(events).toHaveLength(1);
    expect([...(events[0].changedColIds ?? [])].sort()).toEqual(["a", "e"]);
  });

  it("counts hidden columns in the index", () => {
    const { api } = makeGrid();
    api.setColumnsVisible(["b"], false);
    api.moveColumn("e", 2);
    expect(order(api)).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("keeps a column in its own section, clamping the index to the section's range", () => {
    const { api } = makeGrid();
    api.setColumnPinned(["a", "b"], "left");
    api.setColumnPinned("e", "right");
    // left: a b | centre: c d | right: e
    api.moveColumn("d", 0);
    expect(order(api)).toEqual(["a", "b", "d", "c", "e"]);
    api.moveColumn("a", 4);
    expect(order(api)).toEqual(["b", "a", "d", "c", "e"]);
    api.moveColumn("e", 0);
    expect(order(api)).toEqual(["b", "a", "d", "c", "e"]);
  });

  it("never moves a locked or movable: false column, and keeps locked columns at their edge", () => {
    const { api } = makeGrid([
      col("first", { lockPosition: "left" }),
      col("a"),
      col("fixed", { movable: false }),
      col("b"),
      col("last", { lockPosition: "right" }),
    ]);
    const events = record(api);
    api.moveColumns(["first", "last", "fixed"], 2);
    expect(events).toEqual([]);
    expect(order(api)).toEqual(["first", "a", "fixed", "b", "last"]);
    api.moveColumn("b", 0);
    expect(order(api)).toEqual(["first", "b", "a", "fixed", "last"]);
    api.moveColumn("a", 4);
    expect(order(api)).toEqual(["first", "b", "fixed", "a", "last"]);
  });

  it("moves a group as a whole by its colId, and takes a leaf out of its group", () => {
    const { api, core } = makeGrid([
      col("a"),
      { colId: "G", label: "G", children: [col("g1"), col("g2")] },
      col("b"),
    ]);
    api.moveColumn("G", 0);
    expect(order(api)).toEqual(["g1", "g2", "a", "b"]);
    api.moveColumn("g2", 3);
    expect(order(api)).toEqual(["g1", "a", "b", "g2"]);
    const top = core.getColumnModel().getCenterColumns().map(c => c.colId);
    expect(top[top.length - 1]).not.toBe("b");
  });

  it("ignores an empty list and unknown ids", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.moveColumns([], 0);
    api.moveColumn("nope", 0);
    expect(events).toEqual([]);
  });
});
