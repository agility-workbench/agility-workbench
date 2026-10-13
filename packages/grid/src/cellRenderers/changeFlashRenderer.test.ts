// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { ChangeFlashCellRenderer, changeFlashTrackedRowCount } from "./changeFlashRenderer";
import { createGrid } from "../createGrid";
import type { CellRendererParams } from "../renderer/renderer";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

/** A stand-in for one grid's API: the renderer keys its state on it and asks it which rows exist. */
function fakeApi(rowIds?: () => string[]) {
  return {
    getCore: () => ({ getOptions: () => ({}) }),
    getRowNode: (id: string) => (!rowIds || rowIds().includes(id) ? { id } : undefined),
  };
}

function params(api: object, rowId: string, value: unknown): CellRendererParams {
  return {
    value,
    data: { id: rowId, price: value },
    rowId,
    rowIndex: 0,
    colDef: { colId: "price", instanceID: "c1" },
    api,
    eCell: document.createElement("div"),
    registerTooltipTarget: () => () => {},
  } as unknown as CellRendererParams;
}

const flashing = (r: ChangeFlashCellRenderer) =>
  [...r.getGui().classList].some(c => /^pte-cell-flash-(up|down|neutral)$/.test(c));

function mounted(api: object, rowId: string, value: unknown): ChangeFlashCellRenderer {
  const r = new ChangeFlashCellRenderer();
  r.init(params(api, rowId, value));
  return r;
}

describe("ChangeFlashCellRenderer", () => {
  it("does not flash on first render, flashes when the value changes", () => {
    const api = fakeApi();
    const r = mounted(api, "r1", 10);
    expect(flashing(r)).toBe(false);
    r.refresh(params(api, "r1", 10));
    expect(flashing(r)).toBe(false);
    r.refresh(params(api, "r1", 12));
    expect(r.getGui().classList.contains("pte-cell-flash-up")).toBe(true);
    r.destroy();
  });

  it("keeps two grids with the same row ids apart", () => {
    const apiA = fakeApi();
    const apiB = fakeApi();
    const a = mounted(apiA, "r1", 10);
    const b = mounted(apiB, "r1", 99);

    // Grid A refreshes with its own unchanged value: grid B's 99 must not make it flash.
    a.refresh(params(apiA, "r1", 10));
    expect(flashing(a)).toBe(false);

    // A slot of grid B recycled onto r1 compares against B's value, not A's.
    const b2 = mounted(apiB, "other", 1);
    b2.refresh(params(apiB, "r1", 99));
    expect(flashing(b2)).toBe(false);

    a.destroy();
    b.destroy();
    b2.destroy();
  });

  it("still flashes a row that moved to another pooled slot with a new value", () => {
    const api = fakeApi();
    const slot0 = mounted(api, "r1", 10);
    const slot1 = mounted(api, "r2", 20);
    // A sort after an update swaps the rows between slots.
    slot0.refresh(params(api, "r2", 20));
    slot1.refresh(params(api, "r1", 30));
    expect(flashing(slot0)).toBe(false);
    expect(slot1.getGui().classList.contains("pte-cell-flash-up")).toBe(true);
    slot0.destroy();
    slot1.destroy();
  });

  it("flashes both instances that show the same cell (sticky mirror and body row)", () => {
    const api = fakeApi();
    const body = mounted(api, "g1", 1);
    const mirror = mounted(api, "g1", 1);
    body.refresh(params(api, "g1", 2));
    mirror.refresh(params(api, "g1", 2));
    expect(flashing(body)).toBe(true);
    expect(flashing(mirror)).toBe(true);
    body.destroy();
    mirror.destroy();
  });

  it("forgets rows that left the model", () => {
    let live = Array.from({ length: 600 }, (_, i) => `r${i}`);
    const api = fakeApi(() => live);
    const r = mounted(api, "r0", 0);
    for (let i = 1; i < 300; i++) r.refresh(params(api, `r${i}`, i));
    expect(changeFlashTrackedRowCount(api)).toBe(300);

    // Every row but the last batch is removed; the next sweep drops them.
    live = Array.from({ length: 300 }, (_, i) => `n${i}`);
    for (let i = 0; i < 300; i++) r.refresh(params(api, `n${i}`, i));
    expect(changeFlashTrackedRowCount(api)).toBeLessThanOrEqual(300);
    r.destroy();
  });

  it("releases a grid's state when its renderers are destroyed with the grid", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const api = createGrid(host, {
      columnDefs: [{ colId: "price", key: "price", label: "Price", cellRenderer: ChangeFlashCellRenderer }],
      rowData: [{ id: "1", price: 1 }, { id: "2", price: 2 }],
      rowIdKey: "id",
    });
    expect(changeFlashTrackedRowCount(api)).toBeGreaterThan(0);

    api.destroy();
    expect(changeFlashTrackedRowCount(api)).toBe(0);
    host.remove();
  });
});
