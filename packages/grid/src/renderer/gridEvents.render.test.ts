// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import type { ColDef } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource } from "../interfaces/serverSide";
import type {
  GridEventBodyScrollParams,
  GridEventColumnGroupOpenedParams,
  GridEventFirstDataRenderedParams,
  GridEventRowGroupOpenedParams,
} from "../events/events";
import { initDomRenderer } from "./dom";

/**
 * The renderer-driven halves of the new grid events: `firstDataRendered` (once, after the first
 * paint that shows a row), `bodyScroll` (every body scroll tick, deduped across the mirrored
 * horizontal scrollers), and the "user" source of `rowGroupOpened` / `columnGroupOpened` from the
 * real chevron and header-expander gestures. The model halves live in core/core.gridEvents.test.ts.
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
const VIEW_HEIGHT = 400;
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

const DEFS: ColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "region", key: "region", label: "Region" },
];
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `r${i}`, name: `Account ${i}`, region: i % 2 === 0 ? "AMER" : "EMEA",
}));

function mount(options: GridOptions = {}, defs: ColDef[] = DEFS) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowHeight: 40, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const firstData: GridEventFirstDataRenderedParams[] = [];
  core.on("firstDataRendered", ev => firstData.push(ev));
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs);
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  return { container, core, api, body, firstData };
}

describe("firstDataRendered", () => {
  it("fires once, after the first paint that shows a row", () => {
    const { api, container, firstData } = mount();
    let paintedInHandler = 0;
    api.on("firstDataRendered", () => {
      paintedInHandler = container.querySelectorAll(".pte-row[row-id]").length;
    });
    expect(firstData).toEqual([]);
    api.setRowData(rows(30));
    expect(firstData).toEqual([{ rowCount: 30 }]);
    expect(paintedInHandler).toBeGreaterThan(0);
    api.setRowData(rows(5));
    api.setRowData([]);
    api.setRowData(rows(8));
    expect(firstData).toHaveLength(1);
  });

  it("does not fire for an empty grid, and fires when data arrives later", () => {
    const { api, firstData } = mount();
    api.setRowData([]);
    expect(firstData).toEqual([]);
    api.applyTransaction({ add: rows(2) });
    expect(firstData).toEqual([{ rowCount: 2 }]);
  });

  it("waits for a server-side block to land", async () => {
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        setTimeout(() => success({
          rows: rows(12).slice(request.startRow ?? 0, request.endRow ?? 12),
          totalRows: 12,
        }), 0);
      },
    };
    const { core, firstData } = mount({ rowModelType: "serverSide", serverSideBlockSize: 20 });
    core.setServerSideDataSource(source);
    expect(firstData).toEqual([]);
    await flush();
    expect(firstData).toEqual([{ rowCount: 12 }]);
  });
});

describe("bodyScroll", () => {
  it("reports vertical, horizontal and both, once per movement", () => {
    const { api, container, body } = mount();
    api.setRowData(rows(100));
    const events: GridEventBodyScrollParams[] = [];
    api.on("bodyScroll", ev => events.push(ev));

    body.scrollTop = 200;
    body.dispatchEvent(new Event("scroll"));
    expect(events).toEqual([{ scrollTopPx: 200, scrollLeftPx: 0, direction: "vertical" }]);

    // A tick that moved nothing (the browser re-firing, or an echo) is dropped.
    body.dispatchEvent(new Event("scroll"));
    expect(events).toHaveLength(1);

    // The scrollbar strip drives the centre section; the echoes from the header and the centre
    // section itself collapse into the one event.
    const strip = container.querySelector<HTMLElement>(".pte-scroller-horizontal-container .pte-scroller-horizontal-spacer")!;
    strip.scrollLeft = 50;
    strip.dispatchEvent(new Event("scroll"));
    const centre = container.querySelector<HTMLElement>(".pte-body .pte-spacer")!;
    expect(centre.scrollLeft).toBe(50);
    centre.dispatchEvent(new Event("scroll"));
    expect(events).toEqual([
      { scrollTopPx: 200, scrollLeftPx: 0, direction: "vertical" },
      { scrollTopPx: 200, scrollLeftPx: 50, direction: "horizontal" },
    ]);

    // Both offsets moved before the next tick.
    centre.scrollLeft = 80;
    body.scrollTop = 400;
    body.dispatchEvent(new Event("scroll"));
    expect(events.at(-1)).toEqual({ scrollTopPx: 400, scrollLeftPx: 80, direction: "both" });
  });
});

describe("user sources from the real gestures", () => {
  it("the group chevron reports rowGroupOpened as user", () => {
    const { api, container } = mount({ groupDefaultExpanded: 0 });
    api.setRowData(rows(6));
    api.setRowGroupColumns(["region"]);
    const events: GridEventRowGroupOpenedParams[] = [];
    api.on("rowGroupOpened", ev => events.push(ev));
    const toggle = container.querySelector<HTMLElement>(".pte-group-toggle")!;
    const groupId = toggle.getAttribute("data-group-id")
      ?? toggle.closest(".pte-row")!.getAttribute("data-group-id")!;
    toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(events).toEqual([{ groupIds: [groupId], expanded: true, source: "user" }]);
  });

  it("the header expander reports columnGroupOpened as user", () => {
    const { api, container } = mount({}, [
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "geo", label: "Geo", children: [
          { colId: "region", key: "region", label: "Region" },
          { colId: "country", key: "country", label: "Country", columnGroupShow: "open" },
        ],
      },
    ]);
    api.setRowData(rows(3));
    const events: GridEventColumnGroupOpenedParams[] = [];
    api.on("columnGroupOpened", ev => events.push(ev));
    const expander = container.querySelector<HTMLElement>(".pte-hcell-expander")!;
    expander.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(events).toEqual([{ groupIds: ["geo"], expanded: true, source: "user" }]);
  });
});
