import { GridCore } from "../../core/core";
import { ExportOptions } from "../../export/export";
import { MenuItem } from "../../interfaces/menuItem";
import { button, div, span } from "../element";
import { MenuRenderer } from "../menuRenderer";

interface GridToolbarRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  menuRenderer: MenuRenderer;
  exportCSV: (options: ExportOptions) => void;
  exportExcel: (options: ExportOptions) => void;
}

/**
 * Shared grid toolbar chrome. Controls translate toolbar intent into existing renderer/core
 * operations; export construction and download behavior remain owned by ExportRenderer.
 */
export class GridToolbarRenderer {
  private toolbar = div("pte-grid-toolbar");
  private left = div("pte-grid-toolbar-left");
  private right = div("pte-grid-toolbar-right");
  private exportButton = button("pte-grid-toolbar-export-button");

  constructor(private params: GridToolbarRendererParams) {
    this.exportButton.type = "button";
    this.exportButton.setAttribute("aria-label", "Export table");
    this.exportButton.setAttribute("aria-haspopup", "menu");
    const options = this.params.core.getOptions();
    this.exportButton.disabled = !options.allowExportAsCSV && !options.allowExportAsExcel;
    const icon = span("pte-grid-toolbar-export-icon icon-export");
    icon.setAttribute("aria-hidden", "true");
    this.exportButton.append(icon, span("pte-grid-toolbar-export-label", "Export"));
    this.exportButton.addEventListener("click", () => this.openExportMenu());
    this.toolbar.append(this.left, this.right);
  }

  mountColumnTrigger(trigger: HTMLButtonElement): void {
    if (!this.toolbar.isConnected) {
      this.params.root.insertBefore(this.toolbar, this.params.root.firstChild);
    }
    this.right.replaceChildren(this.exportButton, trigger);
  }

  unmount(): void {
    this.params.menuRenderer.close(0);
    this.toolbar.remove();
  }

  destroy(): void {
    this.unmount();
  }

  private openExportMenu(): void {
    const selection = this.params.core.getSelectionSnapshot();
    const hasSelection = selection.kind !== "none";
    const selectionScope: ExportOptions["scope"] =
      selection.kind === "column" ? "selectedColumns" : "selection";
    const items: MenuItem[] = hasSelection
      ? [
          {
            id: "toolbarExportSelection",
            label: "Selection",
            subMenu: this.formatItems("Selection", selectionScope),
          },
          {
            id: "toolbarExportAll",
            label: "Entire table",
            subMenu: this.formatItems("All", "all"),
          },
        ]
      : this.formatItems("All", "all", "Table as ");
    const rect = this.exportButton.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: this.exportButton,
      clientX: rect.right,
      clientY: rect.bottom,
      items,
      position: "bottom-right",
      onItemClick: item => this.executeExport(item),
    });
  }

  private formatItems(
    prefix: "Selection" | "All",
    scope: ExportOptions["scope"],
    labelPrefix = "",
  ): MenuItem[] {
    const options = this.params.core.getOptions();
    const items: MenuItem[] = [];
    if (options.allowExportAsCSV) {
      items.push({
        id: `toolbarExport${prefix}CSV`,
        label: `${labelPrefix}CSV`,
        command: "toolbar.export.csv",
        payload: { scope },
      });
    }
    if (options.allowExportAsExcel) {
      items.push({
        id: `toolbarExport${prefix}Excel`,
        label: `${labelPrefix}Excel`,
        command: "toolbar.export.excel",
        payload: { scope },
      });
    }
    return items;
  }

  private executeExport(item: MenuItem): void {
    const options: ExportOptions = { scope: item.payload?.scope };
    if (item.command === "toolbar.export.csv") {
      this.params.exportCSV(options);
    } else if (item.command === "toolbar.export.excel") {
      this.params.exportExcel(options);
    }
  }
}
