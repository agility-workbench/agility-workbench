import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { ColumnState } from "../../interfaces/iGridCore";
import {
  ColumnPanelOptions,
  ColumnPanelTrigger,
  resolveColumnPanelOptions,
} from "../../interfaces/gridOptions";
import { Unsubscribe } from "../../events/events";
import { button, createElement, div, span } from "../element";
import { registerRendererTooltipTarget } from "../tooltip/rendererTooltipTarget";

type PanelSection = "left" | "center" | "right";

interface ColumnPanelRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  options: boolean | ColumnPanelOptions | undefined;
  onLayoutChange: () => void;
}

interface PanelColumn {
  col: Column;
  state: ColumnState;
}

const SECTION_LABELS: Record<PanelSection, string> = {
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
  private list = div("pte-column-panel-list");
  private resetButton = button("pte-column-panel-reset", "Reset layout");
  private triggerButton = button("pte-column-panel-trigger");
  private triggerMount: HTMLElement | null = null;
  private unsubscribe?: Unsubscribe;
  private enabled = false;
  private open = false;
  private trigger: ColumnPanelTrigger = "rail";
  private draggedColId: string | null = null;
  private initialState: ColumnState[] | null = null;
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

    const footer = div("pte-column-panel-footer");
    this.resetButton.type = "button";
    this.resetButton.addEventListener("click", () => this.resetLayout());
    footer.appendChild(this.resetButton);

    this.content.append(header, this.searchInput, this.list, footer);
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
      const toolbar = div("pte-grid-toolbar");
      const left = div("pte-grid-toolbar-left");
      const right = div("pte-grid-toolbar-right");
      right.appendChild(this.triggerButton);
      toolbar.append(left, right);
      this.params.root.insertBefore(toolbar, this.params.root.firstChild);
      this.triggerMount = toolbar;
      return;
    }

  }

  private unmountExternalTrigger(): void {
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
  }

  private getPanelColumns(): PanelColumn[] {
    const model = this.params.core.getColumnModel();
    return model.getColumnState()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .flatMap((state) => {
        const col = model.getByColId(state.colId);
        return col && !col.isInternal() ? [{ col, state }] : [];
      });
  }

  private sectionFor(state: ColumnState): PanelSection {
    return state.pinned === "left" ? "left" : state.pinned === "right" ? "right" : "center";
  }

  private renderList(): void {
    if (!this.enabled) return;
    this.disposeListTooltips();
    this.list.replaceChildren();
    const query = this.searchInput.value.trim().toLocaleLowerCase();
    const columns = this.getPanelColumns();

    let shown = 0;
    for (const section of ["left", "center", "right"] as const) {
      const sectionColumns = columns.filter(({ col, state }) => {
        if (this.sectionFor(state) !== section) return false;
        if (!query) return true;
        return col.label.toLocaleLowerCase().includes(query)
          || col.colId.toLocaleLowerCase().includes(query)
          || col.key.toLocaleLowerCase().includes(query);
      });
      if (sectionColumns.length === 0) continue;
      shown += sectionColumns.length;

      const group = div("pte-column-panel-section");
      group.dataset.section = section;
      const heading = div("pte-column-panel-section-title", SECTION_LABELS[section]);
      const count = span("pte-column-panel-section-count", String(sectionColumns.length));
      heading.appendChild(count);
      group.appendChild(heading);
      sectionColumns.forEach((entry, index) => {
        group.appendChild(this.buildColumnRow(entry, sectionColumns, index, section));
      });
      this.list.appendChild(group);
    }

    if (shown === 0) {
      const empty = div("pte-column-panel-empty", query ? "No matching columns" : "No columns");
      this.list.appendChild(empty);
    }
  }

  private buildColumnRow(
    entry: PanelColumn,
    sectionColumns: PanelColumn[],
    index: number,
    section: PanelSection,
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
      this.params.core.dispatch({
        type: "columnVisibility",
        colIds: [col.instanceID],
        hidden: !checkbox.checked,
      });
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
      this.params.core.dispatch({
        type: "columnPin",
        colIds: [col.instanceID],
        pinned: pin.value === "left" ? "left" : pin.value === "right" ? "right" : null,
      });
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
    this.applySectionOrder(ordered);
  }

  private applySectionOrder(orderedSection: PanelColumn[]): void {
    const all = this.getPanelColumns();
    const positions = all
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => this.sectionFor(entry.state) === this.sectionFor(orderedSection[0].state))
      .map(({ index }) => index);
    positions.forEach((position, index) => {
      all[position] = orderedSection[index];
    });
    this.params.core.dispatch({
      type: "columnStateSet",
      state: all.map(({ state, col }, order) => ({ ...state, colId: col.colId, order })),
    });
  }

  private bindDrag(row: HTMLDivElement, entry: PanelColumn, section: PanelSection): void {
    if (!entry.col.movable) return;
    row.addEventListener("dragstart", (event) => {
      this.draggedColId = entry.col.colId;
      row.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", entry.col.colId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      this.draggedColId = null;
      this.list.querySelectorAll(".dragging, .drag-over").forEach((el) => {
        el.classList.remove("dragging", "drag-over");
      });
    });
    row.addEventListener("dragover", (event) => {
      const source = this.getPanelColumns().find(({ col }) => col.colId === this.draggedColId);
      if (!source || this.sectionFor(source.state) !== section) return;
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      const sectionColumns = this.getPanelColumns().filter(({ state }) => this.sectionFor(state) === section);
      const from = sectionColumns.findIndex(({ col }) => col.colId === this.draggedColId);
      const to = sectionColumns.findIndex(({ col }) => col.colId === entry.col.colId);
      this.reorderWithinSection(sectionColumns, from, to);
      this.draggedColId = null;
    });
  }
}
