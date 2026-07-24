/**
 * Tests for the body context menu's Cut / Paste items:
 *  - Copy / Copy with Headers are always present.
 *  - Cut / Paste appear only when the current selection contains at least one editable cell
 *    (reported by the clipboard target's hasEditableCells()).
 *  - Executing them routes to the clipboard target's cutSelection / pasteSelection.
 */
import { describe, it, expect } from "vitest";
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
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
  ]);
  return core;
}

function makeService(core: GridCore, hasEditableCells: boolean) {
  const calls: string[] = [];
  const clipboard: BodyMenuClipboardTarget = {
    copySelection: () => calls.push("copy"),
    cutSelection: () => calls.push("cut"),
    pasteSelection: () => calls.push("paste"),
    hasEditableCells: () => hasEditableCells,
  };
  const svc = new BodyMenuService({
    core: core as any,
    exporter: { exportCSV: () => {}, exportExcel: () => {} },
    clipboard,
  });
  return { svc, calls };
}

function ids(items: MenuItem[]): string[] {
  return items.filter(i => !i.isSeparator).map(i => i.id!).filter(Boolean);
}

const ctx: BodyMenuContext = {
  trigger: "bodyContextMenu",
  rowId: "1",
  colId: "name",
  viewIdx: 0,
  selection: { rowIds: [], colIds: [], range: null },
};

describe("body menu Cut / Paste", () => {
  it("omits Cut and Paste when the selection has no editable cells", () => {
    const { svc } = makeService(makeGrid(), false);
    const items = ids(svc.buildDefaultBodyMenu(ctx));
    expect(items).toContain("copy");
    expect(items).not.toContain("cut");
    expect(items).not.toContain("paste");
  });

  it("includes Cut and Paste when the selection has an editable cell", () => {
    const { svc } = makeService(makeGrid(), true);
    const items = svc.buildDefaultBodyMenu(ctx);
    const cut = items.find(i => i.id === "cut")!;
    const paste = items.find(i => i.id === "paste")!;
    expect(cut).toBeTruthy();
    expect(cut.command).toBe("body.cut");
    expect(cut.left).toBe("icon-cut");
    expect(paste.command).toBe("body.paste");
    expect(paste.left).toBe("icon-paste");
  });

  it("orders clipboard items as Cut, Copy, Copy with Headers, Paste", () => {
    const { svc } = makeService(makeGrid(), true);
    const clipboardIds = ids(svc.buildDefaultBodyMenu(ctx))
      .filter(id => ["cut", "copy", "copyWithHeaders", "paste"].includes(id));
    expect(clipboardIds).toEqual(["cut", "copy", "copyWithHeaders", "paste"]);
  });

  it("routes Cut / Paste execution to the clipboard target", () => {
    const { svc, calls } = makeService(makeGrid(), true);
    const items = svc.buildDefaultBodyMenu(ctx);
    svc.execute(items.find(i => i.id === "cut")!, ctx);
    svc.execute(items.find(i => i.id === "paste")!, ctx);
    expect(calls).toEqual(["cut", "paste"]);
  });
});
