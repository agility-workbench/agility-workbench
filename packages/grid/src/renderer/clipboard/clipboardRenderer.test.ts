import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "../../core/core";
import { ClipboardRenderer } from "./clipboardRenderer";
import { ColumnType } from "../../interfaces/column";
import { AggregateType } from "../../interfaces/aggregate";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import type { GridOptions } from "../../interfaces/gridOptions";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: GridOptions = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3, locked: "L1" },
    { id: "2", name: "bob", qty: 7, locked: "L2" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    {
      colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true,
      valueParser: ({ value, oldValue }) => {
        if (value === "") return 0;
        const n = Number(value);
        return Number.isNaN(n) ? oldValue : n;
      },
    },
    { colId: "locked", key: "locked", label: "Locked" }, // not editable
  ]);
  return core;
}

// Column leaf indices (no row-number column): name=0, qty=1, locked=2.
function makeClip(core: GridCore) {
  const writes: string[] = [];
  const clip = new ClipboardRenderer({
    core,
    writeText: async (t) => { writes.push(t); },
    readText: async () => reads.value,
  });
  const reads = { value: "" };
  return { clip, writes, reads };
}

function data(core: GridCore, id: string) {
  return core.getRowModel().getRowNode(id)!.data;
}

describe("ClipboardRenderer", () => {
  let core: GridCore;

  beforeEach(() => {
    core = makeGrid();
  });

  it("copies a multi-cell range as TSV", () => {
    const { clip, writes } = makeClip(core);
    // Select the 2×2 block of name+qty across both rows.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    clip.copy();
    expect(writes).toEqual(["alice\t3\nbob\t7"]);
  });

  it("copies a single active cell", () => {
    const { clip, writes } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 0 });
    clip.copy();
    expect(writes).toEqual(["bob"]);
  });

  it("cut copies then clears only editable cells", () => {
    const { clip, writes } = makeClip(core);
    // Range covering name (editable), qty (editable) and locked (not) on row 0.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 2, mode: "extend" });
    clip.cut();

    expect(writes).toEqual(["alice\t3\tL1"]);
    // name cleared to "" (no parser), qty cleared via parser to 0, locked untouched.
    expect(data(core, "1").name).toBe("");
    expect(data(core, "1").qty).toBe(0);
    expect(data(core, "1").locked).toBe("L1");
  });

  it("pastes the first clipboard cell into the active editable cell via valueParser", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1 }); // qty (editable, numeric)
    reads.value = "42\t99\nfoo";
    await clip.paste();
    expect(data(core, "1").qty).toBe(42);
  });

  it("does not paste into a non-editable active cell", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2 }); // locked (not editable)
    reads.value = "hacked";
    await clip.paste();
    expect(data(core, "1").locked).toBe("L1");
  });

  it("hasEditableCells reflects whether the selection covers an editable cell", () => {
    const { clip } = makeClip(core);
    // Nothing selected → false.
    expect(clip.hasEditableCells()).toBe(false);
    // Active cell on the non-editable "locked" column → false.
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2 });
    expect(clip.hasEditableCells()).toBe(false);
    // Active cell on the editable "qty" column → true.
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1 });
    expect(clip.hasEditableCells()).toBe(true);
    // A range spanning locked + editable columns → true (at least one editable).
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 2, mode: "extend" });
    expect(clip.hasEditableCells()).toBe(true);
  });

  it("treats a row presentation veto as non-editable for menu gating, cut, and paste", async () => {
    core = makeGrid({
      getRowPresentation: ({ rowId }) => ({ editable: rowId !== "1" }),
    });
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });

    expect(clip.hasEditableCells()).toBe(false);
    clip.cut();
    expect(data(core, "1").name).toBe("alice");

    reads.value = "changed";
    await clip.paste();
    expect(data(core, "1").name).toBe("alice");

    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 0 });
    expect(clip.hasEditableCells()).toBe(true);
  });
});

describe("ClipboardRenderer multi-cell paste", () => {
  let core: GridCore;

  beforeEach(() => {
    core = makeGrid();
  });

  it("spills an R×C block down/right from the anchor", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 }); // anchor at name/row0
    reads.value = "x\t11\ny\t22";
    await clip.paste();
    expect(data(core, "1").name).toBe("x");
    expect(data(core, "1").qty).toBe(11);
    expect(data(core, "2").name).toBe("y");
    expect(data(core, "2").qty).toBe(22);
  });

  it("keeps positional alignment across a non-editable column, skipping it", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 }); // anchor at name
    // 3 wide: name (editable) | locked (skipped) | (past end → clipped). Only name gets written;
    // the locked slot is consumed, not shifted onto qty.
    reads.value = "N\tSKIP\tEXTRA";
    await clip.paste();
    expect(data(core, "1").name).toBe("N");
    expect(data(core, "1").locked).toBe("L1"); // untouched
    expect(data(core, "1").qty).toBe(3); // NOT overwritten by "SKIP"
  });

  it("fills the whole selected range from a 1×1 clipboard", async () => {
    const { clip, reads } = makeClip(core);
    // Select name+qty across both rows (2×2).
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    reads.value = "5";
    await clip.paste();
    expect(data(core, "1").name).toBe("5");
    expect(data(core, "1").qty).toBe(5);
    expect(data(core, "2").name).toBe("5");
    expect(data(core, "2").qty).toBe(5);
  });

  it("clips cells that spill past the last row", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 0 }); // last row
    reads.value = "p\nq\nr"; // 3 rows from the last row → 2 clipped
    await clip.paste();
    expect(data(core, "2").name).toBe("p");
    // Grid only has 2 rows; nothing crashes, extras dropped.
    expect(core.getRowModel().getViewCount()).toBe(2);
  });

  it("emits a single cellsChanged for the whole block", async () => {
    const { clip, reads } = makeClip(core);
    const events: number[] = [];
    core.on("cellsChanged", (e) => events.push(e.rowIds.length));
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    reads.value = "x\t11\ny\t22";
    await clip.paste();
    expect(events).toEqual([2]); // one event covering both rows
  });

  it("selects the pasted rectangle afterwards", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    reads.value = "x\t11\ny\t22";
    await clip.paste();
    const range = core.getSelectionRange()!;
    expect(range).toMatchObject({ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 });
  });
});

describe("ClipboardRenderer clearContents (Delete)", () => {
  let core: GridCore;

  beforeEach(() => {
    core = makeGrid();
  });

  it("clears editable cells in the selection, leaving locked cells untouched", () => {
    const { clip } = makeClip(core);
    // Range over name (editable), qty (editable), locked (not) on row 0.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 2, mode: "extend" });
    clip.clearContents();
    expect(data(core, "1").name).toBe("");
    expect(data(core, "1").qty).toBe(0); // numeric valueParser: "" → 0
    expect(data(core, "1").locked).toBe("L1");
  });

  it("does not write to the clipboard (unlike cut)", () => {
    const { clip, writes } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    clip.clearContents();
    expect(writes).toEqual([]);
  });

  it("is one undoable step that restores the original values", () => {
    const { clip } = makeClip(core);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "extend" }); // name, both rows
    clip.clearContents();
    expect(data(core, "1").name).toBe("");
    expect(data(core, "2").name).toBe("");

    core.dispatch({ type: "undo" });
    expect(data(core, "1").name).toBe("alice");
    expect(data(core, "2").name).toBe("bob");
    expect(core.canUndo()).toBe(false); // exactly one step
  });

  it("no-ops when only non-editable cells are selected", () => {
    const { clip } = makeClip(core);
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2 }); // locked
    clip.clearContents();
    expect(data(core, "1").locked).toBe("L1");
    expect(core.canUndo()).toBe(false);
  });
});

// Tiling needs more rows/cols than the 2-row default grid.
function makeTileGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", a: "a1", b: "b1" },
    { id: "2", a: "a2", b: "b2" },
    { id: "3", a: "a3", b: "b3" },
    { id: "4", a: "a4", b: "b4" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "a", key: "a", label: "A", editable: true },
    { colId: "b", key: "b", label: "B", editable: true },
  ]);
  return core;
}

describe("ClipboardRenderer paste tiling", () => {
  let core: GridCore;
  beforeEach(() => { core = makeTileGrid(); });

  it("tiles a 1×2 block down a 3×2 selection (exact multiple)", async () => {
    const { clip, reads } = makeClip(core);
    // Select rows 0..2 across both columns.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 2, colIdx: 1, mode: "extend" });
    reads.value = "X\tY"; // one row, two cols → repeats down 3 rows
    await clip.paste();
    expect([data(core, "1").a, data(core, "1").b]).toEqual(["X", "Y"]);
    expect([data(core, "2").a, data(core, "2").b]).toEqual(["X", "Y"]);
    expect([data(core, "3").a, data(core, "3").b]).toEqual(["X", "Y"]);
    expect([data(core, "4").a, data(core, "4").b]).toEqual(["a4", "b4"]); // untouched
  });

  it("tiles a 2×1 block down a 4×1 selection, wrapping the source rows", async () => {
    const { clip, reads } = makeClip(core);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 3, colIdx: 0, mode: "extend" });
    reads.value = "P\nQ"; // two rows → P,Q,P,Q
    await clip.paste();
    expect([data(core, "1").a, data(core, "2").a, data(core, "3").a, data(core, "4").a])
      .toEqual(["P", "Q", "P", "Q"]);
  });

  it("spills once (no tiling) when the selection is not an exact multiple", async () => {
    const { clip, reads } = makeClip(core);
    // 2-row selection with a 1×1... use a non-multiple: 3-row selection, 2-row block.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 2, colIdx: 0, mode: "extend" }); // span 3
    reads.value = "P\nQ"; // block 2 rows; 3 % 2 !== 0 → spill once from anchor
    await clip.paste();
    expect([data(core, "1").a, data(core, "2").a, data(core, "3").a])
      .toEqual(["P", "Q", "a3"]); // only 2 written, third untouched
  });
});

describe("ClipboardRenderer with row grouping", () => {
  // Region-grouped, fully expanded: group headers interleave with leaf rows.
  function makeGroupedGrid(groupRowsSelectable = false) {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", groupDefaultExpanded: -1, groupRowsSelectable });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData([
      { id: "1", region: "EMEA", name: "alice" },
      { id: "2", region: "EMEA", name: "bob" },
    ]);
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name" },
    ]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    return core;
  }

  // Leaf columns in singleColumn mode: autoGroup(pinned left)=0, region=1, name=2.
  const REGION_COL = 1;

  it("omits group rows from a copied range by default", () => {
    const core = makeGroupedGrid();
    // View: [EMEA header, alice, bob]. Select the Region column top-to-bottom.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: REGION_COL, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 2, colIdx: REGION_COL, mode: "extend" });
    const { clip, writes } = makeClip(core);
    clip.copy();
    // Only the two leaf rows' region values — the group header row is skipped.
    expect(writes).toEqual(["EMEA\nEMEA"]);
  });

  it("includes group rows in the copy when groupRowsSelectable is enabled", () => {
    const core = makeGroupedGrid(true);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: REGION_COL, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 2, colIdx: REGION_COL, mode: "extend" });
    const { clip, writes } = makeClip(core);
    clip.copy();
    // Group header row is included → 3 lines (the header cell is blank in the region column).
    expect(writes[0]?.split("\n").length).toBe(3);
  });
});

describe("ClipboardRenderer in pivot mode", () => {
  // Region-grouped, quarter-pivoted, revenue summed. Displayed leaves:
  // autoGroup=0, Q1·revenue=1, Q2·revenue=2. All body rows are group rows.
  function makePivotedGrid() {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      { colId: "quarter", key: "quarter", label: "Quarter" },
      { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
    ]);
    core.setRowData([
      { id: "1", region: "West", quarter: "Q1", revenue: 10 },
      { id: "2", region: "West", quarter: "Q2", revenue: 20 },
      { id: "3", region: "East", quarter: "Q1", revenue: 30 },
    ]);
    const revenue = core.getColumnModel().getByColId("revenue")!;
    core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }] });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    return core;
  }

  it("copies a pivot range: aggregate values plus the group label, without any option", () => {
    const core = makePivotedGrid();
    expect(core.getOptions().groupRowsSelectable).toBe(false);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 2, mode: "extend" });
    const { clip, writes } = makeClip(core);
    clip.copy();
    const lines = writes[0]!.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContain("West (2)\t10\t20");
    expect(lines).toContain("East (1)\t30\t");
  });

  it("copies only the generated value columns when the range excludes the group column", () => {
    const core = makePivotedGrid();
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 2, mode: "extend" });
    const { clip, writes } = makeClip(core);
    clip.copy();
    const lines = writes[0]!.split("\n");
    expect(lines).toContain("10\t20");
    expect(lines).toContain("30\t");
  });
});
