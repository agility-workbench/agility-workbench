/**
 * ColDef.lockPosition: enforced in the column model, so the drag primitive (`columnMove`), pinning,
 * applyColumnState, saved views and setColumnDefs all keep a locked column at its edge.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { GridAPI } from "../api/api";
import { ColumnModel } from "./columnModel";
import type { ColDef } from "../interfaces/column";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeCore(defs: ColDef[], extra: Record<string, unknown> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...extra } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps(defs);
  return core;
}

const col = (id: string, extra: Partial<ColDef> = {}): ColDef => ({ colId: id, key: id, label: id, ...extra });

const order = (core: GridCore) =>
  (core.getColumnModel() as ColumnModel).getColumnState().map(s => s.colId);
const centerOrder = (core: GridCore) =>
  core.getColumnModel().getCenterLeaves().filter(c => !c.isInternal()).map(c => c.colId);
const id = (core: GridCore, colId: string) => core.getColumnModel().getByColId(colId)!.instanceID;

const lockedDefs = () => [
  col("a"),
  col("first", { lockPosition: true }),
  col("b"),
  col("last", { lockPosition: "right" }),
  col("c"),
];

describe("lockPosition ordering", () => {
  it("puts locked columns at their edge whatever the definition order", () => {
    const core = makeCore(lockedDefs());
    expect(order(core)).toEqual(["first", "a", "b", "c", "last"]);
  });

  it('treats true as "left" and keeps several locked columns in definition order', () => {
    const core = makeCore([
      col("x"),
      col("l1", { lockPosition: "left" }),
      col("r1", { lockPosition: "right" }),
      col("l2", { lockPosition: true }),
      col("r2", { lockPosition: "right" }),
    ]);
    expect(order(core)).toEqual(["l1", "l2", "x", "r1", "r2"]);
    expect(core.getColumnModel().getByColId("l2")!.lockPosition).toBe("left");
  });

  it("leaves the selection-checkbox column ahead of a left-locked column", () => {
    const core = makeCore(lockedDefs(), { rowSelection: { mode: "multiple", checkboxes: true } });
    const checkbox = core.getColumnModel().getLeaves().find(c => c.isSelectionCheckboxColumn())!;
    // Same section as the checkbox column, wherever that is pinned by default.
    core.dispatch({ type: "columnPin", colIds: [id(core, "first")], pinned: checkbox.pinned ?? null });
    const section = checkbox.pinned === "left" ? core.getColumnModel().getLeftLeaves()
      : checkbox.pinned === "right" ? core.getColumnModel().getRightLeaves()
        : core.getColumnModel().getCenterLeaves();
    expect(section[0].isSelectionCheckboxColumn()).toBe(true);
    expect(section[1].colId).toBe("first");
  });

  it("re-applies after setColumnDefs", () => {
    const core = makeCore(lockedDefs());
    core.setColumnDefsFromProps([col("last", { lockPosition: "right" }), col("z"), col("first", { lockPosition: "left" })]);
    expect(order(core)).toEqual(["first", "z", "last"]);
  });

  it("locks a child within its group, and a locked group at the section edge", () => {
    const core = makeCore([
      col("a"),
      { colId: "G", label: "G", lockPosition: "left", children: [col("g1"), col("g2", { lockPosition: "left" })] },
    ]);
    expect(order(core)).toEqual(["g2", "g1", "a"]);
  });
});

describe("lockPosition through the drag primitive (columnMove)", () => {
  it("a locked column refuses to move", () => {
    const core = makeCore(lockedDefs());
    core.dispatch({ type: "columnMove", source: "user", colId: id(core, "first"), toIndex: 3, toSection: "center" });
    core.dispatch({ type: "columnMove", source: "user", colId: id(core, "last"), toIndex: 0, toSection: "center" });
    expect(order(core)).toEqual(["first", "a", "b", "c", "last"]);
  });

  it("a column dropped before a left-locked column lands after it; after a right-locked one, before it", () => {
    const core = makeCore(lockedDefs());
    core.dispatch({ type: "columnMove", source: "user", colId: id(core, "c"), toIndex: 0, toSection: "center" });
    expect(centerOrder(core)).toEqual(["first", "c", "a", "b", "last"]);
    core.dispatch({ type: "columnMove", source: "user", colId: id(core, "a"), toIndex: 99, toSection: "center" });
    expect(centerOrder(core)).toEqual(["first", "c", "b", "a", "last"]);
  });
});

describe("lockPosition with pinning", () => {
  it("pins a locked column and keeps it at the edge of its new section", () => {
    const core = makeCore([col("p"), ...lockedDefs()]);
    core.dispatch({ type: "columnPin", colIds: [id(core, "p")], pinned: "left" });
    core.dispatch({ type: "columnPin", colIds: [id(core, "first")], pinned: "left" });
    const left = core.getColumnModel().getLeftLeaves().map(c => c.colId);
    expect(left).toEqual(["first", "p"]);
    core.dispatch({ type: "columnPin", colIds: [id(core, "last")], pinned: "right" });
    core.dispatch({ type: "columnPin", colIds: [id(core, "a")], pinned: "right" });
    expect(core.getColumnModel().getRightLeaves().map(c => c.colId)).toEqual(["a", "last"]);
  });
});

describe("lockPosition through applyColumnState and saved views", () => {
  it("applyColumnState cannot move a locked column off its edge", () => {
    const core = makeCore(lockedDefs());
    core.dispatch({
      type: "columnStateSet",
      state: [
        { colId: "last", order: 0 },
        { colId: "c", order: 1 },
        { colId: "first", order: 4 },
      ],
    });
    expect(order(core)).toEqual(["first", "c", "a", "b", "last"]);
  });

  it("a saved view taken before the column was locked restores with the lock in force", () => {
    const before = makeCore([col("a"), col("first"), col("b"), col("last"), col("c")]);
    const api = new GridAPI(before);
    api.moveColumns(["last"], 0);
    api.moveColumns(["first"], 4);
    const view = api.captureViewState();

    const locked = makeCore(lockedDefs());
    new GridAPI(locked).applyViewState(view);
    const restored = order(locked);
    expect(restored[0]).toBe("first");
    expect(restored[restored.length - 1]).toBe("last");
  });
});
