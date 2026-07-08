import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: { undoLimit?: number } = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}

function val(core: GridCore, rowId: string, key: string) {
  return core.getRowModel().getRowNode(rowId)!.data[key];
}

describe("GridCore undo/redo", () => {
  let core: GridCore;

  beforeEach(() => {
    core = makeGrid();
  });

  it("starts with nothing to undo or redo", () => {
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(false);
  });

  it("records a single edit and undoes/redoes it", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });
    expect(val(core, "1", "name")).toBe("ALICE");
    expect(core.canUndo()).toBe(true);

    core.dispatch({ type: "undo" });
    expect(val(core, "1", "name")).toBe("alice");
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(true);

    core.dispatch({ type: "redo" });
    expect(val(core, "1", "name")).toBe("ALICE");
    expect(core.canRedo()).toBe(false);
  });

  it("treats a cellsCommit batch (paste/cut) as one undo step", () => {
    const nameId = colId(core, "name");
    const qtyId = colId(core, "qty");
    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: { rowId: "1", colId: nameId }, value: "x" },
        { cell: { rowId: "2", colId: nameId }, value: "y" },
        { cell: { rowId: "1", colId: qtyId }, value: "99" },
      ],
    });
    expect(val(core, "1", "name")).toBe("x");
    expect(val(core, "2", "name")).toBe("y");
    // No valueParser on qty → cellsCommit stores the raw text.
    expect(val(core, "1", "qty")).toBe("99");

    core.dispatch({ type: "undo" }); // one step reverts the whole batch
    expect(val(core, "1", "name")).toBe("alice");
    expect(val(core, "2", "name")).toBe("bob");
    expect(val(core, "1", "qty")).toBe(3);
    expect(core.canUndo()).toBe(false);
  });

  it("emits cellsChanged on undo and redo", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    const reasons: string[] = [];
    core.on("cellsChanged", (e) => reasons.push(e.reason));
    core.dispatch({ type: "editCommit", cell, value: "ALICE" }); // 1
    core.dispatch({ type: "undo" });  // 2
    core.dispatch({ type: "redo" });  // 3
    expect(reasons.length).toBe(3);
  });

  it("clears the redo stack when a new edit is committed after undo", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });
    core.dispatch({ type: "undo" });
    expect(core.canRedo()).toBe(true);

    core.dispatch({ type: "editCommit", cell, value: "OTHER" });
    expect(core.canRedo()).toBe(false); // redo history discarded
    expect(val(core, "1", "name")).toBe("OTHER");
  });

  it("does not record undo/redo's own writes as new history", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });
    core.dispatch({ type: "undo" });
    core.dispatch({ type: "redo" });
    // A single edit should mean exactly one undo available after redo — not stacked from applies.
    core.dispatch({ type: "undo" });
    expect(val(core, "1", "name")).toBe("alice");
    expect(core.canUndo()).toBe(false);
  });

  it("preserves typed (parsed) values through undo/redo", () => {
    const cell = { rowId: "2", colId: colId(core, "qty") };
    core.dispatch({ type: "editCommit", cell, value: 42, parsed: true });
    expect(val(core, "2", "qty")).toBe(42);
    core.dispatch({ type: "undo" });
    expect(val(core, "2", "qty")).toBe(7);
    core.dispatch({ type: "redo" });
    expect(val(core, "2", "qty")).toBe(42);
  });

  it("undo/redo are no-ops when the stacks are empty", () => {
    expect(() => core.dispatch({ type: "undo" })).not.toThrow();
    expect(() => core.dispatch({ type: "redo" })).not.toThrow();
  });

  it("clearHistory empties both stacks", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });
    core.clearHistory();
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(false);
  });

  it("caps history at undoLimit, dropping the oldest step", () => {
    const limited = makeGrid({ undoLimit: 2 });
    const cell = { rowId: "1", colId: colId(limited, "name") };
    limited.dispatch({ type: "editCommit", cell, value: "v1" });
    limited.dispatch({ type: "editCommit", cell, value: "v2" });
    limited.dispatch({ type: "editCommit", cell, value: "v3" }); // drops the "alice→v1" step
    expect(val(limited, "1", "name")).toBe("v3");

    limited.dispatch({ type: "undo" }); // v3 → v2
    limited.dispatch({ type: "undo" }); // v2 → v1
    expect(val(limited, "1", "name")).toBe("v1");
    // Only two steps were retained — the original "alice" state is no longer reachable.
    expect(limited.canUndo()).toBe(false);
    expect(val(limited, "1", "name")).toBe("v1");
  });

  it("disables history entirely when undoLimit is 0", () => {
    const disabled = makeGrid({ undoLimit: 0 });
    const cell = { rowId: "1", colId: colId(disabled, "name") };
    disabled.dispatch({ type: "editCommit", cell, value: "ALICE" });
    expect(val(disabled, "1", "name")).toBe("ALICE"); // edit still applies
    expect(disabled.canUndo()).toBe(false);           // but nothing recorded
  });
});
