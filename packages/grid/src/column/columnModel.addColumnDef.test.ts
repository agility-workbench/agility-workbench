import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { ColumnType } from "../interfaces/column";

// Width proportional to text length so content-based sizing is observable.
const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const measureParams: TextMeasureParams = { headerFont: "14px Arial", cellFont: "14px Arial" };

const rowNode = (data: any): IRowNode => ({ data } as IRowNode);

// A fresh ColumnModel obtained through GridCore, so it carries a real
// InternalGridOptions rather than a hand-built stub.
function makeModel(): ColumnModel {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  const model = core.getColumnModel() as ColumnModel;
  model.setColumnDefs([{ colId: "a", key: "a", label: "A", type: ColumnType.NUMBER }]);
  return model;
}

describe("ColumnModel.addColumnDef", () => {
  it("returns the new column's instanceID and registers it in the lookup maps", () => {
    const model = makeModel();
    const id = model.addColumnDef({ colId: "spark", key: "spark", label: "Spark" });

    const col = model.getById(id);
    expect(col).toBeDefined();
    expect(model.getByColId("spark")).toBe(col);
    expect(model.getByKey("spark")).toBe(col);
    // Appears in the flat leaves list.
    expect(model.getLeaves().some((c) => c.instanceID === id)).toBe(true);
  });

  it("assigns a comparator to a new sortable leaf when rows are supplied (gap #1)", () => {
    const model = makeModel();
    const rows = [rowNode({ v: 3 }), rowNode({ v: 1 }), rowNode({ v: 2 })];
    const id = model.addColumnDef(
      { colId: "v", key: "v", label: "V", type: ColumnType.NUMBER },
      "center",
      measurer,
      measureParams,
      rows,
    );

    const col = model.getById(id)!;
    expect(col.getComparator()).not.toBeNull();
    // Numeric comparator orders ascending by value.
    const cmp = col.getComparator()!;
    expect(cmp(0, 0, rows[1], rows[0])).toBeLessThan(0); // 1 < 3
    expect(cmp(0, 0, rows[0], rows[1])).toBeGreaterThan(0); // 3 > 1
  });

  it("sizes a new leaf to its content when a measure context is supplied (gap #3)", () => {
    const model = makeModel();
    const id = model.addColumnDef(
      { colId: "long", key: "long", label: "A very long header label" },
      "center",
      measurer,
      measureParams,
      [],
    );

    const col = model.getById(id)!;
    // Header-content width = label.length * 7 + 104 padding, well past the 200 default.
    expect(col.computedWidth).toBeGreaterThan(200);
  });

  it("preserves an explicit width for a cellRenderer column instead of measuring (gap #3)", () => {
    const model = makeModel();
    const id = model.addColumnDef(
      { colId: "spark", key: "spark", label: "Spark", width: 120, cellRenderer: () => "" },
      "center",
      measurer,
      measureParams,
      [rowNode({ spark: 1 })],
    );

    expect(model.getById(id)!.computedWidth).toBe(120);
  });

  it("rolls child leaf widths up into a group header (gap #2)", () => {
    const model = makeModel();
    // No measure context: children keep their explicit widths (computeColumnWidth
    // would otherwise re-measure and ignore col.width for non-renderer columns).
    const id = model.addColumnDef({
      colId: "grp",
      label: "Group",
      children: [
        { colId: "c1", key: "c1", label: "C1", width: 80 },
        { colId: "c2", key: "c2", label: "C2", width: 140 },
      ],
    });

    const group = model.getById(id)!;
    expect(group.children.length).toBe(2);
    // Parent width is the sum of its visible leaves (80 + 140), not the 200 default.
    expect(group.computedWidth).toBe(220);
  });

  it("dedups on colId: a repeat add returns the existing column (gap #5)", () => {
    const model = makeModel();
    const first = model.addColumnDef({ colId: "spark", key: "spark", label: "Spark" });
    const leafCountAfterFirst = model.getLeaves().length;

    const second = model.addColumnDef({ colId: "spark", key: "spark", label: "Spark again" });

    expect(second).toBe(first);
    // No duplicate leaf was appended.
    expect(model.getLeaves().length).toBe(leafCountAfterFirst);
  });

  it("does not identify a comparator when no rows are supplied", () => {
    const model = makeModel();
    const id = model.addColumnDef({ colId: "v", key: "v", label: "V", type: ColumnType.NUMBER });
    // With an empty row set, identifyComparator leaves the comparator null.
    expect(model.getById(id)!.getComparator()).toBeNull();
  });

  // The added column is transient by design (gap #4, intentionally not persisted):
  // it survives imperative mutations of the live column set but is dropped whenever
  // the declared columns are rebuilt from originalColDefs.
  describe("transient contract (gap #4)", () => {
    it("survives hiding another column", () => {
      const model = makeModel();
      const id = model.addColumnDef({ colId: "spark", key: "spark", label: "Spark" });

      model.toggleVisibility(["a"], true);

      expect(model.getById(id)).toBeDefined();
      expect(model.getByColId("spark")).toBeDefined();
    });

    it("survives being reordered, keeping both its colId and its instanceID", () => {
      const model = makeModel();
      const id = model.addColumnDef({ colId: "spark", key: "spark", label: "Spark" });

      // Move the added column to the front of the center section.
      model.moveColumnTo(id, 0, "center");

      // A reorder rebuilds the node, but it is the same column: the instanceID rides along, so
      // instanceID-keyed state (roles, aggregates, sorts) still addresses it. This used to mint a
      // fresh id and strand every such reference.
      const moved = model.getByColId("spark");
      expect(moved).toBeDefined();
      expect(moved!.instanceID).toBe(id);
      expect(model.getById(id)).toBe(moved);
    });

    it("is dropped by reset()", () => {
      const model = makeModel();
      model.addColumnDef({ colId: "spark", key: "spark", label: "Spark" });
      expect(model.getByColId("spark")).toBeDefined();

      model.reset();

      // reset() rebuilds from originalColDefs, which never held the added column.
      expect(model.getByColId("spark")).toBeUndefined();
      // The declared column is still there.
      expect(model.getByColId("a")).toBeDefined();
    });

    it("is dropped by a subsequent setColumnDefs()", () => {
      const model = makeModel();
      model.addColumnDef({ colId: "spark", key: "spark", label: "Spark" });

      model.setColumnDefs([{ colId: "a", key: "a", label: "A", type: ColumnType.NUMBER }]);

      expect(model.getByColId("spark")).toBeUndefined();
      expect(model.getByColId("a")).toBeDefined();
    });
  });
});
