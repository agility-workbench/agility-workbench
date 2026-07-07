import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "../../core/core";
import { ClipboardRenderer } from "./clipboardRenderer";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
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
