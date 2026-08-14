import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { FilterItem, FilterMatcherFn, FilterParams, FilterType, valuesNeededFor } from "../interfaces/filter";
import { QuickFilterMatchMode } from "../interfaces/gridOptions";

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

// Narrow an existing list of row indices (already passing the column filters) to those that also
// match the quick-filter search text. Matching is against each column's *formatted display value*
// so the user searches what they see (e.g. "$1,200"), joined by a tab so tokens can't bridge two
// adjacent columns. Returns `candidateIdx` unchanged when the search text is empty.
export function performQuickFilter(
  spec: QuickFilterSpec,
  rows: IRowNode[],
  candidateIdx: number[],
): number[] {
  const raw = spec.text.trim();
  if (raw === "" || spec.columns.length === 0) return candidateIdx;

  const fold = (s: string) => (spec.caseSensitive ? s : s.toLowerCase());
  const needle = fold(raw);
  // In multiTerm mode every whitespace-separated token must be found; in substring mode the whole
  // string is a single term.
  const terms = spec.matchMode === "multiTerm" ? needle.split(/\s+/).filter(Boolean) : [needle];
  if (terms.length === 0) return candidateIdx;

  const out: number[] = [];
  for (let k = 0; k < candidateIdx.length; k++) {
    const i = candidateIdx[k];
    const node = rows[i];
    // Group nodes carry synthetic data; skip them here — the grouped path rebuilds groups from the
    // surviving leaves, so a group's visibility follows from its children.
    if (node.isGroup) continue;
    let haystack = "";
    for (let c = 0; c < spec.columns.length; c++) {
      const col = spec.columns[c];
      const formatted = col.formatValue(col.getValue(node), node);
      if (formatted) haystack += (haystack ? "\t" : "") + formatted;
    }
    const folded = fold(haystack);
    let matchedAll = true;
    for (let t = 0; t < terms.length; t++) {
      if (!folded.includes(terms[t])) {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) out.push(i);
  }
  return out;
}

export function performFilter(filters: FilterItem[], rows: IRowNode[]): number[] {
  const n = rows.length;
  const out = new Array(n);
  let outLen = 0;

  type ActiveFilter = {
    col: Column;
    type: FilterType;
    v: any;
    rawValues: any[];
    params: ResolvedFilterParams;
    matcher?: FilterMatcherFn;
    filterFunction?: NonNullable<FilterParams["filterFunction"]>;
  };

  const active: ActiveFilter[] = [];
  for (const filter of filters) {
    // `false` is an explicit opt-out. Usually this also prevents the menu from creating a model,
    // but honour it here as well for models supplied through the API or restored from state.
    if (filter.col.filter === false) continue;

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
      continue;
    }

    // Pre-normalize filter values
    for (const f of filter.filters) {
      const rawValues = toValuesArray(f.values);
      const valuesNeeded = valuesNeededFor(f.type);
      if (valuesNeeded === 0) {
        active.push({
          col: filter.col,
          type: f.type,
          v: null,
          rawValues,
          params,
        });
      } else if (f.type === "in" || f.type === "notIn") {
        const values = Array.isArray(rawValues[0]) ? rawValues[0] : rawValues; // allow both in([1,2,3]) and in(1,2,3) for set filters
        active.push({
          col: filter.col,
          type: f.type,
          v: values.map(value => normalizeFilterOperand(value, params)),
          rawValues: values,
          params,
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
        active.push({
          col: filter.col,
          type: f.type,
          v: v,
          rawValues,
          params,
        });
      }
    }
  }

  if (active.length === 0) {
    for (let i = 0; i < n; i++) out[outLen++] = i;
    out.length = outLen;
    return out;
  }

  for (let i = 0; i < n; i++) {
    let ok = true;

    for (let j = 0; j < active.length; j++) {
      const f = active[j];
      const cell = f.col.getValue(rows[i]);

      if (f.filterFunction) {
        const formattedCell = formatOperand(cell, f.params.textFormatter);
        if (!f.filterFunction(f.type, f.v, formattedCell, f.params.caseSensitive, f.params.trimValues)) {
          ok = false;
          break;
        }
        continue;
      }

      // Custom matcher: delegate the keep/drop decision to the column's filter function. Without
      // textFormatter this preserves the existing raw-value contract.
      if (f.matcher) {
        const formattedCell = formatOperand(cell, f.params.textFormatter);
        if (!f.matcher(formattedCell, rows[i], f.v, f.type)) {
          ok = false;
          break;
        }
        continue;
      }

      const usesRawBlankSemantics = f.type === FilterType.IS_BLANK || f.type === FilterType.IS_NOT_BLANK;
      const comparableCell = usesRawBlankSemantics ? cell : normalizeCellOperand(cell, f.params);
      const strVal = comparableCell == null ? "" : String(comparableCell);

      switch (f.type) {
        case "contains": {
          if (!strVal.includes(f.v)) ok = false;
          break;
        }
        case "notContains": {
          if (strVal.includes(f.v)) ok = false;
          break;
        }
        case "startsWith": {
          if (!strVal.startsWith(f.v)) ok = false;
          break;
        }
        case "endsWith": {
          if (!strVal.endsWith(f.v)) ok = false;
          break;
        }
        case "eq":
          // Numeric columns compare coerced, formatter-processed operands; string columns compare
          // the normalized text prepared above.
          if (f.col.isComputableType() ? Number(comparableCell) !== Number(f.v) : strVal !== f.v) ok = false;
          break;
        case "neq":
          if (f.col.isComputableType() ? Number(comparableCell) === Number(f.v) : strVal === f.v) ok = false;
          break;
        case "gt":
          if (!(Number(comparableCell) > Number(f.v))) ok = false;
          break;
        case "gte":
          if (!(Number(comparableCell) >= Number(f.v))) ok = false;
          break;
        case "lt":
          if (!(Number(comparableCell) < Number(f.v))) ok = false;
          break;
        case "lte":
          if (!(Number(comparableCell) <= Number(f.v))) ok = false;
          break;
        case "in":
          if (!Array.isArray(f.v) || !setValuesInclude(f.v, comparableCell, f.rawValues, cell)) ok = false;
          break;
        case "notIn":
          if (Array.isArray(f.v) && setValuesInclude(f.v, comparableCell, f.rawValues, cell)) ok = false;
          break;
        case "isBlank":
          if (cell != null && cell !== "") ok = false;
          break;
        case "isNotBlank":
          if (cell == null || cell === "") ok = false;
          break;
        case "inRange": {
          const v = Number(comparableCell);
          if (v < Number(f.v[0]) || v > Number(f.v[1])) ok = false;
          break;
        }
        case "notInRange": {
          const v = Number(comparableCell);
          if (v >= Number(f.v[0]) && v <= Number(f.v[1])) ok = false;
          break;
        }
        default:
          ok = false;
      }

      if (!ok) break;
    }

    if (ok) out[outLen++] = i;
  };

  out.length = outLen;
  return out;
}

// Membership test for set-filter (in/notIn) value lists. A null entry represents the "(Blanks)"
// bucket and matches every blank cell (null, undefined, or empty string) — the set-filter menu and
// API store the bucket as null, while rows may hold any of the three.
function setValuesInclude(values: any[], cell: any, rawValues: any[], rawCell: any): boolean {
  if (values.includes(cell)) return true;
  const cellIsBlank = rawCell == null || rawCell === "";
  return cellIsBlank && rawValues.includes(null);
}

type ResolvedFilterParams = {
  caseSensitive: boolean;
  trimValues: boolean;
  textFormatter?: NonNullable<FilterParams["textFormatter"]>;
};

function resolveFilterParams(params: FilterParams | undefined): ResolvedFilterParams {
  return {
    caseSensitive: params?.caseSensitive ?? false,
    trimValues: params?.trimValues ?? false,
    textFormatter: params?.textFormatter,
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
