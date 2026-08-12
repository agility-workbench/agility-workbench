/**
 * B8 public history surface: the `historyChanged` event (toolbar state without polling),
 * `getHistoryState`, batched `setCellValues` (one undo step), and the two recording scopes
 * `withUndoGroup` (coalesce into one step) / `withoutUndoHistory` (record nothing).
 */
import { describe, expect, it, vi } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { GridEventHistoryChangedParams } from "../events/events";
import { GridOptions, REJECT } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ]);
  return { core, api: new GridAPI(core) };
}

function cell(core: GridCore, rowId: string, colId: string) {
  return { rowId, colId: core.getColumnModel().getByColId(colId)!.instanceID };
}

function val(core: GridCore, rowId: string, key: string) {
  return core.getRowModel().getRowNode(rowId)!.data[key];
}

/** Collect every historyChanged payload the core emits. */
function watchHistory(core: GridCore) {
  const events: GridEventHistoryChangedParams[] = [];
  core.on("historyChanged", ev => events.push(ev));
  return events;
}

describe("GridAPI history state", () => {
  it("getHistoryState reports both stacks and their depths", () => {
    const { core, api } = makeGrid();
    expect(api.getHistoryState()).toEqual({
      canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0,
    });

    api.setCellValue(cell(core, "1", "name"), "ALICE");
    api.setCellValue(cell(core, "2", "name"), "BOB");
    expect(api.getHistoryState()).toEqual({
      canUndo: true, canRedo: false, undoDepth: 2, redoDepth: 0,
    });

    api.undo();
    expect(api.getHistoryState()).toEqual({
      canUndo: true, canRedo: true, undoDepth: 1, redoDepth: 1,
    });
  });
});

describe("historyChanged event", () => {
  it("fires on commit, undo, redo, and clear with the stack snapshot", () => {
    const { core, api } = makeGrid();
    const events = watchHistory(core);

    api.setCellValue(cell(core, "1", "name"), "ALICE");
    api.undo();
    api.redo();
    api.clearHistory();

    expect(events.map(e => e.reason)).toEqual(["commit", "undo", "redo", "clear"]);
    expect(events[0]).toMatchObject({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    expect(events[1]).toMatchObject({ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 });
    expect(events[2]).toMatchObject({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    expect(events[3]).toMatchObject({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  });

  it("bridges to the onHistoryChanged option", () => {
    const onHistoryChanged = vi.fn();
    const core = new GridCore(measurer, {
      rowIdKey: "id", rowModelType: "clientSide", onHistoryChanged,
    });
    core.dispatch({
      type: "themeFontSet", headerFont: "12px sans-serif", cellFont: "12px sans-serif", reason: "test",
    });
    core.setRowData([{ id: "1", name: "alice" }]);
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", editable: true }]);

    new GridAPI(core).setCellValue(cell(core, "1", "name"), "ALICE");
    expect(onHistoryChanged).toHaveBeenCalledTimes(1);
    expect(onHistoryChanged.mock.calls[0][0]).toMatchObject({ reason: "commit", canUndo: true });
  });

  it("follows the write's own events, so a handler sees value and history agree", () => {
    const { core, api } = makeGrid();
    const order: string[] = [];
    core.on("cellValueChanged", () => order.push("cellValueChanged"));
    core.on("historyChanged", () => order.push(`historyChanged:${core.canUndo()}`));

    api.setCellValue(cell(core, "1", "name"), "ALICE");
    expect(order).toEqual(["cellValueChanged", "historyChanged:true"]);
  });

  it("does not fire when nothing enters history", () => {
    const { core, api } = makeGrid();
    const events = watchHistory(core);

    api.undo();                     // empty stack
    api.redo();                     // empty stack
    api.clearHistory();             // already empty
    api.setCellValues([]);          // nothing to write
    core.applyTransaction({ update: [{ rowId: "1", row: { id: "1", name: "zed", qty: 3 } }] });
    expect(events).toEqual([]);
  });

  it("does not fire for a vetoed commit", () => {
    const { core, api } = makeGrid({ onBeforeCellCommit: () => REJECT });
    const events = watchHistory(core);

    api.setCellValue(cell(core, "1", "name"), "ALICE");
    expect(val(core, "1", "name")).toBe("alice");
    expect(events).toEqual([]);
    expect(core.canUndo()).toBe(false);
  });

  it('fires clear when rowData is replaced under rowDataMode "reset"', () => {
    const { core, api } = makeGrid({ rowDataMode: "reset" });
    api.setCellValue(cell(core, "1", "name"), "ALICE");
    const events = watchHistory(core);

    core.setRowData([{ id: "9", name: "new", qty: 1 }]);
    expect(events.map(e => e.reason)).toEqual(["clear"]);
    expect(core.canUndo()).toBe(false);
  });

  it("keeps history when rowData is replaced and the grid can diff it (B6)", () => {
    // Diffing is the default where it is possible, and it applies the new array as a transaction —
    // which preserves history. Entries keyed to rows the diff removed simply no-op on replay.
    const { core, api } = makeGrid();
    api.setCellValue(cell(core, "1", "name"), "ALICE");
    const events = watchHistory(core);

    core.setRowData([{ id: "1", name: "alice", qty: 3 }, { id: "9", name: "new", qty: 1 }]);
    expect(events).toEqual([]);
    expect(core.canUndo()).toBe(true);
    core.dispatch({ type: "undo" });
    expect(val(core, "1", "name")).toBe("alice");
  });

  it("stays silent under readOnlyEdit — the application owns the write and the history", () => {
    const { core, api } = makeGrid({ readOnlyEdit: true });
    const events = watchHistory(core);

    api.setCellValue(cell(core, "1", "name"), "ALICE");
    api.setCellValues([{ cell: cell(core, "2", "name"), value: "BOB" }]);
    expect(events).toEqual([]);
    expect(core.canUndo()).toBe(false);
  });
});

describe("setCellValues", () => {
  it("writes every cell and records the batch as one undo step", () => {
    const { core, api } = makeGrid();
    const events = watchHistory(core);

    api.setCellValues([
      { cell: cell(core, "1", "name"), value: "x" },
      { cell: cell(core, "2", "name"), value: "y" },
      { cell: cell(core, "1", "qty"), value: 99 },
    ]);
    expect(val(core, "1", "name")).toBe("x");
    expect(val(core, "2", "name")).toBe("y");
    expect(val(core, "1", "qty")).toBe(99);
    expect(events).toHaveLength(1);
    expect(api.getHistoryState().undoDepth).toBe(1);

    api.undo();
    expect(val(core, "1", "name")).toBe("alice");
    expect(val(core, "2", "name")).toBe("bob");
    expect(val(core, "1", "qty")).toBe(3);
    expect(api.canUndo()).toBe(false);
  });

  it("stores typed values as-is and routes strings through the valueParser", () => {
    const { core, api } = makeGrid();
    api.setCellValues([
      { cell: cell(core, "1", "qty"), value: 99 },    // typed → stored as a number
      { cell: cell(core, "2", "qty"), value: "42" },  // string → parser's call (none here: raw text)
    ]);
    expect(val(core, "1", "qty")).toBe(99);
    expect(val(core, "2", "qty")).toBe("42");

    // The undo entry holds the same typed forms, so a round-trip does not retype the cell.
    api.undo();
    api.redo();
    expect(val(core, "1", "qty")).toBe(99);
  });

  it("emits one cellValueChanged per cell with source 'edit'", () => {
    const { core, api } = makeGrid();
    const sources: string[] = [];
    core.on("cellValueChanged", ev => sources.push(ev.source));

    api.setCellValues([
      { cell: cell(core, "1", "name"), value: "x" },
      { cell: cell(core, "2", "name"), value: "y" },
    ]);
    expect(sources).toEqual(["edit", "edit"]);
  });

  it("drops cells vetoed by onBeforeCellCommit from the write and the undo step", () => {
    const { core, api } = makeGrid({
      onBeforeCellCommit: params => (params.value === "y" ? REJECT : undefined),
    });

    api.setCellValues([
      { cell: cell(core, "1", "name"), value: "x" },
      { cell: cell(core, "2", "name"), value: "y" },
    ]);
    expect(val(core, "1", "name")).toBe("x");
    expect(val(core, "2", "name")).toBe("bob"); // vetoed

    api.undo();
    expect(val(core, "1", "name")).toBe("alice");
  });
});

describe("withUndoGroup", () => {
  it("coalesces many writes into a single undo step", () => {
    const { core, api } = makeGrid();
    const events = watchHistory(core);

    api.withUndoGroup(() => {
      api.setCellValue(cell(core, "1", "name"), "x");
      api.setCellValue(cell(core, "2", "name"), "y");
      api.setCellValues([{ cell: cell(core, "1", "qty"), value: 99 }]);
    });

    // One entry, announced once — not three.
    expect(events.map(e => e.reason)).toEqual(["commit"]);
    expect(api.getHistoryState().undoDepth).toBe(1);

    api.undo();
    expect(val(core, "1", "name")).toBe("alice");
    expect(val(core, "2", "name")).toBe("bob");
    expect(val(core, "1", "qty")).toBe(3);
    expect(api.canUndo()).toBe(false);

    api.redo();
    expect(val(core, "1", "name")).toBe("x");
    expect(val(core, "2", "name")).toBe("y");
    expect(val(core, "1", "qty")).toBe(99);
  });

  it("returns the callback's value and records nothing for a no-write scope", () => {
    const { core, api } = makeGrid();
    const events = watchHistory(core);
    expect(api.withUndoGroup(() => 42)).toBe(42);
    expect(events).toEqual([]);
    expect(api.canUndo()).toBe(false);
  });

  it("still closes the group when the callback throws", () => {
    const { core, api } = makeGrid();
    expect(() => api.withUndoGroup(() => {
      api.setCellValue(cell(core, "1", "name"), "x");
      throw new Error("boom");
    })).toThrow("boom");

    // The write happened, so it must be undoable — and the scope must not leak to later writes.
    expect(api.getHistoryState().undoDepth).toBe(1);
    api.setCellValue(cell(core, "2", "name"), "y");
    expect(api.getHistoryState().undoDepth).toBe(2);
  });

  it("clears the redo stack like any other commit", () => {
    const { core, api } = makeGrid();
    api.setCellValue(cell(core, "1", "name"), "ALICE");
    api.undo();
    expect(api.canRedo()).toBe(true);

    api.withUndoGroup(() => api.setCellValue(cell(core, "2", "name"), "BOB"));
    expect(api.canRedo()).toBe(false);
  });
});

describe("withoutUndoHistory", () => {
  it("applies writes and their events but records no undo step", () => {
    const { core, api } = makeGrid();
    const values: unknown[] = [];
    core.on("cellValueChanged", ev => values.push(ev.value));
    const events = watchHistory(core);

    api.withoutUndoHistory(() => {
      api.setCellValue(cell(core, "1", "name"), "external");
      api.setCellValues([{ cell: cell(core, "2", "name"), value: "also-external" }]);
    });

    expect(val(core, "1", "name")).toBe("external");
    expect(val(core, "2", "name")).toBe("also-external");
    expect(values).toEqual(["external", "also-external"]); // events still fire
    expect(events).toEqual([]);
    expect(api.canUndo()).toBe(false);
  });

  it("leaves an existing undo stack untouched, redo included", () => {
    const { core, api } = makeGrid();
    api.setCellValue(cell(core, "1", "name"), "ALICE");
    api.undo();
    const before = api.getHistoryState();

    api.withoutUndoHistory(() => api.setCellValue(cell(core, "2", "name"), "external"));
    expect(api.getHistoryState()).toEqual(before); // redo NOT discarded

    api.redo();
    expect(val(core, "1", "name")).toBe("ALICE");
  });

  it("does not leak: writes after the scope record normally", () => {
    const { core, api } = makeGrid();
    api.withoutUndoHistory(() => api.setCellValue(cell(core, "1", "name"), "external"));
    api.setCellValue(cell(core, "2", "name"), "user");
    expect(api.getHistoryState().undoDepth).toBe(1);

    api.undo();
    expect(val(core, "2", "name")).toBe("bob");
    expect(val(core, "1", "name")).toBe("external"); // the external write is not undoable
  });

  it("suppresses a nested withUndoGroup — the outermost scope wins", () => {
    const { core, api } = makeGrid();
    api.withoutUndoHistory(() => {
      api.withUndoGroup(() => api.setCellValue(cell(core, "1", "name"), "external"));
    });
    expect(val(core, "1", "name")).toBe("external");
    expect(api.canUndo()).toBe(false);
  });
});
