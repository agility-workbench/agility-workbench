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
  core.setRowData([{ id: "1", name: "A" }, { id: "2", name: "B" }]);
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
  return core;
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
});
