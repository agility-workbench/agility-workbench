import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: { reevaluateOnEdit?: boolean } = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
    { id: "3", name: "carol", qty: 5 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true, type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", editable: true, type: ColumnType.NUMBER },
  ]);
  return core;
}

const colId = (core: GridCore, key: string) => core.getColumnModel().getByColId(key)!.instanceID;

// Row ids in current view order.
function viewOrder(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) {
    out.push(core.getRowIdAtViewIndex(i)!);
  }
  return out;
}

describe("GridCore reevaluate-on-edit", () => {
  let core: GridCore;

  beforeEach(() => {
    core = makeGrid();
  });

  it("re-sorts when an edit changes a value in the sorted column", () => {
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]); // 3,5,7

    // Edit row 1's qty from 3 → 100; it should move to the end.
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 100, parsed: true });
    expect(viewOrder(core)).toEqual(["3", "2", "1"]); // 5,7,100
  });

  it("does not re-sort when the edited column is not part of the sort", () => {
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]);

    // Editing name shouldn't reorder a qty-sorted view.
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "name") }, value: "zzz" });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]);
  });

  it("follows the edited cell to its new sorted position", () => {
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    // Focus row 1 (qty=3, at view index 0).
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1 });
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 100, parsed: true });
    // Row "1" is now last (view index 2); the active cell should have followed it.
    const active = core.getActiveCell()!;
    expect(core.getRowIdAtViewIndex(active.row)).toBe("1");
  });

  it("drops a row out of the view when an edit fails the active filter", () => {
    // Filter qty >= 5.
    const qtyCol = core.getColumnModel().getByColId("qty")!;
    core.setFilterModel([
      { col: qtyCol, key: "qty", filters: [{ type: "gte" as any, values: [5] }] },
    ]);
    expect(viewOrder(core).sort()).toEqual(["2", "3"]); // alice(3) filtered out

    // Bump alice to 9 → she re-enters; then knock bob down to 1 → he drops out.
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 9, parsed: true });
    expect(viewOrder(core).includes("1")).toBe(true);

    core.dispatch({ type: "editCommit", cell: { rowId: "2", colId: colId(core, "qty") }, value: 1, parsed: true });
    expect(viewOrder(core).includes("2")).toBe(false);
  });

  it("does nothing when reevaluateOnEdit is false", () => {
    const off = makeGrid({ reevaluateOnEdit: false });
    off.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(off, "qty"), dir: "asc" }] });
    expect(viewOrder(off)).toEqual(["1", "3", "2"]);

    off.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(off, "qty") }, value: 100, parsed: true });
    // Order unchanged — the edited row stays in place.
    expect(viewOrder(off)).toEqual(["1", "3", "2"]);
  });

  it("re-sorts after undo moves a value back", () => {
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 100, parsed: true });
    expect(viewOrder(core)).toEqual(["3", "2", "1"]);

    core.dispatch({ type: "undo" }); // qty back to 3 → row 1 first again
    expect(viewOrder(core)).toEqual(["1", "3", "2"]);
  });
});
