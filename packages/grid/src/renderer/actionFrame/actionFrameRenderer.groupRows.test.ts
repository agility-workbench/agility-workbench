// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { CellClassParams, ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import type { ActionFrameComponentParams } from "./actionFrameComponent";
import { initDomRenderer } from "../dom";

/**
 * Group rows host ActionFrames when cell-selectable. In singleColumn mode the frame sits on the
 * group row's cell for its column; in groupRows mode on the full-width host, which stands in for
 * the nominal column. A docked group row's border follows it onto the sticky mirror the user sees.
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

let received: ActionFrameComponentParams[] = [];
const Form = (p: ActionFrameComponentParams) => {
  received.push(p);
  const el = document.createElement("div");
  el.className = "group-frame-form";
  return el;
};

function defs(extra: Partial<ColDef> = {}): ColDef[] {
  return [
    {
      colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER,
      actionFrameComponent: Form, ...extra,
    },
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
  ];
}

async function mountGrouped(options: Partial<GridOptions> = {}, colDefs: ColDef[] = defs(), rowCount = 6) {
  document.body.innerHTML = "";
  received = [];
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id", groupDisplayType: "groupRows", groupRowsSelectable: true, ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    region: i < rowCount / 2 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  })));
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: AggregateType.SUM }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  return { container, core, api };
}

function instanceId(core: GridCore, colId: string): string {
  return core.getColumnModel().getByColId(colId)!.instanceID;
}

function globalIdx(core: GridCore, colId: string): number {
  return core.getColumnModel().leafColumnLookup.get(instanceId(core, colId))!.globalIndex;
}

function bodyCell(container: HTMLElement, viewIdx: number, colIdx: number): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIdx}"]`,
  );
}

function bodyHost(container: HTMLElement, viewIdx: number): HTMLElement {
  const host = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-full-width-cell`,
  );
  if (!host || host.style.display === "none") throw new Error(`no full-width host at ${viewIdx}`);
  return host;
}

function framed(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".pte-action-frame"));
}

async function scrollBody(container: HTMLElement, top: number) {
  const scroller = container.querySelector<HTMLElement>(".pte-body")!;
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event("scroll"));
  await raf();
  await raf();
}

describe("ActionFrame on group rows", () => {
  it("frames the group row's cell in singleColumn mode and hands the component the group", async () => {
    const { container, core, api } = await mountGrouped({ groupDisplayType: "singleColumn" });
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    expect(group.isGroup).toBe(true);

    api.openActionFrame({ rowId: group.id, colId: instanceId(core, "total") });
    await raf();

    const cell = bodyCell(container, 0, globalIdx(core, "total"))!;
    expect(cell.classList).toContain("pte-group-cell");
    expect(framed(container)).toEqual([cell]);
    expect(cell.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".pte-action-frame-popover")?.getAttribute("role")).toBe("dialog");

    const params = received.at(-1)!;
    expect(params.isGroup).toBe(true);
    expect(params.node).toBe(group);
    // AMER holds r0..r2: 0 + 1 + 2.
    expect(params.value).toBe(3);
    expect(params.value).toBe(core.getGroupCellValue(core.getColumnModel().getByColId("total")!, group).value);
  });

  it("leaf rows still get isGroup false, the node, and the column's value", async () => {
    const { core, api } = await mountGrouped({ groupDisplayType: "singleColumn" });
    api.setAllGroupsExpanded(true);
    await raf();
    const leaf = core.getRowModel().getRowNodeAtViewIndex(1)!;
    expect(leaf.isGroup).toBeFalsy();

    api.openActionFrame({ rowId: leaf.id, colId: instanceId(core, "total") });
    await raf();

    const params = received.at(-1)!;
    expect(params.isGroup).toBe(false);
    expect(params.node).toBe(leaf);
    expect(params.value).toBe(leaf.data.total);
  });

  it("frames the full-width host in groupRows mode", async () => {
    const { container, core, api } = await mountGrouped();
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    const nominal = core.getColumnModel().getFullWidthNominalLeaf()!;
    expect(nominal.colId).toBe("total");

    api.openActionFrame({ rowId: group.id, colId: nominal.instanceID });
    await raf();

    const host = bodyHost(container, 0);
    expect(framed(container)).toEqual([host]);
    expect(host.classList).toContain("pte-full-width-cell");
    expect(document.querySelector(".pte-action-frame-popover")?.getAttribute("role")).toBe("dialog");
    expect(received.at(-1)!.isGroup).toBe(true);
  });

  it("opens from a click on the full-width host when the nominal column triggers on click", async () => {
    const { container, core } = await mountGrouped({}, defs({ actionFrameTrigger: "click" }));
    bodyHost(container, 0).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await raf();
    expect(core.getActionFrameCell()?.colInstanceId).toBe(instanceId(core, "total"));
    expect(framed(container)).toEqual([bodyHost(container, 0)]);
  });

  it("moves the border onto the sticky mirror when the framed group row docks", async () => {
    const { container, core, api } = await mountGrouped({ groupRowsSticky: true }, defs(), 200);
    api.setAllGroupsExpanded(true);
    await raf();
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    api.openActionFrame({ rowId: group.id, colId: instanceId(core, "total") });
    await raf();

    await scrollBody(container, 5 * core.options.rowHeight);

    const mirrorHost = container.querySelector<HTMLElement>(
      `.pte-sticky-row[data-row-id="${group.id}"] .pte-full-width-cell`,
    );
    expect(mirrorHost).toBeTruthy();
    expect(mirrorHost!.classList).toContain("pte-action-frame");
    // The pooled copy under the mirror is not framed; the mirror is the only frame.
    expect(framed(container)).toEqual([mirrorHost]);
  });

  it("re-stamps the mirror after a forced sticky rebuild outside the scroll tick", async () => {
    const { container, core, api } = await mountGrouped({ groupRowsSticky: true }, defs(), 200);
    api.setAllGroupsExpanded(true);
    await raf();
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    api.openActionFrame({ rowId: group.id, colId: instanceId(core, "total") });
    await scrollBody(container, 5 * core.options.rowHeight);
    const before = container.querySelector<HTMLElement>(".pte-sticky-row .pte-action-frame");
    expect(before).toBeTruthy();

    api.refreshRowPresentation();

    const after = container.querySelector<HTMLElement>(".pte-sticky-row .pte-action-frame");
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect(framed(container)).toEqual([after]);
  });

  it("clears the frame from the mirror and the pool on close", async () => {
    const { container, core, api } = await mountGrouped({ groupRowsSticky: true }, defs(), 200);
    api.setAllGroupsExpanded(true);
    await raf();
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    api.openActionFrame({ rowId: group.id, colId: instanceId(core, "total") });
    await scrollBody(container, 5 * core.options.rowHeight);
    expect(framed(container)).toHaveLength(1);

    api.closeActionFrame();
    expect(framed(container)).toEqual([]);
  });
});

describe("ActionFrame indicator on group rows", () => {
  it("marks a group cell through a predicate that reads isGroup", async () => {
    const seen: CellClassParams[] = [];
    const { container, core, api } = await mountGrouped({ groupDisplayType: "singleColumn" }, defs({
      actionFrameIndicator: (p) => {
        seen.push(p);
        return !!p.isGroup;
      },
    }));
    api.setAllGroupsExpanded(true);
    await raf();
    const colIdx = globalIdx(core, "total");

    const groupCell = bodyCell(container, 0, colIdx)!;
    const leafCell = bodyCell(container, 1, colIdx)!;
    expect(groupCell.classList).toContain("pte-action-frame-indicator");
    expect(leafCell.classList).not.toContain("pte-action-frame-indicator");

    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    const groupParams = seen.find(p => p.rowId === group.id)!;
    expect(groupParams.node).toBe(group);
    expect(groupParams.value).toBe(3);
  });

  it("marks the full-width host with the nominal column's indicator", async () => {
    const { container, api } = await mountGrouped({}, defs({
      actionFrameIndicator: (p) => p.isGroup === true && p.value === 3,
    }));
    // AMER sums to 3; EMEA (r3..r5) to 12.
    expect(bodyHost(container, 0).classList).toContain("pte-action-frame-indicator");
    expect(bodyHost(container, 1).classList).not.toContain("pte-action-frame-indicator");

    // Expanding recycles the EMEA host's slot onto a leaf; no stale mark survives on the hidden host.
    api.setAllGroupsExpanded(true);
    await raf();
    const marked = Array.from(container.querySelectorAll<HTMLElement>(".pte-full-width-cell.pte-action-frame-indicator"))
      .filter(host => host.style.display !== "none");
    expect(marked.map(host => host.closest<HTMLElement>(".pte-row")!.dataset.viewIdx)).toEqual(["0"]);
  });

  it("leaves the host unmarked when the nominal column has no indicator", async () => {
    const { container } = await mountGrouped();
    expect(bodyHost(container, 0).classList).not.toContain("pte-action-frame-indicator");
  });
});
