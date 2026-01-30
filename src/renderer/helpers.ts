import { Column } from "../column/Column";
import { isNullOrUndefined, isTrue } from "../misc";
import { IRowNode } from "../interfaces/IRowNode";
import { FilterDef } from "../interfaces/filter";

export function findColumnById(columns: Column[], id: string): Column | undefined {
  for (const col of columns) {
    if (col.instanceID === id) return col;
    if (col.children) {
      const found = findColumnById(col.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function getVisibleChildren(column: Column): Column[] {
  if (!column.children) return [];
  return column.children.filter(c => c.columnGroupVisible);
}

export function collectLeaves(column: Column, visibleOnly: boolean = false): Column[] {
  let leaves: Column[] = [];
  function walker(column: Column) {
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

export function getColumnAncestors(columns: Column[], id: string): Column[] {
  const path: Column[] = [];

  function helper(cols: Column[], targetId: string): boolean {
    for (const col of cols) {
      if (col.instanceID === targetId) {
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
export function computeFilteredIdx(rows: IRowNode[], filters: FilterDef[]): number[] {
  const n = rows.length;
  const out = new Array(n);
  let outLen = 0;

  const active: Array<{ col: Column; type: FilterDef["type"]; q?: string; v?: any }> = [];
  for (const f of filters) {
    // Pre-normalize filter values
    if (f.type === "contains" || f.type === "startsWith" || f.type === "endsWith") {
      active.push({
        col: f.col,
        type: f.type,
        q: String(f.v ?? "").toLowerCase(),
      });
    } else {
      active.push({
        col: f.col,
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
    const r = rows[i].data;
    let ok = true;

    for (let j = 0; j < active.length; j++) {
      const f = active[j];
      const cell = f.col.getValue(r);

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

export function newColumnHierarchy(ancestors: Column[], col: Column): Column {
  if (ancestors.length === 0) return col;
  const newHierarchy: Column[] = [];
  let parent: Column | null = null;
  let idx = -1;
  for (const ancestor of ancestors) {
    if (ancestor.instanceID === col.instanceID) {
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(col);
      }
      break;
    }
    idx++;
    const newAncestor: Column = ancestor.duplicate();
    if (newHierarchy.length === 0) {
      newHierarchy.push(newAncestor);
    } else {
      parent!.children!.push(newAncestor);
    }
    parent = newAncestor;
  }
  ancestors[idx].children = ancestors[idx].children?.filter(c => c.instanceID !== col.instanceID);
  return newHierarchy[0];
}

export function splitTreeAtColumn(column: Column, firstRight: Column): [Column, Column | null] {
  const ancestors = getColumnAncestors([column], firstRight.instanceID);
  let right: Column | null = null;
  let rightChild: Column = firstRight;
  let leftChild: Column | null = null;
  let mustSplit = false;
  for (const level of ancestors.reverse().slice(1)) {
    const children = level.children;
    if (!children || children.length === 0) continue;
    const visibleChildren = children.filter(c => c.columnGroupVisible);
    if (visibleChildren.length === 0) continue;
    let visibleIdx = visibleChildren.findIndex(c => c.instanceID == rightChild.instanceID);
    if (visibleIdx < 0 && leftChild) visibleIdx = visibleChildren.findIndex(c => c.instanceID == leftChild!.instanceID);
    if (visibleIdx > 0 || mustSplit) {
      const newLevel = level.duplicate();
      let idx = children.findIndex(c => c.instanceID == rightChild.instanceID);
      if (idx < 0 && leftChild) idx = children.findIndex(c => c.instanceID == leftChild!.instanceID);
      level.children = children.slice(0, idx || 1);
      if (leftChild && level.children) {
        level.children[idx] = leftChild;
      }
      newLevel.children = children.slice(idx);
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

export function mergeColumns(columns: Column[]): Column[] {
  if (columns.length <= 1) return columns;
  const finalColumns: Column[] = [];
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
    if (nextIdx == i + 1 && skipIdx.has(nextIdx)) {
      // No more columns to process
      if (!addedIDs.has(curr.instanceID)) {
        finalColumns.push(curr);
        addedIDs.add(curr.instanceID);
      }
      break;
    }
    const next = columns[nextIdx];
    if (next.children && next.children.length > 0) {
      const mergedChildren = mergeColumns(next.children);
      next.children = mergedChildren;
    }
    if (curr.originalInstanceID !== next.originalInstanceID) {
      if (addedIDs.has(curr.instanceID)) {
        if (nextIdx == columns.length - 1 && !addedIDs.has(next.instanceID)) {
          finalColumns.push(next);
          addedIDs.add(next.instanceID);
        }
        continue;
      }
      finalColumns.push(curr);
      addedIDs.add(curr.instanceID);
      if (i == columns.length - 2) finalColumns.push(next);
      continue;
    }
    mergeTrees(curr, next);
    skipIdx.add(nextIdx);
    if (addedIDs.has(curr.instanceID)) continue;
    finalColumns.push(curr);
    addedIDs.add(curr.instanceID);
    i--;
  }
  return finalColumns;
}

export function mergeTrees(left: Column, right: Column) {
  const currChildLen = left.children?.length || 0;
  const nextChildLen = right.children?.length || 0;
  if (currChildLen == 0 || nextChildLen == 0) return;
  if (left.children![currChildLen - 1].originalInstanceID != right.children![0].originalInstanceID) {
    left.children?.push(...right.children!);
    return;
  }
  mergeTrees(left.children![currChildLen - 1], right.children![0]);
  if (nextChildLen > 1) {
    left.children?.push(...right.children!.slice(1));
  }
}

export function adjustPinned(cols: Column[], pinned: "left" | "right" | null) {
  for (const c of cols) {
    c.pinned = pinned;
    if (c.children && c.children.length > 0) {
      adjustPinned(c.children, pinned);
    }
  }
}

export function empty(component: HTMLElement) {
  while (component.firstChild) {
    component.removeChild(component.firstChild);
  }
}
