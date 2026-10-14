import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { FilterItem, FilterMatcherFn, FilterParams, FilterType, valuesNeededFor } from "../interfaces/filter";
import { QuickFilterMatchMode } from "../interfaces/gridOptions";
import { isBlankValue } from "../misc";
import { defaultValueKey } from "../filter/setFilterCore";
import { ColumnType } from "../interfaces/column";
import { parseDateInput } from "../column/formatters";
import { parseBooleanText, parseIsoDate } from "../column/parsers";

export interface QuickFilterSpec {
  // The raw search text as typed by the user (may contain leading/trailing/inner whitespace).
  text: string;
  // "multiTerm" splits on whitespace and requires every token to match somewhere in the row;
  // "substring" matches the whole (trimmed) text as one contiguous run.
  matchMode: QuickFilterMatchMode;
  caseSensitive: boolean;
  // Columns whose formatted values are searched. Callers pass only visible, non-internal leaves.
  columns: Column[];
}

/**
 * Match one cell's already-folded display text against the search. Shared by the row filter and by
 * the find index so the two can never drift on what a mode means.
 *
 * `terms` is read for "multiTerm" only, and only the FIND path passes it: multiTerm is row-scoped
 * when filtering (each word may live in a different cell), so `performQuickFilter` tracks the words
 * across a whole row itself and calls this for the other two modes.
 */
export function cellTextMatches(
  value: string,
  needle: string,
  matchMode: QuickFilterMatchMode,
  terms: readonly string[] = [],
): boolean {
  switch (matchMode) {
    // Both sides trimmed: the search box trims its own input, so a padded display value would
    // otherwise be impossible to match exactly.
    case "wholeCell": return value.trim() === needle;
    case "multiTerm": return terms.every(term => value.includes(term));
    default: return value.includes(needle);
  }
}

// Narrow an existing list of row indices (already passing the column filters) to those that also
// match the quick-filter search text. Matching is against each column's *formatted display value*
// so the user searches what they see (e.g. "$1,200"), and it is evaluated per cell so nothing ever
// matches across a column boundary. Returns `candidateIdx` unchanged when the search text is empty.
//
// Per cell rather than against one joined row string: "wholeCell" needs a single cell's whole text
// to compare against, and the previous tab-joined haystack was already equivalent to per-cell
// matching for the other two modes — whitespace-split terms can never contain the tab separator,
// so no term could bridge two columns. (One microscopic change: a *pasted* tab inside a substring
// search could previously bridge two adjacent columns. That was the separator failing at its one
// job.) Formatting each column lazily also lets a row bail out on its first hit.
export function performQuickFilter(
  spec: QuickFilterSpec,
  rows: IRowNode[],
  candidateIdx: number[],
): number[] {
  const raw = spec.text.trim();
  if (raw === "" || spec.columns.length === 0) return candidateIdx;

  const fold = (s: string) => (spec.caseSensitive ? s : s.toLowerCase());
  const needle = fold(raw);
  const columns = spec.columns;
  // Only multiTerm splits; the other modes match the whole string as one unit.
  const terms = spec.matchMode === "multiTerm" ? needle.split(/\s+/).filter(Boolean) : [];
  if (spec.matchMode === "multiTerm" && terms.length === 0) return candidateIdx;
  // Reused across rows: one allocation, not one per row.
  const termFound: boolean[] = new Array(terms.length);

  const out: number[] = [];
  for (let k = 0; k < candidateIdx.length; k++) {
    const i = candidateIdx[k];
    const node = rows[i];
    // Group nodes carry synthetic data; skip them here — the grouped path rebuilds groups from the
    // surviving leaves, so a group's visibility follows from its children.
    if (node.isGroup) continue;

    let keep = false;
    if (spec.matchMode === "multiTerm") {
      // Row-scoped: each word may be found in a different cell, so the row is kept once every word
      // has been seen somewhere in it.
      termFound.fill(false);
      let remaining = terms.length;
      for (let c = 0; c < columns.length && remaining > 0; c++) {
        const col = columns[c];
        const formatted = col.formatValue(col.getValue(node), node);
        if (!formatted) continue;
        const value = fold(formatted);
        for (let t = 0; t < terms.length; t++) {
          if (termFound[t] || !value.includes(terms[t])) continue;
          termFound[t] = true;
          remaining--;
        }
      }
      keep = remaining === 0;
    } else {
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const formatted = col.formatValue(col.getValue(node), node);
        if (!formatted) continue;
        if (cellTextMatches(fold(formatted), needle, spec.matchMode)) {
          keep = true;
          break;
        }
      }
    }
    if (keep) out.push(i);
  }
  return out;
}

type ActiveFilter = {
  col: Column;
  type: FilterType;
  v: any;
  rawValues: any[];
  params: ResolvedFilterParams;
  matcher?: FilterMatcherFn;
  filterFunction?: NonNullable<FilterParams["filterFunction"]>;
  /** in/notIn: the model's values as membership keys (`setMembershipKey`), null for the blanks bucket. */
  setKeys?: Set<string | null>;
  /** Date columns: the operands as local calendar days, `[start, end]` instants (NaN when unparseable). */
  days?: DayBounds[];
  /** Boolean columns, eq/neq: the operand as a boolean, null when it is not one. */
  bool?: boolean | null;
};

/** One column's conditions and the join between them. */
type ActiveGroup = { join: "and" | "or"; conditions: ActiveFilter[] };

type DayBounds = { start: number; end: number };

/**
 * Keep the rows (by index) that pass every column's filter. A column passes when all of its
 * conditions match (`join: "and"`, the default) or any one does (`join: "or"`); columns are always
 * ANDed with each other.
 */
export function performFilter(filters: FilterItem[], rows: IRowNode[]): number[] {
  const n = rows.length;
  const out = new Array(n);
  let outLen = 0;

  const groups: ActiveGroup[] = [];
  for (const filter of filters) {
    // `false` is an explicit opt-out. Usually this also prevents the menu from creating a model,
    // but honour it here as well for models supplied through the API or restored from state.
    if (filter.col.filter === false) continue;

    const active: ActiveFilter[] = [];
    const params = resolveFilterParams(filter.col.filterParams);
    const filterFunction = filter.col.filterParams?.filterFunction;
    const matcher = typeof filter.col.filter === "function" ? (filter.col.filter as FilterMatcherFn) : undefined;

    // The FilterParams callback is the most specific customisation and therefore wins over a
    // matcher supplied through ColDef.filter. Both callbacks receive textFormatter-processed
    // operands; filterFunction additionally receives the case/trim settings so it can decide how
    // those settings apply to its custom comparison.
    if (filterFunction || matcher) {
      for (const f of filter.filters) {
        const rawValues = toValuesArray(f.values);
        active.push({
          col: filter.col,
          type: f.type,
          v: formatFilterValues(rawValues, params.textFormatter),
          rawValues,
          params,
          filterFunction,
          matcher: filterFunction ? undefined : matcher,
        });
      }
    } else {
      const dateColumn = isDateFilterColumn(filter.col);
      const booleanColumn = isBooleanFilterColumn(filter.col);
      // Pre-normalize filter values
      for (const f of filter.filters) {
        const rawValues = toValuesArray(f.values);
        const valuesNeeded = valuesNeededFor(f.type);
        if (valuesNeeded === 0) {
          active.push({ col: filter.col, type: f.type, v: null, rawValues, params });
        } else if (f.type === "in" || f.type === "notIn") {
          const values = Array.isArray(rawValues[0]) ? rawValues[0] : rawValues; // allow both in([1,2,3]) and in(1,2,3) for set filters
          active.push({
            col: filter.col,
            type: f.type,
            v: values,
            rawValues: values,
            params,
            setKeys: new Set(values.map(value => setMembershipKey(value, params))),
          });
        } else if (dateColumn && DATE_OPS.has(f.type)) {
          active.push({
            col: filter.col,
            type: f.type,
            v: rawValues,
            rawValues,
            params,
            days: rawValues.slice(0, valuesNeeded).map(value => dayBounds(formatOperand(value, params.textFormatter))),
          });
        } else if (booleanColumn && (f.type === "eq" || f.type === "neq")) {
          active.push({
            col: filter.col,
            type: f.type,
            v: rawValues[0],
            rawValues,
            params,
            bool: toBoolean(formatOperand(rawValues[0], params.textFormatter)),
          });
        } else if (f.type === "contains" || f.type === "notContains" || f.type === "startsWith" || f.type === "endsWith" || !filter.col.isComputableType()) {
          active.push({
            col: filter.col,
            type: f.type,
            v: normalizeTextFilterOperand(rawValues[0], params),
            rawValues,
            params,
          });
        } else {
          const v = valuesNeeded === 1
            ? normalizeFilterOperand(rawValues[0], params)
            : rawValues.map(value => normalizeFilterOperand(value, params));
          active.push({ col: filter.col, type: f.type, v, rawValues, params });
        }
      }
    }
    if (active.length > 0) groups.push({ join: filter.join === "or" ? "or" : "and", conditions: active });
  }

  if (groups.length === 0) {
    for (let i = 0; i < n; i++) out[outLen++] = i;
    out.length = outLen;
    return out;
  }

  for (let i = 0; i < n; i++) {
    const node = rows[i];
    let ok = true;
    for (let g = 0; g < groups.length && ok; g++) {
      const { join, conditions } = groups[g];
      if (join === "or") {
        let any = false;
        for (let j = 0; j < conditions.length; j++) {
          if (conditionMatches(conditions[j], node)) {
            any = true;
            break;
          }
        }
        ok = any;
      } else {
        for (let j = 0; j < conditions.length; j++) {
          if (!conditionMatches(conditions[j], node)) {
            ok = false;
            break;
          }
        }
      }
    }
    if (ok) out[outLen++] = i;
  }

  out.length = outLen;
  return out;
}

function conditionMatches(f: ActiveFilter, node: IRowNode): boolean {
  const cell = f.col.getValue(node);

  if (f.filterFunction) {
    const formattedCell = formatOperand(cell, f.params.textFormatter);
    return !!f.filterFunction(f.type, f.v, formattedCell, f.params.caseSensitive, f.params.trimValues);
  }

  // Custom matcher: delegate the keep/drop decision to the column's filter function. Without
  // textFormatter this preserves the existing raw-value contract.
  if (f.matcher) {
    const formattedCell = formatOperand(cell, f.params.textFormatter);
    return !!f.matcher(formattedCell, node, f.v, f.type);
  }

  if (f.days) return dateMatches(f.type, f.days, toInstant(formatOperand(cell, f.params.textFormatter)));

  if (f.bool !== undefined) {
    const value = toBoolean(formatOperand(cell, f.params.textFormatter));
    const equal = f.bool !== null && value === f.bool;
    return f.type === "eq" ? equal : !equal;
  }

  const usesRawBlankSemantics = f.type === FilterType.IS_BLANK || f.type === FilterType.IS_NOT_BLANK;
  const comparableCell = usesRawBlankSemantics ? cell : normalizeCellOperand(cell, f.params);
  const strVal = comparableCell == null ? "" : String(comparableCell);

  switch (f.type) {
    case "contains": return strVal.includes(f.v);
    case "notContains": return !strVal.includes(f.v);
    case "startsWith": return strVal.startsWith(f.v);
    case "endsWith": return strVal.endsWith(f.v);
    case "eq":
      // Numeric columns compare coerced, formatter-processed operands; string columns compare
      // the normalized text prepared above.
      return f.col.isComputableType() ? Number(comparableCell) === Number(f.v) : strVal === f.v;
    case "neq":
      return f.col.isComputableType() ? Number(comparableCell) !== Number(f.v) : strVal !== f.v;
    case "gt": return Number(comparableCell) > Number(f.v);
    case "gte": return Number(comparableCell) >= Number(f.v);
    case "lt": return Number(comparableCell) < Number(f.v);
    case "lte": return Number(comparableCell) <= Number(f.v);
    case "in": return !!f.setKeys?.has(setMembershipKey(cell, f.params));
    case "notIn": return !f.setKeys?.has(setMembershipKey(cell, f.params));
    case "isBlank": return cell == null || cell === "";
    case "isNotBlank": return !(cell == null || cell === "");
    case "inRange": {
      const v = Number(comparableCell);
      return !(v < Number(f.v[0]) || v > Number(f.v[1]));
    }
    case "notInRange": {
      const v = Number(comparableCell);
      return !(v >= Number(f.v[0]) && v <= Number(f.v[1]));
    }
    default:
      return false;
  }
}

const DATE_OPS = new Set<string>(["eq", "neq", "gt", "gte", "lt", "lte", "inRange", "notInRange"]);

/** A DATE-typed column, or one whose filter is declared `"date"`: operands are calendar days. */
function isDateFilterColumn(col: Column): boolean {
  return col.type === ColumnType.DATE || col.filter === "date";
}

/** A BOOLEAN-typed column, or one whose filter is declared `"boolean"`. */
function isBooleanFilterColumn(col: Column): boolean {
  return col.type === ColumnType.BOOLEAN || col.filter === "boolean";
}

/**
 * A date operand or cell — `Date`, epoch number, or text — as an instant. ISO text without a zone
 * (`2026-01-12`, what the date input sends) is read in local time, as the date column reads it.
 */
function toInstant(value: any): number {
  if (value == null || value === "") return NaN;
  if (typeof value === "string") {
    const iso = parseIsoDate(value.trim());
    if (iso) return iso.getTime();
  }
  if (value instanceof Date || typeof value === "number" || typeof value === "string") {
    return parseDateInput(value)?.getTime() ?? NaN;
  }
  return NaN;
}

/** The local calendar day an operand falls on, as its first and last millisecond. */
function dayBounds(value: any): DayBounds {
  const t = toInstant(value);
  if (Number.isNaN(t)) return { start: NaN, end: NaN };
  const d = new Date(t);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
  return { start, end };
}

/**
 * Day-level date comparison. `eq` is "on that day", `gt` "after it", `gte` "on or after it", `lt`
 * "before it", `lte` "on or before it", `inRange` from the start of the first day through the end
 * of the second (both ends inclusive). A cell or operand that is not a date fails the positive
 * operators and so passes their complements (`neq`, `notInRange`).
 */
function dateMatches(type: FilterType, days: DayBounds[], cell: number): boolean {
  const a = days[0];
  switch (type) {
    case "eq": return cell >= a.start && cell <= a.end;
    case "neq": return !(cell >= a.start && cell <= a.end);
    case "gt": return cell > a.end;
    case "gte": return cell >= a.start;
    case "lt": return cell < a.start;
    case "lte": return cell <= a.end;
    case "inRange": return cell >= a.start && cell <= (days[1]?.end ?? NaN);
    case "notInRange": return !(cell >= a.start && cell <= (days[1]?.end ?? NaN));
    default: return false;
  }
}

/**
 * A boolean operand or cell: `true`/`false`; `1`/`0`; text `true`/`false`, `yes`/`no`, `y`/`n`,
 * `1`/`0` (any case). Anything else, blanks included, is not a boolean (null).
 */
function toBoolean(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const parsed = parseBooleanText(value);
  return typeof parsed === "boolean" ? parsed : null;
}

/**
 * The identity of a value in a set filter (in/notIn), the same on both sides of the test and the
 * same rule the menu's universe dedupes by (`resolveValueKey` in `filter/setFilterCore.ts`). The two
 * must agree, or a value would be one option in the menu while its rows filtered as several —
 * which is exactly what used to happen to `Date` cells: deduped by instant in the menu, compared by
 * reference here, so unchecking a date hid only the rows holding that very instance.
 *
 *  - A blank raw is the grid's `(Blanks)` bucket, `null`, and never reaches `keyCreator`; an empty
 *    key is blank too, which is how an application widens the bucket.
 *  - With a `keyCreator`, the key decides.
 *  - Without one, the operand is normalized as every built-in comparison is (`textFormatter`, then
 *    trim and case per the params) and keyed with `defaultValueKey`: a Date by its instant, an
 *    object by its content, and a persisted `"5"` finds the numeric 5 the rows hold — the menu
 *    already treats those as one option.
 */
function setMembershipKey(value: any, params: ResolvedFilterParams): string | null {
  if (isBlankValue(value)) return null;
  if (params.keyCreator) {
    const key = params.keyCreator(value);
    return isBlankValue(key) ? null : String(key);
  }
  return defaultValueKey(normalizeFilterOperand(value, params));
}

type ResolvedFilterParams = {
  caseSensitive: boolean;
  trimValues: boolean;
  textFormatter?: NonNullable<FilterParams["textFormatter"]>;
  keyCreator?: NonNullable<FilterParams["keyCreator"]>;
};

function resolveFilterParams(params: FilterParams | undefined): ResolvedFilterParams {
  return {
    caseSensitive: params?.caseSensitive ?? false,
    trimValues: params?.trimValues ?? false,
    textFormatter: params?.textFormatter,
    keyCreator: params?.keyCreator,
  };
}

function toValuesArray(values: any): any[] {
  return Array.isArray(values) ? values : [values];
}

function formatOperand(value: any, formatter: ResolvedFilterParams["textFormatter"]): any {
  return formatter ? formatter(value) : value;
}

function formatFilterValues(values: any[], formatter: ResolvedFilterParams["textFormatter"]): any[] {
  if (!formatter) return values;
  return values.map(value => Array.isArray(value) ? formatFilterValues(value, formatter) : formatter(value));
}

function normalizeFilterOperand(value: any, params: ResolvedFilterParams): any {
  const formatted = formatOperand(value, params.textFormatter);
  if (typeof formatted !== "string") return formatted;
  const trimmed = params.trimValues ? formatted.trim() : formatted;
  return params.caseSensitive ? trimmed : trimmed.toLowerCase();
}

function normalizeTextFilterOperand(value: any, params: ResolvedFilterParams): string {
  const normalized = normalizeFilterOperand(value, params);
  return normalized == null ? "" : String(normalized);
}

function normalizeCellOperand(value: any, params: ResolvedFilterParams): any {
  const formatted = formatOperand(value, params.textFormatter);
  if (typeof formatted !== "string" || params.caseSensitive) return formatted;
  return formatted.toLowerCase();
}
