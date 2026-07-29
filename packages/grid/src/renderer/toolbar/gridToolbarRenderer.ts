import { GridCore } from "../../core/core";
import { Unsubscribe } from "../../events/events";
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
  private draggedGroupColId: string | null = null;
  private unsubscribe: Unsubscribe;

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
    this.bindExternalColumnDrop();
    this.toolbar.append(this.left, this.right);
    this.unsubscribe = this.params.core.on("columnsChanged", event => {
      if (event.reason === "group" || event.reason === "defs") this.renderGroupChips();
    });
    this.renderGroupChips();
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
    this.unsubscribe();
    this.unmount();
  }

  private renderGroupChips(): void {
    this.left.replaceChildren();
    const groups = this.params.core.getRowGroupColumns();
    if (groups.length > 0) {
      const label = span("pte-grid-toolbar-group-label", "Grouped by");
      const list = div("pte-grid-toolbar-group-list");
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", "Row grouping order");

      groups.forEach((col, index) => {
        const chip = div("pte-grid-toolbar-group-chip");
        chip.dataset.groupColId = col.instanceID;
        chip.draggable = true;
        chip.tabIndex = 0;
        chip.setAttribute("role", "listitem");
        chip.setAttribute(
          "aria-label",
          `${col.label}, grouping level ${index + 1} of ${groups.length}. Use Left and Right arrows to reorder.`,
        );

        const handle = span("pte-grid-toolbar-group-drag", "⠿");
        handle.setAttribute("aria-hidden", "true");
        const chipLabel = span("pte-grid-toolbar-group-chip-label", col.label);
        const remove = button("pte-grid-toolbar-group-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${col.label} from row grouping`);
        remove.addEventListener("click", event => {
          event.stopPropagation();
          this.removeGroup(col.instanceID);
        });

        chip.addEventListener("keydown", event => {
          if (event.target !== chip) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            this.moveGroup(col.instanceID, event.key === "ArrowLeft" ? -1 : 1);
          }
        });
        chip.addEventListener("dragstart", event => {
          this.draggedGroupColId = col.instanceID;
          chip.classList.add("dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", col.instanceID);
          }
        });
        chip.addEventListener("dragend", () => {
          this.draggedGroupColId = null;
          chip.classList.remove("dragging");
        });
        chip.addEventListener("dragover", event => {
          if (!this.draggedGroupColId || this.draggedGroupColId === col.instanceID) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        });
        chip.addEventListener("drop", event => {
          event.preventDefault();
          const dragged = this.draggedGroupColId;
          this.draggedGroupColId = null;
          if (dragged) this.moveGroupTo(dragged, col.instanceID);
        });

        chip.append(handle, chipLabel, remove);
        list.appendChild(chip);
      });

      this.left.append(label, list);
    }

    const addGroup = button("pte-grid-toolbar-group-add", "Add group");
    addGroup.type = "button";
    addGroup.setAttribute("aria-haspopup", "menu");
    addGroup.disabled = this.availableGroupColumns().length === 0;
    addGroup.addEventListener("click", () => this.openAddGroupMenu(addGroup));
    this.left.appendChild(addGroup);
  }

  private bindExternalColumnDrop(): void {
    this.left.classList.add("pte-grid-toolbar-group-dropzone");
    this.left.addEventListener("dragover", event => {
      if (this.availableGroupColumns().length === 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.left.classList.add("drag-over");
    });
    this.left.addEventListener("dragleave", event => {
      const next = event.relatedTarget as Node | null;
      if (!next || !this.left.contains(next)) this.left.classList.remove("drag-over");
    });
    this.left.addEventListener("drop", event => {
      event.preventDefault();
      this.left.classList.remove("drag-over");
      const colId = event.dataTransfer?.getData("text/plain");
      if (colId) this.addGroupColumn(colId);
    });
  }

  private availableGroupColumns() {
    if (this.params.core.getRowModel().getType() !== "clientSide") return [];
    const grouped = new Set(this.params.core.getRowGroupColumns().map(col => col.instanceID));
    return this.params.core.getColumnModel().getLeaves().filter(
      col => col.groupable && !col.isInternal() && !grouped.has(col.instanceID),
    );
  }

  private openAddGroupMenu(anchor: HTMLButtonElement): void {
    const items: MenuItem[] = this.availableGroupColumns().map(col => ({
      id: `toolbarGroupAdd-${col.instanceID}`,
      label: col.label,
      command: "toolbar.group.add",
      payload: { colId: col.instanceID },
    }));
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: anchor,
      clientX: rect.left,
      clientY: rect.bottom,
      items,
      position: "bottom-left",
      onItemClick: item => this.addGroupColumn(item.payload.colId),
    });
  }

  private addGroupColumn(colId: string): void {
    const model = this.params.core.getColumnModel();
    const col = model.getById(colId) ?? model.getByColId(colId);
    if (!col || !col.groupable || col.isInternal()) return;
    const colIds = this.params.core.getRowGroupColumns().map(group => group.instanceID);
    if (colIds.includes(col.instanceID)) return;
    this.params.core.dispatch({ type: "rowGroupSet", colIds: [...colIds, col.instanceID] });
  }

  private removeGroup(colId: string): void {
    const colIds = this.params.core.getRowGroupColumns()
      .map(col => col.instanceID)
      .filter(id => id !== colId);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
  }

  private moveGroup(colId: string, offset: -1 | 1): void {
    const colIds = this.params.core.getRowGroupColumns().map(col => col.instanceID);
    const from = colIds.indexOf(colId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= colIds.length) return;
    [colIds[from], colIds[to]] = [colIds[to], colIds[from]];
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
    this.focusGroupChip(colId);
  }

  private moveGroupTo(colId: string, targetColId: string): void {
    if (colId === targetColId) return;
    const colIds = this.params.core.getRowGroupColumns().map(col => col.instanceID);
    const from = colIds.indexOf(colId);
    const to = colIds.indexOf(targetColId);
    if (from < 0 || to < 0) return;
    const [moved] = colIds.splice(from, 1);
    colIds.splice(to, 0, moved);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
    this.focusGroupChip(colId);
  }

  private focusGroupChip(colId: string): void {
    const chip = Array.from(this.left.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"))
      .find(item => item.dataset.groupColId === colId);
    chip?.focus();
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
