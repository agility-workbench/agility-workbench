import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { ColumnSection } from "../../interfaces/column";
import { ColumnState } from "../../interfaces/iGridCore";
import {
  ColumnPanelOptions,
  ColumnPanelTrigger,
  resolveColumnPanelOptions,
} from "../../interfaces/gridOptions";
import { Unsubscribe } from "../../events/events";
import { button, createElement, div, span } from "../element";
import { registerRendererTooltipTarget } from "../tooltip/rendererTooltipTarget";

interface ColumnPanelRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  options: boolean | ColumnPanelOptions | undefined;
  onLayoutChange: () => void;
  toolbar: {
    mountColumnTrigger: (trigger: HTMLButtonElement) => void;
    unmount: () => void;
  };
}

interface PanelColumn {
  col: Column;
  state: ColumnState;
  ancestors: Column[];
}

type PanelTreeItem =
  | { kind: "column"; entry: PanelColumn }
  | { kind: "group"; group: Column; items: PanelTreeItem[] };

const SECTION_LABELS: Record<ColumnSection, string> = {
  left: "Pinned left",
  center: "Columns",
  right: "Pinned right",
};

/**
 * Docked, framework-agnostic column management UI. It deliberately dispatches the same core
 * actions as header menus/dragging, keeping the column model as the single source of truth.
 */
export class ColumnPanelRenderer {
  private panel = createElement("aside", "pte-column-panel");
  private railButton = button("pte-column-panel-rail");
  private content = div("pte-column-panel-content");
  private searchInput = createElement("input", "pte-column-panel-search");
  private bulkVisibility = createElement("label", "pte-column-panel-bulk");
  private bulkVisibilityCheckbox = createElement("input", "pte-column-panel-bulk-checkbox");
  private bulkVisibilityLabel = span("pte-column-panel-bulk-label", "All columns");
  private list = div("pte-column-panel-list");
  private announcer = div("pte-column-panel-announcer");
  private modifiedIndicator = span("pte-column-panel-modified", "Modified");
  private resetButton = button("pte-column-panel-reset", "Reset layout");
  private triggerButton = button("pte-column-panel-trigger");
  private triggerMount: HTMLElement | null = null;
  private toolbarTriggerMounted = false;
  private unsubscribe?: Unsubscribe;
  private enabled = false;
  private open = false;
  private trigger: ColumnPanelTrigger = "rail";
  private draggedColId: string | null = null;
  private initialState: ColumnState[] | null = null;
  private collapsedGroups = new Set<string>();
  private triggerTooltipDisposer: (() => void) | null = null;
  private listTooltipDisposers: Array<() => void> = [];

  constructor(private params: ColumnPanelRendererParams) {
    this.buildDOM();
    this.unsubscribe = this.params.core.on("columnsChanged", (event) => {
      this.captureInitialState(event.reason === "defs");
      this.renderList();
    });
    this.setOptions(this.params.options);
  }

  setOptions(options: boolean | ColumnPanelOptions | undefined): void {
    const resolved = resolveColumnPanelOptions(options);
    const wasEnabled = this.enabled;
    this.enabled = resolved.enabled;
    this.trigger = resolved.trigger;

    this.params.root.style.setProperty("--pte-column-panel-width", `${resolved.width}px`);
    this.params.root.classList.toggle("pte-column-panel-enabled", this.enabled);
    for (const trigger of ["rail", "header", "menu", "footer", "toolbar"] as const) {
      this.params.root.classList.toggle(
        `pte-column-panel-trigger-${trigger}`,
        this.enabled && resolved.trigger === trigger,
      );
    }
    this.unmountExternalTrigger();

    if (this.enabled && !this.panel.isConnected) {
      this.params.root.appendChild(this.panel);
    } else if (!this.enabled) {
      this.disposeListTooltips();
      this.panel.remove();
    }

    if (this.enabled && !wasEnabled) {
      this.open = resolved.defaultOpen;
      this.captureInitialState(false);
      this.renderList();
    }
    if (!this.enabled) this.open = false;
    if (this.enabled) this.mountTrigger(resolved.trigger);
    this.applyOpenState();
  }

  openPanel(): void {
    this.setOpen(true);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.panel.remove();
    this.unmountExternalTrigger();
    this.params.root.classList.remove(
      "pte-column-panel-enabled",
      "pte-column-panel-open",
      "pte-column-panel-trigger-rail",
      "pte-column-panel-trigger-header",
      "pte-column-panel-trigger-menu",
      "pte-column-panel-trigger-footer",
      "pte-column-panel-trigger-toolbar",
    );
    this.params.root.style.removeProperty("--pte-column-panel-width");
    this.disposeListTooltips();
    this.triggerTooltipDisposer?.();
    this.triggerTooltipDisposer = null;
  }

  private buildDOM(): void {
    this.panel.setAttribute("aria-label", "Column management");
    this.panel.id = `pte-column-panel-${this.params.core.id}`;
    this.panel.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        this.setOpen(false);
      }
    });

    this.railButton.type = "button";
    this.railButton.textContent = "Columns";
    this.railButton.setAttribute("aria-label", "Open column panel");
    this.railButton.addEventListener("click", () => this.setOpen(!this.open));

    this.triggerButton.type = "button";
    this.triggerTooltipDisposer = registerRendererTooltipTarget(
      this.triggerButton,
      () => "Columns",
      undefined,
      "left",
    );
    this.triggerButton.setAttribute("aria-label", "Open column panel");
    this.triggerButton.setAttribute("aria-controls", this.panel.id);
    const triggerIcon = span("pte-column-panel-trigger-icon", "▦");
    triggerIcon.setAttribute("aria-hidden", "true");
    const triggerLabel = span("pte-column-panel-trigger-label", "Columns");
    this.triggerButton.append(triggerIcon, triggerLabel);
    this.triggerButton.addEventListener("click", () => this.setOpen(!this.open));
    this.triggerButton.addEventListener("keydown", (event) => event.stopPropagation());

    const header = div("pte-column-panel-header");
    const title = createElement("h2", "pte-column-panel-title", "Columns");
    const close = button("pte-column-panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close column panel");
    close.addEventListener("click", () => this.setOpen(false));
    header.append(title, close);

    this.searchInput.type = "search";
    this.searchInput.placeholder = "Search columns…";
    this.searchInput.setAttribute("aria-label", "Search columns");
    this.searchInput.addEventListener("input", () => this.renderList());

    this.bulkVisibilityCheckbox.type = "checkbox";
    this.bulkVisibilityCheckbox.addEventListener("change", () => this.setBulkVisibility());
    this.bulkVisibility.append(this.bulkVisibilityCheckbox, this.bulkVisibilityLabel);

    const footer = div("pte-column-panel-footer");
    this.modifiedIndicator.hidden = true;
    this.resetButton.type = "button";
    this.resetButton.disabled = true;
    this.resetButton.addEventListener("click", () => this.resetLayout());
    footer.append(this.modifiedIndicator, this.resetButton);

    this.announcer.setAttribute("aria-live", "polite");
    this.announcer.setAttribute("aria-atomic", "true");
    this.content.append(header, this.searchInput, this.bulkVisibility, this.list, footer, this.announcer);
    this.panel.append(this.railButton, this.content);
  }

  private setOpen(open: boolean): void {
    if (!this.enabled || this.open === open) return;
    this.open = open;
    this.applyOpenState();
    if (open) {
      this.renderList();
      this.searchInput.focus();
    } else {
      const focusTarget = this.trigger === "rail" ? this.railButton : this.triggerButton;
      if (focusTarget.isConnected) focusTarget.focus();
    }
  }

  private applyOpenState(): void {
    this.params.root.classList.toggle("pte-column-panel-open", this.enabled && this.open);
    this.panel.classList.toggle("open", this.enabled && this.open);
    this.railButton.setAttribute("aria-expanded", String(this.enabled && this.open));
    this.railButton.setAttribute("aria-label", this.open ? "Close column panel" : "Open column panel");
    this.triggerButton.setAttribute("aria-expanded", String(this.enabled && this.open));
    this.triggerButton.setAttribute("aria-label", this.open ? "Close column panel" : "Open column panel");
    this.content.setAttribute("aria-hidden", String(!this.open));
    this.params.onLayoutChange();
  }

  private mountTrigger(trigger: ColumnPanelTrigger): void {
    if (trigger === "rail" || trigger === "menu") return;
    this.triggerButton.className = `pte-column-panel-trigger pte-column-panel-trigger-${trigger}-button`;

    if (trigger === "header" || trigger === "footer") {
      // Header/footer are rail-layout variants: the entire right gutter stays reserved and empty,
      // with only the toggle placed at its top/bottom corner. Mounting inside the collapsed drawer
      // makes the gutter geometry identical to rail mode and guarantees no data column sits under it.
      this.panel.appendChild(this.triggerButton);
      this.triggerMount = this.triggerButton;
      return;
    }

    if (trigger === "toolbar") {
      this.params.toolbar.mountColumnTrigger(this.triggerButton);
      this.toolbarTriggerMounted = true;
      this.triggerMount = this.triggerButton;
      return;
    }

  }

  private unmountExternalTrigger(): void {
    if (this.toolbarTriggerMounted) {
      this.params.toolbar.unmount();
      this.toolbarTriggerMounted = false;
    }
    this.triggerButton.remove();
    if (this.triggerMount && this.triggerMount !== this.triggerButton) {
      this.triggerMount.remove();
    }
    this.triggerMount = null;
  }

  private captureInitialState(fromDefs: boolean): void {
    const state = this.params.core.getColumnModel().getColumnState();
    if (state.length === 0) return;
    // Only genuine column-definition changes replace the reset point. Grouping has its own event
    // reason even though it also rebuilds the rendered column structure.
    if (this.initialState === null || fromDefs) {
      this.initialState = state.map((item) => ({ ...item }));
    }
  }

  private resetLayout(): void {
    if (!this.initialState?.length) return;
    this.params.core.dispatch({
      type: "columnStateSet",
      state: this.initialState.map((item) => ({ ...item })),
      defaultState: { hidden: true, pinned: null },
    });
    this.announce("Column layout reset");
  }

  private getPanelColumns(): PanelColumn[] {
    const model = this.params.core.getColumnModel();
    return model.getColumnState()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .flatMap((state) => {
        const col = model.getByColId(state.colId);
        if (!col || col.isInternal()) return [];
        const ancestors = model.getAncestors(col.instanceID).slice(0, -1);
        const entry = { col, state, ancestors };
        return col.suppressColumnPanel
          || ancestors.some(ancestor => ancestor.suppressColumnPanel)
          || !col.columnGroupVisible
          ? []
          : [entry];
      });
  }

  private sectionFor(state: ColumnState): ColumnSection {
    return state.pinned === "left" ? "left" : state.pinned === "right" ? "right" : "center";
  }

  private renderList(): void {
    if (!this.enabled) return;
    this.disposeListTooltips();
    this.list.replaceChildren();
    const query = this.searchInput.value.trim().toLocaleLowerCase();
    const columns = this.getPanelColumns();
    this.updateModifiedState(columns);
    const matchingColumns = columns.filter(entry => this.matchesQuery(entry, query));
    this.updateBulkVisibility(matchingColumns, query.length > 0);

    let shown = 0;
    for (const section of ["left", "center", "right"] as const) {
      const sectionColumns = matchingColumns.filter(({ state }) => this.sectionFor(state) === section);
      if (sectionColumns.length === 0) continue;
      shown += sectionColumns.length;

      const group = div("pte-column-panel-section");
      group.dataset.section = section;
      const heading = div("pte-column-panel-section-title", SECTION_LABELS[section]);
      const count = span("pte-column-panel-section-count", String(sectionColumns.length));
      heading.appendChild(count);
      group.appendChild(heading);
      group.appendChild(this.buildColumnTree(sectionColumns, section, query.length > 0));
      group.appendChild(this.buildRootDropZone(section));
      this.list.appendChild(group);
    }

    if (shown === 0) {
      const empty = div("pte-column-panel-empty", query ? "No matching columns" : "No columns");
      this.list.appendChild(empty);
    }
  }

  private matchesQuery(entry: PanelColumn, query: string): boolean {
    if (!query) return true;
    return [entry.col, ...entry.ancestors].some(col =>
      col.label.toLocaleLowerCase().includes(query)
      || col.colId.toLocaleLowerCase().includes(query)
      || col.key.toLocaleLowerCase().includes(query),
    );
  }

  private updateBulkVisibility(columns: PanelColumn[], filtered: boolean): void {
    const eligible = columns.filter(entry => entry.col.hideable);
    const visibleCount = eligible.filter(({ state }) => !state.hidden).length;
    this.bulkVisibilityLabel.textContent = filtered ? "All matching columns" : "All columns";
    this.bulkVisibilityCheckbox.disabled = eligible.length === 0;
    this.bulkVisibilityCheckbox.checked = eligible.length > 0 && visibleCount === eligible.length;
    this.bulkVisibilityCheckbox.indeterminate = visibleCount > 0 && visibleCount < eligible.length;
  }

  private setBulkVisibility(): void {
    const query = this.searchInput.value.trim().toLocaleLowerCase();
    const eligible = this.getPanelColumns()
      .filter(entry =>
        entry.col.hideable
        && this.matchesQuery(entry, query),
      );
    if (eligible.length === 0) return;
    const hidden = !this.bulkVisibilityCheckbox.checked;
    this.params.core.dispatch({
      type: "columnVisibility",
      colIds: eligible.map(({ col }) => col.instanceID),
      hidden,
    });
    const noun = eligible.length === 1 ? "column" : "columns";
    const scope = query ? `matching ${noun}` : noun;
    this.announce(`${eligible.length} ${scope} ${hidden ? "hidden" : "shown"}`);
  }

  private updateModifiedState(columns: PanelColumn[]): void {
    const managedIds = new Set(columns.map(({ col }) => col.colId));
    const baseline = (this.initialState ?? []).filter(state => managedIds.has(state.colId));
    const current = columns.map(({ state }) => state);
    const modified = this.layoutSignature(current) !== this.layoutSignature(baseline);
    this.modifiedIndicator.hidden = !modified;
    this.resetButton.disabled = !modified;
  }

  private layoutSignature(states: ColumnState[]): string {
    return JSON.stringify(
      states
        .map(state => ({
          colId: state.colId,
          hidden: state.hidden ?? false,
          pinned: state.pinned ?? null,
          order: state.order ?? 0,
        }))
        .sort((a, b) => a.colId.localeCompare(b.colId)),
    );
  }

  private buildColumnTree(
    columns: PanelColumn[],
    section: ColumnSection,
    forceExpanded: boolean,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const items = this.createTreeItems(columns);
    for (const item of items) {
      fragment.appendChild(this.renderTreeItem(item, section, forceExpanded));
    }
    return fragment;
  }

  private createTreeItems(columns: PanelColumn[]): PanelTreeItem[] {
    const items: PanelTreeItem[] = [];
    const groupItems = new Map<string, Extract<PanelTreeItem, { kind: "group" }>>();
    for (const entry of columns) {
      let target = items;
      let path = "";
      for (const group of entry.ancestors) {
        path = `${path}/${group.instanceID}`;
        let groupItem = groupItems.get(path);
        if (!groupItem) {
          groupItem = { kind: "group", group, items: [] };
          groupItems.set(path, groupItem);
          target.push(groupItem);
        }
        target = groupItem.items;
      }
      target.push({ kind: "column", entry });
    }
    return items;
  }

  private renderTreeItem(
    item: PanelTreeItem,
    section: ColumnSection,
    forceExpanded: boolean,
  ): HTMLElement {
    if (item.kind === "column") {
      const sectionColumns = this.getPanelColumns()
        .filter(candidate => this.sectionFor(candidate.state) === section);
      const index = sectionColumns.findIndex(({ col }) => col.instanceID === item.entry.col.instanceID);
      return this.buildColumnRow(item.entry, sectionColumns, index, section);
    }

    const wrapper = div("pte-column-panel-tree-group");
    wrapper.dataset.groupColId = item.group.colId;
    const header = button("pte-column-panel-tree-group-header");
    header.type = "button";
    const collapsed = !forceExpanded && this.collapsedGroups.has(item.group.instanceID);
    header.setAttribute("aria-expanded", String(!collapsed));
    header.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${item.group.label}`);
    const chevron = span("pte-column-panel-tree-group-chevron", collapsed ? "›" : "⌄");
    chevron.setAttribute("aria-hidden", "true");
    const label = span("pte-column-panel-tree-group-label", item.group.label);
    const count = span("pte-column-panel-tree-group-count", String(this.countTreeColumns(item)));
    header.append(chevron, label, count);
    this.listTooltipDisposers.push(registerRendererTooltipTarget(label, () => item.group.label));
    header.addEventListener("click", () => {
      if (this.collapsedGroups.has(item.group.instanceID)) {
        this.collapsedGroups.delete(item.group.instanceID);
      } else {
        this.collapsedGroups.add(item.group.instanceID);
      }
      this.renderList();
    });
    wrapper.appendChild(header);
    if (!collapsed) {
      const children = div("pte-column-panel-tree-children");
      for (const child of item.items) {
        children.appendChild(this.renderTreeItem(child, section, forceExpanded));
      }
      wrapper.appendChild(children);
    }
    return wrapper;
  }

  private countTreeColumns(item: Extract<PanelTreeItem, { kind: "group" }>): number {
    return item.items.reduce(
      (count, child) => count + (child.kind === "column" ? 1 : this.countTreeColumns(child)),
      0,
    );
  }

  private buildColumnRow(
    entry: PanelColumn,
    sectionColumns: PanelColumn[],
    index: number,
    section: ColumnSection,
  ): HTMLDivElement {
    const { col, state } = entry;
    const row = div("pte-column-panel-row");
    row.dataset.colId = col.colId;
    row.draggable = col.movable;

    const drag = span("pte-column-panel-drag", "⋮⋮");
    drag.setAttribute("aria-hidden", "true");

    const checkbox = createElement("input", "pte-column-panel-checkbox");
    checkbox.type = "checkbox";
    checkbox.checked = !state.hidden;
    checkbox.disabled = !col.hideable;
    checkbox.setAttribute("aria-label", `${state.hidden ? "Show" : "Hide"} ${col.label}`);
    checkbox.addEventListener("change", () => {
      const hidden = !checkbox.checked;
      this.params.core.dispatch({
        type: "columnVisibility",
        colIds: [col.instanceID],
        hidden,
      });
      this.announce(`${col.label} ${hidden ? "hidden" : "shown"}`);
    });

    const label = span("pte-column-panel-label");
    label.textContent = col.label;
    this.listTooltipDisposers.push(
      registerRendererTooltipTarget(label, () => col.label),
    );

    const pin = createElement("select", "pte-column-panel-pin");
    pin.setAttribute("aria-label", `Pin ${col.label}`);
    [
      ["", "Unpinned"],
      ["left", "Pin left"],
      ["right", "Pin right"],
    ].forEach(([value, text]) => {
      const option = createElement("option");
      option.value = value;
      option.textContent = text;
      pin.appendChild(option);
    });
    pin.value = state.pinned ?? "";
    pin.disabled = !col.movable;
    pin.addEventListener("change", () => {
      const pinned = pin.value === "left" ? "left" : pin.value === "right" ? "right" : null;
      this.params.core.dispatch({
        type: "columnPin",
        colIds: [col.instanceID],
        pinned,
      });
      this.announce(`${col.label} ${pinned ? `pinned ${pinned}` : "unpinned"}`);
    });

    const actions = div("pte-column-panel-order-actions");
    const up = this.orderButton("↑", `Move ${col.label} up`, index === 0 || !col.movable, () => {
      this.reorderWithinSection(sectionColumns, index, index - 1);
    });
    const down = this.orderButton(
      "↓",
      `Move ${col.label} down`,
      index === sectionColumns.length - 1 || !col.movable,
      () => this.reorderWithinSection(sectionColumns, index, index + 1),
    );
    actions.append(up, down);

    row.append(drag, checkbox, label, pin, actions);
    this.bindDrag(row, entry, section);
    return row;
  }

  private orderButton(
    text: string,
    label: string,
    disabled: boolean,
    action: () => void,
  ): HTMLButtonElement {
    const control = button("pte-column-panel-order", text);
    control.type = "button";
    control.disabled = disabled;
    control.setAttribute("aria-label", label);
    control.addEventListener("click", action);
    return control;
  }

  private disposeListTooltips(): void {
    for (const dispose of this.listTooltipDisposers.splice(0)) dispose();
  }

  private reorderWithinSection(columns: PanelColumn[], from: number, to: number): void {
    if (from < 0 || from >= columns.length || to < 0 || to >= columns.length || from === to) return;
    const ordered = columns.slice();
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const section = this.sectionFor(moved.state);
    const visibleLeaves = this.params.core.getColumnModel().getLeavesBySection(section);
    const visibleIds = new Set(visibleLeaves.map(col => col.instanceID));
    const firstVisibleRight = ordered.slice(to + 1)
      .find(candidate => visibleIds.has(candidate.col.instanceID));
    const targetIndex = firstVisibleRight
      ? visibleLeaves.findIndex(col => col.instanceID === firstVisibleRight.col.instanceID)
      : visibleLeaves.length;
    this.params.core.dispatch({
      type: "columnMove",
      colId: moved.col.instanceID,
      toIndex: targetIndex,
      toSection: section,
    });
    this.announce(`${moved.col.label} moved to position ${to + 1} of ${columns.length}`);
  }

  private announce(message: string): void {
    this.announcer.textContent = message;
  }

  private buildRootDropZone(section: ColumnSection): HTMLDivElement {
    const dropZone = div("pte-column-panel-root-dropzone", "Drop here to move branch to section end");
    dropZone.addEventListener("dragover", (event) => {
      const source = this.getPanelColumns()
        .find(({ col }) => col.instanceID === this.draggedColId);
      if (!source || source.ancestors.length === 0 || this.sectionFor(source.state) !== section) return;
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      const source = this.getPanelColumns()
        .find(({ col }) => col.instanceID === this.draggedColId);
      if (source && source.ancestors.length > 0 && this.sectionFor(source.state) === section) {
        const sectionColumns = this.getPanelColumns()
          .filter(candidate => this.sectionFor(candidate.state) === section);
        const from = sectionColumns
          .findIndex(candidate => candidate.col.instanceID === source.col.instanceID);
        this.reorderWithinSection(sectionColumns, from, sectionColumns.length - 1);
      }
      this.clearDragState();
    });
    return dropZone;
  }

  private bindDrag(row: HTMLDivElement, entry: PanelColumn, section: ColumnSection): void {
    if (!entry.col.movable) return;
    row.addEventListener("dragstart", (event) => {
      this.draggedColId = entry.col.instanceID;
      row.classList.add("dragging");
      this.list.classList.toggle("pte-column-panel-dragging-group-column", entry.ancestors.length > 0);
      event.dataTransfer?.setData("text/plain", entry.col.colId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => this.clearDragState());
    row.addEventListener("dragover", (event) => {
      const source = this.getPanelColumns().find(({ col }) => col.instanceID === this.draggedColId);
      if (
        !source
        || this.sectionFor(source.state) !== section
      ) return;
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      const sectionColumns = this.getPanelColumns().filter(candidate =>
        this.sectionFor(candidate.state) === section,
      );
      const from = sectionColumns.findIndex(({ col }) => col.instanceID === this.draggedColId);
      const to = sectionColumns.findIndex(({ col }) => col.colId === entry.col.colId);
      this.reorderWithinSection(sectionColumns, from, to);
      this.clearDragState();
    });
  }

  private clearDragState(): void {
    this.draggedColId = null;
    this.list.classList.remove("pte-column-panel-dragging-group-column");
    this.list.querySelectorAll(".dragging, .drag-over").forEach((el) => {
      el.classList.remove("dragging", "drag-over");
    });
  }
}
