import { FilterDef, InternalColumnDef } from "./types";

export function findColumnById(columns: InternalColumnDef[], id: string): InternalColumnDef | undefined {
  for (const col of columns) {
    if (col.id === id) return col;
    if (col.children) {
      const found = findColumnById(col.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * A column-aware filter model:
 * filterModel = {
 *   name: { type: "contains", value: "ash" },
 *   age:  { type: "gte", value: 30 }
 * }
 */
export function computeFilteredIdx(rows: any[], filters: FilterDef[], columns: InternalColumnDef[]): number[] {
  const n = rows.length;
  const out = new Array(n);
  let outLen = 0;

  const active = [];
  for (const f of filters) {
    const col = columns.find(c => c.id === f.key);
    if (!col) continue;
    // Pre-normalize filter values
    if (f.type === "contains" || f.type === "startsWith" || f.type === "endsWith") {
      active.push({
        key: col.key,
        type: f.type,
        q: String(f.q ?? "").toLowerCase(),
      });
    } else {
      active.push({
        key: col.key,
        type: f.type,
        v: f.v,
      });
    }
  }

  if (active.length === 0) {
    for (let i = 0; i < n; i++) out[outLen++] = i;
    out.length = outLen;
    return out;
  }

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    let ok = true;

    for (let j = 0; j < active.length; j++) {
      const f = active[j];
      const cell = r[f.key];

      switch (f.type) {
        case "contains": {
          const s = cell == null ? "" : String(cell).toLowerCase();
          if (!s.includes(f.q)) ok = false;
          break;
        }
        case "startsWith": {
          const s = cell == null ? "" : String(cell).toLowerCase();
          if (!s.startsWith(f.q)) ok = false;
          break;
        }
        case "endsWith": {
          const s = cell == null ? "" : String(cell).toLowerCase();
          if (!s.endsWith(f.q)) ok = false;
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
        default:
          ok = false;
      }

      if (!ok) break;
    }

    if (ok) out[outLen++] = i;
  }

  out.length = outLen;
  return out;
}
