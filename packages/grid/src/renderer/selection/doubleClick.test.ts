// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridEventCellDoubleClickedParams, GridEventRowDoubleClickedParams } from "../../events/events";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * Body double-click → rowDoubleClicked / cellDoubleClicked, except when the grid consumed the
 * gesture (the editor opened on that cell, or the fill handle filled to the adjacent block).
 *
 * Leaf indices (no row numbers): name=0 (editable), qty=1 (editable), locked=2.
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
  { colId: "name", key: "name", label: "Name", editable: true },
  { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  { colId: "locked", key: "locked", label: "Locked" },
];

function mountGrid(options: Partial<GridOptions> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(columnDefs);
  api.setRowData(Array.from({ length: 4 }, (_, i) => ({
    id: `r${i}`,
    name: String.fromCharCode(65 + i),
    qty: (i + 1) * 10,
    locked: `L${i}`,
  })));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const onRow = vi.fn<(p: GridEventRowDoubleClickedParams) => void>();
  const onCell = vi.fn<(p: GridEventCellDoubleClickedParams) => void>();
  core.on("rowDoubleClicked", onRow);
  core.on("cellDoubleClicked", onCell);
  return { core, api, root, container, onRow, onCell };
}

function cell(root: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  const rowEls = root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
  for (let i = 0; i < rowEls.length; i++) {
    const found = rowEls[i].querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
    if (found) return found;
  }
  throw new Error(`no cell at ${viewIdx}/${colIdx}`);
}

function dblclick(el: HTMLElement): MouseEvent {
  const event = new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(event);
  return event;
}

describe("double-click events", () => {
  it("a non-editable cell fires rowDoubleClicked then cellDoubleClicked with the cell's identity", () => {
    const { core, root, onRow, onCell } = mountGrid();
    const order: string[] = [];
    core.on("rowDoubleClicked", () => order.push("row"));
    core.on("cellDoubleClicked", () => order.push("cell"));
    const event = dblclick(cell(root, 1, 2));

    expect(core.getEditingCell()).toBeNull();
    expect(order).toEqual(["row", "cell"]);
    const node = core.getRowModel().getRowNode("r1");
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onRow.mock.calls[0][0]).toMatchObject({ rowId: "r1", viewIdx: 1, isGroup: false, event });
    expect(onRow.mock.calls[0][0].node).toBe(node);
    expect(onCell).toHaveBeenCalledTimes(1);
    expect(onCell.mock.calls[0][0]).toMatchObject({
      rowId: "r1", colId: "locked", colIdx: 2, viewIdx: 1, value: "L1", isGroup: false, event,
      colInstanceId: core.getColumnModel().getByColId("locked")!.instanceID,
    });
    expect(onCell.mock.calls[0][0].node).toBe(node);
    expect(onCell.mock.calls[0][0].data).toBe(node!.data);
  });

  it("an editable cell with the default trigger opens the editor and fires neither event", () => {
    const { core, root, onRow, onCell } = mountGrid();
    const event = dblclick(cell(root, 0, 0));
    expect(core.getEditingCell()).toMatchObject({ rowId: "r0", colId: "name" });
    expect(event.defaultPrevented).toBe(true);
    expect(onRow).not.toHaveBeenCalled();
    expect(onCell).not.toHaveBeenCalled();
  });

  it("editTrigger 'none' leaves an editable cell closed and fires both events", () => {
    const { core, root, onRow, onCell } = mountGrid({ editTrigger: "none" });
    dblclick(cell(root, 0, 0));
    expect(core.getEditingCell()).toBeNull();
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onCell).toHaveBeenCalledTimes(1);
    expect(onCell.mock.calls[0][0]).toMatchObject({ rowId: "r0", colId: "name", value: "A" });
  });

  it("a read-only grid (cellSelection 'text') still fires both events", () => {
    const { core, root, onRow, onCell } = mountGrid({ cellSelection: "text" });
    dblclick(cell(root, 2, 1));
    expect(core.getEditingCell()).toBeNull();
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onRow.mock.calls[0][0]).toMatchObject({ rowId: "r2", viewIdx: 2 });
    expect(onCell).toHaveBeenCalledTimes(1);
    expect(onCell.mock.calls[0][0]).toMatchObject({ rowId: "r2", colId: "qty", value: 30 });
  });

  it("a double-click on the fill handle fills and fires neither event", () => {
    const { core, root, onRow, onCell } = mountGrid();
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    const grip = root.querySelector<HTMLElement>(".pte-fill-handle");
    expect(grip).toBeTruthy();
    dblclick(grip!);
    expect(core.getEditingCell()).toBeNull();
    expect(core.getRowModel().getRowNode("r3")!.data).toMatchObject({ qty: 10 });
    expect(onRow).not.toHaveBeenCalled();
    expect(onCell).not.toHaveBeenCalled();
  });

  it("the row-number cell fires the row event only", () => {
    const { root, onRow, onCell } = mountGrid({ rowNumbers: true });
    const rowNumberCell = root.querySelector<HTMLElement>(`.pte-row[data-view-idx="1"] .pte-row-number-cell`);
    expect(rowNumberCell).toBeTruthy();
    dblclick(rowNumberCell!);
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onRow.mock.calls[0][0]).toMatchObject({ rowId: "r1", viewIdx: 1 });
    expect(onCell).not.toHaveBeenCalled();
  });

  it("a group row's cell fires both events with isGroup, the node, and the group cell value", async () => {
    const { core, root, onRow, onCell } = mountGrid();
    core.setAggregateModel([{ key: core.getColumnModel().getByColId("qty")!.instanceID, type: AggregateType.SUM }]);
    core.dispatch({ type: "rowGroupSet", colIds: ["locked"] } as any);
    await raf();
    const groupId = core.getRowIdAtViewIndex(0)!;
    const node = core.getRowModel().getRowNode(groupId)!;
    expect(node.isGroup).toBe(true);
    const qty = core.getColumnModel().getByColId("qty")!;
    const qtyIdx = core.getColumnModel().leafColumnLookup.get(qty.instanceID)!.globalIndex;

    // Group rows host no editor, so the default trigger does not consume the gesture.
    dblclick(cell(root, 0, qtyIdx));
    expect(core.getEditingCell()).toBeNull();
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onRow.mock.calls[0][0]).toMatchObject({ rowId: groupId, isGroup: true });
    expect(onRow.mock.calls[0][0].node).toBe(node);
    expect(onCell).toHaveBeenCalledTimes(1);
    expect(onCell.mock.calls[0][0]).toMatchObject({
      rowId: groupId, colId: "qty", isGroup: true, value: core.getGroupCellValue(qty, node).value,
    });
    expect(onCell.mock.calls[0][0].node).toBe(node);
  });

  it("ignores non-primary buttons", () => {
    const { root, onRow, onCell } = mountGrid({ editTrigger: "none" });
    cell(root, 0, 2).dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 1 }));
    expect(onRow).not.toHaveBeenCalled();
    expect(onCell).not.toHaveBeenCalled();
  });
});
