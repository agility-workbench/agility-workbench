import { FilterController } from "../../filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState } from "../../filter/types";
import { button, createElement, div } from "../element";
import { FilterDef, FilterType, valuesNeededFor } from "../../interfaces/filter";
import { IFilterRenderer } from "../../interfaces/iFilterRenderer";
import { staticSetValue } from "../../filter/setFilterCore";
import { defaultLocaleText, type LocaleTextResolver } from "../../interfaces/locale";

export class BasicFilterRenderer implements IFilterRenderer {
  private root: HTMLElement;
  private joinToggle!: HTMLElement;
  private conditionContainer!: HTMLElement;
  private andCheckbox!: HTMLInputElement;
  private orCheckbox!: HTMLInputElement;

  private conditionsMap: Map<string, HTMLElement> = new Map();
  private readonly t: LocaleTextResolver;

  constructor(private controller: FilterController, private spec: FilterPanelSpec) {
    this.t = spec.localeText ?? defaultLocaleText;
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
    label.textContent = this.t(join === "and" ? "filterJoinAnd" : "filterJoinOr");
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
      row.appendChild(this.createFilterValueInput(idx, suffix, i, filter.values[i]));
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

  /**
   * The value control for one operand of a condition: `valueIdx` is the operand's position (0, or 1
   * for the upper bound of Between / Not between). A boolean filter, and a dropdown filter with a
   * static `filterValues` list, get a select whose empty first choice ("Any") leaves the condition
   * unset; every other kind gets a text, number, or date input.
   */
  private createFilterValueInput(idx: number, suffix: string, valueIdx: number, value: any): HTMLElement {
    const choices = this.valueChoices();
    if (choices) return this.createFilterValueSelect(idx, suffix, valueIdx, value, choices);

    const wrap = div("pte-filter-input-wrap");

    const input = createElement("input", "pte-filter-input");
    input.name = `filter-value-${suffix}`;
    input.setAttribute("data-filter-value", String(valueIdx));
    input.type = this.spec.kind === "number" || this.spec.kind === "date" ? this.spec.kind : "text";
    input.value = value ?? "";

    const clearBtn = button("pte-filter-input-clear");
    clearBtn.type = "button";
    clearBtn.tabIndex = -1;
    clearBtn.setAttribute("aria-label", this.t("clearFilterValue"));
    clearBtn.innerHTML = "&times;";

    const syncClear = () => wrap.classList.toggle("pte-filter-input-clear-visible", input.value !== "");

    input.addEventListener("input", () => {
      this.controller.setValue(idx, valueIdx, input.value);
      syncClear();
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      this.controller.setValue(idx, valueIdx, "");
      syncClear();
      input.focus();
    });

    syncClear();
    wrap.appendChild(input);
    wrap.appendChild(clearBtn);
    return wrap;
  }

  /** The fixed choices of a select-style filter, or null for a free-entry input. */
  private valueChoices(): { value: string; label: string }[] | null {
    if (this.spec.kind === "boolean") {
      return [
        { value: "true", label: this.t("filterTrue") },
        { value: "false", label: this.t("filterFalse") },
      ];
    }
    const values = this.spec.params.filterValues;
    if (this.spec.conditionTemplate?.valueInputType === "dropdown" && Array.isArray(values)) {
      return values.map(entry => {
        const value = staticSetValue(entry);
        const text = value == null ? "" : String(value);
        return { value: text, label: text };
      });
    }
    return null;
  }

  private createFilterValueSelect(
    idx: number,
    suffix: string,
    valueIdx: number,
    value: any,
    choices: { value: string; label: string }[],
  ): HTMLElement {
    const select = document.createElement("select");
    select.className = "pte-select pte-filter-select pte-filter-value-select";
    select.name = `filter-value-${suffix}`;
    select.setAttribute("data-filter-value", String(valueIdx));
    select.setAttribute("aria-label", this.t("filterValue"));
    for (const choice of [{ value: "", label: this.t("filterAny") }, ...choices]) {
      const opt = document.createElement("option");
      opt.value = choice.value;
      opt.textContent = choice.label;
      select.appendChild(opt);
    }
    select.value = value == null ? "" : String(value);
    select.addEventListener("change", () => this.controller.setValue(idx, valueIdx, select.value));
    return select;
  }

  private updateFilterRow(idx: number, suffix: string, filter: FilterDef) {
    const row = this.conditionsMap.get(suffix);
    if (!row) return;
    const typeSelect = row.querySelector(`select[name="filter-type-${suffix}"]`) as HTMLSelectElement;
    if (typeSelect.value !== filter.type) {
      typeSelect.value = filter.type;
    }

    const needed = valuesNeededFor(filter.type);
    const existingInputs = row.querySelectorAll(`[name="filter-value-${suffix}"]`);
    for (let i = 0; i < needed; i++) {
      const input = existingInputs[i] as HTMLInputElement | HTMLSelectElement | undefined;
      if (!input) {
        row.appendChild(this.createFilterValueInput(idx, suffix, i, filter.values[i]));
      } else {
        const next = filter.values[i] == null ? "" : String(filter.values[i]);
        if (input.value !== next) {
          input.value = next;
        }
        // Keep the clear button in sync when the value changes from state (not just user typing).
        const wrap = input.closest(".pte-filter-input-wrap");
        wrap?.classList.toggle("pte-filter-input-clear-visible", input.value !== "");
      }
    }
    // remove extra inputs (remove the wrapper, not just the input)
    for (let i = needed; i < existingInputs.length; i++) {
      (existingInputs[i].closest(".pte-filter-input-wrap") ?? existingInputs[i]).remove();
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
