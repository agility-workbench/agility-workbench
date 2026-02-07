import { FilterModel, IRowNode } from "../interfaces";
import { FilterApplyReason, IFilterController, FilterControllerHooks, FilterPanelSpec, FilterRuntimeState, FilterValueSource, SetFilterOptions, SetFilterOptionType } from "./types";
import { FilterDef, FilterType, valuesNeededFor } from "../interfaces/filter";
import { isNullOrUndefined } from "@grid/misc";

export class FilterController implements IFilterController {
  private spec: FilterPanelSpec;
  private hooks: FilterControllerHooks;

  private listeners = new Set<(s: FilterRuntimeState) => void>();

  private state: FilterRuntimeState;

  private initialModelSnapshot: FilterModel | null;

  private disposed = false;

  // debounce
  private debounceTimer: number | null = null;

  // set-filter loading
  private optionsAbort: AbortController | null = null;
  private optionsRequestId = 0;

  constructor(spec: FilterPanelSpec, currentModel: FilterModel | null, hooks: FilterControllerHooks) {
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

  toggleSetValue(condIndex: number, type: SetFilterOptionType, value: any, selected: boolean): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const d = this.state.draft[id];
    // default type for set filter should be "notIn"
    if (!d.type) d.type = this.spec.defaultOp ?? FilterType.NOT_IN;
    if (type === "select_all") {
      if (selected) {
        d.type = FilterType.NOT_IN;
        d.values = [];
      } else {
        d.type = FilterType.IN;
        d.values = [];
      }
      this.state.ui[id].options?.forEach(o => {
        o.selected = selected;
        o.indeterminate = false;
      });
    } else {
      d.values = d.values ?? [];
      const insert = d.type === FilterType.IN && selected || d.type === FilterType.NOT_IN && !selected;
      if (insert) {
        if (type === "blanks") {
          value = this.state.ui[id]?.options?.find(o => o.key === "" || isNullOrUndefined(o.key))?.raw;
        }
        if (!d.values.includes(value)) {
          d.values.push(value);
        }
      } else {
        d.values = d.values.filter((v: any) => {
          const keyFn = this.spec.valueKey ?? defaultValueKey;
          const k = keyFn(v);
          return k !== value;
        });
      }
      const option = this.state.ui[id].options?.find(o => o.key === value);
      if (option) option.selected = selected;
      if (d.type === FilterType.IN && d.values.length == this.state.ui[id].options?.length) {
        d.type = FilterType.NOT_IN;
        d.values = [];
      } else if (d.type === FilterType.NOT_IN && d.values.length == this.state.ui[id].options?.length) {
        d.type = FilterType.IN;
        d.values = [];
      }
      this.state.ui[id].options![0].selected = d.values.length == 0;
      this.state.ui[id].options![0].indeterminate = d.values.length != 0;
    }
    this.normalizeAfterEdit({ reason: "setValueToggle" });

    this.emit();
    // set filter does NOT use debounce
    this.maybeCommit("ui");
  }

  filterOptions(condIndex: number, filter: string): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const ui = this.state.ui[id];
    if (!ui.options) return;

    const filterLc = filter.toLowerCase();
    const filteredOptions: SetFilterOptions[] = [];
    for (const o of ui.options) {
      if (o.label.toLowerCase().includes(filterLc)) {
        o.hidden = false;
        o.selected = true;
        filteredOptions.push(o);
      } else {
        o.hidden = o.type !== "select_all";
        o.selected = o.type === "select_all";
      }
    }
    const filteredValues = new Set(filteredOptions.map(f => f.key));
    const d = this.state.draft[id];
    if (d.type === FilterType.IN) {
      d.values = [];
      for (const f of filteredValues) {
        d.values.push(f);
      }
    } else if (d.type === FilterType.NOT_IN) {
      d.values = ui.options.filter((v: SetFilterOptions) => !filteredValues.has(v.key)).map((o: any) => o.raw);
    }
    ui.miniFilter = filter;
    this.normalizeAfterEdit({ reason: "setValueToggle" });
    this.emit();
  }

  applyMiniFilter(condIndex: number): void {
    if (this.disposed) return;
    const id = this.getCondId(condIndex);
    if (!id) return;

    const ui = this.state.ui[id];
    if (!ui.miniFilter || ui.miniFilter === "") return;

    console.log(this.state.draft[id], ui.miniFilter);

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
      for (const id of this.state.conditionOrder) {
        this.state.draft[id].values = []; // clear any existing selections since options changed
        this.state.ui[id] = {
          ...(this.state.ui[id] ?? {}),
          loading: false,
          options: options ?? this.state.ui[id]?.options,
          error,
        };
      }
      this.emit();
    };

    (async () => {
      try {
        let rawValues: any[] = [];

        if (source.kind === "static") {
          rawValues = source.values ?? [];
        } else if (source.kind === "fromRows") {
          rawValues = this.computeUniqueValuesFromRows();
        } else if (source.kind === "async") {
          const res = await source.load({ colId: this.spec.column.key, signal: abort.signal });
          rawValues = res.values ?? [];
        }

        if (abort.signal.aborted) return;

        // Apply maxFilterItems / initial count at UI layer? We'll keep full list; renderer can show first N.
        const options = this.mapToOptions(rawValues);
        finalize(options, undefined);
      } catch (e: any) {
        if (abort.signal.aborted) return;
        finalize(undefined, e?.message ?? "Failed to load values");
      }
    })();
  }

  private abortOptionsLoad(): void {
    if (this.optionsAbort) {
      this.optionsAbort.abort();
      this.optionsAbort = null;
    }
  }

  private computeUniqueValuesFromRows(): any[] {
    const keyFn = this.spec.valueKey ?? defaultValueKey;
    const seen = new Set<string>();
    const out: any[] = [];

    this.hooks.getAllRows((row: IRowNode, idx: number) => {
      const v = this.spec.column.getValue(row);
      // v could possibly be undefined/null; we'll allow that and let the keyFn handle it (e.g. return "" for blanks) and dedupe accordingly
      const k = keyFn(v);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    });

    // optional: sort by label
    const labelFn = this.spec.valueLabel ?? ((x: any) => String(x));
    out.sort((a, b) => {
      const la = labelFn(a);
      const lb = labelFn(b);
      return la < lb ? -1 : la > lb ? 1 : 0;
    });

    // optional cap
    const maxItems = this.spec.params.maxFilterItems;
    if (typeof maxItems === "number" && maxItems > 0 && out.length > maxItems) {
      return out.slice(0, maxItems);
    }

    return out;
  }

  private mapToOptions(values: any[]): SetFilterOptions[] {
    const keyFn = this.spec.valueKey ?? defaultValueKey;
    const labelFn = this.spec.valueLabel ?? ((x: any) => String(x));

    let selectedOptions = new Set();
    if (this.initialModelSnapshot === null) {
      selectedOptions = new Set(values.slice());
    } else {
      for (const cond of this.initialModelSnapshot.filters) {
        if (cond.type !== "in" && cond.type !== "notIn") continue;
        for (const v of cond.values) {
          selectedOptions.add(v);
        }
      }
    }

    const options: SetFilterOptions[] = [
      { type: "select_all", key: "__select_all__", label: "(Select All)", raw: "__select_all__", selected: false, indeterminate: false, hidden: false },
    ];
    const seen = new Set<string>(["__select_all__"]);

    let hasBlanks = false;
    let blanksSelected = false;

    for (const v of values ?? []) {
      const key = keyFn(v);
      if (key === "" || isNullOrUndefined(key)) {
        // we'll add a single "(Blanks)" option later if there are any blank/undefined/null keys; for now just track that we have blanks
        hasBlanks = true;
        blanksSelected = blanksSelected || selectedOptions.has(v);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const selected = selectedOptions.has(v);
      options.push({ type: "value", key, label: labelFn(v), raw: v, selected: selected, indeterminate: false, hidden: false });
    }

    options[0].selected = selectedOptions.size == values.length;
    options[0].indeterminate = !options[0].selected && selectedOptions.size > 0;

    if (hasBlanks) {
      options.splice(1, 0, {
        type: "blanks",
        key: "__blanks__",
        label: "(Blanks)",
        raw: null,
        selected: blanksSelected,
        indeterminate: false,
        hidden: false,
      });
    }

    return options;
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

  private computeModelFromDraft(): FilterModel | null {
    const filters: FilterDef[] = [];

    for (const id of this.state.conditionOrder) {
      const d = this.state.draft[id];
      if (!d?.type) continue;

      // skip empty conditions
      if (this.isConditionEmpty(d.type, d.values)) continue;

      // You can choose: skip invalid or include invalid (usually skip)
      if (!this.isConditionValid(d.type, d.values)) continue;

      // normalize values (trim/caseSensitive etc. can be done in filter engine)
      filters.push({ type: d.type, values: [...(d.values ?? [])] });
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

  private loadModelIntoDraft(model: FilterModel): void {
    const count = model.filters.length;
    this.state.join = model.join ?? "and";

    const order: string[] = [];
    const draft: FilterRuntimeState["draft"] = {};
    const ui: FilterRuntimeState["ui"] = {};

    for (let i = 0; i < count; i++) {
      const id = condId(i);
      order.push(id);
      draft[id] = { type: model.filters[i].type, values: [...model.filters[i].values] };
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
      draft: Object.fromEntries(Object.entries(this.state.draft).map(([k, v]) => [k, { type: v.type, values: [...(v.values ?? [])] }])),
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

function deepCloneModel(m: FilterModel): FilterModel {
  return {
    col: m.col,
    key: m.key,
    join: m.join,
    filters: m.filters.map(c => ({ type: c.type, values: [...c.values] })),
  };
}

// fallback
function defaultValueKey(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
