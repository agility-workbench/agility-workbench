// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import type { IRowNode } from "../../interfaces/iRowNode";
import { initDomRenderer } from "../dom";

/**
 * A docked group row (the sticky overlay's mirror) behaves like the body row it covers: clicks,
 * double-clicks, hover tooltips and the ActionFrame resolve to the same row and cell, and a gesture
 * on it leaves the body's scroll position alone.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const tick = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

const Form = () => {
  const el = document.createElement("div");
  el.className = "mirror-frame-form";
  return el;
};

function defs(extra: Partial<ColDef> = {}): ColDef[] {
  return [
    {
      colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER,
      actionFrameComponent: Form, actionFrameTrigger: "click", ...extra,
    },
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
  ];
}

async function mountSticky(options: Partial<GridOptions> = {}, rowCount = 200) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    groupDisplayType: "groupRows",
    groupRowsSelectable: true,
    groupRowsSticky: true,
    ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs());
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    region: i < rowCount / 2 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  })));
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: AggregateType.SUM }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  api.setAllGroupsExpanded(true);
  await raf();
  return { container, core, api };
}

function body(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(".pte-body")!;
}

async function scrollBody(container: HTMLElement, top: number) {
  const scroller = body(container);
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event("scroll"));
  await raf();
  await raf();
}

/** Scroll five rows into the first group so its header is docked and its body copy is above. */
async function dockFirstGroup(container: HTMLElement, core: GridCore): Promise<IRowNode> {
  const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
  expect(group.isGroup).toBe(true);
  await scrollBody(container, 5 * core.options.rowHeight);
  return group;
}

function mirrorHost(container: HTMLElement, rowId: string): HTMLElement {
  const host = container.querySelector<HTMLElement>(
    `.pte-sticky-rows .pte-sticky-row[data-row-id="${rowId}"] .pte-full-width-cell`,
  );
  if (!host) throw new Error(`no docked mirror for ${rowId}`);
  return host;
}

function bodyHost(container: HTMLElement, viewIdx: number): HTMLElement {
  const host = container.querySelector<HTMLElement>(
    `.pte-body .pte-row[data-view-idx="${viewIdx}"] .pte-full-width-cell`,
  );
  if (!host || host.style.display === "none") throw new Error(`no body host at ${viewIdx}`);
  return host;
}

function mouse(target: HTMLElement, type: string) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
}

function framed(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".pte-action-frame"));
}

describe("sticky group mirrors take the body row's pointer gestures", () => {
  it("a click on the mirror opens a click-trigger ActionFrame anchored to the mirror cell", async () => {
    const { container, core } = await mountSticky();
    const group = await dockFirstGroup(container, core);
    const host = mirrorHost(container, group.id);
    // The mirror stamps its body row's view index, so body handlers resolve it as that row.
    expect(host.closest<HTMLElement>(".pte-row")!.dataset.viewIdx).toBe("0");
    const anchorRect = vi.spyOn(host, "getBoundingClientRect");
    const scrollTop = body(container).scrollTop;

    mouse(host, "mousedown");
    mouse(host, "click");
    await raf();

    const open = core.getActionFrameCell();
    expect(open?.rowId).toBe(group.id);
    expect(open?.colInstanceId).toBe(core.getColumnModel().getByColId("total")!.instanceID);
    expect(document.querySelector(".pte-action-frame-popover")).toBeTruthy();
    // The popover's anchor thunk resolved to the mirror cell, which also carries the frame.
    expect(anchorRect).toHaveBeenCalled();
    expect(framed(container)).toEqual([host]);
    // The gesture selected the docked row without scrolling its body copy back into view.
    expect(core.getActiveCell()?.row).toBe(0);
    expect(body(container).scrollTop).toBe(scrollTop);
  });

  it("a double-click on the mirror emits the body row's events with the same node", async () => {
    const { container, core } = await mountSticky();
    const rowEvents: any[] = [];
    const cellEvents: any[] = [];
    core.on("rowDoubleClicked", (p: any) => rowEvents.push(p));
    core.on("cellDoubleClicked", (p: any) => cellEvents.push(p));

    // Reference: the body row at rest.
    mouse(bodyHost(container, 0), "dblclick");
    expect(rowEvents).toHaveLength(1);
    const reference = { row: rowEvents[0], cell: cellEvents[0] };

    const group = await dockFirstGroup(container, core);
    mouse(mirrorHost(container, group.id), "dblclick");

    expect(rowEvents).toHaveLength(2);
    expect(cellEvents).toHaveLength(2);
    const [row, cell] = [rowEvents[1], cellEvents[1]];
    expect(row.node).toBe(group);
    expect(row.node).toBe(reference.row.node);
    expect(row.rowId).toBe(reference.row.rowId);
    expect(row.viewIdx).toBe(reference.row.viewIdx);
    expect(row.isGroup).toBe(true);
    expect(cell.colId).toBe(reference.cell.colId);
    expect(cell.value).toBe(reference.cell.value);
  });

  it("hovering the mirror cell shows the tooltip the body cell would", async () => {
    const { container, core, api } = await mountSticky({
      tooltip: { showDelay: 0, hideDelay: 0 },
      getRowPresentation: (p: any) => p.isGroup ? { tooltip: { content: `Group ${p.rowId}` } } : undefined,
    } as any);
    const shown: any[] = [];
    core.on("tooltipShow", (p: any) => shown.push(p));

    mouse(bodyHost(container, 0), "mouseover");
    await tick(5);
    const bodyText = document.querySelector(".pte-tooltip")?.textContent;
    expect(bodyText).toBeTruthy();
    api.hideTooltip();

    const group = await dockFirstGroup(container, core);
    const host = mirrorHost(container, group.id);
    mouse(host, "mouseover");
    await tick(5);

    expect(document.querySelector(".pte-tooltip")?.textContent).toBe(bodyText);
    expect(shown.at(-1)).toMatchObject({ location: "body", rowId: group.id, viewIdx: 0 });
    // The tooltip describes the cell the user sees.
    expect(host.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("keeps the ActionFrame border on the mirror through forced repaints", async () => {
    const { container, core, api } = await mountSticky();
    const group = await dockFirstGroup(container, core);
    mouse(mirrorHost(container, group.id), "click");
    await raf();
    expect(framed(container)).toEqual([mirrorHost(container, group.id)]);

    api.refreshRowPresentation();
    expect(framed(container)).toEqual([mirrorHost(container, group.id)]);

    api.applyTransaction({
      update: [{ rowId: "r7", row: { id: "r7", region: "AMER", name: "Renamed", total: 70 } }],
    });
    await raf();
    expect(core.getRowModel().getRowNode("r7")?.data.total).toBe(70);
    expect(core.getActionFrameCell()?.rowId).toBe(group.id);
    expect(framed(container)).toEqual([mirrorHost(container, group.id)]);
  });

  it("keyboard focus onto a docked row still scrolls its body copy into view", async () => {
    const { container, core } = await mountSticky();
    const group = await dockFirstGroup(container, core);
    await tick(5);
    const nominal = core.getColumnModel().getFullWidthNominalLeaf()!;
    const colIdx = core.getColumnModel().leafColumnLookup.get(nominal.instanceID)!.globalIndex;
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx, reason: "keyboard" } as any);
    expect(core.getActiveCell()?.row).toBe(0);
    expect(group.viewIndex).toBe(0);
    expect(body(container).scrollTop).toBe(0);
  });
});
