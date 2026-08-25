// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { GridAPI } from "../../api/api";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { GridSheet, SheetsOptions } from "../../interfaces/gridView";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { MenuRenderer } from "../menuRenderer";
import { SheetsRenderer } from "./sheetsRenderer";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(sheetsOptions?: SheetsOptions) {
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "status", key: "status", label: "Status" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setRowData([
    { id: "1", region: "West", status: "Open", revenue: 10 },
    { id: "2", region: "West", status: "Won", revenue: 20 },
    { id: "3", region: "East", status: "Open", revenue: 30 },
  ]);
  const api = new GridAPI(core);
  const host = document.createElement("div");
  host.className = "pte-footer-tabs";
  document.body.appendChild(host);
  const menuRenderer = new MenuRenderer(document.body);
  let enabledChanges = 0;
  let activeTabChanges = 0;
  const renderer = new SheetsRenderer({
    core,
    api,
    host,
    menuRenderer,
    options: sheetsOptions,
    onEnabledChange: () => enabledChanges++,
    onActiveTabChange: () => activeTabChanges++,
  });
  return {
    core,
    api,
    host,
    renderer,
    menuRenderer,
    counts: { enabled: () => enabledChanges, activeTab: () => activeTabChanges },
  };
}

const tabs = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLButtonElement>(".pte-sheet-tab")];
const tabNames = (host: HTMLElement) => tabs(host).map(tab => tab.textContent);
const activeTab = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".pte-sheet-tab[aria-selected=\"true\"]");

describe("sheets tab strip", () => {
  it("stays unmounted without the sheets option", () => {
    const { host, renderer } = makeGrid(undefined);
    expect(renderer.isEnabled()).toBe(false);
    expect(tabs(host)).toHaveLength(0);
    expect(host.classList.contains("pte-footer-tabs-enabled")).toBe(false);
    expect(renderer.getActiveTabElementId()).toBeNull();
  });

  it("synthesizes a Data tab for an empty list and exposes tablist semantics", () => {
    const { host, renderer } = makeGrid({});
    expect(renderer.isEnabled()).toBe(true);
    expect(host.classList.contains("pte-footer-tabs-enabled")).toBe(true);
    expect(tabNames(host)).toEqual(["Data"]);
    const strip = host.querySelector(".pte-sheet-tabs")!;
    expect(strip.getAttribute("role")).toBe("tablist");
    expect(strip.getAttribute("aria-label")).toBe("Sheets");
    const tab = activeTab(host)!;
    expect(tab.getAttribute("role")).toBe("tab");
    expect(tab.tabIndex).toBe(0);
    expect(renderer.getActiveTabElementId()).toBe(tab.id);
  });

  it("applies roving tabindex across supplied sheets and honors activeSheetId", () => {
    const sheets: GridSheet[] = [
      { id: "data", name: "Data" },
      { id: "p1", name: "Pivot 1" },
    ];
    const { host } = makeGrid({ sheets, activeSheetId: "p1" });
    expect(tabNames(host)).toEqual(["Data", "Pivot 1"]);
    expect(activeTab(host)!.textContent).toBe("Pivot 1");
    const [dataTab, pivotTab] = tabs(host);
    expect(dataTab.tabIndex).toBe(-1);
    expect(pivotTab.tabIndex).toBe(0);
  });

  it("captures the outgoing sheet and applies the incoming state on switch", () => {
    const changes: GridSheet[][] = [];
    const activations: (string | null)[] = [];
    const pivotState = {
      version: 1 as const,
      columns: [],
      rowGroupColumns: ["region"],
      sortModel: [],
      filterModel: [],
      quickFilterText: "",
      groupExpansion: [],
      aggregateModel: [{ colId: "revenue", type: "sum" }],
      pivotColumns: ["status"],
      pivotMode: true,
    };
    const { core, host } = makeGrid({
      sheets: [
        { id: "data", name: "Data" },
        { id: "p1", name: "Pivot 1", state: pivotState },
      ],
      onChange: next => changes.push(next),
      onActiveSheetChange: id => activations.push(id),
    });

    expect(core.getPivotMode()).toBe(false);
    tabs(host)[1].click();

    expect(core.getPivotMode()).toBe(true);
    expect(core.getPivotColumns().map(col => col.colId)).toEqual(["status"]);
    expect(activations).toEqual(["p1"]);
    // The outgoing Data sheet got the live state (pivot off) stored and reported.
    const reportedData = changes.at(-1)!.find(sheet => sheet.id === "data")!;
    expect(reportedData.state?.pivotMode).toBe(false);

    // Switching back captures the pivot sheet's state and restores the source view.
    tabs(host)[0].click();
    expect(core.getPivotMode()).toBe(false);
    const reportedPivot = changes.at(-1)!.find(sheet => sheet.id === "p1")!;
    expect(reportedPivot.state?.pivotMode).toBe(true);
    expect(activations).toEqual(["p1", "data"]);
  });

  it("appends a blank pivot sheet via the + button and switches to it", () => {
    const changes: GridSheet[][] = [];
    const { core, host } = makeGrid({ onChange: next => changes.push(next) });

    host.querySelector<HTMLButtonElement>(".pte-sheet-add")!.click();

    expect(tabNames(host)).toEqual(["Data", "Pivot 1"]);
    expect(activeTab(host)!.textContent).toBe("Pivot 1");
    expect(core.getPivotMode()).toBe(true);
    expect(core.getPivotColumns()).toEqual([]);
    expect(core.getAggregateModel()).toEqual([]);
    expect(core.getRowGroupColumns()).toEqual([]);
    const reported = changes.at(-1)!;
    expect(reported.map(sheet => sheet.name)).toEqual(["Data", "Pivot 1"]);
    expect(reported[1].state?.pivotMode).toBe(true);

    // A second + skips used numbers.
    host.querySelector<HTMLButtonElement>(".pte-sheet-add")!.click();
    expect(tabNames(host)).toEqual(["Data", "Pivot 1", "Pivot 2"]);
  });

  it("renames inline on double-click and reports the new name", () => {
    const changes: GridSheet[][] = [];
    const { host } = makeGrid({ onChange: next => changes.push(next) });

    tabs(host)[0].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = host.querySelector<HTMLInputElement>(".pte-sheet-rename-input")!;
    expect(input.value).toBe("Data");
    input.value = "Orders";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(tabNames(host)).toEqual(["Orders"]);
    expect(changes.at(-1)!.map(sheet => sheet.name)).toEqual(["Orders"]);
  });

  it("cancels a rename on Escape without reporting", () => {
    const changes: GridSheet[][] = [];
    const { host } = makeGrid({ onChange: next => changes.push(next) });

    tabs(host)[0].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = host.querySelector<HTMLInputElement>(".pte-sheet-rename-input")!;
    input.value = "Nope";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(tabNames(host)).toEqual(["Data"]);
    expect(changes).toHaveLength(0);
  });

  it("duplicates and deletes through the tab context menu", () => {
    const { host } = makeGrid({
      sheets: [
        { id: "data", name: "Data" },
        { id: "p1", name: "Pivot 1" },
      ],
    });

    const menuItem = (label: string) =>
      [...document.querySelectorAll<HTMLElement>(".pte-menu-item[data-item-id]")]
        .find(el => el.textContent?.includes(label));

    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Duplicate")!.click();
    expect(tabNames(host)).toEqual(["Data", "Pivot 1", "Pivot 1 (copy)"]);

    tabs(host)[2].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Delete")!.click();
    expect(tabNames(host)).toEqual(["Data", "Pivot 1"]);
  });

  it("refuses to delete the last sheet", () => {
    const { host } = makeGrid({});
    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const deleteItem = [...document.querySelectorAll<HTMLElement>(".pte-menu-item[data-item-id]")]
      .find(el => el.textContent?.includes("Delete"))!;
    expect(deleteItem.getAttribute("aria-disabled") === "true" || deleteItem.classList.contains("disabled")
      || (deleteItem as HTMLButtonElement).hasAttribute("disabled")).toBe(true);
    deleteItem.click();
    expect(tabNames(host)).toEqual(["Data"]);
  });

  it("deleting the active sheet activates its right neighbor and applies that state", () => {
    const activations: (string | null)[] = [];
    const { core, host } = makeGrid({
      sheets: [
        { id: "data", name: "Data" },
        {
          id: "p1",
          name: "Pivot 1",
          state: {
            version: 1,
            columns: [],
            rowGroupColumns: [],
            sortModel: [],
            filterModel: [],
            quickFilterText: "",
            groupExpansion: [],
            pivotColumns: ["status"],
            aggregateModel: [{ colId: "revenue", type: "sum" }],
            pivotMode: true,
          },
        },
        { id: "p2", name: "Pivot 2" },
      ],
      activeSheetId: "p1",
      onActiveSheetChange: id => activations.push(id),
    });
    // Enter the pivot sheet's state first so there is something to leave.
    core.dispatch({ type: "pivotColumnsSet", colIds: ["status"] });
    core.dispatch({ type: "pivotModeSet", on: true });

    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll<HTMLElement>(".pte-menu-item[data-item-id]")]
      .find(el => el.textContent?.includes("Delete"))!
      .click();

    expect(tabNames(host)).toEqual(["Data", "Pivot 2"]);
    expect(activeTab(host)!.textContent).toBe("Pivot 2");
    expect(activations).toEqual(["p2"]);
  });

  it("switches sheets with activateAdjacent and declines past either end", () => {
    const { host, renderer } = makeGrid({
      sheets: [
        { id: "data", name: "Data" },
        { id: "p1", name: "Pivot 1" },
      ],
    });
    expect(renderer.activateAdjacent(-1)).toBe(false);
    expect(renderer.activateAdjacent(1)).toBe(true);
    expect(activeTab(host)!.textContent).toBe("Pivot 1");
    expect(renderer.activateAdjacent(1)).toBe(false);
  });

  it("syncs the list through setOptions without applying any state", () => {
    const { core, host, renderer, counts } = makeGrid(undefined);
    expect(counts.enabled()).toBe(0);
    renderer.setOptions({
      sheets: [
        { id: "data", name: "Data" },
        {
          id: "p1",
          name: "Pivot 1",
          state: {
            version: 1,
            columns: [],
            rowGroupColumns: [],
            sortModel: [],
            filterModel: [],
            quickFilterText: "",
            groupExpansion: [],
            pivotMode: true,
          },
        },
      ],
      activeSheetId: "p1",
    });
    expect(counts.enabled()).toBe(1);
    expect(tabNames(host)).toEqual(["Data", "Pivot 1"]);
    expect(activeTab(host)!.textContent).toBe("Pivot 1");
    // Sync-only: the highlight moved, the grid's state did not.
    expect(core.getPivotMode()).toBe(false);

    renderer.setOptions(undefined);
    expect(counts.enabled()).toBe(2);
    expect(tabs(host)).toHaveLength(0);
  });
});
