import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { ColumnType, ColDef } from "../interfaces/column";

// Width proportional to text length so content-based sizing is observable.
const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const measureParams: TextMeasureParams = { headerFont: "14px Arial", cellFont: "14px Arial" };

const LONG = "a cell value long enough to measure well past any declared width";

function makeCore(columnDefs: ColDef[], rows: any[], options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "14px Arial", cellFont: "14px Arial", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps(columnDefs);
  return core;
}

const col = (core: GridCore, colId: string) => (core.getColumnModel() as ColumnModel).getByColId(colId)!;

function viewIds(core: GridCore): string[] {
  const rm = core.getRowModel();
  const out: string[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(String(rm.getRowNodeAtViewIndex(i)!.id));
  return out;
}

describe("declared ColDef.width vs content autosize (finding A5)", () => {
  it("keeps a declared width through the data load", () => {
    const core = makeCore(
      [{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING, width: 80 }],
      [{ id: "1", name: LONG }],
    );
    expect(col(core, "name").computedWidth).toBe(80);

    // A later data change (implicit autosize pass) leaves it alone too.
    core.setRowData([{ id: "2", name: LONG + LONG }]);
    expect(col(core, "name").computedWidth).toBe(80);
  });

  it("keeps a declared width on every data change with autosizeColumnsOnDataChange", () => {
    const core = makeCore(
      [
        { colId: "fixed", key: "fixed", label: "Fixed", type: ColumnType.STRING, width: 90 },
        { colId: "auto", key: "auto", label: "Auto", type: ColumnType.STRING },
      ],
      [{ id: "1", fixed: "x", auto: "short" }],
      { autosizeColumnsOnDataChange: true },
    );
    const before = col(core, "auto").computedWidth;
    core.setRowData([{ id: "1", fixed: LONG, auto: LONG }]);
    expect(col(core, "fixed").computedWidth).toBe(90);
    // The undeclared column still follows its content.
    expect(col(core, "auto").computedWidth).toBeGreaterThan(before);
  });

  it("still autosizes a column with no declared width to its content", () => {
    const core = makeCore(
      [{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }],
      [{ id: "1", name: LONG }],
      { maxColumnWidth: 2000 },
    );
    expect(col(core, "name").computedWidth).toBe(LONG.length * 7 + 16);
  });

  it("clamps a declared width by the column's own minWidth / maxWidth only", () => {
    const core = makeCore(
      [
        { colId: "lo", key: "lo", label: "Lo", width: 40, minWidth: 60 },
        { colId: "hi", key: "hi", label: "Hi", width: 900, maxWidth: 300 },
        // A declared width may exceed the grid-wide maxColumnWidth (it only caps autosize).
        { colId: "wide", key: "wide", label: "Wide", width: 600 },
      ],
      [{ id: "1", lo: "x", hi: "y", wide: "z" }],
    );
    expect(col(core, "lo").computedWidth).toBe(60);
    expect(col(core, "hi").computedWidth).toBe(300);
    expect(col(core, "wide").computedWidth).toBe(600);
  });

  it("caps autosize at maxColumnWidth and floors it at minResizeWidth", () => {
    const core = makeCore(
      [
        { colId: "long", key: "long", label: "L", type: ColumnType.STRING },
        { colId: "short", key: "short", label: "S", type: ColumnType.STRING },
      ],
      [{ id: "1", long: LONG, short: "x" }],
      { maxColumnWidth: 250, minResizeWidth: 180 },
    );
    expect(col(core, "long").computedWidth).toBe(250);
    // Header "S" measures 7 + 120 = 127 < 180 floor.
    expect(col(core, "short").computedWidth).toBe(180);
  });

  it("lets a column's own maxWidth / minWidth win over the grid-wide autosize bounds", () => {
    const core = makeCore(
      [
        { colId: "capped", key: "capped", label: "C", type: ColumnType.STRING, maxWidth: 150 },
        { colId: "roomy", key: "roomy", label: "R", type: ColumnType.STRING, maxWidth: 1000 },
        { colId: "floored", key: "floored", label: "F", type: ColumnType.STRING, minWidth: 300 },
      ],
      [{ id: "1", capped: LONG, roomy: LONG, floored: "x" }],
    );
    expect(col(core, "capped").computedWidth).toBe(150);
    expect(col(core, "roomy").computedWidth).toBe(LONG.length * 7 + 16);
    expect(col(core, "floored").computedWidth).toBe(300);
  });

  it("sets the width (not a stale one) when the header alone exceeds the column's maxWidth", () => {
    const model = (makeCore([{ colId: "a", key: "a", label: "A" }], []).getColumnModel()) as ColumnModel;
    model.setColumnDefs([{ colId: "h", key: "h", label: "A header far wider than its cap", maxWidth: 130 }]);
    const h = model.getByColId("h")!;
    h.computedWidth = 999; // stale value from an earlier layout
    model.computeColumnWidths(measurer, measureParams, []);
    expect(h.computedWidth).toBe(130);
  });

  it("clamps the 200px fallback of an undeclared cellRenderer column", () => {
    const core = makeCore(
      [{ colId: "spark", key: "spark", label: "Spark", cellRenderer: () => "", maxWidth: 160 }],
      [{ id: "1", spark: 1 }],
    );
    expect(col(core, "spark").computedWidth).toBe(160);
  });

  it("explicit autosize (header double-click / columnAutosize) still measures a declared-width column", () => {
    const core = makeCore(
      [{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING, width: 80 }],
      [{ id: "1", name: LONG }],
      { maxColumnWidth: 2000 },
    );
    expect(col(core, "name").computedWidth).toBe(80);
    core.dispatch({ type: "columnAutosize", colId: col(core, "name").instanceID });
    expect(col(core, "name").computedWidth).toBe(LONG.length * 7 + 16);
  });

  it("a user resize still wins over a declared width", () => {
    const core = makeCore(
      [{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING, width: 80 }],
      [{ id: "1", name: "x" }],
    );
    core.dispatch({ type: "columnResize", colId: col(core, "name").instanceID, widthPx: 222 });
    core.setRowData([{ id: "2", name: LONG }]);
    expect(col(core, "name").computedWidth).toBe(222);
  });
});

describe("filter: false does not disable sorting (finding A4)", () => {
  const rows = [
    { id: "1", n: 3, s: "b" },
    { id: "2", n: 1, s: "c" },
    { id: "3", n: 2, s: "a" },
  ];

  it.each([
    ["numeric", "n", ColumnType.NUMBER, ["2", "3", "1"]],
    ["string", "s", ColumnType.STRING, ["3", "1", "2"]],
  ] as const)("a %s column with filter: false sorts asc/desc like one without", (_kind, key, type, asc) => {
    for (const filter of [false, undefined]) {
      const core = makeCore([{ colId: key, key, label: key, type, filter }], rows);
      const id = col(core, key).instanceID;
      expect(col(core, key).getComparator()).not.toBeNull();
      core.dispatch({ type: "sortModelSet", sortItems: [{ key: id, dir: "asc" }] });
      expect(viewIds(core)).toEqual(asc);
      core.dispatch({ type: "sortModelSet", sortItems: [{ key: id, dir: "desc" }] });
      expect(viewIds(core)).toEqual([...asc].reverse());
    }
  });
});

describe("column-group expand/collapse is an implicit sizing pass (finding A5)", () => {
  it("keeps declared and user-resized widths of the revealed leaves and measures only undeclared ones", () => {
    const core = makeCore(
      [{
        colId: "g",
        label: "G",
        children: [
          { colId: "always", key: "always", label: "Always", type: ColumnType.STRING },
          { colId: "fixed", key: "fixed", label: "Fixed", type: ColumnType.STRING, width: 90, columnGroupShow: "open" },
          { colId: "resized", key: "resized", label: "Resized", type: ColumnType.STRING, columnGroupShow: "open" },
          { colId: "auto", key: "auto", label: "Auto", type: ColumnType.STRING, columnGroupShow: "open" },
          { colId: "closedOnly", key: "closedOnly", label: "Closed", type: ColumnType.STRING, columnGroupShow: "closed" },
        ],
      }],
      [{ id: "1", always: "x", fixed: LONG, resized: LONG, auto: "short", closedOnly: "y" }],
      { maxColumnWidth: 2000 },
    );
    const setOpen = (open: boolean) => core.dispatch({ type: "columnGroupStateSet", groups: [{ colId: "g", open }] });

    setOpen(true);
    core.dispatch({ type: "columnResize", colId: col(core, "always").instanceID, widthPx: 222 });
    core.dispatch({ type: "columnResize", colId: col(core, "resized").instanceID, widthPx: 111 });
    setOpen(false);
    // The undeclared leaf's data grows while it is hidden; the reveal must measure it.
    core.setRowData([{ id: "1", always: "x", fixed: LONG, resized: LONG, auto: LONG, closedOnly: "y" }]);
    setOpen(true);

    expect(col(core, "fixed").computedWidth).toBe(90);
    expect(col(core, "resized").computedWidth).toBe(111);
    expect(col(core, "always").computedWidth).toBe(222);
    expect(col(core, "auto").computedWidth).toBe(LONG.length * 7 + 16);
    const group = (core.getColumnModel() as ColumnModel).getByColId("g")!;
    expect(group.computedWidth).toBe(222 + 90 + 111 + LONG.length * 7 + 16);
  });
});
