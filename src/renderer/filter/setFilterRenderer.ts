import { FilterController } from "@grid/filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState, SetFilterOptions as SetFilterOption } from "@grid/filter/types";
import { IFilterRenderer } from "@grid/interfaces/iFilterRenderer";
import { createElement, div } from "../element";
import { Overlay } from "../overlay";

export class SetFilterRenderer implements IFilterRenderer {
  private root: HTMLElement;
  private loader!: Overlay;
  private conditionContainer!: HTMLElement;
  private miniFilterInput!: HTMLInputElement;

  constructor(private controller: FilterController, private spec: FilterPanelSpec) {
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

  }

  renderState(state: FilterRuntimeState): void {
    if (state.conditionOrder.length === 0) {
      this.conditionContainer.innerHTML = "";
      return;
    }

    const conditionId = state.conditionOrder[0];
    const uiState = state.ui[conditionId];
    if (!uiState) {
      this.conditionContainer.innerHTML = "";
      return;
    }
    if (uiState.loading) {
      if (!this.loader) {
        this.loader = new Overlay("Loading values…");
        this.conditionContainer.appendChild(this.loader.getUi());
      }
      this.loader.show();
    } else if (uiState.loading === false) {
      if (this.loader) this.loader.hide();
    } else if (uiState.error) {
        this.conditionContainer.innerHTML = `<div class="pte-set-filter-error">Error loading values</div>`;
    }
    if (uiState.options && uiState.options.length > 0) {
      this.createOptionRows(uiState.options);
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
      if (e.key !== "Enter") return;
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
  }

  private createOptionRows(options: SetFilterOption[]) {
    this.conditionContainer.innerHTML = "";
    for (const option of options) {
      if (option.hidden) continue;
      const row = createElement("label", "pte-set-filter-option");
      const checkbox = createElement("input");
      checkbox.name = `pte-set-filter-option-checkbox-${option.key}`;
      checkbox.type = "checkbox";
      if (option.type === "select_all") {
        checkbox.setAttribute("aria-label", "Select all values");
      } else if (option.type === "blanks") {
        checkbox.setAttribute("aria-label", "Include blank values");
      }
      const {selected, indeterminate} = this.controller.getSetOptionState(0, option.type, option.raw);
      checkbox.checked = selected;
      checkbox.indeterminate = indeterminate;
      checkbox.addEventListener("change", () => {
        this.controller.toggleSetValue(0, option.type, option.raw, checkbox.checked);
      });
      row.appendChild(checkbox);

      const label = createElement("span");
      label.className = "pte-set-filter-option-label";
      label.textContent = option.label;
      row.appendChild(label);

      this.conditionContainer.appendChild(row);
    }
  }

}
