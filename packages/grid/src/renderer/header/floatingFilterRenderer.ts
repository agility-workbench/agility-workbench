import type { Column } from "../../column/column";
import type { GridCore } from "../../core/core";
import { ColumnFilterMenuService } from "../../filter/filterMenuService";
import { staticSetValue } from "../../filter/setFilterCore";
import type { FilterPanelSpec } from "../../filter/types";
import { FilterType, valuesNeededFor, type FilterItem } from "../../interfaces/filter";
import { isFalse } from "../../misc";
import { stampGridCellAria } from "../aria";
import { createElement } from "../element";
import { isRtl } from "../layout/direction";
import type { FloatingFilterRowElements } from "./wrapper";

/**
 * The floating filter row (`GridOptions.floatingFilter`): one control per filterable leaf column,
 * under the header levels, bound to that column's entry in the filter model.
 *
 * The row only ever writes through the core's filter-model API (`addFilterModel` /
 * `removeFilterModel`), exactly like the column filter popup, so `filterChanged`, the header's
 * filter indicator and the popup see one model. It reads back from the same model on every filter
 * change ({@link FloatingFilterRenderer.syncFromModel}), so a filter set from the popup, the API, a
 * saved view or a clear shows up here.
 *
 * Which control a column gets follows the filter popup's own resolution (`ColumnFilterMenuService`):
 *   - text / number / date → an input editing ONE condition: the model's own operator when it holds a
 *     single one-value condition, else the column's first offered operator (`contains` for text,
 *     `equals` for numbers and dates);
 *   - boolean, and `filter: "dropdown"` with a static `filterValues` list → a select (Any / values);
 *   - set and tree filters → a read-only summary button ("(3) A, B, C", "All") opening the popup;
 *   - any model the single control cannot show (two conditions, Between, Is blank, Not equal on a
 *     select) → the same read-only summary, until it is cleared or replaced from the popup.
 * Leading utility columns and columns without a filter (or with `ColDef.floatingFilter: false`)
 * get an empty cell, so the row keeps one cell per leaf.
 */

type ControlKind = "text" | "number" | "date" | "select" | "summary" | "none";

interface FloatingCell {
  col: Column;
  el: HTMLDivElement;
  kind: ControlKind;
  spec: FilterPanelSpec | null;
  /** The editable control (input or select); absent for summary-only and empty cells. */
  control: HTMLInputElement | HTMLSelectElement | null;
  /** Read-only text standing in for the control when the model is more than it can edit. */
  summary: HTMLButtonElement | null;
  /** Opens the full filter popup; text, number and date cells only. */
  openButton: HTMLButtonElement | null;
  /** The operator the control writes with. */
  op: FilterType;
  /** Debounce timer of a typed value not yet applied. */
  timer: ReturnType<typeof setTimeout> | null;
}

export interface FloatingFilterRendererParams {
  core: GridCore;
  root: HTMLElement;
  sections: FloatingFilterRowElements;
  openColumnFilter: (colID: string, anchorEl: HTMLElement) => void;
}

export class FloatingFilterRenderer {
  private cells = new Map<string, FloatingCell>();
  private readonly menuService: ColumnFilterMenuService;

  constructor(private params: FloatingFilterRendererParams) {
    this.menuService = new ColumnFilterMenuService(params.core);
    const { row } = params.sections;
    // Keys typed into the row belong to its controls: the grid's keyboard router would otherwise see
    // them bubble to the root (a button is not a form control to its blocking scope, so Enter on a
    // summary would reach the body cursor). The row handles what it means itself.
    row.addEventListener("keydown", (e) => this.onKeyDown(e));
    // The header's context menu suppresses the browser's across the whole header; an input keeps
    // its native one (cut / copy / paste).
    row.addEventListener("contextmenu", (e) => e.stopPropagation());
  }

  isEnabled(): boolean {
    return !!this.params.core.options.floatingFilter;
  }

  /** The cell of a column, for tests and keyboard entry. */
  getCellElement(instanceID: string): HTMLElement | null {
    return this.cells.get(instanceID)?.el ?? null;
  }

  /** Rebuild every cell from the column model. Empties the row when the option is off. */
  build(): void {
    const { core } = this.params;
    const { row, leading, left, center, right } = this.params.sections;
    // A rebuild mid-typing (a column change while a value waits for its debounce) carries the typed
    // value over instead of dropping it; focus comes back to the same column's control.
    const pending = new Map<string, string>();
    let focusedCol: string | null = null;
    for (const cell of this.cells.values()) {
      if (cell.timer != null && cell.control) pending.set(cell.col.instanceID, cell.control.value);
      if (cell.timer != null) clearTimeout(cell.timer);
      if (cell.el.contains(document.activeElement)) focusedCol = cell.col.instanceID;
    }
    this.cells.clear();
    leading.replaceChildren();
    left.replaceChildren();
    center.replaceChildren();
    right.replaceChildren();
    const enabled = this.isEnabled();
    row.classList.toggle("pte-floating-filter-row-visible", enabled);
    if (!enabled) {
      center.removeAttribute("aria-owns");
      return;
    }
    const model = core.getColumnModel();
    const lookup = model.leafColumnLookup;
    const ids: string[] = [];
    const sections: [HTMLDivElement, Column[]][] = [
      [leading, model.getLeadingLeaves()],
      [left, model.getLeftLeaves()],
      [center, model.getCenterLeaves()],
      [right, model.getRightLeaves()],
    ];
    for (const [section, leaves] of sections) {
      for (const col of leaves) {
        if (col.hidden) continue;
        const cell = this.buildCell(col, lookup.get(col.instanceID)?.globalIndex);
        section.appendChild(cell.el);
        ids.push(cell.el.id);
        this.cells.set(col.instanceID, cell);
      }
    }
    if (ids.length) center.setAttribute("aria-owns", ids.join(" "));
    else center.removeAttribute("aria-owns");
    this.syncFromModel();
    for (const [id, value] of pending) {
      const cell = this.cells.get(id);
      if (!cell?.control || cell.control.hidden) continue;
      cell.control.value = value;
      this.schedule(cell);
    }
    if (focusedCol) this.focusColumn(focusedCol);
  }

  /** Re-read the filter model into every control (a filter changed anywhere). */
  syncFromModel(): void {
    if (!this.isEnabled()) return;
    const items = this.params.core.getFilterModel().items;
    for (const cell of this.cells.values()) {
      // A value still waiting for its debounce is the user's newest word on this column.
      if (cell.timer != null) continue;
      this.syncCell(cell, items.find(item => matchesColumn(item, cell.col)) ?? null);
    }
  }

  /**
   * Put DOM focus on a column's floating control (its input, select or summary). Returns false when
   * the row is off or the column has nothing focusable there.
   */
  focusColumn(instanceID: string): boolean {
    if (!this.isEnabled()) return false;
    const cell = this.cells.get(instanceID);
    const target = cell && focusTarget(cell);
    if (!target) return false;
    target.focus();
    return true;
  }

  destroy(): void {
    for (const cell of this.cells.values()) {
      if (cell.timer != null) clearTimeout(cell.timer);
    }
    this.cells.clear();
  }

  // ---------------------------------------------------------------- building

  private buildCell(col: Column, globalIndex: number | undefined): FloatingCell {
    const { core } = this.params;
    const el = createElement("div", "pte-floating-filter-cell");
    el.id = `${core.id}-ff-${col.instanceID}`;
    el.dataset.colId = col.instanceID;
    el.style.width = `${col.computedWidth}px`;
    stampGridCellAria(el, globalIndex);
    const cell: FloatingCell = {
      col, el, kind: "none", spec: null, control: null, summary: null, openButton: null,
      op: FilterType.CONTAINS, timer: null,
    };
    if (!hasFloatingFilter(col)) {
      el.classList.add("pte-floating-filter-cell-empty");
      return cell;
    }
    const spec = this.menuService.buildFilterMenu({ trigger: "api", targetCol: col });
    cell.spec = spec;
    cell.op = defaultOp(spec);
    const label = col.label ?? col.key;
    const dir = isRtl(this.params.root) ? "rtl" : "ltr";
    const body = createElement("div", "pte-floating-filter-body");
    el.appendChild(body);

    // The read-only stand-in: every cell that has a filter gets one (set filters only this).
    const summary = createElement("button", "pte-floating-filter-summary");
    summary.type = "button";
    summary.dir = dir;
    summary.addEventListener("click", () => this.openFilter(cell, summary));
    body.appendChild(summary);
    cell.summary = summary;

    cell.kind = controlKind(spec);
    if (cell.kind === "select") {
      const select = createElement("select", "pte-floating-filter-input pte-floating-filter-select");
      select.dir = dir;
      const choices = selectChoices(spec, (key) => core.getLocaleText(key));
      for (const choice of [{ value: "", label: core.getLocaleText("filterAny") }, ...choices]) {
        const opt = document.createElement("option");
        opt.value = choice.value;
        opt.textContent = choice.label;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => this.apply(cell));
      body.insertBefore(select, summary);
      cell.control = select;
    } else if (cell.kind !== "summary") {
      const input = createElement("input", "pte-floating-filter-input");
      input.type = cell.kind;
      input.dir = dir;
      input.autocomplete = "off";
      input.spellcheck = false;
      if (cell.kind === "date") {
        input.addEventListener("change", () => this.apply(cell));
      } else {
        input.addEventListener("input", () => this.schedule(cell));
      }
      body.insertBefore(input, summary);
      cell.control = input;

      const open = createElement("button", "pte-floating-filter-button");
      open.type = "button";
      // One Tab stop per column: the button is reachable by pointer, and from the input with
      // Alt+ArrowDown (the header's own filter chord).
      open.tabIndex = -1;
      open.setAttribute("aria-label", core.getLocaleText("floatingFilterOpen", { column: label }));
      open.appendChild(createElement("span", "pte-filter-icon"));
      open.addEventListener("click", () => this.openFilter(cell, open));
      body.appendChild(open);
      cell.openButton = open;
    }
    const name = core.getLocaleText("floatingFilterLabel", { column: label });
    cell.control?.setAttribute("aria-label", name);
    summary.setAttribute("aria-label", name);
    summary.setAttribute("aria-haspopup", "dialog");
    return cell;
  }

  // ---------------------------------------------------------------- model → controls

  private syncCell(cell: FloatingCell, item: FilterItem | null): void {
    const { spec } = cell;
    if (!spec) return;
    cell.el.classList.toggle("pte-floating-filter-active", item != null);
    cell.openButton?.classList.toggle("pte-floating-filter-button-active", item != null);
    const editable = this.editableValue(cell, item);
    if (editable && cell.control) {
      if (editable.op) cell.op = editable.op;
      if (cell.control.value !== editable.value) cell.control.value = editable.value;
      this.updateOperatorHint(cell);
      this.showControl(cell, true);
      return;
    }
    if (cell.summary) cell.summary.textContent = this.describe(cell, item);
    this.showControl(cell, false);
  }

  /**
   * What the editable control shows for `item`, or null when it cannot represent it (the cell then
   * shows the read-only summary). `op` is the operator a typed value will be written with.
   */
  private editableValue(cell: FloatingCell, item: FilterItem | null): { value: string; op?: FilterType } | null {
    if (cell.kind === "summary" || cell.kind === "none") return null;
    if (!item || item.filters.length === 0) return { value: "", op: defaultOp(cell.spec!) };
    if (item.filters.length !== 1) return null;
    const [def] = item.filters;
    if (cell.kind === "select") {
      if (def.type !== FilterType.EQ || valuesNeededFor(def.type) !== 1) return null;
      const value = def.values?.[0] == null ? "" : String(def.values[0]);
      // A value the select does not list (set from the API) is shown read-only, not dropped.
      const listed = Array.from((cell.control as HTMLSelectElement).options).some(o => o.value === value);
      return listed ? { value, op: def.type } : null;
    }
    if (valuesNeededFor(def.type) !== 1) return null;
    if (def.type === FilterType.IN || def.type === FilterType.NOT_IN) return null;
    const raw = def.values?.[0];
    return { value: raw == null ? "" : String(raw), op: def.type };
  }

  private showControl(cell: FloatingCell, editable: boolean): void {
    if (cell.control) cell.control.hidden = !editable;
    if (cell.summary) cell.summary.hidden = editable;
    cell.el.classList.toggle("pte-floating-filter-readonly", !editable);
  }

  /** The operator the input writes with, as its placeholder and the open button's tooltip. */
  private updateOperatorHint(cell: FloatingCell): void {
    if (cell.kind !== "text" && cell.kind !== "number" && cell.kind !== "date") return;
    const label = opLabel(cell.spec!, cell.op);
    const input = cell.control as HTMLInputElement;
    if (cell.kind !== "date" && input.placeholder !== label) input.placeholder = label;
    if (cell.openButton && cell.openButton.title !== label) cell.openButton.title = label;
  }

  /** Read-only text for a model the control cannot edit (or a set filter's selection). */
  private describe(cell: FloatingCell, item: FilterItem | null): string {
    const { core } = this.params;
    const spec = cell.spec!;
    if (!item || item.filters.length === 0) {
      return cell.kind === "summary" ? core.getLocaleText("floatingFilterAll") : "";
    }
    const valueText = (value: any): string => {
      if (value == null || value === "") return core.getLocaleText("blanks");
      if (spec.valueLabel) {
        try {
          return spec.valueLabel(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    };
    const parts = item.filters.map(def => {
      if (def.type === FilterType.IN || def.type === FilterType.NOT_IN) {
        const values: any[] = Array.isArray(def.values) ? def.values : [];
        const list = `(${values.length}) ${values.map(valueText).join(", ")}`.trim();
        return def.type === FilterType.IN ? list : core.getLocaleText("floatingFilterAllExcept", { values: list });
      }
      const label = opLabel(spec, def.type);
      const values: any[] = Array.isArray(def.values) ? def.values.slice(0, valuesNeededFor(def.type)) : [];
      return values.length ? `${label} ${values.map(v => (v == null ? "" : String(v))).join(" – ")}` : label;
    });
    const join = core.getLocaleText(item.join === "or" ? "filterJoinOr" : "filterJoinAnd");
    return parts.join(` ${join} `);
  }

  // ---------------------------------------------------------------- controls → model

  private schedule(cell: FloatingCell): void {
    if (cell.timer != null) clearTimeout(cell.timer);
    const delay = this.debounceMs(cell);
    cell.timer = setTimeout(() => {
      cell.timer = null;
      this.apply(cell);
    }, delay);
  }

  private flush(cell: FloatingCell): void {
    if (cell.timer == null) return;
    clearTimeout(cell.timer);
    cell.timer = null;
    this.apply(cell);
  }

  private debounceMs(cell: FloatingCell): number {
    const fromParams = cell.spec?.params.debounceMs;
    const ms = fromParams ?? this.params.core.options.filterDebounceMs;
    return typeof ms === "number" && ms >= 0 ? ms : 0;
  }

  /** Write the control's value to the filter model: one condition, or no filter when empty. */
  private apply(cell: FloatingCell): void {
    if (cell.timer != null) {
      clearTimeout(cell.timer);
      cell.timer = null;
    }
    const { core } = this.params;
    if (!cell.control || !this.cells.has(cell.col.instanceID)) return;
    const value = cell.control.value;
    const current = core.getFilterModel().items.find(item => matchesColumn(item, cell.col)) ?? null;
    if (value === "") {
      if (!current) return;
      core.withColumnChangeSource("user", () => core.removeFilterModel(cell.col));
      return;
    }
    const op = cell.kind === "select" ? FilterType.EQ : cell.op;
    if (current?.filters.length === 1 && current.filters[0].type === op
      && String(current.filters[0].values?.[0] ?? "") === value) {
      return;
    }
    core.withColumnChangeSource("user", () => core.addFilterModel({
      col: cell.col,
      key: cell.col.key,
      join: "and",
      filters: [{ type: op, values: [value] }],
    }));
  }

  private openFilter(cell: FloatingCell, anchor: HTMLElement): void {
    // The popup edits the model from what it holds now, so a value still waiting for its debounce
    // goes in first.
    this.flush(cell);
    this.params.openColumnFilter(cell.col.instanceID, anchor);
  }

  // ---------------------------------------------------------------- keyboard

  private onKeyDown(e: KeyboardEvent): void {
    e.stopPropagation();
    const target = e.target as HTMLElement | null;
    const cellEl = target?.closest<HTMLElement>(".pte-floating-filter-cell");
    const cell = cellEl?.dataset.colId ? this.cells.get(cellEl.dataset.colId) : undefined;
    if (!cell) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.returnToHeader(cell);
      return;
    }
    if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      this.openFilter(cell, cell.openButton && !cell.openButton.hidden ? cell.openButton : cellEl!);
      return;
    }
    if (e.key === "Enter" && target === cell.control && cell.kind !== "select") {
      e.preventDefault();
      this.apply(cell);
      return;
    }
    // ArrowUp goes back to the column's header from a text box or a summary; a number, date or
    // select keeps the key, which steps its value.
    if (e.key === "ArrowUp" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
      && (target === cell.summary || (target === cell.control && cell.kind === "text"))) {
      e.preventDefault();
      this.returnToHeader(cell);
    }
  }

  /** Hand the keyboard back to the grid with the header cursor on this column. */
  private returnToHeader(cell: FloatingCell): void {
    this.flush(cell);
    const { core, root } = this.params;
    const colIdx = core.getColumnModel().getLeaves().indexOf(cell.col);
    if (colIdx >= 0) core.setHeaderFocus(colIdx, "keyboard");
    root.focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------------ helpers

/** Does this column show a control in the floating row? */
export function hasFloatingFilter(col: Column): boolean {
  if (col.isLeadingUtilityColumn() || col.children.length > 0) return false;
  if (isFalse(col.filter) || col.filter === "none") return false;
  return col.col?.floatingFilter !== false;
}

function controlKind(spec: FilterPanelSpec): ControlKind {
  const inputType = spec.conditionTemplate.valueInputType;
  if (inputType === "set" || inputType === "tree" || spec.kind === "set") return "summary";
  if (spec.kind === "boolean") return "select";
  if (inputType === "dropdown" && Array.isArray(spec.params.filterValues)) return "select";
  if (spec.kind === "number") return "number";
  if (spec.kind === "date") return "date";
  return "text";
}

function selectChoices(
  spec: FilterPanelSpec,
  t: (key: "filterTrue" | "filterFalse") => string,
): { value: string; label: string }[] {
  if (spec.kind === "boolean") {
    return [{ value: "true", label: t("filterTrue") }, { value: "false", label: t("filterFalse") }];
  }
  const values = Array.isArray(spec.params.filterValues) ? spec.params.filterValues : [];
  return values.map(entry => {
    const value = staticSetValue(entry);
    const text = value == null ? "" : String(value);
    return { value: text, label: text };
  });
}

/** The column's first offered one-value operator; `contains` / `equals` when it offers none. */
function defaultOp(spec: FilterPanelSpec): FilterType {
  const offered = spec.conditionTemplate.ops.find(op => valuesNeededFor(op.value) === 1
    && op.value !== FilterType.IN && op.value !== FilterType.NOT_IN);
  if (offered) return offered.value;
  return spec.kind === "text" ? FilterType.CONTAINS : FilterType.EQ;
}

function opLabel(spec: FilterPanelSpec, op: FilterType): string {
  return spec.conditionTemplate.ops.find(o => o.value === op)?.label ?? op;
}

function focusTarget(cell: FloatingCell): HTMLElement | null {
  if (cell.control && !cell.control.hidden) return cell.control;
  if (cell.summary && !cell.summary.hidden) return cell.summary;
  return null;
}

function matchesColumn(item: FilterItem, col: Column): boolean {
  return item.col.instanceID === col.instanceID
    || (!!col.colId && item.col.colId === col.colId)
    || (!!col.key && item.col.key === col.key)
    || (!!col.colId && item.key === col.colId)
    || (!!col.key && item.key === col.key);
}
