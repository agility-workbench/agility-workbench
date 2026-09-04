// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { ColumnMenuService } from "../../menu/columnMenuService";
import { MenuCoordinator } from "../../menu/coordinator";
import { MenuRenderer } from "../menuRenderer";
import { ColumnPanelRenderer } from "./columnPanelRenderer";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(opts: { open?: boolean } = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setRowData([
    { id: "1", region: "West", quarter: "Q1", revenue: 10 },
    { id: "2", region: "West", quarter: "Q2", revenue: 20 },
    { id: "3", region: "East", quarter: "Q1", revenue: 30 },
  ]);
  const root = document.createElement("div");
  document.body.appendChild(root);
  const menuRenderer = new MenuRenderer(document.body);
  const menuCoordinator = new MenuCoordinator(
    new ColumnMenuService(core),
    { resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }) },
    core,
  );
  const renderer = new ColumnPanelRenderer({
    core,
    root: root as HTMLDivElement,
    options: true,
    onLayoutChange: () => undefined,
    toolbar: {
      mountColumnTrigger: () => undefined,
      unmountColumnTrigger: () => undefined,
    },
    menuCoordinator,
    menuRenderer,
  });
  // The panel body only tracks the grid while it is open (a closed panel defers its rebuild), so
  // these tests, which read that DOM, open it.
  if (opts.open !== false) renderer.openPanel();
  return { core, root, renderer };
}

const instanceId = (core: GridCore, colId: string) =>
  core.getColumnModel().getByColId(colId)!.instanceID;

function setRoles(core: GridCore, roles: { groups?: string[]; values?: Array<[string, AggregateType]>; pivots?: string[] }) {
  if (roles.groups) core.dispatch({ type: "rowGroupSet", colIds: roles.groups });
  if (roles.values) {
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: roles.values.map(([colId, type]) => ({ key: instanceId(core, colId), type })),
    });
  }
  if (roles.pivots) core.dispatch({ type: "pivotColumnsSet", colIds: roles.pivots });
}

const row = (root: HTMLElement, colId: string) =>
  root.querySelector<HTMLDivElement>(`.pte-column-panel-row[data-col-id="${colId}"]`);
const chips = (root: HTMLElement, colId: string) =>
  [...(row(root, colId)?.querySelectorAll<HTMLButtonElement>(".pte-column-panel-role-chip") ?? [])];
const chipTexts = (root: HTMLElement, colId: string) =>
  chips(root, colId).map(chip => chip.querySelector(".pte-column-panel-role-chip-text")!.textContent);
const well = (root: HTMLElement, role: string) =>
  root.querySelector<HTMLDivElement>(`.pte-column-panel-well[data-role="${role}"]`);
const wellLabels = (root: HTMLElement, role: string) =>
  [...(well(root, role)?.querySelectorAll(".pte-column-panel-well-item-label") ?? [])].map(el => el.textContent);
const menuItems = () =>
  [...document.querySelectorAll<HTMLElement>(".pte-menu-item[data-item-id]")];
const wellItems = (root: HTMLElement, role: string) =>
  [...(well(root, role)?.querySelectorAll<HTMLElement>(".pte-column-panel-well-item") ?? [])];

/**
 * Stack a well's entries at 28px each, so the drop resolver has real rects to compare a pointer
 * against — happy-dom reports an all-zero rect for every element otherwise, which would land every
 * drop at the end of the list.
 */
function layOutWell(root: HTMLElement, role: string): HTMLElement[] {
  const items = wellItems(root, role);
  items.forEach((item, index) => {
    item.getBoundingClientRect = () => ({
      x: 0, y: index * 28, left: 0, right: 200, top: index * 28, bottom: (index + 1) * 28,
      width: 200, height: 28, toJSON: () => ({}),
    });
  });
  return items;
}

const dragOver = (target: HTMLElement, clientY: number) => {
  const event = new MouseEvent("dragover", { bubbles: true, cancelable: true, clientY });
  target.dispatchEvent(event);
  return event;
};

describe("column panel role chips", () => {
  it("shows removable role chips outside pivot mode and none on role-less columns", () => {
    const { core, root } = makeGrid();
    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM], ["revenue", AggregateType.AVG]] });
    expect(chipTexts(root, "region")).toEqual(["Group"]);
    expect(chipTexts(root, "revenue")).toEqual(["Sum", "Average"]);
    expect(row(root, "quarter")!.querySelector(".pte-column-panel-roles")).toBeNull();
    // Layout controls stay in place outside pivot mode.
    expect(row(root, "region")!.querySelector(".pte-column-panel-checkbox")).not.toBeNull();
    expect(root.querySelector(".pte-column-panel-wells")!.hasAttribute("hidden")).toBe(true);
  });

  it("numbers group chips by level once several groups exist", () => {
    const { core, root } = makeGrid();
    setRoles(core, { groups: ["region", "quarter"] });
    expect(chipTexts(root, "region")).toEqual(["Group 1"]);
    expect(chipTexts(root, "quarter")).toEqual(["Group 2"]);
  });

  it("removes exactly the clicked role", () => {
    const { core, root } = makeGrid();
    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM], ["revenue", AggregateType.AVG]] });
    chips(root, "region")[0].click();
    expect(core.getRowGroupColumns()).toHaveLength(0);
    // The Sum chip goes; Average stays.
    chips(root, "revenue")[0].click();
    expect(core.getAggregateModel()).toEqual([
      { key: instanceId(core, "revenue"), type: AggregateType.AVG },
    ]);
    expect(chipTexts(root, "revenue")).toEqual(["Average"]);
  });
});

// A rebuild tears down and re-creates the whole panel body, and the grid asks for one on each of
// columnsChanged / aggregateChanged / pivotChanged — three per pivot mutation. None of it is
// observable while the panel is closed.
describe("column panel rebuild scheduling", () => {
  const spyRebuilds = () => vi.spyOn(ColumnPanelRenderer.prototype as any, "renderListNow");

  const closeButton = (root: HTMLElement) =>
    root.querySelector<HTMLButtonElement>(".pte-column-panel-close")!;

  it("does not rebuild while closed, and settles once on open", () => {
    const spy = spyRebuilds();
    const { core, root, renderer } = makeGrid({ open: false });
    spy.mockClear();

    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM]], pivots: ["quarter"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(spy).not.toHaveBeenCalled();

    renderer.openPanel();
    expect(spy).toHaveBeenCalledTimes(1);
    // One rebuild, and the panel shows the state it missed.
    expect(wellLabels(root, "group")).toEqual(["Region"]);
    expect(wellLabels(root, "value")).toEqual(["Revenue — Sum"]);
    spy.mockRestore();
  });

  it("does not rebuild when reopened with nothing changed in between", () => {
    const { core, root, renderer } = makeGrid();
    setRoles(core, { groups: ["region"] });
    const spy = spyRebuilds();

    closeButton(root).click();
    renderer.openPanel();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("coalesces the events of one mutation into a single rebuild while open", () => {
    const { core, root } = makeGrid();
    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM]], pivots: ["quarter"] });
    const spy = spyRebuilds();

    // pivotModeSet emits columnsChanged, aggregateChanged and pivotChanged from inside one
    // dispatch. Rebuilding per event cost three teardowns of the same DOM for one mutation.
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(spy).toHaveBeenCalledTimes(1);

    // Coalesced, not deferred: the panel is already showing the mutation when dispatch returns —
    // read synchronously, with no microtask or frame in between.
    expect(root.querySelector(".pte-column-panel-wells")?.children.length).toBeGreaterThan(0);
    expect(wellLabels(root, "pivot")).toEqual(["Quarter"]);
    expect(wellLabels(root, "value")).toEqual(["Revenue — Sum"]);
    spy.mockRestore();
  });

  it("rebuilds once, with settled state, when the same dispatch opens the panel", () => {
    const { core, root, renderer } = makeGrid({ open: false });
    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM]], pivots: ["quarter"] });
    // Opening from inside the burst: the deferred rebuild the closed panel owed and the rebuild
    // this mutation asks for are the same rebuild, and it runs once, at the end, on settled state.
    const unsubscribe = core.on("pivotChanged", () => renderer.openPanel());
    const spy = spyRebuilds();

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(wellLabels(root, "pivot")).toEqual(["Quarter"]);
    unsubscribe();
    spy.mockRestore();
  });

  it("skips the coalesced rebuild when the same dispatch also closed the panel", () => {
    const { core, root, renderer } = makeGrid();
    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM]], pivots: ["quarter"] });
    // Close from inside the burst: the rebuild is requested before the close and settles after it,
    // so it has to re-check, and record the staleness the closed panel settles on open.
    const unsubscribe = core.on("pivotChanged", () => closeButton(root).click());
    const spy = spyRebuilds();

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(spy).not.toHaveBeenCalled();
    unsubscribe();

    renderer.openPanel();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(wellLabels(root, "pivot")).toEqual(["Quarter"]);
    spy.mockRestore();
  });
});

describe("column panel pivot customizer", () => {
  function makePivotGrid() {
    const grid = makeGrid();
    setRoles(grid.core, {
      groups: ["region"],
      values: [["revenue", AggregateType.SUM]],
      pivots: ["quarter"],
    });
    grid.core.dispatch({ type: "pivotModeSet", on: true });
    return grid;
  }

  it("is nothing but the wells while pivoted — no column list, no layout chrome", () => {
    const { root } = makePivotGrid();
    // The listed columns are the stashed sources: the grid displays generated columns, so every
    // control over them (search, visibility, pin, order, bulk, reset) had nothing to act on.
    expect(root.querySelector(".pte-column-panel-list")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelectorAll(".pte-column-panel-row")).toHaveLength(0);
    expect(root.querySelector(".pte-column-panel-search")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".pte-column-panel-bulk")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".pte-column-panel-footer")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".pte-column-panel-title")!.textContent).toBe("Pivot setup");

    expect(root.querySelector(".pte-column-panel-wells")!.hasAttribute("hidden")).toBe(false);
    expect(wellLabels(root, "group")).toEqual(["Region"]);
    expect(wellLabels(root, "pivot")).toEqual(["Quarter"]);
    expect(wellLabels(root, "value")).toEqual(["Revenue — Sum"]);
  });

  it("restores the column list and its chrome when pivot mode exits", () => {
    const { core, root } = makePivotGrid();
    core.dispatch({ type: "pivotModeSet", on: false });
    expect(root.querySelector(".pte-column-panel-wells")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".pte-column-panel-list")!.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".pte-column-panel-search")!.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".pte-column-panel-bulk")!.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".pte-column-panel-footer")!.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".pte-column-panel-title")!.textContent).toBe("Columns");
    expect(row(root, "region")!.querySelector(".pte-column-panel-checkbox")).not.toBeNull();
  });

  it("adds a role from a well's add menu, excluding columns already in that role", () => {
    const { core, root } = makePivotGrid();
    well(root, "group")!.querySelector<HTMLButtonElement>(".pte-column-panel-well-add")!.click();
    const labels = menuItems().map(item => item.textContent);
    expect(labels).toContain("Quarter");
    expect(labels).toContain("Revenue");
    expect(labels).not.toContain("Region");
    menuItems().find(item => item.textContent === "Quarter")!.click();
    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["region", "quarter"]);
    expect(wellLabels(root, "group")).toEqual(["Region", "Quarter"]);
  });

  it("adds a value with a type picked from the nested add-value menu", () => {
    const { core, root } = makePivotGrid();
    well(root, "value")!.querySelector<HTMLButtonElement>(".pte-column-panel-well-add")!.click();
    const revenue = menuItems().find(item => item.textContent === "Revenue")!;
    revenue.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    revenue.click();
    menuItems().find(item => item.dataset.itemId === "aggMedian")!.click();
    expect(core.getAggregateModel()).toEqual([
      { key: instanceId(core, "revenue"), type: AggregateType.SUM },
      { key: instanceId(core, "revenue"), type: AggregateType.MEDIAN },
    ]);
    expect(wellLabels(root, "value")).toEqual(["Revenue — Sum", "Revenue — Median"]);
  });

  it("reorders roles with the well's move buttons", () => {
    const { core, root } = makePivotGrid();
    setRoles(core, { groups: ["region", "quarter"] });
    const buttons = [...well(root, "group")!.querySelectorAll<HTMLButtonElement>(".pte-column-panel-order")];
    // Region: up (disabled), down. Quarter: up, down (disabled).
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[3].disabled).toBe(true);
    buttons[1].click();
    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["quarter", "region"]);
    expect(wellLabels(root, "group")).toEqual(["Quarter", "Region"]);
  });

  it("reorders a well by dragging one of its entries past another", () => {
    const { core, root } = makePivotGrid();
    setRoles(core, { groups: ["region", "quarter"] });
    const items = layOutWell(root, "group");
    const list = items[0].parentElement!;

    items[0].dispatchEvent(new Event("dragstart", { bubbles: true }));
    // Past the midpoint of the second entry, i.e. into the gap after it.
    expect(dragOver(list, 50).defaultPrevented).toBe(true);
    expect(list.querySelector(".pte-column-panel-well-drop-indicator")).not.toBeNull();
    list.dispatchEvent(new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 50 }));

    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["quarter", "region"]);
    expect(wellLabels(root, "group")).toEqual(["Quarter", "Region"]);
  });

  it("refuses a drag that started in another well", () => {
    const { core, root } = makePivotGrid();
    layOutWell(root, "group");
    const valueList = layOutWell(root, "value")[0].parentElement!;

    wellItems(root, "group")[0].dispatchEvent(new Event("dragstart", { bubbles: true }));
    // Roles are not interchangeable — Values holds column+aggregate pairs, not columns — so the
    // other wells are simply not drop targets, and the unprevented dragover says so to the browser.
    expect(dragOver(valueList, 10).defaultPrevented).toBe(false);
    expect(valueList.querySelector(".pte-column-panel-well-drop-indicator")).toBeNull();
    valueList.dispatchEvent(new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 10 }));

    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["region"]);
    expect(core.getAggregateModel()).toHaveLength(1);
  });

  it("removes roles from the wells and keeps pivot mode on when the last pivot column goes", () => {
    const { core, root } = makePivotGrid();
    well(root, "pivot")!.querySelector<HTMLButtonElement>(".pte-column-panel-well-remove")!.click();
    expect(core.getPivotColumns()).toHaveLength(0);
    expect(core.getPivotMode()).toBe(true);
    expect(well(root, "pivot")!.querySelector(".pte-column-panel-well-empty")).not.toBeNull();
    well(root, "value")!.querySelector<HTMLButtonElement>(".pte-column-panel-well-remove")!.click();
    expect(core.getAggregateModel()).toHaveLength(0);
  });
});
