import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { Unsubscribe } from "../../events/events";
import { ExportOptions } from "../../export/export";
import {
  GridToolbarOptions,
  ResolvedGridToolbarOptions,
  resolveGridToolbarOptions,
} from "../../interfaces/gridOptions";
import { MenuItem } from "../../interfaces/menuItem";
import { SortDir } from "../../interfaces/sort";
import { button, div, span } from "../element";
import { MenuRenderer } from "../menuRenderer";
import { registerRendererTooltipTarget } from "../tooltip/rendererTooltipTarget";
import {
  clearGroupDropPosition,
  resolveGroupDropIndex,
  showGroupDropPosition,
} from "./groupDropPosition";
import {
  applyOrderedSortItems,
  getOrderedSortItems,
  getSortDirections,
  insertSortColumn,
} from "./sortModelOperations";

interface GridToolbarRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  menuRenderer: MenuRenderer;
  options?: GridToolbarOptions;
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
  private groupSection = div("pte-grid-toolbar-group-section");
  private sortSection = div("pte-grid-toolbar-sort-section");
  private right = div("pte-grid-toolbar-right");
  private quickFilterHost = div("pte-grid-toolbar-quick-filter");
  private exportButton = button("pte-grid-toolbar-export-button");
  private moreButton = button("pte-grid-toolbar-more-button");
  private draggedGroupColId: string | null = null;
  private draggedSortColId: string | null = null;
  private groupChipTooltipDisposers: Array<() => void> = [];
  private sortChipTooltipDisposers: Array<() => void> = [];
  private exportTooltipDisposer: (() => void) | null = null;
  private moreTooltipDisposer: (() => void) | null = null;
  private options: ResolvedGridToolbarOptions = resolveGridToolbarOptions(undefined);
  private columnTrigger: HTMLButtonElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private availableWidth: number | null = null;
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
    this.exportTooltipDisposer = registerRendererTooltipTarget(
      this.exportButton,
      () => this.toolbar.classList.contains("pte-grid-toolbar-compact") ? "Export" : null,
      undefined,
      "left",
    );

    this.moreButton.type = "button";
    this.moreButton.setAttribute("aria-label", "More toolbar actions");
    this.moreButton.setAttribute("aria-haspopup", "menu");
    const moreIcon = span("pte-grid-toolbar-more-icon pte-menu-icon");
    moreIcon.setAttribute("aria-hidden", "true");
    this.moreButton.appendChild(moreIcon);
    this.moreButton.addEventListener("click", () => this.openMoreMenu());
    this.moreTooltipDisposer = registerRendererTooltipTarget(
      this.moreButton,
      () => "More actions",
      undefined,
      "left",
    );

    this.bindExternalColumnDrop();
    this.bindSortChipDrop();
    this.toolbar.append(this.left, this.right);
    this.bindResponsiveLayout();
    this.unsubscribe = this.params.core.on("columnsChanged", event => {
      if (event.reason === "group" || event.reason === "defs") this.renderGroupChips();
      if (event.reason === "sort" || event.reason === "defs") this.renderSortChips();
    });
    this.renderGroupChips();
    this.renderSortChips();
    this.setOptions(this.params.options);
  }

  setOptions(options: GridToolbarOptions | undefined): void {
    this.options = resolveGridToolbarOptions(options);
    this.syncSections();
  }

  mountColumnTrigger(trigger: HTMLButtonElement): void {
    this.columnTrigger = trigger;
    this.syncSections();
  }

  unmountColumnTrigger(): void {
    this.columnTrigger?.remove();
    this.columnTrigger = null;
    this.syncSections();
  }

  getQuickFilterHost(): HTMLDivElement {
    return this.quickFilterHost;
  }

  private unmount(): void {
    this.params.menuRenderer.close(0);
    this.toolbar.remove();
  }

  destroy(): void {
    this.unsubscribe();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.exportTooltipDisposer?.();
    this.exportTooltipDisposer = null;
    this.moreTooltipDisposer?.();
    this.moreTooltipDisposer = null;
    this.disposeGroupChipTooltips();
    this.disposeSortChipTooltips();
    this.columnTrigger = null;
    this.unmount();
  }

  private syncSections(): void {
    this.params.menuRenderer.close(0);
    const leftSections: HTMLElement[] = [];
    if (this.options.grouping) leftSections.push(this.groupSection);
    if (this.options.sorting) leftSections.push(this.sortSection);
    this.left.replaceChildren(...leftSections);
    this.left.style.gridTemplateColumns = leftSections.length > 0
      ? `repeat(${leftSections.length}, minmax(0, 1fr))`
      : "";

    const rightSections: HTMLElement[] = [];
    if (this.options.quickFilter) rightSections.push(this.quickFilterHost);
    if (this.options.export) rightSections.push(this.exportButton);
    if (this.options.export || this.columnTrigger) rightSections.push(this.moreButton);
    if (this.columnTrigger) rightSections.push(this.columnTrigger);
    this.right.replaceChildren(...rightSections);
    if (this.availableWidth != null) this.applyResponsiveWidth(this.availableWidth);

    const visible = leftSections.length > 0 || rightSections.length > 0;
    if (visible && !this.toolbar.isConnected) {
      this.params.root.insertBefore(this.toolbar, this.params.root.firstChild);
    } else if (!visible) {
      this.toolbar.remove();
    }
  }

  private bindResponsiveLayout(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? this.toolbar.getBoundingClientRect().width;
      if (width <= 0) return;
      this.availableWidth = width;
      this.applyResponsiveWidth(width);
    });
    this.resizeObserver.observe(this.toolbar);
  }

  private applyResponsiveWidth(width: number): void {
    const compact = width < 760;
    const overflow = width < 520 && (this.options.export || this.columnTrigger != null);
    const changed =
      this.toolbar.classList.contains("pte-grid-toolbar-compact") !== compact ||
      this.toolbar.classList.contains("pte-grid-toolbar-overflow") !== overflow;
    this.toolbar.classList.toggle("pte-grid-toolbar-compact", compact);
    this.toolbar.classList.toggle("pte-grid-toolbar-overflow", overflow);
    if (changed) this.params.menuRenderer.close(0);
  }

  private renderGroupChips(): void {
    this.disposeGroupChipTooltips();
    this.groupSection.replaceChildren();
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
        this.groupChipTooltipDisposers.push(registerRendererTooltipTarget(
          chip,
          () => chipLabel.scrollWidth > chipLabel.clientWidth ? col.label : null,
        ));
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
          this.groupSection.classList.remove("drag-over");
          clearGroupDropPosition(this.groupSection);
        });

        chip.append(handle, chipLabel, remove);
        list.appendChild(chip);
      });

      this.groupSection.append(label, list);
    }

    const addGroup = button("pte-grid-toolbar-group-add", "Add group");
    addGroup.type = "button";
    addGroup.setAttribute("aria-haspopup", "menu");
    addGroup.disabled = this.availableGroupColumns().length === 0;
    addGroup.addEventListener("click", event => {
      this.openAddGroupMenu(addGroup, event.detail === 0 ? undefined : event.clientX);
    });
    this.groupSection.appendChild(addGroup);

    if (groups.length > 0) {
      const clear = button("pte-grid-toolbar-group-clear", "×");
      clear.type = "button";
      clear.setAttribute("aria-label", "Clear row grouping");
      clear.addEventListener("click", () => {
        this.params.core.dispatch({ type: "rowGroupSet", colIds: [] });
      });
      this.groupChipTooltipDisposers.push(registerRendererTooltipTarget(
        clear,
        () => "Clear grouping",
      ));
      this.groupSection.appendChild(clear);
    }
  }

  private bindExternalColumnDrop(): void {
    this.groupSection.classList.add("pte-grid-toolbar-group-dropzone");
    this.groupSection.addEventListener("dragover", event => {
      if (this.draggedSortColId) return;
      if (!this.draggedGroupColId && this.availableGroupColumns().length === 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.groupSection.classList.add("drag-over");
      showGroupDropPosition(
        this.groupSection,
        resolveGroupDropIndex(this.groupSection, event.clientX),
      );
    });
    this.groupSection.addEventListener("dragleave", event => {
      const next = event.relatedTarget as Node | null;
      if (!next || !this.groupSection.contains(next)) {
        this.groupSection.classList.remove("drag-over");
        clearGroupDropPosition(this.groupSection);
      }
    });
    this.groupSection.addEventListener("drop", event => {
      if (this.draggedSortColId) return;
      event.preventDefault();
      this.groupSection.classList.remove("drag-over");
      const index = resolveGroupDropIndex(this.groupSection, event.clientX);
      clearGroupDropPosition(this.groupSection);
      const draggedGroup = this.draggedGroupColId;
      this.draggedGroupColId = null;
      if (draggedGroup) {
        this.moveGroupToIndex(draggedGroup, index);
        return;
      }
      const colId = event.dataTransfer?.getData("text/plain");
      if (colId) this.addGroupColumn(colId, index);
    });
  }

  private renderSortChips(): void {
    this.disposeSortChipTooltips();
    this.sortSection.replaceChildren();
    const sorts = this.params.core.getSortModel().items;
    if (sorts.length > 0) {
      const label = span("pte-grid-toolbar-sort-label", "Sort by");
      const list = div("pte-grid-toolbar-sort-list");
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", "Column sort priority");

      sorts.forEach((sort, index) => {
        const col = sort.col;
        const chip = div("pte-grid-toolbar-sort-chip");
        chip.dataset.sortColId = col.instanceID;
        chip.draggable = true;
        chip.tabIndex = 0;
        chip.setAttribute("role", "listitem");
        chip.setAttribute(
          "aria-label",
          `${col.label}, sort priority ${index + 1} of ${sorts.length}, ${sort.dir === "asc" ? "ascending" : "descending"}. Use Left and Right arrows to reorder.`,
        );

        const handle = span("pte-grid-toolbar-sort-drag", "⠿");
        handle.setAttribute("aria-hidden", "true");
        const chipLabel = span("pte-grid-toolbar-sort-chip-label", col.label);
        this.sortChipTooltipDisposers.push(registerRendererTooltipTarget(
          chip,
          () => chipLabel.scrollWidth > chipLabel.clientWidth ? col.label : null,
        ));
        const nextDirection = this.nextSortDirection(col, sort.dir);
        const direction = button("pte-grid-toolbar-sort-direction");
        direction.type = "button";
        direction.disabled = nextDirection == null;
        direction.setAttribute("aria-label", nextDirection == null
          ? `${col.label} sort direction is fixed to ${sort.dir === "asc" ? "ascending" : "descending"}`
          : `Sort ${col.label} ${nextDirection === "asc" ? "ascending" : "descending"}`);
        direction.addEventListener("click", event => {
          event.stopPropagation();
          if (nextDirection) this.setSortDirection(col.instanceID, nextDirection);
        });
        const directionIcon = span(
          `pte-grid-toolbar-sort-direction-icon ${sort.dir === "asc" ? "icon-asc" : "icon-desc"}`,
        );
        directionIcon.setAttribute("aria-hidden", "true");
        direction.appendChild(directionIcon);
        const remove = button("pte-grid-toolbar-sort-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${col.label} from sorting`);
        remove.addEventListener("click", event => {
          event.stopPropagation();
          this.removeSort(col.instanceID);
        });

        chip.addEventListener("keydown", event => {
          if (event.target !== chip) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            this.moveSort(col.instanceID, event.key === "ArrowLeft" ? -1 : 1);
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            this.removeSort(col.instanceID);
          }
        });
        chip.addEventListener("dragstart", event => {
          this.draggedSortColId = col.instanceID;
          chip.classList.add("dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", col.instanceID);
          }
        });
        chip.addEventListener("dragend", () => {
          this.draggedSortColId = null;
          chip.classList.remove("dragging");
          this.sortSection.classList.remove("drag-over");
          clearGroupDropPosition(
            this.sortSection,
            "pte-grid-toolbar-sort-drop-indicator",
          );
        });

        chip.append(handle, chipLabel, direction, remove);
        list.appendChild(chip);
      });

      this.sortSection.append(label, list);
    }

    const addSort = button("pte-grid-toolbar-sort-add", "Add sort");
    addSort.type = "button";
    addSort.setAttribute("aria-haspopup", "menu");
    addSort.disabled = this.availableSortColumns().length === 0;
    addSort.addEventListener("click", event => {
      this.openAddSortMenu(addSort, event.detail === 0 ? undefined : event.clientX);
    });
    this.sortSection.appendChild(addSort);

    if (sorts.length > 0) {
      const clear = button("pte-grid-toolbar-sort-clear", "×");
      clear.type = "button";
      clear.setAttribute("aria-label", "Clear all sorting");
      clear.addEventListener("click", () => this.applySortModel([]));
      this.sortChipTooltipDisposers.push(registerRendererTooltipTarget(
        clear,
        () => "Clear sorting",
      ));
      this.sortSection.appendChild(clear);
    }
  }

  private bindSortChipDrop(): void {
    const chipSelector = ".pte-grid-toolbar-sort-chip";
    const indicatorClass = "pte-grid-toolbar-sort-drop-indicator";
    this.sortSection.classList.add("pte-grid-toolbar-sort-dropzone");
    this.sortSection.addEventListener("dragover", event => {
      if (!this.draggedSortColId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.sortSection.classList.add("drag-over");
      showGroupDropPosition(
        this.sortSection,
        resolveGroupDropIndex(this.sortSection, event.clientX, chipSelector),
        chipSelector,
        indicatorClass,
      );
    });
    this.sortSection.addEventListener("dragleave", event => {
      const next = event.relatedTarget as Node | null;
      if (!next || !this.sortSection.contains(next)) {
        this.sortSection.classList.remove("drag-over");
        clearGroupDropPosition(this.sortSection, indicatorClass);
      }
    });
    this.sortSection.addEventListener("drop", event => {
      if (!this.draggedSortColId) return;
      event.preventDefault();
      const index = resolveGroupDropIndex(this.sortSection, event.clientX, chipSelector);
      const colId = this.draggedSortColId;
      this.draggedSortColId = null;
      this.sortSection.classList.remove("drag-over");
      clearGroupDropPosition(this.sortSection, indicatorClass);
      this.moveSortToIndex(colId, index);
    });
  }

  private availableGroupColumns() {
    if (this.params.core.getRowModel().getType() !== "clientSide") return [];
    const grouped = new Set(this.params.core.getRowGroupColumns().map(col => col.instanceID));
    return this.params.core.getColumnModel().getLeaves().filter(
      col => col.groupable && !col.isInternal() && !grouped.has(col.instanceID),
    );
  }

  private openAddGroupMenu(anchor: HTMLButtonElement, pointerX?: number): void {
    const items: MenuItem[] = this.availableGroupColumns().map(col => ({
      id: `toolbarGroupAdd-${col.instanceID}`,
      label: col.label,
      command: "toolbar.group.add",
      payload: { colId: col.instanceID },
    }));
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      clientX: pointerX ?? rect.left,
      clientY: rect.bottom,
      items,
      position: "bottom-left",
      onItemClick: item => this.addGroupColumn(item.payload.colId),
    });
  }

  private availableSortColumns() {
    const sorted = new Set(
      this.params.core.getSortModel().items.map(item => item.col.instanceID),
    );
    return this.params.core.getColumnModel().getLeaves().filter(
      col => col.sortable
        && !col.isInternal()
        && !sorted.has(col.instanceID)
        && getSortDirections(col).length > 0,
    );
  }

  private openAddSortMenu(anchor: HTMLButtonElement, pointerX?: number): void {
    const items: MenuItem[] = this.availableSortColumns().map(col => ({
      id: `toolbarSortAdd-${col.instanceID}`,
      label: col.label,
      command: "toolbar.sort.add",
      payload: { colId: col.instanceID },
    }));
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      clientX: pointerX ?? rect.left,
      clientY: rect.bottom,
      items,
      position: "bottom-left",
      onItemClick: item => this.addSortColumn(item.payload.colId),
    });
  }

  private addSortColumn(colId: string): void {
    const model = this.params.core.getColumnModel();
    const col = model.getById(colId) ?? model.getByColId(colId);
    if (!col || !col.sortable || col.isInternal()) return;
    if (this.params.core.getSortModel().items.some(item => item.col.instanceID === col.instanceID)) {
      return;
    }
    insertSortColumn(this.params.core, col);
  }

  private nextSortDirection(col: Column, current: SortDir): SortDir | null {
    const directions = getSortDirections(col);
    if (directions.length < 2) return null;
    const index = directions.indexOf(current);
    return directions[(index < 0 ? 0 : index + 1) % directions.length];
  }

  private setSortDirection(colId: string, dir: SortDir): void {
    this.params.core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: colId, dir }],
    });
  }

  private removeSort(colId: string): void {
    this.params.core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: colId, dir: null }],
    });
  }

  private moveSort(colId: string, offset: -1 | 1): void {
    const sorts = this.currentSortItems();
    const from = sorts.findIndex(item => item.key === colId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= sorts.length) return;
    [sorts[from], sorts[to]] = [sorts[to], sorts[from]];
    this.applySortModel(sorts);
    this.focusSortChip(colId);
  }

  private moveSortToIndex(colId: string, index: number): void {
    const col = this.params.core.getColumnModel().getById(colId);
    if (!col) return;
    insertSortColumn(this.params.core, col, index);
    this.focusSortChip(colId);
  }

  private currentSortItems(): { key: string; dir: SortDir }[] {
    return getOrderedSortItems(this.params.core);
  }

  private applySortModel(next: { key: string; dir: SortDir }[]): void {
    applyOrderedSortItems(this.params.core, next);
  }

  private focusSortChip(colId: string): void {
    const chip = Array.from(
      this.sortSection.querySelectorAll<HTMLElement>(".pte-grid-toolbar-sort-chip"),
    ).find(item => item.dataset.sortColId === colId);
    chip?.focus();
  }

  private disposeGroupChipTooltips(): void {
    this.groupChipTooltipDisposers.forEach(dispose => dispose());
    this.groupChipTooltipDisposers = [];
  }

  private disposeSortChipTooltips(): void {
    this.sortChipTooltipDisposers.forEach(dispose => dispose());
    this.sortChipTooltipDisposers = [];
  }

  private addGroupColumn(colId: string, index?: number): void {
    const model = this.params.core.getColumnModel();
    const col = model.getById(colId) ?? model.getByColId(colId);
    if (!col || !col.groupable || col.isInternal()) return;
    const colIds = this.params.core.getRowGroupColumns().map(group => group.instanceID);
    if (colIds.includes(col.instanceID)) return;
    const insertAt = index == null ? colIds.length : Math.max(0, Math.min(index, colIds.length));
    colIds.splice(insertAt, 0, col.instanceID);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
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

  private moveGroupToIndex(colId: string, index: number): void {
    const colIds = this.params.core.getRowGroupColumns().map(col => col.instanceID);
    const from = colIds.indexOf(colId);
    if (from < 0) return;
    const [moved] = colIds.splice(from, 1);
    const insertAt = Math.max(0, Math.min(index > from ? index - 1 : index, colIds.length));
    colIds.splice(insertAt, 0, moved);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
    this.focusGroupChip(colId);
  }

  private focusGroupChip(colId: string): void {
    const chip = Array.from(this.left.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"))
      .find(item => item.dataset.groupColId === colId);
    chip?.focus();
  }

  private openExportMenu(): void {
    const items = this.buildExportItems();
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

  private openMoreMenu(): void {
    const items: MenuItem[] = [];
    if (this.options.export) {
      const exportItems = this.buildExportItems();
      items.push({
        id: "toolbarMoreExport",
        label: "Export",
        left: "icon-export",
        disabled: exportItems.length === 0,
        subMenu: exportItems.length > 0 ? exportItems : undefined,
      });
    }
    if (this.columnTrigger) {
      items.push({
        id: "toolbarMoreColumns",
        label: "Columns",
        command: "toolbar.columns.open",
      });
    }
    const rect = this.moreButton.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: this.moreButton,
      clientX: rect.right,
      clientY: rect.bottom,
      items,
      position: "bottom-right",
      onItemClick: item => {
        if (item.command === "toolbar.columns.open") {
          this.columnTrigger?.click();
        } else {
          this.executeExport(item);
        }
      },
    });
  }

  private buildExportItems(): MenuItem[] {
    const selection = this.params.core.getSelectionSnapshot();
    const hasSelection = selection.kind !== "none";
    const selectionScope: ExportOptions["scope"] =
      selection.kind === "column" ? "selectedColumns" : "selection";
    return hasSelection
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
