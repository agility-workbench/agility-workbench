import { FilterController } from "../../filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState, SetFilterOptions as SetFilterOption } from "../../filter/types";
import { GroupExpansion, groupExpansion, hasSetFilterGroups, SiblingPosition, siblingPositions, visibleSetOptions } from "../../filter/setFilterTree";
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
  SetFilterGroupComponentParams,
  SetFilterSpecialValueComponentParams,
  SetFilterValueComponentParams,
} from "./setFilterValueComponent";

interface ValueComponentRecord {
  component: SetFilterComponent<any>;
  runtime: SetFilterComponentRuntime<any>;
}

/**
 * The set filter's value list. In the flat layout it is a list of labelled checkboxes; a tree
 * column (`spec.tree`) whose values produced groups renders the same rows indented by level, with a
 * chevron before each group, and exposes them as a `tree` of `treeitem`s: Select All is the root
 * and every other row sits beneath it, each with its level, its position among its siblings, its
 * checked state, and (groups) whether it is open; the native checkbox inside a tree row is hidden
 * from AT since the row itself is the checkable item. In the flat layout the list is a labelled
 * `group` and focus sits on each row's native checkbox — a named, checkable control everywhere —
 * rather than on the `<label>` around it, which has no role and no name. The tree's rows are the
 * controller's own pre-order option list filtered by `visibleSetOptions`, so a row's `data-idx` is
 * the index the controller addresses — the same index a flat row's toggle has always sent.
 */
export class SetFilterRenderer implements IFilterRenderer {
  private static instances = 0;
  private root: HTMLElement;
  /** Prefix for the ids `aria-describedby` points at; unique per renderer so grids on one page do not collide. */
  private readonly idPrefix = `pte-set-filter-${++SetFilterRenderer.instances}`;
  private loader!: Overlay;
  private conditionContainer!: HTMLElement;
  private miniFilterInput!: HTMLInputElement;
  private valueComponents = new Map<string, ValueComponentRecord>();
  /** Whether the current rows are laid out as a tree (groups present), which turns on tree keys. */
  private treeRows = false;
  /** Whether a mini filter is typed for the rows being painted: every group is then held open. */
  private miniFilterActive = false;

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
      this.setMiniFilterPlaceholder(uiState.options);
      this.createOptionRows(uiState.options, uiState.selectedIdx, (uiState.miniFilter ?? "").length > 0);
    }

  }

  private createFilter() {
    this.createMiniFilter();
    this.createConditionContainer();
  }

  private createMiniFilter() {
    const filterContainer = div("pte-set-filter-mini");
    this.miniFilterInput = createElement("input", "pte-filter-input");
    this.miniFilterInput.name = "pte-set-filter-mini-input";
    this.miniFilterInput.type = "text";
    this.miniFilterInput.className = "pte-filter-input pte-set-filter-input";
    this.setMiniFilterPlaceholder(undefined);

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

  /**
   * The box's placeholder, which is also its accessible name: the application's text, else the
   * built-in prompt — in the tree layout followed by an example of the formatted value a leaf also
   * matches on (`e.g. 2026-01-12`), taken from the first leaf that carries one, because that text
   * is not on screen and the format would otherwise be a guess. Re-resolved on every paint so an
   * async universe gets its example once the values arrive.
   */
  private setMiniFilterPlaceholder(options: SetFilterOption[] | undefined): void {
    let text = this.spec.params.miniFilterPlaceholder;
    if (text === undefined) {
      text = "Type to filter values";
      const example = options?.find(o => o.type === "value" && o.matchText !== undefined)?.matchText;
      if (example !== undefined) text += `, e.g. ${example}`;
    }
    if (this.miniFilterInput.placeholder === text) return;
    this.miniFilterInput.placeholder = text;
    this.miniFilterInput.setAttribute("aria-label", text);
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

      // The current row is the focused one: the row itself in the tree, else the row whose
      // checkbox holds focus — where a mouse click lands it too.
      const activeElement = document.activeElement as HTMLElement | null;
      const activeRow = activeElement?.closest<HTMLLabelElement>("label.pte-set-filter-option") ?? null;
      let currentIndex = activeRow ? Array.from(focusableOptions).indexOf(activeRow) : -1;
      if (currentIndex === -1) {
        // Forward Tab only: Shift+Tab is the user leaving backwards, and capturing it here used to
        // drag focus onto the first option instead.
        if (matchesChord(e, "tab")) {
          // if focus is not on an option, start from the first one
          this.focusOption(focusableOptions, -1, 0);
          e.preventDefault();
        }
        return;
      }

      // Bare chords: none of these list gestures reads a modifier, so a modified arrow keeps its
      // platform meaning instead of walking the option list.
      if (matchesChord(e, "arrowdown")) {
        e.preventDefault();
        this.focusOption(focusableOptions, currentIndex, (currentIndex + 1) % focusableOptions.length);
      } else if (matchesChord(e, "arrowup")) {
        e.preventDefault();
        this.focusOption(focusableOptions, currentIndex, (currentIndex - 1 + focusableOptions.length) % focusableOptions.length);
      } else if (matchesChord(e, "home")) {
        e.preventDefault();
        this.focusOption(focusableOptions, currentIndex, 0);
      } else if (matchesChord(e, "end")) {
        e.preventDefault();
        this.focusOption(focusableOptions, currentIndex, focusableOptions.length - 1);
      } else if (matchesChord(e, "arrowleft")) {
        e.preventDefault();
        if (this.treeRows) this.treeArrowLeft(focusableOptions, currentIndex);
        else this.focusOption(focusableOptions, currentIndex, 0);
      } else if (matchesChord(e, "arrowright")) {
        e.preventDefault();
        if (this.treeRows) this.treeArrowRight(focusableOptions, currentIndex);
        else this.focusOption(focusableOptions, currentIndex, focusableOptions.length - 1);
      } else if (matchesAnyChord(e, ["space", "enter"])) {
        // Flat layout: focus is on the native checkbox, and Space toggles it natively.
        if (activeElement instanceof HTMLInputElement && matchesChord(e, "space")) return;
        e.preventDefault();
        focusableOptions[currentIndex].click();
      }
    });
  }

  private focusOption(rows: NodeListOf<HTMLLabelElement>, from: number, to: number): void {
    if (from >= 0) rows[from].classList.remove("focused");
    rows[to].classList.add("focused");
    this.focusTarget(rows[to]).focus();
  }

  /**
   * What takes focus for a row. In the tree it is the row, the treeitem. In the flat layout it is
   * the native checkbox: the `<label>` around it has no role and no name, so focus parked there
   * read as nothing, and a mouse click put focus on the checkbox anyway, where the arrow keys then
   * found no current row.
   */
  private focusTarget(row: HTMLLabelElement): HTMLElement {
    return this.treeRows ? row : row.querySelector("input") ?? row;
  }

  /**
   * Tree pattern: Right opens a closed group, or steps into an open one (its first child is the
   * next row). On the root, "some" counts as closed: Right opens the rest.
   */
  private treeArrowRight(rows: NodeListOf<HTMLLabelElement>, currentIndex: number): void {
    const row = rows[currentIndex];
    const expansion = row.dataset.expansion as GroupExpansion | undefined;
    if (expansion === "none" || expansion === "some") {
      this.controller.setSetGroupExpanded(0, Number(row.dataset.idx), true);
    } else if (expansion === "all" && currentIndex + 1 < rows.length) {
      this.focusOption(rows, currentIndex, currentIndex + 1);
    }
  }

  /**
   * Tree pattern: Left closes an open group, or moves from any other row to its parent — Select
   * All for a row at the top of the tree. On the root, "some" counts as open: Left closes the rest.
   */
  private treeArrowLeft(rows: NodeListOf<HTMLLabelElement>, currentIndex: number): void {
    const row = rows[currentIndex];
    const expansion = row.dataset.expansion as GroupExpansion | undefined;
    if (expansion === "all" || expansion === "some") {
      this.controller.setSetGroupExpanded(0, Number(row.dataset.idx), false);
      return;
    }
    const level = Number(row.dataset.level ?? 0);
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (Number(rows[i].dataset.level ?? 0) < level) {
        this.focusOption(rows, currentIndex, i);
        return;
      }
    }
  }

  private createOptionRows(options: SetFilterOption[], selectedIdx?: number, miniFilterActive = false) {
    const liveComponentKeys = new Set<string>();
    for (const option of options) {
      if (this.getOptionComponent(option)) liveComponentKeys.add(option.key);
    }

    // A tree column whose values produced no groups is a flat list: no chevrons, no tree roles.
    this.treeRows = !!this.spec.tree && hasSetFilterGroups(options);
    this.miniFilterActive = miniFilterActive;
    // The flat list is a labelled group of checkboxes; the tree is a tree.
    this.conditionContainer.setAttribute("role", this.treeRows ? "tree" : "group");
    this.conditionContainer.setAttribute("aria-label", "Filter values");

    const rows = document.createDocumentFragment();
    let rowToFocus: HTMLLabelElement | null = null;
    // While a mini filter is typed every surviving group is held open, so paint that state.
    const rootExpansion: GroupExpansion = !this.treeRows ? "all" : miniFilterActive ? "all" : groupExpansion(options);
    // Every row's state in one pass, rather than one query per row that rescans the list.
    const states = this.controller.getSetOptionStates(0);
    const visible = visibleSetOptions(options, miniFilterActive);
    const positions = this.treeRows ? siblingPositions(options, visible) : [];
    for (let v = 0; v < visible.length; v++) {
      const i = visible[v];
      const option = options[i];
      const component = this.getOptionComponent(option);
      const row = createElement("label", "pte-set-filter-option");
      row.tabIndex = -1; // make label focusable for keyboard navigation
      row.dataset.idx = String(i);
      const { selected, indeterminate } = states[i] ?? { selected: false, indeterminate: false };
      if (this.treeRows) this.decorateTreeRow(row, option, i, miniFilterActive, rootExpansion, selected, indeterminate, positions[v]);

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
      checkbox.checked = selected;
      checkbox.indeterminate = indeterminate;
      if (this.treeRows) {
        // The row is the treeitem and carries aria-checked, so its native checkbox is hidden from
        // AT: exposed, its label folded into the row's name ("Fruit Fruit 3") and it read as a
        // second checked control inside every row. A label click still lands browser focus on
        // its control — now a hidden element — so focus is handed straight back to the row.
        checkbox.setAttribute("aria-hidden", "true");
        checkbox.addEventListener("focus", () => row.focus());
      }
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
          // A sighted user reads the muted number as a count; a reader hears "3 rows", not "3".
          const unit = createElement("span", "pte-sr-only");
          unit.textContent = option.count === 1 ? " row" : " rows";
          label.appendChild(unit);
          if (!this.treeRows) {
            // The flat checkbox's name is the value's label by contract (`valueFormatter`); the
            // count reaches a reader as its description.
            count.id = `${this.idPrefix}-count-${i}`;
            unit.id = `${this.idPrefix}-unit-${i}`;
            checkbox.setAttribute("aria-describedby", `${count.id} ${unit.id}`);
          }
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
    if (rowToFocus) this.focusTarget(rowToFocus).focus();
  }

  /**
   * Tree rows: indent by level, carry the tree ARIA (level, position among siblings, expanded,
   * checked — mirroring what is painted), and lead with a chevron on groups and on select_all (the
   * root, whose chevron reports how much of the tree is open and opens or closes every group) or a
   * spacer on everything else so labels align.
   *
   * Select All is the tree's single root as AT sees it: a level-0 group is its child, one level
   * deeper, which is what its chevron (opens everything beneath) and its mixed checkbox (some of
   * what is beneath is checked) already say. `data-level` holds that depth, which is what Left
   * walks to find a parent; the indent keeps the visual level, so root groups line up with
   * Select All as in the flat layout.
   */
  private decorateTreeRow(
    row: HTMLLabelElement,
    option: SetFilterOption,
    idx: number,
    miniFilterActive: boolean,
    rootExpansion: GroupExpansion,
    selected: boolean,
    indeterminate: boolean,
    position: SiblingPosition,
  ): void {
    const level = option.level ?? 0;
    const depth = option.type === "select_all" ? 0 : level + 1;
    row.classList.add("pte-set-filter-option-tree");
    row.style.setProperty("--pte-set-filter-level", String(level));
    row.dataset.level = String(depth);
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", String(depth + 1));
    row.setAttribute("aria-posinset", String(position.pos));
    row.setAttribute("aria-setsize", String(position.size));
    row.setAttribute("aria-checked", indeterminate ? "mixed" : String(selected));

    if (option.type === "group") {
      row.classList.add("pte-set-filter-option-group");
      // While a mini filter is typed every surviving group is held open, so paint that state.
      this.appendExpander(row, idx, miniFilterActive || !!option.expanded ? "all" : "none");
    } else if (option.type === "select_all") {
      row.classList.add("pte-set-filter-option-root");
      this.appendExpander(row, idx, rootExpansion);
    } else {
      const spacer = createElement("span", "pte-set-filter-expander-spacer");
      spacer.setAttribute("aria-hidden", "true");
      row.appendChild(spacer);
    }
  }

  /**
   * A group's chevron is open or closed; the root's can also be "some" — painted as a dash, like the
   * indeterminate checkbox beside it, read by AT as expanded (the groups it directly holds are all
   * in view), and treated by a click and by Right as closed (they open the rest) and by Left as
   * open (it closes the rest).
   */
  private appendExpander(row: HTMLLabelElement, idx: number, expansion: GroupExpansion): void {
    row.dataset.expansion = expansion;
    row.setAttribute("aria-expanded", String(expansion !== "none"));
    const expander = createElement("span", "pte-set-filter-expander");
    // Mouse-only and unnamed, like the grid's group chevron: the row itself carries aria-expanded,
    // and the keyboard opens and closes it with Left/Right.
    expander.setAttribute("aria-hidden", "true");
    const iconClass = expansion === "all" ? "icon-group-expanded" : expansion === "some" ? "icon-group-mixed" : "icon-group-collapsed";
    const icon = createElement("span", "pte-set-filter-expander-icon " + iconClass);
    expander.appendChild(icon);
    expander.addEventListener("click", (e) => {
      // The chevron sits inside the row's <label>: cancelling the click keeps the label from
      // toggling the checkbox, so opening a group never changes what is checked.
      e.preventDefault();
      e.stopPropagation();
      this.controller.setSetGroupExpanded(0, idx, expansion !== "all");
    });
    row.appendChild(expander);
  }

  private getOptionComponent(option: SetFilterOption): SetFilterComponent<any> | undefined {
    switch (option.type) {
      case "value": return this.spec.params.valueComponent;
      case "select_all": return this.spec.params.selectAllComponent;
      case "blanks": return this.spec.params.blanksComponent;
      case "group": return this.spec.params.groupComponent;
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
      : option.type === "group"
      ? {
          label: option.label,
          count: option.count,
          level: option.level ?? 0,
          path: option.path ?? [],
          segment: option.path?.[option.path.length - 1],
          // The painted state: a typed mini filter holds every group open.
          expanded: this.miniFilterActive || !!option.expanded,
          colDef: this.spec.column,
          api: this.api,
          ...(this.spec.params.groupComponentParams ?? {}),
        } satisfies SetFilterGroupComponentParams
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
