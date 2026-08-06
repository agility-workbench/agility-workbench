import { FilterController } from "../../filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState, SetFilterOptions as SetFilterOption } from "../../filter/types";
import { IFilterRenderer } from "../../interfaces/iFilterRenderer";
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
    if (uiState.error) {
      this.conditionContainer.innerHTML = `<div class="pte-set-filter-error">Error loading values</div>`;
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
    if (uiState.options && uiState.options.length > 0) {
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
    this.root.tabIndex = 0; // make root focusable to capture keyboard events
    this.root.addEventListener("keydown", (e) => {
      // Toggle through options with arrow keys and space/enter
      const focusableOptions = this.conditionContainer.querySelectorAll<HTMLLabelElement>("label.pte-set-filter-option");
      if (focusableOptions.length === 0) return;

      const activeElement = document.activeElement as HTMLElement;
      let currentIndex = Array.from(focusableOptions).findIndex(opt => opt === activeElement);
      if (currentIndex === -1) {
        if (e.key === "Tab") {
          // if focus is not on an option, start from the first one
          focusableOptions[0].classList.add("focused");
          focusableOptions[0].focus();
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        const nextIndex = (currentIndex + 1) % focusableOptions.length;
        focusableOptions[nextIndex].classList.add("focused");
        focusableOptions[nextIndex].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        const prevIndex = (currentIndex - 1 + focusableOptions.length) % focusableOptions.length;
        focusableOptions[prevIndex].classList.add("focused");
        focusableOptions[prevIndex].focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        focusableOptions[0].classList.add("focused");
        focusableOptions[0].focus();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        focusableOptions[currentIndex].classList.remove("focused");
        focusableOptions[focusableOptions.length - 1].classList.add("focused");
        focusableOptions[focusableOptions.length - 1].focus();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        focusableOptions[currentIndex].click();
      }
    });
  }

  private createOptionRows(options: SetFilterOption[], selectedIdx?: number) {
    this.conditionContainer.innerHTML = "";
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
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
      label.textContent = option.label;
      row.appendChild(label);

      this.conditionContainer.appendChild(row);

      if (selectedIdx === i) {
        row.classList.add("focused");
        row.focus();
      }
    }
  }

}
