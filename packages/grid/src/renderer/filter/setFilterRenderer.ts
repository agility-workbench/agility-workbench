import { FilterController } from "../../filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState, SetFilterOptions as SetFilterOption } from "../../filter/types";
import { IFilterRenderer } from "../../interfaces/iFilterRenderer";
import { createElement, div } from "../element";
import { matchesAnyChord, matchesChord } from "../interaction/keyChord";
import { Overlay } from "../overlay";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import {
  createSetFilterComponentRuntime,
} from "./setFilterValueComponent";
import type {
  SetFilterComponent,
  SetFilterComponentRuntime,
  SetFilterSpecialValueComponentParams,
  SetFilterValueComponentParams,
} from "./setFilterValueComponent";

interface ValueComponentRecord {
  component: SetFilterComponent<any>;
  runtime: SetFilterComponentRuntime<any>;
}

export class SetFilterRenderer implements IFilterRenderer {
  private root: HTMLElement;
  private loader!: Overlay;
  private conditionContainer!: HTMLElement;
  private miniFilterInput!: HTMLInputElement;
  private valueComponents = new Map<string, ValueComponentRecord>();

  constructor(
    private controller: FilterController,
    private spec: FilterPanelSpec,
    private api: IGridAPI,
  ) {
    this.root = div("pte-filter-form");
    this.createFilter();
  }

  getUi(): HTMLElement {
    return this.root;
  }

  onOpen(): void {
    this.miniFilterInput.focus();
  }

  destroy(): void {
    this.destroyValueComponents();
  }

  renderState(state: FilterRuntimeState): void {
    if (state.conditionOrder.length === 0) {
      this.clearOptions();
      return;
    }

    const conditionId = state.conditionOrder[0];
    const uiState = state.ui[conditionId];
    if (!uiState) {
      this.clearOptions();
      return;
    }
    if (uiState.error) {
      this.clearOptions();
      const error = div("pte-set-filter-error");
      error.textContent = "Error loading values";
      this.conditionContainer.appendChild(error);
      return;
    } else if (uiState.loading) {
      if (!this.loader) {
        this.loader = new Overlay("Loading values…");
        this.root.appendChild(this.loader.getUi());
      }
      this.loader.show();
    } else if (uiState.loading === false) {
      if (this.loader) this.loader.hide();
    }
    if (uiState.options) {
      this.createOptionRows(uiState.options, uiState.selectedIdx);
    }
  }

  private createFilter() {
    this.createMiniFilter();
    this.createConditionContainer();
  }

  private createMiniFilter() {
    const filterContainer = div("pte-set-filter-mini");
    this.miniFilterInput = createElement("input", "pte-filter-input");
    this.miniFilterInput.setAttribute("aria-label", "Type to filter values");
    this.miniFilterInput.name = "pte-set-filter-mini-input";
    this.miniFilterInput.type = "text";
    this.miniFilterInput.className = "pte-filter-input pte-set-filter-input";
    this.miniFilterInput.placeholder = "Type to filter values";
    this.miniFilterInput.addEventListener("input", () => {
      this.controller.filterOptions(0, this.miniFilterInput.value);
    });
    this.miniFilterInput.addEventListener("keydown", (e) => {
      if (!matchesChord(e, "enter")) return;
      this.controller.applyMiniFilter(0);
    });
    filterContainer.appendChild(this.miniFilterInput);
    this.root.appendChild(filterContainer);
  }

  private createConditionContainer() {
    const container = div("pte-filter-condition-container pte-set-filter-condition-container");
    this.conditionContainer = div("pte-set-filter-options");
    container.appendChild(this.conditionContainer);
    this.root.appendChild(container);
    this.root.tabIndex = 0; // make root focusable to capture keyboard events
    this.root.addEventListener("keydown", (e) => {
      // Toggle through options with arrow keys and space/enter
      const focusableOptions = this.conditionContainer.querySelectorAll<HTMLLabelElement>("label.pte-set-filter-option");
      if (focusableOptions.length === 0) return;

      const activeElement = document.activeElement as HTMLElement;
      let currentIndex = Array.from(focusableOptions).findIndex(opt => opt === activeElement);
      if (currentIndex === -1) {
        // Forward Tab only: Shift+Tab is the user leaving backwards, and capturing it here used to
        // drag focus onto the first option instead.
        if (matchesChord(e, "tab")) {
          // if focus is not on an option, start from the first one
          focusableOptions[0].classList.add("focused");
          focusableOptions[0].focus();
          e.preventDefault();
        }
        return;
      }

      // Bare chords: none of these list gestures reads a modifier, so a modified arrow keeps its
      // platform meaning instead of walking the option list.
      if (matchesChord(e, "arrowdown")) {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        const nextIndex = (currentIndex + 1) % focusableOptions.length;
        focusableOptions[nextIndex].classList.add("focused");
        focusableOptions[nextIndex].focus();
      } else if (matchesChord(e, "arrowup")) {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        const prevIndex = (currentIndex - 1 + focusableOptions.length) % focusableOptions.length;
        focusableOptions[prevIndex].classList.add("focused");
        focusableOptions[prevIndex].focus();
      } else if (matchesChord(e, "arrowleft")) {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        focusableOptions[0].classList.add("focused");
        focusableOptions[0].focus();
      } else if (matchesChord(e, "arrowright")) {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        focusableOptions[focusableOptions.length - 1].classList.add("focused");
        focusableOptions[focusableOptions.length - 1].focus();
      } else if (matchesAnyChord(e, ["space", "enter"])) {
        e.preventDefault();
        focusableOptions[currentIndex].click();
      }
    });
  }

  private createOptionRows(options: SetFilterOption[], selectedIdx?: number) {
    const liveComponentKeys = new Set<string>();
    const rows = document.createDocumentFragment();
    let rowToFocus: HTMLLabelElement | null = null;
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const component = this.getOptionComponent(option);
      if (component) liveComponentKeys.add(option.key);
      if (option.hidden) continue;
      const row = createElement("label", "pte-set-filter-option");
      row.tabIndex = -1; // make label focusable for keyboard navigation
      const checkbox = createElement("input");
      checkbox.tabIndex = -1; // exclude checkbox from tab order, we will handle focus on the label
      checkbox.name = `pte-set-filter-option-checkbox-${option.key}`;
      checkbox.type = "checkbox";
      if (option.type === "select_all") {
        checkbox.setAttribute("aria-label", "Select all values");
      } else if (option.type === "blanks") {
        checkbox.setAttribute("aria-label", "Include blank values");
      } else {
        checkbox.setAttribute("aria-label", option.label);
      }
      const { selected, indeterminate } = this.controller.getSetOptionState(0, option.type, option.raw);
      checkbox.checked = selected;
      checkbox.indeterminate = indeterminate;
      checkbox.addEventListener("change", () => {
        this.controller.toggleSetValue(0, i, checkbox.checked);
      });
      row.appendChild(checkbox);

      const label = createElement("span");
      label.className = "pte-set-filter-option-label";
      if (component) {
        label.appendChild(this.renderOptionComponent(option, component));
      } else {
        const labelText = createElement("span", "pte-set-filter-option-label-text");
        labelText.textContent = option.label;
        label.appendChild(labelText);
        if (option.count !== undefined) {
          const count = createElement("span", "pte-set-filter-option-count");
          count.textContent = String(option.count);
          label.appendChild(count);
        }
      }
      row.appendChild(label);

      rows.appendChild(row);

      if (selectedIdx === i) {
        row.classList.add("focused");
        rowToFocus = row;
      }
    }
    this.destroyStaleValueComponents(liveComponentKeys);
    this.conditionContainer.replaceChildren(rows);
    rowToFocus?.focus();
  }

  private getOptionComponent(option: SetFilterOption): SetFilterComponent<any> | undefined {
    switch (option.type) {
      case "value": return this.spec.params.valueComponent;
      case "select_all": return this.spec.params.selectAllComponent;
      case "blanks": return this.spec.params.blanksComponent;
    }
  }

  private renderOptionComponent(option: SetFilterOption, component: SetFilterComponent<any>): HTMLElement {
    const params = option.type === "value"
      ? {
          value: option.raw,
          valueFormatted: option.label,
          count: option.count,
          colDef: this.spec.column,
          api: this.api,
          ...(this.spec.params.valueComponentParams ?? {}),
        } satisfies SetFilterValueComponentParams
      : {
          label: option.label,
          count: option.count,
          colDef: this.spec.column,
          api: this.api,
          ...(option.type === "select_all"
            ? this.spec.params.selectAllComponentParams ?? {}
            : this.spec.params.blanksComponentParams ?? {}),
        } satisfies SetFilterSpecialValueComponentParams;

    const current = this.valueComponents.get(option.key);
    if (!current || current.component !== component) {
      current?.runtime.destroy();
      const runtime = createSetFilterComponentRuntime(component, params);
      this.valueComponents.set(option.key, { component, runtime });
      return runtime.gui;
    }

    if (current.runtime.refresh(params) === false) {
      current.runtime.destroy();
      current.runtime = createSetFilterComponentRuntime(component, params);
    }
    return current.runtime.gui;
  }

  private clearOptions(): void {
    this.destroyValueComponents();
    this.conditionContainer.replaceChildren();
  }

  private destroyStaleValueComponents(liveKeys: Set<string>): void {
    for (const [key, record] of this.valueComponents) {
      if (liveKeys.has(key)) continue;
      record.runtime.destroy();
      this.valueComponents.delete(key);
    }
  }

  private destroyValueComponents(): void {
    for (const record of this.valueComponents.values()) record.runtime.destroy();
    this.valueComponents.clear();
  }
}
