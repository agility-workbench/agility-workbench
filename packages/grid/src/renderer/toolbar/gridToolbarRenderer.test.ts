// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { MenuRenderer } from "../menuRenderer";
import { GridToolbarRenderer } from "./gridToolbarRenderer";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeCore() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData([
    { id: "1", name: "A", region: "East", country: "India", year: 2025 },
    { id: "2", name: "B", region: "West", country: "USA", year: 2026 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name" },
    { colId: "region", key: "region", label: "Region" },
    { colId: "country", key: "country", label: "Country" },
    { colId: "year", key: "year", label: "Year", sortingOrder: ["desc", "asc", null] },
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getLeaves().find(col => col.key === key)!.instanceID;
}

describe("GridToolbarRenderer", () => {
  it("mounts only for opted-in sections and reconciles them live", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      root,
      menuRenderer: new MenuRenderer(root),
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });

    expect(root.querySelector(".pte-grid-toolbar")).toBeNull();

    toolbar.setOptions({ grouping: true });
    expect(root.querySelector(".pte-grid-toolbar-group-section")).not.toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-sort-section")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-export-button")).toBeNull();
    expect(
      root.querySelector<HTMLElement>(".pte-grid-toolbar-left")!.style.gridTemplateColumns,
    ).toContain("repeat(1");

    toolbar.setOptions({ sorting: true, export: true });
    expect(root.querySelector(".pte-grid-toolbar-group-section")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-sort-section")).not.toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-export-button")).not.toBeNull();

    toolbar.setOptions(undefined);
    expect(root.querySelector(".pte-grid-toolbar")).toBeNull();

    const columns = document.createElement("button");
    columns.textContent = "Columns";
    toolbar.mountColumnTrigger(columns);
    expect(root.querySelector(".pte-grid-toolbar")).not.toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-right")?.lastElementChild).toBe(columns);

    toolbar.setOptions({ export: true });
    expect(root.querySelector(".pte-grid-toolbar-export-button")).not.toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-right")?.lastElementChild).toBe(columns);

    toolbar.setOptions(undefined);
    expect(root.querySelector(".pte-grid-toolbar")).not.toBeNull();
    toolbar.unmountColumnTrigger();
    expect(root.querySelector(".pte-grid-toolbar")).toBeNull();

    toolbar.destroy();
    root.remove();
  });

  it("offers explicit selection and entire-table scopes while keeping Columns rightmost", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menuRenderer = new MenuRenderer(root);
    const exportCSV = vi.fn();
    const exportExcel = vi.fn();
    const toolbar = new GridToolbarRenderer({
      core,
      root,
      menuRenderer,
      options: { grouping: true, sorting: true, export: true },
      exportCSV,
      exportExcel,
    });
    const columns = document.createElement("button");
    columns.textContent = "Columns";
    toolbar.mountColumnTrigger(columns);

    const right = root.querySelector(".pte-grid-toolbar-right")!;
    expect(right.lastElementChild).toBe(columns);
    const exportButton = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-export-button")!;
    exportButton.click();
    expect(root.querySelector(
      '.pte-menu-item[data-item-id="toolbarExportSelection"]',
    )).toBeNull();
    expect(root.querySelector(
      '.pte-menu-item[data-item-id="toolbarExportAll"]',
    )).toBeNull();
    expect(root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAllCSV"]',
    )?.textContent).toContain("Table as CSV");
    expect(root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAllExcel"]',
    )?.textContent).toContain("Table as Excel");
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAllCSV"]',
    )!.click();
    expect(exportCSV).toHaveBeenCalledWith({ scope: "all" });

    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    exportButton.click();
    const selection = root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportSelection"]',
    )!;
    expect(selection).not.toBeNull();
    selection.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-submenu .pte-menu-item[data-item-id="toolbarExportSelectionCSV"]',
    )!.click();
    expect(exportCSV).toHaveBeenCalledWith({ scope: "selection" });

    exportButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAll"]',
    )!.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-submenu .pte-menu-item[data-item-id="toolbarExportAllExcel"]',
    )!.click();
    expect(exportExcel).toHaveBeenCalledWith({ scope: "all" });

    toolbar.destroy();
    root.remove();
  });

  it("opens group and sort pickers at the pressed point in their trailing targets", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menuRenderer = new MenuRenderer(root);
    const openMenu = vi.spyOn(menuRenderer, "open").mockImplementation(() => {});
    const toolbar = new GridToolbarRenderer({
      core,
      root,
      menuRenderer,
      options: { grouping: true, sorting: true, export: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    toolbar.mountColumnTrigger(document.createElement("button"));

    const groupTarget = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-group-add",
    )!;
    vi.spyOn(groupTarget, "getBoundingClientRect").mockReturnValue({
      left: 20,
      right: 200,
      top: 0,
      bottom: 42,
      width: 180,
      height: 42,
      x: 20,
      y: 0,
      toJSON: () => ({}),
    });
    groupTarget.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: 143,
      detail: 1,
    }));
    expect(openMenu).toHaveBeenLastCalledWith(expect.objectContaining({
      clientX: 143,
      clientY: 42,
      position: "bottom-left",
    }));

    const sortTarget = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-sort-add",
    )!;
    vi.spyOn(sortTarget, "getBoundingClientRect").mockReturnValue({
      left: 220,
      right: 400,
      top: 0,
      bottom: 42,
      width: 180,
      height: 42,
      x: 220,
      y: 0,
      toJSON: () => ({}),
    });
    sortTarget.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: 347,
      detail: 1,
    }));
    expect(openMenu).toHaveBeenLastCalledWith(expect.objectContaining({
      clientX: 347,
      clientY: 42,
      position: "bottom-left",
    }));

    toolbar.destroy();
    root.remove();
  });

  it("renders active row groups and reuses rowGroupSet for removal and reordering", () => {
    const core = makeCore();
    const region = colId(core, "region");
    const country = colId(core, "country");
    const year = colId(core, "year");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      root,
      menuRenderer: new MenuRenderer(root),
      options: { grouping: true, sorting: true, export: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    toolbar.mountColumnTrigger(document.createElement("button"));

    expect(root.querySelector(".pte-grid-toolbar-group-label")).toBeNull();
    const addGroup = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!;
    expect(addGroup.disabled).toBe(false);
    addGroup.click();
    const regionItem = root.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarGroupAdd-${region}"]`,
    )!;
    expect(regionItem.textContent).toContain("Region");
    regionItem.click();
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([region]);

    core.dispatch({ type: "rowGroupSet", colIds: [region, country, year] });

    const chipLabels = () => Array.from(
      root.querySelectorAll(".pte-grid-toolbar-group-chip-label"),
      chip => chip.textContent,
    );
    expect(chipLabels()).toEqual(["Region", "Country", "Year"]);

    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${country}"] .pte-grid-toolbar-group-remove`,
    )!.click();
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([region, year]);
    expect(chipLabels()).toEqual(["Region", "Year"]);

    core.dispatch({ type: "rowGroupSet", colIds: [region, country, year] });
    root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${region}"]`,
    )!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([country, region, year]);
    expect(chipLabels()).toEqual(["Country", "Region", "Year"]);

    const dropZone = root.querySelector<HTMLElement>(".pte-grid-toolbar-group-dropzone")!;
    const internalChips = Array.from(
      dropZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"),
    );
    internalChips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    const yearChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${year}"]`,
    )!;
    const countryChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${country}"]`,
    )!;
    yearChip.dispatchEvent(new Event("dragstart", { bubbles: true }));
    countryChip.dispatchEvent(new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(countryChip.classList.contains("drop-before")).toBe(true);
    expect(
      dropZone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")?.style.left,
    ).toBe("0px");
    countryChip.dispatchEvent(new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([year, country, region]);
    expect(chipLabels()).toEqual(["Year", "Country", "Region"]);
    expect(dropZone.querySelector(".pte-grid-toolbar-group-drop-indicator")).toBeNull();

    const dragData = {
      dropEffect: "none",
      getData: (type: string) => type === "text/plain" ? "name" : "",
    };
    const chips = Array.from(
      dropZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"),
    );
    chips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    const dragOver = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
    });
    Object.defineProperty(dragOver, "dataTransfer", { value: dragData });
    dropZone.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    expect(dropZone.classList.contains("drag-over")).toBe(true);
    expect(chips[1].classList.contains("drop-before")).toBe(true);
    expect(
      dropZone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")?.style.left,
    ).toBe("100px");
    const drop = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
    });
    Object.defineProperty(drop, "dataTransfer", { value: dragData });
    dropZone.dispatchEvent(drop);
    expect(core.getRowGroupColumns().map(col => col.key))
      .toEqual(["year", "name", "country", "region"]);
    expect(dropZone.classList.contains("drag-over")).toBe(false);
    expect(dropZone.querySelector(".pte-grid-toolbar-group-drop-indicator")).toBeNull();

    const clearGrouping = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-group-clear",
    )!;
    expect(clearGrouping.getAttribute("aria-label")).toBe("Clear row grouping");
    expect(clearGrouping.hasAttribute("title")).toBe(false);
    clearGrouping.click();
    expect(core.getRowGroupColumns()).toEqual([]);
    expect(root.querySelector(".pte-grid-toolbar-group-chip")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-group-clear")).toBeNull();

    toolbar.destroy();
    root.remove();
  });

  it("manages ordered multi-column sorting through the shared sort model", () => {
    const core = makeCore();
    const region = colId(core, "region");
    const country = colId(core, "country");
    const year = colId(core, "year");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      root,
      menuRenderer: new MenuRenderer(root),
      options: { grouping: true, sorting: true, export: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    toolbar.mountColumnTrigger(document.createElement("button"));

    expect(root.querySelector(".pte-grid-toolbar-sort-label")).toBeNull();
    const addSort = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!;
    addSort.click();
    root.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${region}"]`,
    )!.click();
    expect(core.getSortModel().items.map(item => ({
      id: item.col.instanceID,
      dir: item.dir,
    }))).toEqual([{ id: region, dir: "asc" }]);

    core.dispatch({
      type: "headerAction",
      action: "toggleSort",
      colId: country,
      additive: true,
    });
    const chipLabels = () => Array.from(
      root.querySelectorAll(".pte-grid-toolbar-sort-chip-label"),
      chip => chip.textContent,
    );
    expect(chipLabels()).toEqual(["Region", "Country"]);

    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${region}"] .pte-grid-toolbar-sort-direction`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.dir)).toEqual(["desc", "asc"]);
    expect(root.querySelector(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${region}"] .icon-desc`,
    )).not.toBeNull();

    const countryChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${country}"]`,
    )!;
    countryChip.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
    }));
    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([country, region]);
    expect(chipLabels()).toEqual(["Country", "Region"]);

    core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: year, dir: "asc" }],
    });
    expect(chipLabels()).toEqual(["Country", "Region", "Year"]);

    const sortSection = root.querySelector<HTMLElement>(".pte-grid-toolbar-sort-section")!;
    const chips = Array.from(
      sortSection.querySelectorAll<HTMLElement>(".pte-grid-toolbar-sort-chip"),
    );
    chips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    const yearChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${year}"]`,
    )!;
    yearChip.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const groupDragOver = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    });
    root.querySelector<HTMLElement>(".pte-grid-toolbar-group-section")!
      .dispatchEvent(groupDragOver);
    expect(groupDragOver.defaultPrevented).toBe(false);
    expect(root.querySelector(".pte-grid-toolbar-group-section.drag-over")).toBeNull();

    chips[0].dispatchEvent(new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(chips[0].classList.contains("drop-before")).toBe(true);
    expect(
      sortSection.querySelector<HTMLElement>(".pte-grid-toolbar-sort-drop-indicator")?.style.left,
    ).toBe("0px");
    chips[0].dispatchEvent(new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([year, country, region]);
    expect(chipLabels()).toEqual(["Year", "Country", "Region"]);
    expect(sortSection.querySelector(".pte-grid-toolbar-sort-drop-indicator")).toBeNull();

    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${country}"] .pte-grid-toolbar-sort-remove`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.col.instanceID)).toEqual([year, region]);

    const sortTarget = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!;
    expect(sortTarget.textContent).toBe("Add sort");
    expect(sortTarget.disabled).toBe(false);
    const clearSorting = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-sort-clear",
    )!;
    expect(clearSorting.getAttribute("aria-label")).toBe("Clear all sorting");
    expect(clearSorting.hasAttribute("title")).toBe(false);
    clearSorting.click();
    expect(core.getSortModel().items).toEqual([]);
    expect(root.querySelector(".pte-grid-toolbar-sort-chip")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-sort-clear")).toBeNull();

    root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
    root.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${year}"]`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.dir)).toEqual(["desc"]);
    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${year}"] .pte-grid-toolbar-sort-direction`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.dir)).toEqual(["asc"]);

    core.dispatch({
      type: "sortModelSet",
      sortItems: [
        { key: region, dir: "asc" },
        { key: country, dir: "asc" },
        { key: colId(core, "name"), dir: "asc" },
      ],
    });
    const allColumnsSortedTarget = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-sort-add",
    )!;
    expect(allColumnsSortedTarget.disabled).toBe(true);
    expect(root.querySelector(".pte-grid-toolbar-sort-clear")).not.toBeNull();

    toolbar.destroy();
    root.remove();
  });
});
