// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
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

function makeGrid() {
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

  it("opens the role menu from the editor chip and toggles an aggregate through it", () => {
    const { core, root } = makeGrid();
    setRoles(core, { groups: ["region"], values: [["revenue", AggregateType.SUM]], pivots: ["quarter"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    const editor = row(root, "revenue")!.querySelector<HTMLButtonElement>(".pte-column-panel-role-add")!;
    editor.click();
    const aggregate = menuItems().find(item => item.dataset.itemId === "aggregateColumns")!;
    aggregate.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    aggregate.click();
    const average = menuItems().find(item => item.dataset.itemId === "aggAvg")!;
    average.click();
    expect(core.getAggregateModel()).toEqual([
      { key: instanceId(core, "revenue"), type: AggregateType.SUM },
      { key: instanceId(core, "revenue"), type: AggregateType.AVG },
    ]);
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

  it("swaps rows to the customizer form and shows the wells", () => {
    const { root } = makePivotGrid();
    const regionRow = row(root, "region")!;
    expect(regionRow.classList.contains("pte-column-panel-row-pivot")).toBe(true);
    expect(regionRow.querySelector(".pte-column-panel-checkbox")).toBeNull();
    expect(regionRow.querySelector(".pte-column-panel-pin")).toBeNull();
    expect(regionRow.querySelector(".pte-column-panel-role-add")).not.toBeNull();
    expect(root.querySelector(".pte-column-panel-wells")!.hasAttribute("hidden")).toBe(false);
    expect(wellLabels(root, "group")).toEqual(["Region"]);
    expect(wellLabels(root, "pivot")).toEqual(["Quarter"]);
    expect(wellLabels(root, "value")).toEqual(["Revenue — Sum"]);
    // Bulk visibility and the reset footer act on the hidden stashed layout — gone while pivoted.
    expect(root.querySelector(".pte-column-panel-bulk")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".pte-column-panel-footer")!.hasAttribute("hidden")).toBe(true);
  });

  it("restores the layout chrome when pivot mode exits", () => {
    const { core, root } = makePivotGrid();
    core.dispatch({ type: "pivotModeSet", on: false });
    expect(root.querySelector(".pte-column-panel-wells")!.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".pte-column-panel-bulk")!.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".pte-column-panel-footer")!.hasAttribute("hidden")).toBe(false);
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
