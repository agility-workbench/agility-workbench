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
    { colId: "year", key: "year", label: "Year" },
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getLeaves().find(col => col.key === key)!.instanceID;
}

describe("GridToolbarRenderer", () => {
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

    toolbar.destroy();
    root.remove();
  });
});
