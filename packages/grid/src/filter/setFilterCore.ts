/**
 * Pure set-filter logic, shared by the filter-menu controller and the IGridAPI set-filter
 * helpers. Everything here operates on plain data:
 *
 *  - the OPTION UNIVERSE: `SetFilterOptions[]` as rendered by the menu — a synthetic select_all
 *    row first, an optional synthetic blanks row (all null/""/undefined values fold into one
 *    bucket whose `raw` is null), then one row per distinct value (deduped by `valueKey`);
 *  - the STORED representation: an in/notIn `FilterDef` whose `values` hold option raws (null =
 *    the blanks bucket), or `null` meaning "no filter" (everything visible);
 *  - the CANONICAL selection: the set of checked option keys, from which both representations
 *    are derived.
 *
 * Representation rules (`defFromCheckedKeys`):
 *  - `mode: "include"` → always `in` + checked raws (values arriving after filtering stay hidden);
 *  - `mode: "exclude"` → always `notIn` + unchecked raws (new values stay visible); everything
 *    checked collapses to null (no filter — semantically identical);
 *  - no mode (menu-driven) → keep the current representation, flipping only at the extremes:
 *    everything checked → null, nothing checked → `in []`.
 *
 * All comparisons go through the option KEY (`valueKey`, blanks-aware) — never `includes` on raw
 * values — so numeric/string mismatches cannot corrupt toggling or pruning.
 */
import { FilterDef, FilterType, SetFilterMode } from "../interfaces/filter";
import { isNullOrUndefined } from "../misc";
import { SetFilterOptions } from "./types";

export const SELECT_ALL_KEY = "__select_all__";
export const BLANKS_KEY = "__blanks__";

export type ValueKeyFn = (value: any) => string;
export type ValueLabelFn = (value: any) => string;

export function defaultValueKey(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const defaultValueLabel: ValueLabelFn = (v: any) => String(v);

/** The key a STORED value resolves to: blank scalars (null/undefined/"") map to the blanks bucket. */
export function storedValueKey(value: any, keyFn: ValueKeyFn = defaultValueKey): string {
  const key = keyFn(value);
  return key === "" || isNullOrUndefined(key) ? BLANKS_KEY : key;
}

/** Resolve any input (possibly differently typed, e.g. "5" for a numeric universe) to its option. */
export function resolveOption(
  options: SetFilterOptions[],
  input: any,
  keyFn: ValueKeyFn = defaultValueKey,
): SetFilterOptions | undefined {
  const key = storedValueKey(input, keyFn);
  return options.find(o => o.type !== "select_all" && o.key === key);
}

/** Build the option universe from a value list: select_all, then blanks (if any), then values. */
export function buildSetOptions(
  values: any[],
  keyFn: ValueKeyFn = defaultValueKey,
  labelFn: ValueLabelFn = defaultValueLabel,
): SetFilterOptions[] {
  const options: SetFilterOptions[] = [
    { type: "select_all", key: SELECT_ALL_KEY, label: "(Select All)", raw: SELECT_ALL_KEY, hidden: false },
  ];
  const seen = new Set<string>([SELECT_ALL_KEY]);

  let hasBlanks = false;
  for (const v of values ?? []) {
    const key = keyFn(v);
    if (key === "" || isNullOrUndefined(key)) {
      hasBlanks = true;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ type: "value", key, label: labelFn(v), raw: v, hidden: false });
  }

  if (hasBlanks) {
    options.splice(1, 0, { type: "blanks", key: BLANKS_KEY, label: "(Blanks)", raw: null, hidden: false });
  }

  return options;
}

/**
 * Attach loaded-row counts to an existing option universe. Values not present in the universe are
 * ignored; configured static/async values with no loaded rows retain a useful zero count.
 */
export function addSetOptionCounts(
  options: SetFilterOptions[],
  forEachRow: (callback: (row: any, idx: number) => void) => void,
  getValue: (row: any) => any,
  keyFn: ValueKeyFn = defaultValueKey,
): SetFilterOptions[] {
  const counts = new Map<string, number>();
  forEachRow((row, _idx) => {
    const key = storedValueKey(getValue(row), keyFn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return options.map(option => option.type === "select_all"
    ? option
    : { ...option, count: counts.get(option.key) ?? 0 });
}

/** Complete distinct column-value universe across rows, deduped by key and sorted by label. */
export function computeUniqueValues(
  forEachRow: (callback: (row: any, idx: number) => void) => void,
  getValue: (row: any) => any,
  keyFn: ValueKeyFn = defaultValueKey,
  labelFn: ValueLabelFn = defaultValueLabel,
): any[] {
  const seen = new Set<string>();
  const out: any[] = [];

  forEachRow((row, _idx) => {
    const v = getValue(row);
    const k = keyFn(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  });

  out.sort((a, b) => {
    const la = labelFn(a);
    const lb = labelFn(b);
    return la < lb ? -1 : la > lb ? 1 : 0;
  });

  return out;
}

/** The selectable options — everything except the synthetic select_all row. */
export function valueOptions(options: SetFilterOptions[]): SetFilterOptions[] {
  return options.filter(o => o.type !== "select_all");
}

/** The canonical selection: the set of CHECKED option keys. No filter (null) = all checked. */
export function checkedKeySet(
  def: Pick<FilterDef, "type" | "values"> | null,
  options: SetFilterOptions[],
  keyFn: ValueKeyFn = defaultValueKey,
): Set<string> {
  const opts = valueOptions(options);
  if (!def) return new Set(opts.map(o => o.key));
  const storedKeys = new Set<string>((def.values ?? []).map((v: any) => storedValueKey(v, keyFn)));
  if (def.type === FilterType.IN) {
    return new Set(opts.filter(o => storedKeys.has(o.key)).map(o => o.key));
  }
  return new Set(opts.filter(o => !storedKeys.has(o.key)).map(o => o.key));
}

/** Whether one option renders checked under the given def. */
export function isValueChecked(
  def: Pick<FilterDef, "type" | "values"> | null,
  option: SetFilterOptions,
  keyFn: ValueKeyFn = defaultValueKey,
): boolean {
  if (!def) return true;
  const stored = (def.values ?? []).some((v: any) => storedValueKey(v, keyFn) === option.key);
  return def.type === FilterType.IN ? stored : !stored;
}

/**
 * Serialize a checked-key set back to a FilterDef (or null = no filter) per the representation
 * rules in the module header. `preferType` keeps the menu's mid-state representation stable when
 * no mode is pinned.
 */
export function defFromCheckedKeys(
  checked: Set<string>,
  options: SetFilterOptions[],
  opts: { mode?: SetFilterMode; preferType?: FilterType } = {},
): FilterDef | null {
  const all = valueOptions(options);
  const checkedRaws = all.filter(o => checked.has(o.key)).map(o => o.raw);
  const uncheckedRaws = all.filter(o => !checked.has(o.key)).map(o => o.raw);

  if (opts.mode === "include") {
    return { type: FilterType.IN, values: checkedRaws, mode: "include" };
  }
  if (opts.mode === "exclude") {
    // Everything checked = no filter; keeping an empty notIn would be an equivalent no-op.
    if (uncheckedRaws.length === 0) return null;
    return { type: FilterType.NOT_IN, values: uncheckedRaws, mode: "exclude" };
  }

  if (uncheckedRaws.length === 0) return null;
  if (checkedRaws.length === 0) return { type: FilterType.IN, values: [] };
  return opts.preferType === FilterType.IN
    ? { type: FilterType.IN, values: checkedRaws }
    : { type: FilterType.NOT_IN, values: uncheckedRaws };
}

/** Toggle one option (never select_all — use setAllChecked). */
export function toggleOption(
  def: FilterDef | null,
  option: SetFilterOptions,
  selected: boolean,
  options: SetFilterOptions[],
  keyFn: ValueKeyFn = defaultValueKey,
): FilterDef | null {
  const keys = checkedKeySet(def, options, keyFn);
  if (selected) keys.add(option.key);
  else keys.delete(option.key);
  return defFromCheckedKeys(keys, options, {
    mode: def?.mode,
    preferType: def?.type === FilterType.IN ? FilterType.IN : FilterType.NOT_IN,
  });
}

/** Select-all toggle. */
export function setAllChecked(
  selected: boolean,
  options: SetFilterOptions[],
  mode?: SetFilterMode,
): FilterDef | null {
  const keys = selected ? new Set(valueOptions(options).map(o => o.key)) : new Set<string>();
  return defFromCheckedKeys(keys, options, { mode });
}

export interface SetFilterSelection {
  mode: SetFilterMode;
  /** Option raws currently checked (visible). */
  checked: any[];
  /** Option raws currently unchecked (hidden). */
  unchecked: any[];
}

/** Intent-level summary of a def against the universe. No filter = exclude-nothing. */
export function selectionSummary(
  def: FilterDef | null,
  options: SetFilterOptions[],
  keyFn: ValueKeyFn = defaultValueKey,
): SetFilterSelection {
  const checked = checkedKeySet(def, options, keyFn);
  const all = valueOptions(options);
  return {
    mode: def?.mode ?? (def?.type === FilterType.IN ? "include" : "exclude"),
    checked: all.filter(o => checked.has(o.key)).map(o => o.raw),
    unchecked: all.filter(o => !checked.has(o.key)).map(o => o.raw),
  };
}

/**
 * Restrict stored values to the loaded universe, healing typed mismatches: each survivor is
 * replaced by its option's raw (so a persisted "5" becomes the numeric 5 the rows hold), and
 * duplicates that resolve to the same option collapse.
 */
export function pruneToUniverse(
  values: any[],
  options: SetFilterOptions[],
  keyFn: ValueKeyFn = defaultValueKey,
): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const v of values ?? []) {
    const option = resolveOption(options, v, keyFn);
    if (!option || seen.has(option.key)) continue;
    seen.add(option.key);
    out.push(option.raw);
  }
  return out;
}
