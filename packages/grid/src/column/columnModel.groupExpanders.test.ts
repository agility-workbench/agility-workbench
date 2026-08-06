import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColDef } from "../interfaces/column";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeModel(colDefs: ColDef[]): ColumnModel {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  const model = core.getColumnModel() as ColumnModel;
  model.setColumnDefs(colDefs);
  return model;
}

type Mix = null | "open" | "closed";

function groupOf(mix: Mix[], colId = "grp", openByDefault?: boolean): ColDef {
  return {
    colId,
    label: colId,
    openByDefault,
    children: mix.map((m, i) => ({
      colId: `${colId}c${i}`,
      key: `${colId}c${i}`,
      label: `${colId}c${i}`,
      ...(m ? { columnGroupShow: m } : {}),
    })),
  };
}

// The rules under test:
//  1. A group shows its expander iff its non-hidden children carry at least two distinct
//     effective `columnGroupShow` values ("always" [= unset] / "open" / "closed").
//  2. A group whose non-hidden children all share one non-"always" value is not
//     expansion-controlled at all: `columnGroupShow` is ignored and every child stays visible
//     (otherwise an all-"open" group that starts closed would vanish with no way back).
describe("group expander visibility rules", () => {
  it.each<{ title: string; mix: Mix[]; openByDefault?: boolean; expander: boolean; visibleIdx: number[] }>([
    { title: "all unset → no expander, all visible", mix: [null, null], expander: false, visibleIdx: [0, 1] },
    { title: "unset + open → expander, open child hidden while closed", mix: [null, "open"], expander: true, visibleIdx: [0] },
    { title: "unset + closed → expander, both visible while closed", mix: [null, "closed"], expander: true, visibleIdx: [0, 1] },
    { title: "open + closed → expander, closed child visible while closed", mix: ["open", "closed"], expander: true, visibleIdx: [1] },
    { title: "all open (uniform) → no expander, columnGroupShow ignored", mix: ["open", "open"], expander: false, visibleIdx: [0, 1] },
    { title: "all closed (uniform) → no expander, columnGroupShow ignored", mix: ["closed", "closed"], expander: false, visibleIdx: [0, 1] },
    { title: "unset + open + closed → expander", mix: [null, "open", "closed"], expander: true, visibleIdx: [0, 2] },
    { title: "unset + open, openByDefault → expander, both visible while open", mix: [null, "open"], openByDefault: true, expander: true, visibleIdx: [0, 1] },
    { title: "all closed, openByDefault (uniform) → no expander, still visible", mix: ["closed", "closed"], openByDefault: true, expander: false, visibleIdx: [0, 1] },
  ])("$title", ({ mix, openByDefault, expander, visibleIdx }) => {
    const model = makeModel([groupOf(mix, "grp", openByDefault)]);
    const grp = model.getByColId("grp")!;
    expect(grp.showExpander).toBe(expander);
    const expectedLeaves = visibleIdx.map((i) => `grpc${i}`);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(expectedLeaves);
    expect(grp.children.filter((c) => c.columnGroupVisible).map((c) => c.colId))
      .toEqual(expectedLeaves);
  });

  it("applies the uniform-toggle rule to nested subgroups", () => {
    const model = makeModel([
      {
        colId: "outer",
        label: "outer",
        children: [
          { colId: "plain", key: "plain", label: "plain" },
          groupOf(["open", "open"], "inner"),
        ],
      },
    ]);
    const inner = model.getByColId("inner")!;
    expect(inner.showExpander).toBe(false);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["plain", "innerc0", "innerc1"]);
  });

  it("recomputes (never mutates) when hiding makes the remaining children uniform", () => {
    const model = makeModel([
      {
        colId: "grp",
        label: "grp",
        children: [
          { colId: "a", key: "a", label: "a" },
          { colId: "b", key: "b", label: "b", columnGroupShow: "open" },
        ],
      },
    ]);
    expect(model.getByColId("grp")!.showExpander).toBe(true);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["a"]);

    // Hiding the "always" child leaves a uniform-"open" remainder: the expander goes away and
    // the "open" child becomes plainly visible instead of unreachable.
    model.applyColumnState([{ colId: "a", hidden: true }]);
    expect(model.getByColId("grp")!.showExpander).toBe(false);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["b"]);
    // The stored value must survive so the behavior is reversible.
    expect(model.getByColId("b")!.columnGroupShow).toBe("open");

    // Un-hiding restores the original mixed behavior.
    model.applyColumnState([{ colId: "a", hidden: false }]);
    expect(model.getByColId("grp")!.showExpander).toBe(true);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["a"]);
  });

  it("toggling a mixed group swaps which children are visible", () => {
    const model = makeModel([groupOf([null, "open", "closed"], "grp")]);
    const grp = model.getByColId("grp")!;
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["grpc0", "grpc2"]);

    model.toggleGroupExpansion(grp.instanceID);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["grpc0", "grpc1"]);
    expect(grp.showExpander).toBe(true);

    model.toggleGroupExpansion(grp.instanceID);
    expect(model.getCenterLeaves().map((l) => l.colId)).toEqual(["grpc0", "grpc2"]);
  });
});
