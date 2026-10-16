/**
 * `columnAutosize` accepts the public colId (as `resolve` does) and must look the column's
 * ancestors up by its instance id: the lookup by colId returned nothing and the parent-width update
 * dereferenced `undefined`, so autosizing a grouped column through the action threw.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3, note: "short" },
    { id: "2", name: "bob", qty: 7, note: "a considerably longer note that widens the column" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    {
      colId: "details", label: "Details",
      children: [
        { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
        { colId: "note", key: "note", label: "Note", type: ColumnType.STRING },
      ],
    },
  ]);
  return core;
}

describe("columnAutosize by colId", () => {
  it("autosizes a grouped leaf addressed by its public colId and re-sums the group's width", () => {
    const core = makeGrid();
    const model = core.getColumnModel();
    const note = model.getByColId("note")!;
    const group = model.getByColId("details")!;
    core.dispatch({ type: "columnResize", colId: note.instanceID, widthPx: 40 });
    const widths: string[][] = [];
    core.on("columnWidthsChanged", (ev) => widths.push(ev.changedColIds ?? []));

    expect(() => core.dispatch({ type: "columnAutosize", colId: "note" })).not.toThrow();

    expect(note.computedWidth).toBeGreaterThan(40);
    const childSum = group.getVisibleChildren().reduce((sum, c) => sum + c.computedWidth, 0);
    expect(group.computedWidth).toBe(childSum);
    expect(widths.at(-1)).toContain("note");
  });

  it("accepts the instance id too", () => {
    const core = makeGrid();
    const qty = core.getColumnModel().getByColId("qty")!;
    expect(() => core.dispatch({ type: "columnAutosize", colId: qty.instanceID })).not.toThrow();
  });
});
