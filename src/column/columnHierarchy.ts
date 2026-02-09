import { Column } from "./column";
import { ColumnModel } from "./columnModel";

export class ColumnHierarchy {
  constructor(private model: ColumnModel) { }

  newColumnHierarchy(ancestors: Column[], col: Column): Column {
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

  splitTreeAtColumn(column: Column, firstRight: Column): [Column, Column | null] {
    const ancestors = this.model.getAncestors(firstRight.instanceID);
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

  mergeColumns(columns: Column[]): Column[] {
    if (columns.length <= 1) return columns;
    const finalColumns: Column[] = [];
    const skipIdx: Set<number> = new Set();
    const addedIDs: Set<string> = new Set();
    for (let i = 0; i < columns.length - 1; i++) {
      if (skipIdx.has(i)) continue;
      const curr = columns[i];
      if (curr.children && curr.children.length > 0) {
        const mergedChildren = this.mergeColumns(curr.children);
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
        const mergedChildren = this.mergeColumns(next.children);
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
      this.mergeTrees(curr, next);
      skipIdx.add(nextIdx);
      if (addedIDs.has(curr.instanceID)) continue;
      finalColumns.push(curr);
      addedIDs.add(curr.instanceID);
      i--;
    }
    return finalColumns;
  }

  mergeTrees(left: Column, right: Column) {
    const currChildLen = left.children?.length || 0;
    const nextChildLen = right.children?.length || 0;
    if (currChildLen == 0 || nextChildLen == 0) return;
    if (left.children![currChildLen - 1].originalInstanceID != right.children![0].originalInstanceID) {
      left.children?.push(...right.children!);
      return;
    }
    this.mergeTrees(left.children![currChildLen - 1], right.children![0]);
    if (nextChildLen > 1) {
      left.children?.push(...right.children!.slice(1));
    }
  }

  adjustPinned(cols: Column[], pinned: "left" | "right" | null) {
    for (const c of cols) {
      c.pinned = pinned;
      if (c.children && c.children.length > 0) {
        this.adjustPinned(c.children, pinned);
      }
    }
  }

}
