import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { AggregateScope, AggregateType } from "../../interfaces/aggregate";

type AggregateModelControllerParams = {
  core: GridCore;
  leafColumns: () => Column[];
  selectedColumnIDs: () => Set<string>;
  markAggregatesDirty: () => void;
  requestServerAggregates: () => void;
  renderAggregateRow: () => void;
};

export class AggregateModelController {
  constructor(private params: AggregateModelControllerParams) {}

  aggregate(colID: string, aggType?: AggregateType) {
    const aggregates = this.getAggregateMap();
    const prevSize = aggregates.size;
    if (!aggType) {
      aggregates.delete(colID);
    } else {
      aggregates.set(colID, aggType);
    }
    this.setAggregateMap(aggregates);
    if (prevSize === 0 && aggregates.size > 0 && this.params.core.getAggregateScope() === "none") {
      this.setAggregateScope("page");
    }
    this.params.markAggregatesDirty();
    this.params.renderAggregateRow();
  }

  aggregateSelectedColumns(aggType: AggregateType) {
    const aggregates = this.getAggregateMap();
    const prevSize = aggregates.size;
    const selectedCols = Array.from(this.params.selectedColumnIDs());
    for (const colID of selectedCols) {
      const col = this.params.core.getColumnModel().getById(colID);
      if (!col) continue;
      if (col.children.length > 0) continue;
      aggregates.set(colID, aggType);
    }
    this.setAggregateMap(aggregates);
    if (prevSize === 0 && aggregates.size > 0 && this.params.core.getAggregateScope() === "none") {
      this.setAggregateScope("page");
    }
    this.params.markAggregatesDirty();
    this.params.renderAggregateRow();
  }

  clearAggregates() {
    if (this.params.core.getAggregateModel().length === 0) return;
    this.params.core.setAggregateModel([]);
    this.setAggregateScope("none");
    this.params.markAggregatesDirty();
    this.params.renderAggregateRow();
  }

  setAggregateScope(scope: AggregateScope) {
    const changed = scope !== this.params.core.getAggregateScope();
    this.params.core.setAggregateScope(scope);
    this.params.markAggregatesDirty();
    this.params.requestServerAggregates();
    if (changed) {
      this.params.renderAggregateRow();
    }
  }

  pruneAggregates() {
    return;
  }

  getAggregateOpForColumn(col: Column): AggregateType {
    const explicit = this.getAggregateMap().get(col.instanceID);
    if (explicit != null) return explicit;
    return col.isComputableType() ? AggregateType.SUM : AggregateType.COUNT;
  }

  getAggregateMap(): Map<string, AggregateType> {
    return new Map(this.params.core.getAggregateModel().map(a => [a.key, a.type]));
  }

  getAggregateRows(): any[] {
    if (this.params.core.getAggregateScope() === "all") {
      const rows: any[] = [];
      this.params.core.getRowModel().forEachNodeAfterFilterAndSort((node) => rows.push(node.data));
      return rows;
    }
    const rows: any[] = [];
    for (let i = 0; i < this.params.core.getRowModel().getViewCount(); i++) {
      const node = this.params.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  private setAggregateMap(aggregates: Map<string, AggregateType>) {
    this.params.core.setAggregateModel(Array.from(aggregates.entries()).map(([key, type]) => ({ key, type })));
  }
}
