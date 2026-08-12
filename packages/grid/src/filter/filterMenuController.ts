import { IRowNode } from "../interfaces/iRowNode";
import {
  FilterApplyReason,
  IFilterController,
  FilterControllerHooks,
  FilterPanelSpec,
  FilterRuntimeState,
  FilterValueSource,
  SetFilterOptions,
  SetFilterOptionType,
  FilterValueAsyncSourceParamsImpl,
} from "./types";
import { FilterDef, FilterItem, FilterType, valuesNeededFor } from "../interfaces/filter";
import {
  buildSetOptions,
  computeUniqueValues,
  defaultValueKey,
  defFromCheckedKeys,
  isValueChecked,
  pruneToUniverse,
  setAllChecked,
  toggleOption,
  valueOptions,
} from "./setFilterCore";

export class FilterController implements IFilterController {
  private spec: FilterPanelSpec;
  private hooks: FilterControllerHooks;

  private listeners = new Set<(s: FilterRuntimeState) => void>();

  private state: FilterRuntimeState;

  private initialModelSnapshot: FilterItem | null;

  private disposed = false;

  // debounce
  private debounceTimer: number | null = null;

  // set-filter loading
  private optionsAbort: AbortController | null = null;
  private optionsRequestId = 0;

  constructor(spec: FilterPanelSpec, currentModel: FilterItem | null, hooks: FilterControllerHooks) {
    this.spec = spec;
    this.hooks = hooks;
    this.initialModelSnapshot = currentModel ? deepCloneModel(currentModel) : null;

    // init state from model or params
    const modelCount = currentModel?.filters.length ?? 0;
    const max = spec.limits.maxNumConditions ?? 1;
    const def = spec.limits.defaultNumConditions ?? 1;

    const initialCount = modelCount > 0 ? modelCount : clamp(def, 1, max);

    const conditionOrder: string[] = [];
    const draft: FilterRuntimeState["draft"] = {};
    const ui: FilterRuntimeState["ui"] = {};

    for (let i = 0; i < initialCount; i++) {
      const id = condId(i);
      conditionOrder.push(id);

      const modelCond = currentModel?.filters[i];
      draft[id] = {
        type: modelCond?.type ?? spec.defaultOp,
        values: modelCond?.values ? [...modelCond.values] : [],
      };
      ui[id] = {};
    }

    this.state = {
      join: currentModel?.join ?? "and",
      conditionOrder,
      draft,
      ui,
    };

    // If set filter is present, kick off loading for existing conditions (or the first)
    if (this.spec.kind === "set") {
      this.ensureSetOptionsLoaded(); // shows loader, loads values
    }

    // Validate + normalize conditions (may compact / remove empties etc.)
    this.normalizeAfterEdit({ reason: "init" });

    // If live mode and model exists, you may optionally apply immediately (usually not needed)
    this.emit();
  }

  subscribe(listener: (s: FilterRuntimeState) => void): () => void {
    this.listeners.add(listener);
    // immediate push
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  setJoin(join: "and" | "or"): void {
    if (this.disposed) return;
    if (this.state.join === join) return;
    this.state.join = join;
    this.emit();
    this.maybeCommit("ui");
  }

  setOp(condIndex: number, type: FilterType): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const d = this.state.draft[id];
    d.type = type;

    // If operator implies 0 values (blank/notBlank), clear values.
    const needed = valuesNeededFor(type);
    if (needed === 0) d.values = [];

    // If operator needs 2 values and we have >2, trim; if fewer, keep as-is until user types.
    if (needed > 0 && d.values.length > needed && type !== FilterType.IN_RANGE && type !== FilterType.NOT_IN_RANGE) {
      d.values = d.values.slice(0, needed);
    }

    // Validate and normalize (auto remove/auto add)
    this.normalizeAfterEdit({ reason: "opChange" });

    this.emit();
    this.maybeCommit("ui");
  }

  setValue(condIndex: number, valueIndex: number, value: any): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const d = this.state.draft[id];
    if (!d.type) d.type = this.spec.defaultOp;

    // Store in values array position
    const next = [...(d.values ?? [])];
    next[valueIndex] = value;
    d.values = next;

    this.normalizeAfterEdit({ reason: "valueChange" });

    this.emit();
    this.maybeCommit("ui");
  }

  toggleSetValue(condIndex: number, optionIdx: number, selected: boolean): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const ui = this.state.ui[id];
    if (!ui) return;
    const option = (ui.options ?? [])[optionIdx];
    if (!option) return;

    ui.selectedIdx = optionIdx;
    const d = this.state.draft[id];
    // default type for set filter should be "notIn"
    if (!d.type) d.type = this.spec.defaultOp ?? FilterType.NOT_IN;

    const keyFn = this.spec.valueKey ?? defaultValueKey;
    const def = draftToDef(d);
    const next = option.type === "select_all"
      ? setAllChecked(selected, ui.options ?? [], def?.mode)
      : toggleOption(def, option, selected, ui.options ?? [], keyFn);
    applyDefToDraft(next, d);

    this.normalizeAfterEdit({ reason: "setValueToggle" });

    this.emit();
    // set filter does NOT use debounce
    this.maybeCommit("ui");
  }

  getSetOptionState(condIndex: number, type: SetFilterOptionType, value: any): { selected: boolean, indeterminate: boolean } {
    let selected = false, indeterminate = false;
    const id = this.getCondId(condIndex);
    if (!id) return { selected, indeterminate };

    const d = this.state.draft[id];
    if (!d.type) d.type = this.spec.defaultOp ?? FilterType.NOT_IN;

    const ui = this.state.ui[id];
    if (!ui || !ui.options) return { selected, indeterminate };

    const keyFn = this.spec.valueKey ?? defaultValueKey;
    const def = draftToDef(d);

    if (type === "select_all") {
      // With an active mini-filter, select-all describes only the visible options.
      const scope = (ui.miniFilter || "").length > 0
        ? valueOptions(ui.options).filter(o => !o.hidden)
        : valueOptions(ui.options);
      const checkedCount = scope.filter(o => isValueChecked(def, o, keyFn)).length;
      selected = checkedCount === scope.length;
      indeterminate = checkedCount > 0 && checkedCount < scope.length;
      return { selected, indeterminate };
    }

    const option = type === "blanks"
      ? ui.options.find(o => o.type === "blanks")
      : ui.options.find(o => o.type === "value" && o.key === keyFn(value));
    if (!option) return { selected, indeterminate };
    selected = isValueChecked(def, option, keyFn);
    return { selected, indeterminate };
  }

  filterOptions(condIndex: number, filter: string): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const ui = this.state.ui[id];
    if (!ui.options) return;

    const filterLc = filter.toLowerCase();
    for (const o of ui.options) {
      o.hidden = o.type !== "select_all" && !o.label.toLowerCase().includes(filterLc);
    }

    // Check exactly the matching options: the visible set becomes the checked set.
    const d = this.state.draft[id];
    const def = draftToDef(d);
    const visibleKeys = new Set(valueOptions(ui.options).filter(o => !o.hidden).map(o => o.key));
    const next = defFromCheckedKeys(visibleKeys, ui.options, {
      mode: def?.mode,
      preferType: def?.type === FilterType.IN ? FilterType.IN : FilterType.NOT_IN,
    });
    applyDefToDraft(next, d);
    ui.miniFilter = filter;
    this.normalizeAfterEdit({ reason: "setValueToggle" });
    this.emit();
  }

  applyMiniFilter(condIndex: number): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const ui = this.state.ui[id];
    // This check is not needed because input.change is only called when enter is pressed,
    // so empty mini-filter is a valid request.
    // if (!ui.miniFilter || ui.miniFilter === "") return;

    this.maybeCommit("ui");
  }

  apply(): void {
    if (this.disposed) return;
    this.clearDebounce();
    const model = this.computeModelFromDraft();
    this.hooks.applyModel(this.spec.column, model, { reason: "applyButton" });
  }

  clearAll(): void {
    if (this.disposed) return;
    this.clearDebounce();

    // reset draft to 1 blank row (or defaultNumConditions), no values
    this.resetToBlank();

    this.emit();
    this.hooks.applyModel(this.spec.column, null, { reason: "clearAll" });
  }

  reset(): void {
    if (this.disposed) return;
    this.clearDebounce();

    // "reset" meaning: go back to initial model snapshot if it existed, else blank.
    if (this.initialModelSnapshot) {
      this.loadModelIntoDraft(this.initialModelSnapshot);
      this.emit();
      // If live mode, commit; if apply mode, no commit until Apply is pressed.
      this.maybeCommit("reset");
    } else {
      this.resetToBlank();
      this.emit();
      this.maybeCommit("reset");
    }
  }

  cancel(): void {
    if (this.disposed) return;
    this.clearDebounce();

    // If apply-button mode: simply revert UI and close (coordinator handles close)
    // If live mode: we should revert applied model too, otherwise cancel does nothing meaningful.
    // Here: always revert to initial snapshot and apply it (or null) so cancel truly cancels changes.
    const revertModel = this.initialModelSnapshot ? deepCloneModel(this.initialModelSnapshot) : null;
    this.hooks.applyModel(this.spec.column, revertModel, { reason: "cancelRevert" });

    // Restore draft UI as well
    if (revertModel) this.loadModelIntoDraft(revertModel);
    else this.resetToBlank();

    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearDebounce();
    this.abortOptionsLoad();
    this.listeners.clear();
  }

  // --------------------------
  // Debounce / Commit behavior
  // --------------------------

  private maybeCommit(reason: FilterApplyReason): void {
    const buttons = this.spec.params.buttons ?? [];
    const hasApply = buttons.includes("apply");

    // apply-mode: don't auto commit on change (except commit still works on clear/reset/cancel)
    if (hasApply) {
      // But some actions should still commit immediately:
      if (reason === "clearAll" || reason === "reset" || reason === "cancelRevert") {
        const model = this.computeModelFromDraft();
        this.hooks.applyModel(this.spec.column, model, { reason });
      }
      return;
    }

    // live mode
    const kind = this.spec.kind;
    const useDebounce = (kind === "text" || kind === "number") && (this.spec.params.debounceMs ?? 0) > 0;

    if (!useDebounce) {
      const model = this.computeModelFromDraft();
      this.hooks.applyModel(this.spec.column, model, { reason });
      return;
    }

    // debounce commit
    const ms = this.spec.params.debounceMs ?? 250;
    this.clearDebounce();
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      if (this.disposed) return;
      const model = this.computeModelFromDraft();
      this.hooks.applyModel(this.spec.column, model, { reason: "debounce" });
    }, ms);
  }

  private clearDebounce(): void {
    if (this.debounceTimer != null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // --------------------------
  // Set filter loading + loader state
  // --------------------------

  private ensureSetOptionsLoaded(): void {
    if (this.spec.kind !== "set") return;

    // load options for all current conditions that are set filters (same source)
    // load once and store in ui for all conditions.
    const source = this.spec.conditionTemplate.valueSource;
    if (!source) return;

    // Avoid reloading if already have options and not loading
    const firstId = this.state.conditionOrder[0];
    if (firstId && this.state.ui[firstId]?.options && !this.state.ui[firstId]?.loading) return;

    this.loadSetOptions(source);
  }

  private loadSetOptions(source: FilterValueSource): void {
    this.abortOptionsLoad();

    const requestId = ++this.optionsRequestId;
    const abort = new AbortController();
    this.optionsAbort = abort;

    // turn loader on for all active condition rows
    for (const id of this.state.conditionOrder) {
      this.state.ui[id] = { ...(this.state.ui[id] ?? {}), loading: true, error: undefined };
    }
    this.emit();

    const finalize = (options?: SetFilterOptions[], error?: string) => {
      if (this.disposed) return;
      if (requestId !== this.optionsRequestId) return; // stale
      const keyFn = this.spec.valueKey ?? defaultValueKey;
      for (const id of this.state.conditionOrder) {
        // Restrict stored values to the loaded universe (healing typed mismatches). Only when a
        // universe actually loaded — a load error must not wipe the stored values.
        if (options) {
          this.state.draft[id].values = pruneToUniverse(this.state.draft[id].values ?? [], options, keyFn);
        }
        this.state.ui[id] = {
          ...(this.state.ui[id] ?? {}),
          loading: false,
          options: options ?? this.state.ui[id]?.options,
          error,
        };
      }
      this.emit();
    };

    const res = new FilterValueAsyncSourceParamsImpl(this.spec.column.col, abort.signal);
    res.onSuccess((values) => {
      if (abort.signal.aborted) return;
      finalize(this.mapToOptions(values), undefined);
    });
    res.onError((err) => {
      finalize(undefined, err?.message ?? "Failed to load values");
    });

    if (source.kind === "static") {
      res.success(source.values ?? []);
    } else if (source.kind === "fromRows") {
      res.success(this.computeUniqueValuesFromRows());
    } else if (source.kind === "async") {
      source.load(res);
    }
  }

  private abortOptionsLoad(): void {
    if (this.optionsAbort) {
      this.optionsAbort.abort();
      this.optionsAbort = null;
    }
  }

  private computeUniqueValuesFromRows(): any[] {
    return computeUniqueValues(
      (callback) => this.hooks.getAllRows(callback),
      (row: IRowNode) => this.spec.column.getValue(row),
      this.spec.valueKey ?? defaultValueKey,
      this.spec.valueLabel ?? ((x: any) => String(x)),
      typeof this.spec.params.maxFilterItems === "number" ? this.spec.params.maxFilterItems : undefined,
    );
  }

  private mapToOptions(values: any[]): SetFilterOptions[] {
    return buildSetOptions(values, this.spec.valueKey ?? defaultValueKey, this.spec.valueLabel);
  }

  // --------------------------
  // Condition auto-grow / auto-remove + validity
  // --------------------------

  private normalizeAfterEdit(ctx: { reason: string }): void {
    // 1) Remove empty conditions (but keep at least 1 row)
    this.removeEmptyConditions();

    // 2) Ensure at least one condition row exists
    if (this.state.conditionOrder.length === 0) {
      this.addBlankCondition();
    }

    // 3) Auto-grow: append a blank condition when allowed and the last is non-empty
    this.autoAppendBlankIfAllowed();

    // 4) Compact IDs to c1..cN for sanity
    this.compactConditionIds();

    // 5) Update validity flags
    this.updateValidity();

    // 6) For set filter: ensure options loading (if needed)
    if (this.spec.kind === "set") {
      this.ensureSetOptionsLoaded();
    }
  }

  private removeEmptyConditions(): void {
    // We remove empties anywhere, but preserve at least one row.
    // Iterate from end to start to keep indices stable.
    for (let i = this.state.conditionOrder.length - 1; i >= 0; i--) {
      if (this.state.conditionOrder.length <= 1) break;

      const id = this.state.conditionOrder[i];
      const d = this.state.draft[id];
      if (!d) continue;

      if (this.isConditionEmpty(d.type, d.values)) {
        delete this.state.draft[id];
        delete this.state.ui[id];
        this.state.conditionOrder.splice(i, 1);
      }
    }
  }

  private autoAppendBlankIfAllowed(): void {
    const max = this.spec.limits.maxNumConditions ?? 1;

    // If currently exceeded, don't auto-add.
    const currentlyExceeded = this.state.conditionOrder.length > max;
    if (currentlyExceeded) return;

    if (this.state.conditionOrder.length >= max) return;

    const lastId = this.state.conditionOrder[this.state.conditionOrder.length - 1];
    const last = this.state.draft[lastId];

    // Append only if last is non-empty
    if (last && !this.isConditionEmpty(last.type, last.values)) {
      this.addBlankCondition();
    }
  }

  private addBlankCondition(): void {
    const nextIndex = this.state.conditionOrder.length;
    const id = condId(nextIndex);
    this.state.conditionOrder.push(id);
    this.state.draft[id] = { type: this.spec.defaultOp, values: [] };
    this.state.ui[id] = {};
  }

  private compactConditionIds(): void {
    // If ids already c1..cN in order, do nothing
    const desired = this.state.conditionOrder.map((_, i) => condId(i));
    let needs = false;
    for (let i = 0; i < desired.length; i++) {
      if (this.state.conditionOrder[i] !== desired[i]) {
        needs = true;
        break;
      }
    }
    if (!needs) return;

    const newDraft: FilterRuntimeState["draft"] = {};
    const newUi: FilterRuntimeState["ui"] = {};
    const newOrder: string[] = [];

    for (let i = 0; i < this.state.conditionOrder.length; i++) {
      const oldId = this.state.conditionOrder[i];
      const newId = desired[i];

      newOrder.push(newId);
      newDraft[newId] = this.state.draft[oldId] ?? { op: this.spec.defaultOp, values: [] };
      newUi[newId] = this.state.ui[oldId] ?? {};
    }

    this.state.conditionOrder = newOrder;
    this.state.draft = newDraft;
    this.state.ui = newUi;
  }

  private updateValidity(): void {
    for (const id of this.state.conditionOrder) {
      const d = this.state.draft[id];
      const valid = this.isConditionValid(d?.type, d?.values);
      this.state.ui[id] = { ...(this.state.ui[id] ?? {}), valid };
    }
  }

  private isConditionEmpty(op?: FilterType, values?: any[]): boolean {
    if (!op) return true;

    const needed = valuesNeededFor(op);

    // operators like blank/notBlank are meaningful without values
    if (needed === 0) return false;

    // set filter: op in/notIn allow empty values (meaning "matches nothing");
    // other ops with set semantics like inRange/notInRange require values to be non-empty since they have meaning only with values
    if (op === ("in" as FilterType)) {
      return false; // "in" with empty values means "matches nothing", which is a valid condition, so never empty
    } else if (op === ("notIn" as FilterType)) {
      // "notIn" with empty values means "matches everything", so report empty so that fitler can be removed
      return !Array.isArray(values) || values.length === 0;
    }

    // range: empty only if both empty
    if (op === ("inRange" as FilterType)) {
      const a = values?.[0];
      const b = values?.[1];
      return isEmptyScalar(a) && isEmptyScalar(b);
    }

    // single value: empty if value empty
    const v = values?.[0];
    return isEmptyScalar(v);
  }

  private isConditionValid(op?: FilterType, values?: any[]): boolean {
    if (!op) return true; // blank row considered valid

    const needed = valuesNeededFor(op);
    if (needed === 0) return true;

    // set
    if (op === ("in" as FilterType) || op === ("notIn" as FilterType)) {
      return Array.isArray(values); // allow empty for set filters, meaning "matches nothing" or "matches everything" respectively; but must be an array
    }

    if (op === ("inRange" as FilterType)) {
      const a = values?.[0];
      const b = values?.[1];
      // valid only if both non-empty
      return !isEmptyScalar(a) && !isEmptyScalar(b);
    }

    // single
    const v = values?.[0];
    if (this.spec.kind === "number") {
      if (isEmptyScalar(v)) return false;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n);
    }

    return !isEmptyScalar(v);
  }

  // --------------------------
  // Draft -> Model
  // --------------------------

  private computeModelFromDraft(): FilterItem | null {
    const filters: FilterDef[] = [];

    for (const id of this.state.conditionOrder) {
      const d = this.state.draft[id];
      if (!d?.type) continue;

      // skip empty conditions
      if (this.isConditionEmpty(d.type, d.values)) continue;

      // You can choose: skip invalid or include invalid (usually skip)
      if (!this.isConditionValid(d.type, d.values)) continue;

      // normalize values (trim/caseSensitive etc. can be done in filter engine)
      const def: FilterDef = { type: d.type, values: [...(d.values ?? [])] };
      if (d.mode) def.mode = d.mode;
      filters.push(def);
    }

    if (filters.length === 0) return null;

    return {
      col: this.spec.column,
      key: this.spec.column.key,
      join: this.state.join ?? "and",
      filters,
    };
  }

  // --------------------------
  // Helpers: model loading / reset
  // --------------------------

  private loadModelIntoDraft(model: FilterItem): void {
    const count = model.filters.length;
    this.state.join = model.join ?? "and";

    const order: string[] = [];
    const draft: FilterRuntimeState["draft"] = {};
    const ui: FilterRuntimeState["ui"] = {};

    for (let i = 0; i < count; i++) {
      const id = condId(i);
      order.push(id);
      draft[id] = { type: model.filters[i].type, values: [...model.filters[i].values] };
      if (model.filters[i].mode) draft[id].mode = model.filters[i].mode;
      ui[id] = {};
    }

    this.state.conditionOrder = order;
    this.state.draft = draft;
    this.state.ui = ui;

    this.normalizeAfterEdit({ reason: "loadModel" });
  }

  private resetToBlank(): void {
    const max = this.spec.limits.maxNumConditions ?? 1;
    const def = this.spec.limits.defaultNumConditions ?? 1;

    const count = clamp(def, 1, max);

    const order: string[] = [];
    const draft: FilterRuntimeState["draft"] = {};
    const ui: FilterRuntimeState["ui"] = {};

    for (let i = 0; i < count; i++) {
      const id = condId(i);
      order.push(id);
      draft[id] = { type: this.spec.defaultOp, values: [] };
      ui[id] = {};
    }

    this.state.join = "and";
    this.state.conditionOrder = order;
    this.state.draft = draft;
    this.state.ui = ui;

    this.normalizeAfterEdit({ reason: "resetToBlank" });
  }

  // --------------------------
  // Snapshot + emit
  // --------------------------

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private snapshot(): FilterRuntimeState {
    // cheap-ish deep copy so renderer can't mutate state accidentally
    return {
      join: this.state.join,
      conditionOrder: [...this.state.conditionOrder],
      draft: Object.fromEntries(Object.entries(this.state.draft).map(([k, v]) =>
        [k, { type: v.type, values: [...(v.values ?? [])], ...(v.mode ? { mode: v.mode } : {}) }])),
      ui: Object.fromEntries(Object.entries(this.state.ui).map(([k, v]) => [k, { ...v, options: v.options ? [...v.options] : v.options }])),
    };
  }

  private getCondId(condIndex: number): string | null {
    if (condIndex < 0 || condIndex >= this.state.conditionOrder.length) return null;
    return this.state.conditionOrder[condIndex];
  }
}

// --------------------------
// Utility helpers
// --------------------------

function condId(index: number): string {
  return `c${index + 1}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isEmptyScalar(v: any): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function deepCloneModel(m: FilterItem): FilterItem {
  return {
    col: m.col,
    key: m.key,
    join: m.join,
    filters: m.filters.map(c => ({ ...c, values: [...c.values] })),
  };
}

/**
 * Draft ⇄ def mapping for set filters. A draft always holds a concrete {type, values} so the
 * renderer has something to bind, while the pure module reasons about `null` = "no filter":
 * an un-moded `notIn []` draft (matches everything) is the draft encoding of null.
 */
function draftToDef(d: FilterDef): FilterDef | null {
  if (d.type === FilterType.NOT_IN && (d.values?.length ?? 0) === 0 && !d.mode) return null;
  const def: FilterDef = { type: d.type, values: [...(d.values ?? [])] };
  if (d.mode) def.mode = d.mode;
  return def;
}

function applyDefToDraft(next: FilterDef | null, d: FilterDef): void {
  if (next === null) {
    d.type = FilterType.NOT_IN;
    d.values = [];
    delete d.mode;
    return;
  }
  d.type = next.type;
  d.values = [...next.values];
  if (next.mode) d.mode = next.mode;
  else delete d.mode;
}
