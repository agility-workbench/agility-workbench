import { FilterController } from "../../filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState } from "../../filter/types";
import { createElement, div } from "../element";
import { FilterDef, FilterType, valuesNeededFor } from "../../interfaces/filter";
import { IFilterRenderer } from "@grid/interfaces/iFilterRenderer";

export class BasicFilterRenderer implements IFilterRenderer {
  private root: HTMLElement;
  private joinToggle!: HTMLElement;
  private conditionContainer!: HTMLElement;
  private andCheckbox!: HTMLInputElement;
  private orCheckbox!: HTMLInputElement;

  private conditionsMap: Map<string, HTMLElement> = new Map();

  constructor(private controller: FilterController, private spec: FilterPanelSpec) {
    this.root = div("pte-filter-form");
    this.createFilter();
  }

  getUi(): HTMLElement {
    return this.root;
  }

  onOpen(): void {
    // focus first input
    const firstInput = this.root.querySelector(".pte-filter-input") as HTMLElement;
    if (firstInput) {
      firstInput.focus();
    }
  }

  destroy(): void {

  }

  renderState(state: FilterRuntimeState): void {
    this.toggleJoinToggleState(state);
    this.adjustFilterRows(state);
    this.adjustRowSeparators(state);
  }

  private createFilter() {
    this.createJoinToggle();
    this.createConditionContainer();
  }

  private createJoinToggle() {
    this.joinToggle = div("pte-filter-join-toggle-container");
    this.andCheckbox = this.createJoinCheckbox("and");
    this.orCheckbox = this.createJoinCheckbox("or");
    this.root.appendChild(this.joinToggle);
  }

  private toggleJoinToggleState(state: FilterRuntimeState) {
    if (state.conditionOrder.length > 1) {
      this.joinToggle.classList.add("pte-filter-join-toggle-visible");
    } else {
      this.joinToggle.classList.remove("pte-filter-join-toggle-visible");
    }
    if (state.join === "and") {
      this.andCheckbox.checked = true;
      this.orCheckbox.checked = false;
    } else {
      this.andCheckbox.checked = false;
      this.orCheckbox.checked = true;
    }
  }

  private createJoinCheckbox(join: "and" | "or"): HTMLInputElement {
    const checkbox = createElement("input", "pte-filter-join-toggle");
    checkbox.name = "filter-join";
    checkbox.type = "radio";
    checkbox.addEventListener("change", () => {
      this.controller.setJoin(join as "and" | "or");
    });

    const label = document.createElement("label");
    label.textContent = join.toUpperCase();
    label.prepend(checkbox);

    this.joinToggle.appendChild(label);
    return checkbox;
  }

  private createConditionContainer() {
    this.conditionContainer = div("pte-filter-condition-container");
    this.root.appendChild(this.conditionContainer);
  }

  private adjustFilterRows(state: FilterRuntimeState) {
    const condIDs = new Set(state.conditionOrder);
    // remove deleted conditions
    for (const [condID, row] of this.conditionsMap.entries()) {
      if (!condIDs.has(condID)) {
        row.remove();
        this.conditionsMap.delete(condID);
      }
    }

    for (let idx = 0; idx < state.conditionOrder.length; idx++) {
      const condID = state.conditionOrder[idx];
      const filterDef = state.draft[condID];
      if (!filterDef) continue;
      if (!this.conditionsMap.has(condID)) {
        this.createFilterRow(idx, condID, filterDef);
      } else {
        this.updateFilterRow(idx, condID, filterDef);
      }
    }
  }

  private createFilterRow(idx: number, suffix: string, filter: FilterDef) {
    const row = div("pte-filter-condition-row");
    row.appendChild(this.createFilterTypeSelect(idx, suffix, filter.type));
    const needed = valuesNeededFor(filter.type);
    for (let i = 0; i < needed; i++) {
      row.appendChild(this.createFilterValueInput(idx, suffix, filter.values[i]));
    }
    this.conditionContainer.appendChild(row);
    this.conditionsMap.set(suffix, row);
  }

  private createFilterTypeSelect(idx: number, suffix: string, type: FilterType): HTMLElement {
    const typeSelect = document.createElement("select");
    typeSelect.className = "pte-select pte-filter-select";
    typeSelect.name = `filter-type-${suffix}`;
    typeSelect.setAttribute("data-focus-first", "1");

    const ops = this.spec.params.filterOptions || [];
    for (const op of ops) {
      const opt = document.createElement("option");
      opt.value = op.value;
      opt.selected = op.value === type;
      opt.textContent = op.label;
      typeSelect.appendChild(opt);
    }

    typeSelect.addEventListener("change", (e) => this.controller.setOp(idx, typeSelect.value as FilterType));

    return typeSelect;
  }

  private createFilterValueInput(idx: number, suffix: string, value: any): HTMLElement {
    const input = createElement("input", "pte-filter-input");
    input.name = `filter-value-${suffix}`;
    input.type = this.spec.kind;
    input.value = value ?? "";

    input.addEventListener("input", (e) => this.controller.setValue(idx, 0, input.value));

    return input;
  }

  private updateFilterRow(idx: number, suffix: string, filter: FilterDef) {
    const row = this.conditionsMap.get(suffix);
    if (!row) return;
    const typeSelect = row.querySelector(`select[name="filter-type-${suffix}"]`) as HTMLSelectElement;
    if (typeSelect.value !== filter.type) {
      typeSelect.value = filter.type;
    }

    const needed = valuesNeededFor(filter.type);
    const existingInputs = row.querySelectorAll(`input[name^="filter-value-${suffix}"]`);
    for (let i = 0; i < needed; i++) {
      let input = existingInputs[i] as HTMLInputElement;
      if (!input) {
        input = this.createFilterValueInput(idx, suffix, filter.values[i]) as HTMLInputElement;
        row.appendChild(input);
      } else {
        if (input.value !== (filter.values[i] ?? "")) {
          input.value = filter.values[i] ?? "";
        }
      }
    }
    // remove extra inputs
    for (let i = needed; i < existingInputs.length; i++) {
      existingInputs[i].remove();
    }
  }

  private adjustRowSeparators(state: FilterRuntimeState) {
    const toRemove: HTMLElement[] = [];
    for (let i = 0; i < this.conditionContainer.children.length; i++) {
      const row = this.conditionContainer.children[i];
      if (row instanceof HTMLElement && row.classList.contains("pte-filter-separator")) {
        toRemove.push(row);
      }
    }

    toRemove.forEach(r => r.remove());

    const join = state.join.toUpperCase();
    for (let idx = 0; idx < state.conditionOrder.length - 1; idx++) {
      const row = this.createRowSeparator(join);
      this.conditionContainer.insertBefore(row, this.conditionContainer.children[idx * 2 + 1]);
    }
  }

  private createRowSeparator(join: string): HTMLElement {
    const row = div("pte-filter-separator");
    row.setAttribute("data-join", join.toUpperCase());
    return row;
  }
}
