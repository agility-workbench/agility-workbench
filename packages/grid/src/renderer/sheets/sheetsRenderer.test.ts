// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { GridAPI } from "../../api/api";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { GridSheet, SheetsOptions } from "../../interfaces/gridView";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { MenuRenderer } from "../menuRenderer";
import { SheetsRenderer } from "./sheetsRenderer";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(sheetsOptions?: SheetsOptions, coreOptions: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", ...coreOptions });
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
/** An open menu's item by label — submenu levels included, since every level renders into the
 * document. Labels are distinct across the sheet menu and its color submenu. */
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>(".pte-menu-item[data-item-id]")]
    .find(el => el.textContent?.includes(label));

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

  // The + button makes a PIVOT sheet, and pivot is client-side-only (see IGridCore.isPivotSupported).
  describe("on a grid that cannot pivot", () => {
    const addButton = (host: HTMLElement) =>
      host.querySelector<HTMLButtonElement>(".pte-sheet-add")!;

    it.each([
      ["the server-side row model", {
        rowModelType: "serverSide",
        serverSideDataSource: { getRows: ({ success }: any) => success({ rows: [], totalRows: 0 }) },
      }],
      ["tree data", { treeData: { mode: "path", getPath: (row: any) => [row.id] } }],
    ])("disables the + button and explains why: %s", (_label, coreOptions) => {
      const { host } = makeGrid({}, coreOptions);
      expect(addButton(host).disabled).toBe(true);
      expect(addButton(host).title).toBe("Pivot sheets need the client-side row model without tree data");
      expect(addButton(host).getAttribute("aria-label")).toBe(addButton(host).title);
    });

    it("adds no sheet and destroys no state if the click lands anyway", () => {
      const changes: GridSheet[][] = [];
      const { core, host } = makeGrid({ onChange: next => changes.push(next) }, {
        rowModelType: "serverSide",
        serverSideDataSource: { getRows: ({ success }: any) => success({ rows: [], totalRows: 0 }) },
      });
      core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
      core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });

      addButton(host).click();

      expect(tabNames(host)).toEqual(["Data"]);
      expect(changes).toEqual([]);
      // The roles the sheet was configured with survive — the old failure wiped them to set up a
      // pivot the core then refused, leaving a dead tab behind.
      expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["region"]);
      expect(core.getAggregateModel()).toHaveLength(1);
    });
  });

  it("does not carry a generated-pivot sort onto the new sheet", () => {
    const changes: GridSheet[][] = [];
    const { core, host } = makeGrid({ onChange: next => changes.push(next) });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["status"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    const generated = core.getColumnModel().getLeaves().find(c => c.isPivotResultColumn())!;
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: generated.instanceID, dir: "desc" }] });
    expect(core.getSortModel().items).toHaveLength(1);

    host.querySelector<HTMLButtonElement>(".pte-sheet-add")!.click();

    // The new sheet has no pivot configuration, so the source sheet's generated colIds mean
    // nothing on it — they must not ride along into its state or its live sort model.
    const reported = changes.at(-1)!;
    expect(reported[0].state?.sortModel).toEqual([{ colId: generated.colId, dir: "desc" }]);
    expect(reported[1].state?.sortModel).toEqual([]);
    expect(core.getSortModel().items).toEqual([]);
  });

  it("does not carry an auto-group sort onto the new sheet", () => {
    const changes: GridSheet[][] = [];
    const { core, host } = makeGrid({ onChange: next => changes.push(next) });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groupCol = core.getColumnModel().getAutoGroupColumns()[0];
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: groupCol.instanceID, dir: "desc" }] });

    host.querySelector<HTMLButtonElement>(".pte-sheet-add")!.click();

    // The new sheet clears the row groups, so a sort on the group label orders buckets it does not
    // have — it stays with the sheet whose grouping it belongs to.
    const reported = changes.at(-1)!;
    expect(reported[0].state?.sortModel).toEqual([{ colId: "__pte_group__", dir: "desc" }]);
    expect(reported[1].state?.sortModel).toEqual([]);
    expect(core.getSortModel().items).toEqual([]);
  });

  it("keeps a sort on the auto-group column across a sheet switch", () => {
    const { core, host } = makeGrid({
      sheets: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      onChange: () => {},
    });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groupCol = () => core.getColumnModel().getAutoGroupColumns()[0];
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: groupCol().instanceID, dir: "desc" }] });

    // Leaving captures sheet A by colId; returning replays it. The auto-group column is internal,
    // so only its colId is in the capture — it must still resolve on the way back.
    tabs(host)[1].click();
    tabs(host)[0].click();
    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["region"]);
    expect(core.getSortModel().items.map(item => [item.col.colId, item.dir]))
      .toEqual([["__pte_group__", "desc"]]);
    expect(core.getSortModel().items[0].col).toBe(groupCol());
  });

  it("makes a new pivot sheet exit to the roles of the sheet + was pressed on", () => {
    const changes: GridSheet[][] = [];
    const { core, host } = makeGrid({ onChange: next => changes.push(next) });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    host.querySelector<HTMLButtonElement>(".pte-sheet-add")!.click();
    expect(core.getPivotMode()).toBe(true);
    expect(core.getRowGroupColumns()).toEqual([]);
    expect(changes.at(-1)![1].state?.prePivotState?.rowGroupColumns).toEqual(["region"]);

    // Turning pivot mode off on the new sheet lands back on the Data sheet's grouping.
    core.dispatch({ type: "pivotModeSet", on: false });
    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["region"]);
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

  it("replaces the tab with the input while renaming instead of nesting them", () => {
    const { host, renderer } = makeGrid({});
    tabs(host)[0].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = host.querySelector<HTMLInputElement>(".pte-sheet-rename-input")!;

    // A control inside a control is invalid HTML: browsers may route the click and the focus to
    // the outer button, which can leave the rename stuck open.
    expect(input.closest("button")).toBeNull();
    expect(input.parentElement!.getAttribute("role")).toBe("tablist");
    expect(tabs(host)).toHaveLength(0);
    // The input stands in for the tab, id included — the grid root labels itself by that id, so it
    // has to keep resolving to something rendered.
    expect(host.querySelector(`[id="${renderer.getActiveTabElementId()}"]`)).toBe(input);

    input.value = "Orders";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(tabNames(host)).toEqual(["Orders"]);
    expect(activeTab(host)!.id).toBe(renderer.getActiveTabElementId());
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

    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Duplicate")!.click();
    expect(tabNames(host)).toEqual(["Data", "Pivot 1", "Pivot 1 (copy)"]);

    tabs(host)[2].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Delete")!.click();
    expect(tabNames(host)).toEqual(["Data", "Pivot 1"]);
  });

  it("colors a tab from the Change color submenu and reports it", () => {
    const changes: GridSheet[][] = [];
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data" }, { id: "p1", name: "Pivot 1" }],
      onChange: next => changes.push(next),
    });

    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    menuItem("Blue")!.click();

    expect(changes.at(-1)!.map(sheet => sheet.color)).toEqual([undefined, "#3b82f6"]);
    // The class arms the tint; the raw colour rides a custom property the stylesheet meters out.
    const tab = tabs(host)[1];
    expect(tab.classList.contains("pte-sheet-tab-colored")).toBe(true);
    expect(tab.style.getPropertyValue("--pte-sheet-tab-color")).toBe("#3b82f6");
    // Colour is metadata, not view state: colouring a sheet never switches to it.
    expect(activeTab(host)!.textContent).toBe("Data");
  });

  it("checks the current color and clears it with None", () => {
    const changes: GridSheet[][] = [];
    const { host } = makeGrid({
      // Cased differently from the palette entry: the list round-trips through app storage.
      sheets: [{ id: "data", name: "Data", color: "#3B82F6" }],
      onChange: next => changes.push(next),
    });
    expect(tabs(host)[0].classList.contains("pte-sheet-tab-colored")).toBe(true);

    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    expect(menuItem("Blue")!.querySelector(".icon-check")).not.toBeNull();
    expect(menuItem("None")!.querySelector(".icon-check")).toBeNull();
    menuItem("None")!.click();

    // Deleted, not set to undefined: an explicit undefined does not survive a JSON round-trip.
    expect("color" in changes.at(-1)![0]).toBe(false);
    expect(tabs(host)[0].classList.contains("pte-sheet-tab-colored")).toBe(false);
  });

  it("offers an application-supplied palette in place of the built-in one", () => {
    const changes: GridSheet[][] = [];
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data" }],
      colors: [{ name: "Brand", color: "#123456" }, { color: "#654321" }],
      onChange: next => changes.push(next),
    });

    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    // The supplied list replaces the built-ins wholesale, and an unnamed entry labels itself.
    expect(menuItem("Blue")).toBeUndefined();
    expect(menuItem("#654321")).toBeDefined();
    menuItem("Brand")!.click();

    expect(changes.at(-1)![0].color).toBe("#123456");
    expect(tabs(host)[0].style.getPropertyValue("--pte-sheet-tab-color")).toBe("#123456");
  });

  it("asks a function palette per sheet, on every open", () => {
    const asked: string[] = [];
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data" }, { id: "p1", name: "Pivot 1" }],
      colors: sheet => {
        asked.push(sheet.id);
        // The second sheet opts out of colours entirely; the first gets a one-entry palette.
        return sheet.id === "data" ? [{ name: "Only", color: "#0f766e" }] : [];
      },
    });

    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    expect(menuItem("Only")).toBeDefined();

    // Same strip, different sheet, different answer — including no menu item at all.
    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menuItem("Change color")).toBeUndefined();
    // Consulted per open (never cached), so the answer can follow live application state.
    expect(asked).toEqual(["data", "p1"]);
  });

  it("drops Change color entirely for an empty palette, colors already set still paint", () => {
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data", color: "#ef4444" }],
      colors: [],
    });

    // Opting out of the menu is not opting out of the colour: a sheet that carries one keeps it.
    expect(tabs(host)[0].classList.contains("pte-sheet-tab-colored")).toBe(true);
    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menuItem("Change color")).toBeUndefined();
    expect(menuItem("Rename")).toBeDefined();
  });

  it("opens the platform picker for Custom and commits what it confirms", () => {
    const changes: GridSheet[][] = [];
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data" }],
      customColor: true,
      onChange: next => changes.push(next),
    });

    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    menuItem("Custom")!.click();

    const input = host.querySelector<HTMLInputElement>(".pte-sheet-color-input")!;
    // Parked on the tab: Chromium anchors the picker popup to this box, so an unplaced control
    // opens the picker in the corner of the grid instead of under the tab.
    const rect = tabs(host)[0].getBoundingClientRect();
    expect([input.style.left, input.style.top]).toEqual([`${rect.left}px`, `${rect.top}px`]);
    expect([input.style.width, input.style.height]).toEqual([`${rect.width}px`, `${rect.height}px`]);
    // Out of the tab order and the accessibility tree: the menu item is the real control.
    expect(input.type).toBe("color");
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute("aria-hidden")).toBe("true");
    // A picker that is dismissed fires nothing, so nothing is committed.
    expect(changes).toHaveLength(0);

    input.value = "#123456";
    input.dispatchEvent(new Event("change"));
    expect(changes.at(-1)![0].color).toBe("#123456");
    expect(tabs(host)[0].style.getPropertyValue("--pte-sheet-tab-color")).toBe("#123456");
  });

  it("marks Custom as the current color when the palette does not offer it", () => {
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data", color: "#123456" }],
      colors: [{ name: "Blue", color: "#3b82f6" }],
      customColor: true,
    });

    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    expect(menuItem("Custom")!.querySelector(".icon-check")).not.toBeNull();
    expect(menuItem("None")!.querySelector(".icon-check")).toBeNull();
    expect(menuItem("Blue")!.querySelector(".icon-check")).toBeNull();
  });

  it("offers the picker alone when the palette is empty, per sheet", () => {
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data" }, { id: "p1", name: "Pivot 1" }],
      colors: [],
      customColor: sheet => sheet.id === "data",
    });

    tabs(host)[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Change color")!.click();
    expect(menuItem("Custom")).toBeDefined();
    // "None", its divider, "Custom…" — the palette/picker divider has no two groups to separate.
    expect(document.querySelectorAll(".pte-submenu .pte-menu-separator")).toHaveLength(1);

    // The other sheet asked for neither a palette nor a picker: no entry at all.
    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menuItem("Change color")).toBeUndefined();
  });

  it("carries a tab color into a duplicate", () => {
    const { host } = makeGrid({
      sheets: [{ id: "data", name: "Data" }, { id: "p1", name: "Pivot 1", color: "#ef4444" }],
    });

    tabs(host)[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menuItem("Duplicate")!.click();

    expect(tabNames(host)).toEqual(["Data", "Pivot 1", "Pivot 1 (copy)"]);
    expect(tabs(host)[2].style.getPropertyValue("--pte-sheet-tab-color")).toBe("#ef4444");
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
