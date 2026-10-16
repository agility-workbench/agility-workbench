// @vitest-environment happy-dom
/**
 * api.getFocusedCell and the CellRef form of api.setFocusedCell (finding #112), on a real mounted
 * grid so a click goes through the renderer.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { GridEventFocusChangedParams } from "../events/events";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const apis: IGridAPI[] = [];
afterEach(() => {
  while (apis.length) apis.pop()!.destroy();
  document.body.innerHTML = "";
});

function mount(extra: Record<string, unknown> = {}): { api: IGridAPI; host: HTMLElement } {
  const host = document.createElement("div");
  host.style.height = "400px";
  document.body.appendChild(host);
  const api = createGrid(host, {
    rowIdKey: "id",
    columnDefs: [
      { colId: "name", key: "name", label: "Name" },
      { colId: "n", key: "n", label: "N" },
      { colId: "secret", key: "secret", label: "Secret", hidden: true },
    ],
    rowData: [
      { id: "a", name: "A", n: 1 }, { id: "b", name: "B", n: 2 }, { id: "c", name: "C", n: 3 },
    ],
    pinnedTopRowData: [{ id: "top", name: "Top", n: 0 }],
    ...extra,
  } as any);
  apis.push(api);
  return { api, host };
}

const leafIdx = (api: IGridAPI, colId: string) =>
  api.getColumnModel().getLeaves().findIndex(col => col.colId === colId);

describe("api.getFocusedCell", () => {
  it("is null until a cell is made active", () => {
    const { api } = mount();
    expect(api.getFocusedCell()).toBeNull();
  });

  it("reads back the index form of setFocusedCell as a CellRef", () => {
    const { api } = mount();
    api.setFocusedCell(1, leafIdx(api, "n"));
    expect(api.getFocusedCell()).toEqual({
      rowId: "b", colId: "n", colInstanceId: api.getColumn("n")!.instanceID,
    });
  });

  it("follows a click on a body cell", () => {
    const { api, host } = mount();
    const cell = host.querySelector<HTMLElement>(
      `.pte-body .pte-row[data-view-idx="2"] .pte-cell[data-col-idx="${leafIdx(api, "name")}"]`,
    )!;
    expect(cell).not.toBeNull();
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    expect(api.getFocusedCell()).toMatchObject({ rowId: "c", colId: "name" });
  });

  it("is null while a column selection holds the grid", () => {
    const { api } = mount();
    api.setFocusedCell({ rowId: "a", colId: "name" });
    api.selectColumn("n");
    expect(api.getFocusedCell()).toBeNull();
  });

  it("is null again once the selection is cleared", () => {
    const { api } = mount();
    api.setFocusedCell({ rowId: "a", colId: "name" });
    api.clearSelection();
    expect(api.getFocusedCell()).toBeNull();
  });
});

describe("api.setFocusedCell(cell)", () => {
  it("is the pair of getFocusedCell, round-tripping what it returns", () => {
    const { api } = mount();
    api.setFocusedCell({ rowId: "c", colId: "n" });
    const focused = api.getFocusedCell()!;
    expect(focused).toMatchObject({ rowId: "c", colId: "n" });
    api.setFocusedCell({ rowId: "a", colId: "name" });
    api.setFocusedCell(focused);
    expect(api.getFocusedCell()).toEqual(focused);
  });

  it("reaches a pinned top row, which the index form cannot", () => {
    const { api } = mount();
    // A pinnedTopRowData row carries the band-scoped id the grid gives it.
    const topId = api.getRenderedNodes()[0].id;
    api.setFocusedCell({ rowId: topId, colId: "n", rowPinned: "top" });
    expect(api.getFocusedCell()).toMatchObject({ rowId: topId, colId: "n", rowPinned: "top" });
    // A model row pinned into the band keeps its own id.
    api.setRowPinned("b", "top");
    api.setFocusedCell({ rowId: "b", colId: "name", rowPinned: "top" });
    expect(api.getFocusedCell()).toMatchObject({ rowId: "b", colId: "name", rowPinned: "top" });
  });

  it("emits focusChanged with reason api", () => {
    const { api } = mount();
    const events: GridEventFocusChangedParams[] = [];
    api.on("focusChanged", e => events.push(e));
    api.setFocusedCell({ rowId: "b", colId: "name" });
    expect(events).toEqual([expect.objectContaining({
      reason: "api", next: expect.objectContaining({ rowId: "b", colId: "name" }),
    })]);
  });

  it("does nothing for an unknown row or column, a hidden column, or the wrong band", () => {
    const { api } = mount();
    api.setFocusedCell({ rowId: "a", colId: "name" });
    const before = api.getFocusedCell();
    api.setFocusedCell({ rowId: "zzz", colId: "name" });
    api.setFocusedCell({ rowId: "b", colId: "nope" });
    api.setFocusedCell({ rowId: "b", colId: "secret" });
    api.setFocusedCell({ rowId: api.getRenderedNodes()[0].id, colId: "n", rowPinned: "bottom" });
    api.setFocusedCell({ rowId: "b", colId: "n", rowPinned: "top" });
    expect(api.getFocusedCell()).toEqual(before);
  });

  it("does nothing for a row filtered out of the view", () => {
    const { api } = mount();
    api.setFocusedCell({ rowId: "a", colId: "name" });
    api.setQuickFilter("C");
    api.setFocusedCell({ rowId: "b", colId: "name" });
    expect(api.getFocusedCell()?.rowId).not.toBe("b");
  });
});
