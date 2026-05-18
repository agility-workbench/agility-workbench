import { Column } from "../column/column";

export type SortDir = "asc" | "desc";

export type SortItem = {
  col: Column;
  key: string;
  dir: SortDir;
};

export type SortItemUpdate = {
  col?: Column;
  key: string;
  dir: SortDir | null;
};

export class SortModel {
  public id: string = crypto.randomUUID();

  constructor(public items: SortItem[] = []) { }

  updateItem(col: Column, dir: SortDir | null): boolean {
    if (!this.updateItemWithoutIdChange(col, dir)) return false;
    this.id = crypto.randomUUID();
    return true;
  }

  bulkUpdate(cols: Column[], dir: SortDir | null): boolean {
    let updateID = false;
    for (const col of cols) {
      updateID = this.updateItemWithoutIdChange(col, dir) || updateID;
    }
    if (updateID) this.id = crypto.randomUUID();
    return updateID;
  }

  private updateItemWithoutIdChange(col: Column, dir: SortDir | null): boolean {
    let matched = false;
    let retained = false;
    let changed = false;
    const nextItems: SortItem[] = [];

    for (const item of this.items) {
      if (!this.matchesColumn(item, col)) {
        nextItems.push(item);
        continue;
      }

      matched = true;

      if (retained || dir === null) {
        changed = true;
        continue;
      }

      retained = true;
      changed = item.dir !== dir || item.col !== col || item.key !== col.key;
      nextItems.push({ col, key: col.key, dir });
    }

    if (!matched) {
      if (dir === null) return false;
      nextItems.push({ col, key: col.key, dir });
      changed = true;
    }

    if (!changed) return false;
    this.items = nextItems;
    return true;
  }

  private matchesColumn(item: SortItem, col: Column): boolean {
    return item.col.instanceID === col.instanceID
      || item.col.colId === col.colId
      || item.col.key === col.key
      || item.key === col.colId
      || item.key === col.key;
  }
}
