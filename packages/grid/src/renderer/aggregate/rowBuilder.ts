import { Column } from "../../column/column";
import { markPresentational, stampGridCellAria, stitchAriaRow } from "../aria";
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
  leadingLeafColumns: () => Column[];
  leftPinnedLeafColumns: () => Column[];
  centerLeafColumns: () => Column[];
  rightPinnedLeafColumns: () => Column[];
  /** Grid instance id (core.id) — prefixes ARIA cell ids so multiple grids never collide. */
  ariaIdPrefix: () => string;
};

export type AggregateRowBuildResult = {
  leadingCells: HTMLDivElement[];
  leftCells: HTMLDivElement[];
  centerCells: HTMLDivElement[];
  rightCells: HTMLDivElement[];
};

export class AggregateRowBuilder {
  constructor(private params: AggregateRowBuilderParams) {}

  build(): AggregateRowBuildResult {
    const {
      leading: aggregateLeading,
      left: aggregateLeft,
      center: aggregateCenter,
      right: aggregateRight,
    } = this.params.aggregateRowRenderer.getRefs();
    aggregateLeading.innerHTML = "";
    aggregateLeft.innerHTML = "";
    aggregateCenter.innerHTML = "";
    aggregateRight.innerHTML = "";
    const leadingCells: HTMLDivElement[] = [];
    const leftCells: HTMLDivElement[] = [];
    const centerCells: HTMLDivElement[] = [];
    const rightCells: HTMLDivElement[] = [];

    const makeRow = () => {
      const row = document.createElement("div");
      row.className = "pte-row";
      row.style.height = `${this.params.rowHeight()}px`;
      return row;
    };

    if (this.params.leadingLeafColumns().length > 0) {
      const row = makeRow();
      this.appendCells(row, this.params.leadingLeafColumns(), leadingCells);
      aggregateLeading.appendChild(row);
    }

    if (this.params.leftPinnedLeafColumns().length > 0) {
      const row = makeRow();
      this.appendCells(row, this.params.leftPinnedLeafColumns(), leftCells);
      aggregateLeft.appendChild(row);
    }

    const centerRow = makeRow();
    this.appendCells(centerRow, this.params.centerLeafColumns(), centerCells);
    aggregateCenter.appendChild(centerRow);
    this.params.aggregateRowRenderer.setCenterRow(centerRow);

    if (this.params.rightPinnedLeafColumns().length > 0) {
      const row = makeRow();
      this.appendCells(row, this.params.rightPinnedLeafColumns(), rightCells);
      aggregateRight.appendChild(row);
    }

    // ARIA (plan 2.1): center aggregate row is THE row, owning every section's cells in
    // visual order; the other section rows are presentational.
    markPresentational(aggregateLeading.firstElementChild as HTMLElement | null,
      aggregateLeft.firstElementChild as HTMLElement | null,
      aggregateRight.firstElementChild as HTMLElement | null);
    stitchAriaRow(
      centerRow,
      [...leadingCells, ...leftCells, ...centerCells, ...rightCells],
      `${this.params.ariaIdPrefix()}-agg`,
    );

    this.params.aggregateRowRenderer.setHeight(this.params.rowHeight());

    return {
      leadingCells,
      leftCells,
      centerCells,
      rightCells,
    };
  }

  private appendCells(row: HTMLDivElement, columns: Column[], cells: HTMLDivElement[]) {
    let fallbackIdx = 0;
    for (const col of columns) {
      if (col.hidden) continue;
      const cell = document.createElement("div");
      cell.className = "pte-cell pte-aggregate-cell";
      if (col.isRowNumberColumn()) {
        cell.classList.add("pte-row-number-cell", "pte-aggregate-row-number-cell");
      }
      const meta = this.params.leafColumnLookup().get(col.instanceID);
      if (meta) {
        cell.dataset.colId = col.instanceID;
        cell.dataset.colIdx = String(meta.globalIndex);
      } else {
        cell.dataset.colIdx = String(fallbackIdx);
      }
      stampGridCellAria(cell, meta?.globalIndex);
      if (col.isComputableType()) cell.classList.add("pte-cell-right-aligned");
      row.appendChild(cell);
      cells.push(cell);
      fallbackIdx++;
    }
  }
}
