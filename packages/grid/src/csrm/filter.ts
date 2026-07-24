import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { FilterItem, FilterMatcherFn, FilterType, valuesNeededFor } from "../interfaces/filter";
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

  const active: Array<{ col: Column; type: FilterType; v: any; matcher?: FilterMatcherFn; rawValues?: any[] }> = [];
  for (const filter of filters) {
    // A column whose `filter` is a function supplies a custom matcher: it receives the cell value,
    // node, and the user's raw menu input (values + type), and decides row-by-row. The built-in
    // value normalization / operator switch is bypassed for that column.
    const matcher = typeof filter.col.filter === "function" ? (filter.col.filter as FilterMatcherFn) : undefined;
    if (matcher) {
      for (const f of filter.filters) {
        active.push({ col: filter.col, type: f.type, v: null, matcher, rawValues: Array.isArray(f.values) ? f.values : [f.values] });
      }
      continue;
    }
    // Pre-normalize filter values
    for (const f of filter.filters) {
      const valuesNeeded = valuesNeededFor(f.type);
      if (valuesNeeded === 0) {
        active.push({
          col: filter.col,
          type: f.type,
          v: null,
        });
      } else if (f.type === "in" || f.type === "notIn") {
        const values = Array.isArray(f.values[0]) ? f.values[0] : f.values; // allow both in([1,2,3]) and in(1,2,3) for set filters
        if (!filter.col.isComputableType()) {
          // values.forEach((v: any, i: number) => values[i] = String(v).toLowerCase());
        }
        active.push({
          col: filter.col,
          type: f.type,
          v: values,
        });
      } else if (f.type === "contains" || f.type === "notContains" || f.type === "startsWith" || f.type === "endsWith" || !filter.col.isComputableType()) {
        active.push({
          col: filter.col,
          type: f.type,
          v: String(f.values[0] ?? "").toLowerCase(),
        });
      } else {
        const v = valuesNeeded === 1 ? f.values[0] : f.values;
        active.push({
          col: filter.col,
          type: f.type,
          v: v,
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

      // Custom matcher: delegate the keep/drop decision to the column's filter function.
      if (f.matcher) {
        if (!f.matcher(cell, rows[i], f.rawValues ?? [], f.type)) {
          ok = false;
          break;
        }
        continue;
      }

      const strVal = cell == null ? "" : String(cell).toLowerCase();

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
          if (cell !== f.v) ok = false;
          break;
        case "neq":
          if (cell === f.v) ok = false;
          break;
        case "gt":
          if (!(Number(cell) > Number(f.v))) ok = false;
          break;
        case "gte":
          if (!(Number(cell) >= Number(f.v))) ok = false;
          break;
        case "lt":
          if (!(Number(cell) < Number(f.v))) ok = false;
          break;
        case "lte":
          if (!(Number(cell) <= Number(f.v))) ok = false;
          break;
        case "in":
          if (!Array.isArray(f.v) || !f.v.includes(cell)) ok = false;
          break;
        case "notIn":
          if (Array.isArray(f.v) && f.v.includes(cell)) ok = false;
          break;
        case "isBlank":
          if (cell != null && cell !== "") ok = false;
          break;
        case "isNotBlank":
          if (cell == null || cell === "") ok = false;
          break;
        case "inRange": {
          const v = Number(cell);
          if (v < Number(f.v[0]) || v > Number(f.v[1])) ok = false;
          break;
        }
        case "notInRange": {
          const v = Number(cell);
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
