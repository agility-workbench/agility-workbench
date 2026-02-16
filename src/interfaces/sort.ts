import { Column } from "../column/column";

export type SortDir = "asc" | "desc";

export type SortItem = {
  col: Column;
  key: string;
  dir: SortDir;
};

export class SortModel {
  public id: string = crypto.randomUUID();

  constructor(public items: SortItem[] = []) { }

  updateItem(col: Column, dir: SortDir | null): boolean {
    const idx = this.items.findIndex(s => s.col.instanceID === col.instanceID);
    if (idx < 0) {
      if (dir === null) return false;
      this.items.push({ col, key: col.key, dir });
    } else {
      if (dir === null) {
        this.items.splice(idx, 1);
      } else if (this.items[idx].dir === dir) {
        return false;
      } else {
        this.items[idx].dir = dir;
      }
    }
    this.id = crypto.randomUUID();
    return true;
  }

  bulkUpdate(cols: Column[], dir: SortDir | null): boolean {
    let updateID = false;
    for (const col of cols) {
      let idxToRemove = -1;
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].col.instanceID === col.instanceID) {
          idxToRemove = i;
          if (dir !== null) {
            this.items[i].dir = dir;
            updateID = updateID || this.items[i].dir != dir;
          }
        }
      }
      if (dir === null && idxToRemove >= 0) {
        this.items.splice(idxToRemove, 1);
        updateID = true;
      }
    }
    if (updateID) this.id = crypto.randomUUID();
    return updateID;
  }
}
