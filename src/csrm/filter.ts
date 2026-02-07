import { Column } from "../column/column";
import { FilterModel, IRowNode } from "../interfaces";
import { FilterType, valuesNeededFor } from "../interfaces/filter";

export function performFilter(filters: FilterModel[], rows: IRowNode[]): number[] {
  const n = rows.length;
  const out = new Array(n);
  let outLen = 0;

  const active: Array<{ col: Column; type: FilterType; v: any }> = [];
  for (const filter of filters) {
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
