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

describe("GridCore applyTransaction", () => {
  let core: GridCore;

  beforeEach(() => {
    core = makeGrid();
  });

  it("adds new rows to the view", () => {
    core.applyTransaction({ add: [{ id: "4", name: "dave", qty: 9 }] });
    expect(core.getRowModel().getRowCount()).toBe(4);
    expect(viewOrder(core)).toEqual(["1", "2", "3", "4"]);
    expect(core.getCellValue("4", "name")).toBe("dave");
  });

  it("updates a row's data in place, preserving node identity", () => {
    const before = core.getRowModel().getRowNode("2");
    core.applyTransaction({ update: [{ rowId: "2", row: { id: "2", name: "bob", qty: 42 } }] });
    const after = core.getRowModel().getRowNode("2");
    expect(after).toBe(before); // same node object — change-flash / sparklines can diff
    expect(core.getCellValue("2", "qty")).toBe(42);
  });

  it("removes rows from the view", () => {
    core.applyTransaction({ remove: ["2"] });
    expect(core.getRowModel().getRowCount()).toBe(2);
    expect(viewOrder(core)).toEqual(["1", "3"]);
    expect(core.getRowModel().getRowNode("2")).toBeUndefined();
  });

  it("applies add, update, and remove in a single transaction", () => {
    core.applyTransaction({
      add: [{ id: "4", name: "dave", qty: 1 }],
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 100 } }],
      remove: ["3"],
    });
    expect(viewOrder(core)).toEqual(["1", "2", "4"]);
    expect(core.getCellValue("1", "qty")).toBe(100);
  });

  it("treats an add with an existing id as an update", () => {
    core.applyTransaction({ add: [{ id: "2", name: "bob", qty: 99 }] });
    expect(core.getRowModel().getRowCount()).toBe(3); // no duplicate
    expect(core.getCellValue("2", "qty")).toBe(99);
  });

  it("does NOT reorder an update-only transaction when reevaluateOnEdit is off", () => {
    core = makeGrid({ reevaluateOnEdit: false });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]); // 3,5,7

    // Bump row 1's qty above everyone; with reevaluateOnEdit off, it stays put.
    core.applyTransaction({ update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 100 } }] });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]);
    expect(core.getCellValue("1", "qty")).toBe(100);
  });

  it("reorders an update-only transaction when reevaluateOnEdit is on", () => {
    core = makeGrid({ reevaluateOnEdit: true });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]); // 3,5,7

    core.applyTransaction({ update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 100 } }] });
    expect(viewOrder(core)).toEqual(["3", "2", "1"]); // 5,7,100
  });

  it("re-sorts a newly added row into position regardless of reevaluateOnEdit (structural)", () => {
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    expect(viewOrder(core)).toEqual(["1", "3", "2"]); // 3,5,7

    // Add qty=4 → sorts between 3 and 5. Structural changes always reflow, even with re-eval off.
    core.applyTransaction({ add: [{ id: "4", name: "dave", qty: 4 }] });
    expect(viewOrder(core)).toEqual(["1", "4", "3", "2"]); // 3,4,5,7
  });

  it("emits rowsChanged with reason 'transaction' on structural change", () => {
    const reasons: string[] = [];
    core.on("rowsChanged", (e) => reasons.push(e.reason));
    core.applyTransaction({ add: [{ id: "4", name: "dave", qty: 9 }] });
    expect(reasons).toContain("transaction");
  });

  it("emits cellsChanged (not rowsChanged) for an in-place update with re-eval off", () => {
    core = makeGrid({ reevaluateOnEdit: false });
    const rowsReasons: string[] = [];
    const cellsReasons: string[] = [];
    core.on("rowsChanged", (e) => rowsReasons.push(e.reason));
    core.on("cellsChanged", (e) => cellsReasons.push(e.reason));
    core.applyTransaction({ update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 100 } }] });
    expect(cellsReasons.length).toBeGreaterThan(0);
    expect(rowsReasons).not.toContain("transaction");
  });

  it("preserves edit history across a transaction (unlike setRowData)", () => {
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 50, parsed: true });
    core.applyTransaction({ add: [{ id: "4", name: "dave", qty: 9 }] });
    core.dispatch({ type: "undo" });
    // The pre-edit value is restored — history survived the transaction.
    expect(core.getCellValue("1", "qty")).toBe(3);
  });

  it("is a no-op for empty / non-matching transactions", () => {
    const reasons: string[] = [];
    core.on("rowsChanged", (e) => reasons.push(e.reason));
    core.applyTransaction({});
    core.applyTransaction({ update: [{ rowId: "nope", row: { id: "nope" } }], remove: ["ghost"] });
    expect(reasons).not.toContain("transaction");
    expect(core.getRowModel().getRowCount()).toBe(3);
  });

  it("routes through the rowTransactionApply dispatch action", () => {
    core.dispatch({ type: "rowTransactionApply", add: [{ id: "4", name: "dave", qty: 9 }] });
    expect(viewOrder(core)).toEqual(["1", "2", "3", "4"]);
  });
});
