// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import type { BodyContextMenuGetter, GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

/**
 * Right-click on group rows opens the grid's body menu in every display mode — including the
 * full-width host of a groupRows group row, in the body and as a docked sticky mirror — and the
 * menu context tells a getter what it is looking at: the node, whether it is a group, whether it
 * is full-width (then `colId` is the nominal column), and the display mode.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const columnDefs: ColDef[] = [
  { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, editable: true },
  { colId: "region", key: "region", label: "Region" },
  { colId: "name", key: "name", label: "Name", editable: true },
];

async function mountGrouped(options: Partial<GridOptions> = {}, rowCount = 6) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const getter = vi.fn<BodyContextMenuGetter>(({ items }) => items);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    groupDefaultExpanded: -1,
    bodyContextMenu: getter,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(columnDefs);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    region: i < rowCount / 2 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  })));
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  return { container, core, api, getter };
}

function contextMenu(el: HTMLElement): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

/** The visible full-width host of the body row at a view index. */
function bodyHost(container: HTMLElement, viewIdx: number): HTMLElement {
  const host = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-full-width-cell`,
  );
  if (!host || host.style.display === "none") throw new Error(`no full-width host at ${viewIdx}`);
  return host;
}

/** The body cell of a column at a view index (whichever section row holds it). */
function bodyCell(container: HTMLElement, viewIdx: number, colId: string, core: GridCore): HTMLElement {
  const instanceID = core.getColumnModel().getByColId(colId)!.instanceID;
  const cell = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-cell[data-col-id="${instanceID}"]`,
  );
  if (!cell) throw new Error(`no ${colId} cell at ${viewIdx}`);
  return cell;
}

const nominalId = (core: GridCore) => core.getColumnModel().getFullWidthNominalLeaf()!.instanceID;
const lastCtx = (getter: ReturnType<typeof vi.fn<BodyContextMenuGetter>>) =>
  getter.mock.calls[getter.mock.calls.length - 1][0].ctx;

describe("body context menu on group rows", () => {
  it("opens on a groupRows group row's full-width host, with the nominal column as colId", async () => {
    const { container, core, getter } = await mountGrouped({ groupDisplayType: "groupRows", rowNumbers: true });
    const amer = core.getRowModel().getRowNodeAtViewIndex(0)!;
    expect(amer.isGroup).toBe(true);

    const event = contextMenu(bodyHost(container, 0));

    expect(event.defaultPrevented).toBe(true);
    expect(getter).toHaveBeenCalledTimes(1);
    const ctx = lastCtx(getter);
    expect(ctx.node.id).toBe(amer.id);
    expect(ctx.rowId).toBe(amer.id);
    expect(ctx.isGroup).toBe(true);
    expect(ctx.isFullWidth).toBe(true);
    expect(ctx.groupDisplayType).toBe("groupRows");
    expect(ctx.colId).toBe(nominalId(core));
    // Past the row-number column: the nominal column is the first non-leading leaf.
    expect(core.getColumnModel().getById(ctx.colId)!.colId).toBe("total");
    expect(document.querySelector(".pte-menu")).not.toBeNull();
  });

  it("opens on the same row docked as a sticky mirror", async () => {
    const { container, core, getter } = await mountGrouped({ groupDisplayType: "groupRows", groupRowsSticky: true });
    const host = container.querySelector<HTMLElement>(".pte-sticky-rows .pte-sticky-row .pte-full-width-cell");
    expect(host).not.toBeNull();
    const mirrorRow = host!.closest<HTMLElement>(".pte-sticky-row")!;
    const amer = core.getRowModel().getRowNode(mirrorRow.dataset.rowId!)!;
    expect(amer.isGroup).toBe(true);

    const event = contextMenu(host!);

    expect(event.defaultPrevented).toBe(true);
    expect(getter).toHaveBeenCalledTimes(1);
    const ctx = lastCtx(getter);
    expect(ctx.node.id).toBe(amer.id);
    expect(ctx.isGroup).toBe(true);
    expect(ctx.isFullWidth).toBe(true);
    expect(ctx.groupDisplayType).toBe("groupRows");
    expect(ctx.colId).toBe(nominalId(core));
    expect(ctx.viewIdx).toBe(core.getViewIndexForRowId(amer.id));
  });

  it("opens on a singleColumn group cell, keeping the clicked column", async () => {
    const { container, core, getter } = await mountGrouped({ groupDisplayType: "singleColumn" });
    const amer = core.getRowModel().getRowNodeAtViewIndex(0)!;

    const event = contextMenu(bodyCell(container, 0, "total", core));

    expect(event.defaultPrevented).toBe(true);
    expect(getter).toHaveBeenCalledTimes(1);
    const ctx = lastCtx(getter);
    expect(ctx.node.id).toBe(amer.id);
    expect(ctx.isGroup).toBe(true);
    expect(ctx.isFullWidth).toBe(false);
    expect(ctx.groupDisplayType).toBe("singleColumn");
    expect(ctx.colId).toBe(core.getColumnModel().getByColId("total")!.instanceID);
  });

  it("opens on a leaf cell with isGroup false", async () => {
    const { container, core, getter } = await mountGrouped({ groupDisplayType: "groupRows" });
    const leaf = core.getRowModel().getRowNodeAtViewIndex(1)!;
    expect(leaf.isGroup).toBeFalsy();

    const event = contextMenu(bodyCell(container, 1, "name", core));

    expect(event.defaultPrevented).toBe(true);
    expect(getter).toHaveBeenCalledTimes(1);
    const ctx = lastCtx(getter);
    expect(ctx.node.id).toBe(leaf.id);
    expect(ctx.isGroup).toBe(false);
    expect(ctx.isFullWidth).toBe(false);
    expect(ctx.groupDisplayType).toBe("groupRows");
    expect(ctx.colId).toBe(core.getColumnModel().getByColId("name")!.instanceID);
    // A leaf over an editable column still gets the edit items.
    expect(getter.mock.calls[0][0].items.map(i => i.id)).toEqual(expect.arrayContaining(["cut", "paste"]));
  });

  it("offers Copy but no edit items on a non-selectable group row, and moves the selection there", async () => {
    const { container, core, getter } = await mountGrouped({ groupDisplayType: "groupRows" });
    expect(core.getOptions().groupRowsSelectable).toBeFalsy();
    // A leaf selection elsewhere must not be what the menu acts on.
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 2 } as any);

    expect(() => contextMenu(bodyHost(container, 0))).not.toThrow();

    expect(getter).toHaveBeenCalledTimes(1);
    const ids = getter.mock.calls[0][0].items.map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(["copy", "copyWithHeaders"]));
    expect(ids).not.toContain("cut");
    expect(ids).not.toContain("paste");
    const range = core.getSelectionRange()!;
    expect([range.rowStart, range.rowEnd]).toEqual([0, 0]);
    expect(lastCtx(getter).selection.range).toMatchObject({ rowStart: 0, rowEnd: 0 });
  });

  it("lets the native menu through on a group row when bodyContextMenu is false", async () => {
    const { container } = await mountGrouped({ groupDisplayType: "groupRows", bodyContextMenu: false });
    const event = contextMenu(bodyHost(container, 0));
    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector(".pte-menu")).toBeNull();
  });

  it("never opens a sticky mirror's menu on a different row of a later page", async () => {
    // Page 2 starts inside AMER, so its docked ancestor is a row the page does not display; the
    // mirror's data-view-idx (the ancestor's own viewIndex, 0) names a different row in this page.
    const { container, core, getter } = await mountGrouped(
      { groupDisplayType: "groupRows", groupRowsSticky: true, pagination: true, pageSize: 10, pageSizes: [10] },
      40,
    );
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 10 } as any);
    await raf();
    await raf();
    const host = container.querySelector<HTMLElement>(".pte-sticky-rows .pte-sticky-row .pte-full-width-cell");
    expect(host).not.toBeNull();
    const mirrorId = host!.closest<HTMLElement>(".pte-sticky-row")!.dataset.rowId!;
    expect(core.getRowIdAtViewIndex(0)).not.toBe(mirrorId);

    contextMenu(host!);

    for (const [{ ctx }] of getter.mock.calls) expect(ctx.node.id).toBe(mirrorId);
  });
});
