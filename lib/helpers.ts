import { isNullOrUndefined, isTrue } from "./misc";
import { FilterDef, InternalColumn } from "./types";

export function findColumnById(columns: InternalColumn[], id: string): InternalColumn | undefined {
  for (const col of columns) {
    if (col.id === id) return col;
    if (col.children) {
      const found = findColumnById(col.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function getChildren(column: InternalColumn): InternalColumn[] {
  if (!column.children) return [];
  return column.children.filter(c => c.columnGroupVisible);
}

export function collectLeaves(column: InternalColumn, visibleOnly: boolean = false): InternalColumn[] {
  let leaves: InternalColumn[] = [];
  function walker(column: InternalColumn) {
    if (isTrue(column.hidden)) return;
    if (visibleOnly && !column.columnGroupVisible) return;
    if (!column.children || column.children.length === 0) {
      leaves.push(column);
      return;
    }
    for (const child of column.children) {
      walker(child);
    }
  }
  walker(column);
  return leaves;
}

export function getColumnAncestors(columns: InternalColumn[], id: string): InternalColumn[] {
  const path: InternalColumn[] = [];

  function helper(cols: InternalColumn[], targetId: string): boolean {
    for (const col of cols) {
      if (col.id === targetId) {
        path.push(col);
        return true;
      }
      if (col.children) {
        if (helper(col.children, targetId)) {
          path.push(col);
          return true;
        }
      }
    }
    return false;
  }

  helper(columns, id);
  return path.reverse();
}

/**
 * A column-aware filter model:
 * filterModel = {
 *   name: { type: "contains", value: "ash" },
 *   age:  { type: "gte", value: 30 }
 * }
 */
export function computeFilteredIdx(rows: any[], filters: FilterDef[], columns: InternalColumn[]): number[] {
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
        q: String(f.v ?? "").toLowerCase(),
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

export function newColumnHierarchy(ancestors: InternalColumn[], col: InternalColumn): InternalColumn {
  if (ancestors.length === 0) return col;
  const newHierarchy: InternalColumn[] = [];
  let parent: InternalColumn | null = null;
  let idx = -1;
  for (const ancestor of ancestors) {
    if (ancestor.id === col.id) {
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(col);
      }
      break;
    }
    idx++;
    const newAncestor: InternalColumn = { ...ancestor, id: crypto.randomUUID(), children: [] };
    if (newHierarchy.length === 0) {
      newHierarchy.push(newAncestor);
    } else {
      parent!.children!.push(newAncestor);
    }
    parent = newAncestor;
  }
  ancestors[idx].children = ancestors[idx].children?.filter(c => c.id !== col.id);
  return newHierarchy[0];
}

export function splitTreeAtIndex(column: InternalColumn, index: number): [InternalColumn, InternalColumn | null] {
  const leaves = collectLeaves(column, true);
  if (index <= 0 || index >= leaves.length) {
    return [column, null];
  }

  const firstLeft = leaves[index];

  let right: InternalColumn | null = null;
  const ancestors = getColumnAncestors([column], firstLeft.id);
  let rightChild: InternalColumn = firstLeft;
  let leftChild: InternalColumn | null = null;
  let mustSplit = false;
  for (const level of ancestors.reverse().slice(1)) {
    // const visibleChildren = getChildren(level);
    if (!level.children || level.children.length === 0) continue;
    let idx = level.children.findIndex(c => c.id == rightChild.id);
    if (idx < 0) idx = level.children.findIndex(c => c.id == leftChild?.id);
    if (idx > 0 && !level.children[idx - 1].columnGroupVisible) {
      let i = idx - 1;
      while (i >= 0) {
        if (level.children![i].columnGroupVisible) break;
        i--;
      }
      idx = i < 0 ? 0 : i;
    }

    if (idx > 0 || mustSplit) {
      const newLevel = { ...level, id: crypto.randomUUID(), children: level.children && level.children.length > 0 ? [...level.children] : [] };
      // idx = level.children!.findIndex(c => c.id == rightChild.id);
      level.children = level.children?.slice(0, idx || 1);
      if (leftChild && level.children) {
        level.children[idx] = leftChild;
      }
      newLevel.children = newLevel.children?.slice(idx);
      if (rightChild && newLevel.children) {
        newLevel.children[0] = rightChild;
      }
      rightChild = newLevel;
      leftChild = level;
      right = newLevel;
      mustSplit = true;
    } else {
      rightChild = level;
    }
  }

  return [column, right];
}

export function mergeColumns(columns: InternalColumn[]): InternalColumn[] {
  if (columns.length <= 1) return columns;
  const finalColumns: InternalColumn[] = [];
  const skipIdx: Set<number> = new Set();
  const addedIDs: Set<string> = new Set();
  for (let i = 0; i < columns.length - 1; i++) {
    if (skipIdx.has(i)) continue;
    const curr = columns[i];
    if (curr.children && curr.children.length > 0) {
      const mergedChildren = mergeColumns(curr.children);
      curr.children = mergedChildren;
    }
    let nextIdx = i + 1;
    for (let j = i + 1; j < columns.length; j++) {
      if (!skipIdx.has(j)) {
        nextIdx = j;
        break;
      }
    }
    const next = columns[nextIdx];
    if (next.children && next.children.length > 0) {
      const mergedChildren = mergeColumns(next.children);
      next.children = mergedChildren;
    }
    if (curr.originalID !== next.originalID) {
      if (addedIDs.has(curr.id)) {
        if (nextIdx == columns.length - 1 && !addedIDs.has(next.id)) {
          finalColumns.push(next);
          addedIDs.add(next.id);
        }
        continue;
      }
      finalColumns.push(curr);
      addedIDs.add(curr.id);
      if (i == columns.length - 2) finalColumns.push(next);
      continue;
    }
    mergeTrees(curr, next);
    skipIdx.add(nextIdx);
    if (addedIDs.has(curr.id)) continue;
    finalColumns.push(curr);
    addedIDs.add(curr.id);
    i--;
  }
  return finalColumns;
}

export function mergeTrees(left: InternalColumn, right: InternalColumn) {
  const currChildLen = left.children?.length || 0;
  const nextChildLen = right.children?.length || 0;
  if (currChildLen == 0 || nextChildLen == 0) return;
  if (left.children![currChildLen - 1].originalID != right.children![0].originalID) {
    left.children?.push(...right.children!);
    return;
  }
  mergeTrees(left.children![currChildLen - 1], right.children![0]);
  if (nextChildLen > 1) {
    left.children?.push(...right.children!.slice(1));
  }
}

export function adjustPinned(cols: InternalColumn[], pinned: "left" | "right" | null) {
  for (const c of cols) {
    c.pinned = pinned;
    if (c.children && c.children.length > 0) {
      adjustPinned(c.children, pinned);
    }
  }
}
