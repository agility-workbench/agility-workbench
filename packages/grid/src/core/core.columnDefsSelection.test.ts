import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColDef, ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

function defs(order: string[], overrides: Record<string, Partial<ColDef>> = {}): ColDef[] {
  return order.map(key => ({
    colId: key,
    key,
    label: key.toUpperCase(),
    type: ColumnType.STRING,
    ...overrides[key],
  }));
}

function makeGrid(): GridCore {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([{ id: "1", a: "a", b: "b", c: "c", d: "d", x: "x" }]);
  core.setColumnDefsFromProps(defs(["a", "b", "c", "d"]));
  core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
  core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 2, mode: "extend" });
  return core;
}

describe("columnDefs selection reconciliation", () => {
  it("preserves a contiguous range for presentation-only definition changes", () => {
    const core = makeGrid();
    core.setColumnDefsFromProps(defs(["a", "b", "c", "d"], {
      b: { label: "Bee", cellStyle: { color: "red" } },
      c: { label: "See", showColumnMenu: false },
    }));

    expect(core.getSelectionRange()).toMatchObject({ colStart: 1, colEnd: 2 });
  });

  it("clears a range when the visible column sequence changes by insertion", () => {
    const core = makeGrid();
    core.setColumnDefsFromProps(defs(["x", "a", "b", "c", "d"]));

    expect(core.getSelectionRange()).toBeNull();
  });

  it("clears a range when the selected column sequence changes", () => {
    const core = makeGrid();
    core.setColumnDefsFromProps(defs(["a", "b", "d", "c"]));
    expect(core.getSelectionRange()).toBeNull();
  });

  it("clears a range when a selected column changes pin region", () => {
    const core = makeGrid();
    core.setColumnDefsFromProps(defs(["a", "b", "c", "d"], { b: { pinned: "left" } }));
    expect(core.getSelectionRange()).toBeNull();
  });

  it("clears a range when a selected column becomes hidden", () => {
    const core = makeGrid();
    core.setColumnDefsFromProps(defs(["a", "b", "c", "d"], { c: { hidden: true } }));
    expect(core.getSelectionRange()).toBeNull();
  });
});
