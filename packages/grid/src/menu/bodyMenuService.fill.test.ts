/**
 * The body menu's Fill down / Fill right items: present only when the selection is editable AND the
 * fill target reports the command would write something; executing them routes to the target.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { BodyMenuService, BodyMenuClipboardTarget } from "./bodyMenuService";
import { BodyMenuContext } from "./bodyContext";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([{ id: "1", name: "a", qty: 1 }]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ]);
  return core;
}

function makeService(
  core: GridCore,
  fill: { down: boolean; right: boolean; alternatives?: Array<"copy" | "series"> } | null,
  hasEditableCells = true,
) {
  const calls: string[] = [];
  const clipboard: BodyMenuClipboardTarget = {
    copySelection: () => calls.push("copy"),
    cutSelection: () => calls.push("cut"),
    pasteSelection: () => calls.push("paste"),
    hasEditableCells: () => hasEditableCells,
    ...(fill ? {
      canFillDown: () => fill.down,
      canFillRight: () => fill.right,
      fillDown: () => calls.push("fillDown"),
      fillRight: () => calls.push("fillRight"),
      fillAlternatives: () => fill.alternatives ?? [],
      refill: (mode: "copy" | "series") => calls.push(`refill:${mode}`),
    } : {}),
  };
  const svc = new BodyMenuService({
    core: core as any,
    exporter: { exportCSV: () => {}, exportExcel: () => {} },
    clipboard,
    pinning: { setRowPinned: () => {} },
  });
  return { svc, calls };
}

const ids = (items: MenuItem[]) => items.filter(i => !i.isSeparator).map(i => i.id!).filter(Boolean);

const ctx: BodyMenuContext = {
  trigger: "bodyContextMenu",
  rowId: "1",
  colId: "name",
  viewIdx: 0,
  selection: { rowIds: [], colIds: [], range: null },
};

describe("body menu Fill down / Fill right", () => {
  it("lists each item only when its command would write", () => {
    const { svc } = makeService(makeGrid(), { down: true, right: false });
    const items = svc.buildDefaultBodyMenu(ctx);
    expect(ids(items)).toContain("fillDown");
    expect(ids(items)).not.toContain("fillRight");
    const fillDown = items.find(i => i.id === "fillDown")!;
    expect(fillDown).toMatchObject({ label: "Fill down", command: "body.fillDown" });
  });

  it("omits both without an editable selection, and when the host has no fill handle", () => {
    expect(ids(makeService(makeGrid(), { down: true, right: true }, false).svc.buildDefaultBodyMenu(ctx)))
      .not.toContain("fillDown");
    const noFill = ids(makeService(makeGrid(), null).svc.buildDefaultBodyMenu(ctx));
    expect(noFill).not.toContain("fillDown");
    expect(noFill).not.toContain("fillRight");
  });

  it("sits with the clipboard edits, after Paste", () => {
    const { svc } = makeService(makeGrid(), { down: true, right: true });
    const order = ids(svc.buildDefaultBodyMenu(ctx));
    expect(order.indexOf("fillDown")).toBe(order.indexOf("paste") + 1);
    expect(order.indexOf("fillRight")).toBe(order.indexOf("fillDown") + 1);
  });

  it("executes through the target", () => {
    const { svc, calls } = makeService(makeGrid(), { down: true, right: true });
    const items = svc.buildDefaultBodyMenu(ctx);
    svc.execute(items.find(i => i.id === "fillDown")!, ctx);
    svc.execute(items.find(i => i.id === "fillRight")!, ctx);
    expect(calls).toEqual(["fillDown", "fillRight"]);
  });

  it("offers the last fill's alternatives after the fill items, and redoes through the target", () => {
    const { svc, calls } = makeService(makeGrid(), { down: true, right: true, alternatives: ["copy", "series"] });
    const items = svc.buildDefaultBodyMenu(ctx);
    const order = ids(items);
    expect(order.indexOf("fillAsCopy")).toBe(order.indexOf("fillRight") + 1);
    expect(order.indexOf("fillAsSeries")).toBe(order.indexOf("fillAsCopy") + 1);
    expect(items.find(i => i.id === "fillAsCopy")).toMatchObject({ label: "Copy cells instead", command: "body.fillAsCopy" });
    expect(items.find(i => i.id === "fillAsSeries")).toMatchObject({ label: "Fill series instead", command: "body.fillAsSeries" });
    svc.execute(items.find(i => i.id === "fillAsCopy")!, ctx);
    svc.execute(items.find(i => i.id === "fillAsSeries")!, ctx);
    expect(calls).toEqual(["refill:copy", "refill:series"]);

    expect(ids(makeService(makeGrid(), { down: false, right: false }).svc.buildDefaultBodyMenu(ctx)))
      .not.toContain("fillAsCopy");
    expect(ids(makeService(makeGrid(), { down: true, right: true, alternatives: ["copy"] }, false).svc.buildDefaultBodyMenu(ctx)))
      .not.toContain("fillAsCopy");
  });
});
