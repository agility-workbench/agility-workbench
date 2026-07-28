import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { ColumnType } from "../interfaces/column";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const measureParams: TextMeasureParams = { headerFont: "14px Arial", cellFont: "14px Arial" };

// A fresh ColumnModel obtained through GridCore so it carries a real InternalGridOptions.
function makeModel(): ColumnModel {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  const model = core.getColumnModel() as ColumnModel;
  model.setColumnDefs([
    { colId: "a", key: "a", label: "A", type: ColumnType.NUMBER },
    { colId: "b", key: "b", label: "B" },
    { colId: "c", key: "c", label: "C" },
    { colId: "d", key: "d", label: "D" },
  ]);
  model.computeColumnWidths(measurer, measureParams, []);
  return model;
}

const colIdsInOrder = (m: ColumnModel) =>
  m.getLeaves().filter((c) => !c.isInternal()).map((c) => c.colId);

describe("ColumnModel.applyColumnState", () => {
  it("round-trips widths / pinning / visibility / order via getColumnState", () => {
    const model = makeModel();

    // Mutate the layout: resize a column, pin one left, hide one, reorder.
    model.resizeColumn(model.getByColId("a")!.instanceID, 321);
    model.setPinned(model.getByColId("c")!.instanceID, "left");
    model.toggleVisibility([model.getByColId("d")!.instanceID], true);
    const saved = model.getColumnState();

    // A fresh model with the same defs, then restore.
    const restored = makeModel();
    restored.applyColumnState(saved);

    const after = restored.getColumnState();
    // Compare the salient fields for each colId.
    const byId = (s: typeof after) => new Map(s.map((e) => [e.colId, e]));
    const a = byId(after);
    const b = byId(saved);
    for (const colId of ["a", "b", "c", "d"]) {
      expect(a.get(colId)!.hidden).toBe(b.get(colId)!.hidden);
      expect(a.get(colId)!.pinned).toBe(b.get(colId)!.pinned);
      expect(a.get(colId)!.widthPx).toBe(b.get(colId)!.widthPx);
    }
    // Order (leaf sequence) matches.
    expect(colIdsInOrder(restored)).toEqual(colIdsInOrder(model));
    expect(restored.getByColId("c")!.pinned).toBe("left");
    expect(restored.getByColId("d")!.hidden).toBe(true);
    expect(restored.getByColId("a")!.computedWidth).toBe(321);
  });

  it("ignores state entries for unknown colIds and leaves others in place", () => {
    const model = makeModel();
    const before = colIdsInOrder(model);
    model.applyColumnState([{ colId: "does-not-exist", order: 0, widthPx: 999 }]);
    expect(colIdsInOrder(model)).toEqual(before);
  });

  it("reorders columns to match the state order", () => {
    const model = makeModel();
    // Reverse order.
    const reversed = ["d", "c", "b", "a"].map((colId, i) => ({ colId, order: i }));
    model.applyColumnState(reversed);
    expect(colIdsInOrder(model)).toEqual(["d", "c", "b", "a"]);
  });

  it("reorders leaves among siblings inside nested column groups", () => {
    const model = makeModel();
    model.setColumnDefs([
      {
        colId: "identity",
        label: "Identity",
        children: [
          {
            colId: "contact",
            label: "Contact",
            children: [
              { colId: "a", key: "a", label: "A" },
              { colId: "b", key: "b", label: "B" },
            ],
          },
        ],
      },
      {
        colId: "metrics",
        label: "Metrics",
        children: [
          { colId: "c", key: "c", label: "C" },
          { colId: "d", key: "d", label: "D" },
        ],
      },
    ]);

    model.applyColumnState([
      { colId: "b", order: 0 },
      { colId: "a", order: 1 },
      { colId: "d", order: 2 },
      { colId: "c", order: 3 },
    ]);

    expect(colIdsInOrder(model)).toEqual(["b", "a", "d", "c"]);
  });

  it("a partial state WITHOUT order does not reposition the named column", () => {
    const model = makeModel(); // [a, b, c, d]
    // Only pin d; no order field → d should stay in place, not jump to the front.
    model.applyColumnState([{ colId: "d", pinned: "left" }]);
    expect(model.getByColId("d")!.pinned).toBe("left");
    // Pinning moves d into the left section, but relative order is otherwise preserved: d leads
    // (it's the only left-pinned column) followed by the unchanged center columns.
    expect(colIdsInOrder(model)).toEqual(["d", "a", "b", "c"]);
  });

  it("a column WITH order is inserted at that index; unordered columns shift to make room", () => {
    const model = makeModel(); // [a, b, c, d]
    model.applyColumnState([{ colId: "d", order: 0 }]);
    expect(colIdsInOrder(model)).toEqual(["d", "a", "b", "c"]);
  });

  it("mixed defined/undefined order: only ordered columns reposition", () => {
    const model = makeModel(); // [a, b, c, d]
    // d → index 0, a → index 2; b and c keep their relative order and shift.
    model.applyColumnState([{ colId: "d", order: 0 }, { colId: "a", order: 2 }]);
    expect(colIdsInOrder(model)).toEqual(["d", "b", "a", "c"]);
  });

  it("columns sharing an order value keep their array order (stable tie-break)", () => {
    const model = makeModel(); // [a, b, c, d]
    // c and a both target index 0; array order is c before a.
    model.applyColumnState([{ colId: "c", order: 0 }, { colId: "a", order: 0 }]);
    expect(colIdsInOrder(model)).toEqual(["c", "a", "b", "d"]);
  });

  it("without defaultState, columns absent from state keep their visibility (merge)", () => {
    const model = makeModel();
    // Restore a partial view naming only a and b.
    model.applyColumnState([{ colId: "a", order: 0 }, { colId: "b", order: 1 }]);
    expect(model.getByColId("c")!.hidden).toBe(false);
    expect(model.getByColId("d")!.hidden).toBe(false);
  });

  it("defaultState { hidden: true } hides every column absent from state (exact restore)", () => {
    const model = makeModel();
    model.applyColumnState(
      [{ colId: "a", order: 0 }, { colId: "b", order: 1 }],
      { defaultState: { hidden: true } },
    );
    // Listed columns stay visible; the rest are hidden.
    expect(model.getByColId("a")!.hidden).toBe(false);
    expect(model.getByColId("b")!.hidden).toBe(false);
    expect(model.getByColId("c")!.hidden).toBe(true);
    expect(model.getByColId("d")!.hidden).toBe(true);
  });

  it("defaultState covers a column added after the state was captured", () => {
    const model = makeModel();
    // Capture a view of the original four, then a new column "e" appears in the model.
    const saved = model.getColumnState();
    model.addColumnDef({ colId: "e", key: "e", label: "E" });
    expect(model.getByColId("e")!.hidden).toBe(false);

    model.applyColumnState(saved, { defaultState: { hidden: true } });
    // The new column, absent from the saved state, is hidden by the default.
    expect(model.getByColId("e")!.hidden).toBe(true);
    // Originally-saved columns remain visible.
    expect(model.getByColId("a")!.hidden).toBe(false);
  });
});
