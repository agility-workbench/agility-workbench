// @vitest-environment happy-dom
/**
 * paginationAutoPageSize through a mounted grid: the resize path reports the body's height and the
 * page follows it. happy-dom has no layout, so `clientHeight` comes from a per-class table and the
 * ResizeObserver is a fake fired by hand (the pattern of layout/resizePath.test.ts).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { ColumnType } from "../../interfaces/column";
import type { GridEventPaginationChangedParams } from "../../events/events";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let heights: Record<string, number>;
let observers: Array<{ fire: () => void; targets: Element[] }>;
const OriginalObserver = globalThis.ResizeObserver;
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  heights = {};
  observers = [];
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      for (const cls of Object.keys(heights)) if (this.classList.contains(cls)) return heights[cls];
      return 0;
    },
  });
  globalThis.ResizeObserver = class {
    private entry: { fire: () => void; targets: Element[] };
    constructor(cb: () => void) {
      this.entry = { fire: () => cb(), targets: [] };
      observers.push(this.entry);
    }
    observe(el: Element) { this.entry.targets.push(el); }
    unobserve() {}
    disconnect() {}
  } as any;
});

afterEach(() => {
  globalThis.ResizeObserver = OriginalObserver;
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
});

function fireResize() {
  for (const o of observers) {
    if (o.targets.some(t => (t as HTMLElement).classList?.contains("pte-root"))) o.fire();
  }
}

const columnDefs = [{ colId: "a", key: "a", label: "A", type: ColumnType.NUMBER, width: 200 }];
const rowData = Array.from({ length: 500 }, (_, i) => ({ id: i, a: i }));

describe("paginationAutoPageSize in a mounted grid", () => {
  it("pages by the rows that fit the body, re-paging only when that count moves", () => {
    heights = { "pte-body": 400 };
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData,
      rowHeight: 40,
      pagination: true,
      paginationAutoPageSize: true,
      paginationControls: { controls: ["rowSummary", "pageSize", "pageSelector"] },
    });
    fireResize();
    expect(api.getPaginationInfo().pageSize).toBe(10);
    expect(host.querySelector(".pte-pagination-size-control")).toBeNull();
    expect(host.querySelector(".pte-pagination-row-summary")?.textContent).toBe("1–10 of 500");

    const events: GridEventPaginationChangedParams[] = [];
    api.on("paginationChanged", e => events.push(e));
    // The re-page does not move the body; a second pass with the same height is silent.
    fireResize();
    expect(events).toHaveLength(0);

    heights = { "pte-body": 615 };
    fireResize();
    expect(api.getPaginationInfo().pageSize).toBe(15);
    expect(events).toHaveLength(1);
    expect(host.querySelector(".pte-pagination-row-summary")?.textContent).toBe("1–15 of 500");

    // Turned off at runtime: the configured size and its selector come back.
    api.updateGridOptions({ paginationAutoPageSize: false });
    expect(api.getPaginationInfo().pageSize).toBe(100);
    expect(host.querySelector(".pte-pagination-size-control")).toBeTruthy();
    api.destroy();
  });

  it("applies pageSize and pageSizes updates to the mounted footer", () => {
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData, pagination: true, pageSize: 25 });
    api.goToPage(3);
    api.updateGridOptions({ pageSizes: [20, 40], pageSize: 40 });
    expect(api.getPaginationInfo()).toMatchObject({ pageIndex: 0, pageSize: 40, pageSizes: [20, 40] });
    const select = host.querySelector<HTMLSelectElement>(".pte-pagination-size-control select")!;
    expect([...select.options].map(o => o.value)).toEqual(["20", "40"]);
    expect(select.value).toBe("40");
    api.destroy();
  });
});
