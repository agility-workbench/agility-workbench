import { Column } from "../../column/column";
import { AggregateRowRenderer } from "./wrapper";

type LeafColumnMeta = {
  section: "left" | "center" | "right";
  globalIndex: number;
  localIndex: number;
};

type AggregateRowBuilderParams = {
  rowHeight: () => number;
  leafColumnLookup: () => Map<string, LeafColumnMeta>;
  aggregateRowRenderer: AggregateRowRenderer;
  aggregateRow: HTMLDivElement;
  aggregateLeft: HTMLDivElement;
  aggregateCenter: HTMLDivElement;
  aggregateRight: HTMLDivElement;
  leftPinnedLeafColumns: () => Column[];
  centerLeafColumns: () => Column[];
  rightPinnedLeafColumns: () => Column[];
};

export type AggregateRowBuildResult = {
  leftCells: HTMLDivElement[];
  centerCells: HTMLDivElement[];
  rightCells: HTMLDivElement[];
  leftRow?: HTMLDivElement;
  centerRow: HTMLDivElement;
  rightRow?: HTMLDivElement;
};

export class AggregateRowBuilder {
  constructor(private params: AggregateRowBuilderParams) {}

  build(): AggregateRowBuildResult {
    const {
      aggregateRow,
      aggregateLeft,
      aggregateCenter,
      aggregateRight,
    } = this.params;
    aggregateLeft.innerHTML = "";
    aggregateCenter.innerHTML = "";
    aggregateRight.innerHTML = "";
    const leftCells: HTMLDivElement[] = [];
    const centerCells: HTMLDivElement[] = [];
    const rightCells: HTMLDivElement[] = [];

    const makeRow = () => {
      const row = document.createElement("div");
      row.className = "pte-row";
      row.style.height = `${this.params.rowHeight()}px`;
      return row;
    };

    let leftRow: HTMLDivElement | undefined;
    if (this.params.leftPinnedLeafColumns().length > 0) {
      const row = makeRow();
      this.appendCells(row, this.params.leftPinnedLeafColumns(), leftCells);
      aggregateLeft.appendChild(row);
      leftRow = row;
    }

    const centerRow = makeRow();
    this.appendCells(centerRow, this.params.centerLeafColumns(), centerCells);
    aggregateCenter.appendChild(centerRow);

    let rightRow: HTMLDivElement | undefined;
    if (this.params.rightPinnedLeafColumns().length > 0) {
      const row = makeRow();
      this.appendCells(row, this.params.rightPinnedLeafColumns(), rightCells);
      aggregateRight.appendChild(row);
      rightRow = row;
    }

    this.params.aggregateRowRenderer.setHeight(this.params.rowHeight());

    return {
      leftCells,
      centerCells,
      rightCells,
      leftRow,
      centerRow,
      rightRow,
    };
  }

  private appendCells(row: HTMLDivElement, columns: Column[], cells: HTMLDivElement[]) {
    let fallbackIdx = 0;
    for (const col of columns) {
      if (col.hidden) continue;
      const cell = document.createElement("div");
      cell.className = "pte-cell pte-aggregate-cell";
      const meta = this.params.leafColumnLookup().get(col.instanceID);
      if (meta) {
        cell.dataset.colId = col.instanceID;
        cell.dataset.colIdx = String(meta.globalIndex);
      } else {
        cell.dataset.colIdx = String(fallbackIdx);
      }
      if (col.isComputableType()) cell.classList.add("pte-cell-right-aligned");
      row.appendChild(cell);
      cells.push(cell);
      fallbackIdx++;
    }
  }
}
