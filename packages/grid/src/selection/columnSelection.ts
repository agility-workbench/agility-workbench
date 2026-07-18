import { GridCore } from "../core/core";

export class ColumnSelection {
  private selectedColIds: Set<string> = new Set();

  constructor(private core: GridCore) { }

  isSelected(colId: string) {
    return this.selectedColIds.has(colId);
  }

  toggle(colId: string) {
    if (this.selectedColIds.has(colId)) {
      this.selectedColIds.delete(colId);
    } else {
      this.selectedColIds.add(colId);
    }
    this.core.dispatch({ type: "columnStateSet", state: Array.from(this.selectedColIds).map(id => ({ colId: id, selected: true })) });
  }

  clear() {
    this.selectedColIds.clear();
    this.core.dispatch({ type: "selectionClear" });
  }
}
