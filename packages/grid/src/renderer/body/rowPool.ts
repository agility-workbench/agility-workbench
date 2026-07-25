import { GridCore } from "../../core/core";
import { RendererRecord } from "../renderer";
import { RowPoolDef } from "../types";

interface BodyRowPoolRendererParams {
  core: GridCore;
  rowHeight: () => number;
  leadingViewport: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
}

export class BodyRowPoolRenderer {
  constructor(private params: BodyRowPoolRendererParams) {}

  build(poolSize: number): RowPoolDef[] {
    const { core, leadingViewport, leftViewport, centerViewport, rightViewport } = this.params;
    leadingViewport.innerHTML = "";
    leftViewport.innerHTML = "";
    centerViewport.innerHTML = "";
    rightViewport.innerHTML = "";
    const rowPool: RowPoolDef[] = [];

    for (let i = 0; i < poolSize; i++) {
      const row: RowPoolDef = {
        rowEl: document.createElement("div"),
        leadingCellEls: [],
        leftCellEls: [],
        cellEls: [],
        rightCellEls: [],
        fullWidthCellEl: this.createFullWidthCell(),
        cellRendererInstances: new Map<string, RendererRecord>(),
      };

      const leadingLeaves = core.getColumnModel().getLeadingLeaves();
      const leftLeaves = core.getColumnModel().getLeftLeaves();
      const centerLeaves = core.getColumnModel().getCenterLeaves();
      const rightLeaves = core.getColumnModel().getRightLeaves();
      if (leadingLeaves.length > 0) {
        row.leadingRowEl = this.createRow();

        for (const col of leadingLeaves) {
          if (col.hidden) continue;
          const cell = this.createCell(col.instanceID, col.isComputableType());
          row.leadingRowEl.appendChild(cell);
          row.leadingCellEls?.push(cell);
        }

        leadingViewport.appendChild(row.leadingRowEl);
      }

      if (leftLeaves.length > 0) {
        row.leftRowEl = this.createRow();

        for (const col of leftLeaves) {
          if (col.hidden) continue;
          const cell = this.createCell(col.instanceID, col.isComputableType());
          row.leftRowEl.appendChild(cell);
          row.leftCellEls.push(cell);
        }

        leftViewport.appendChild(row.leftRowEl);
      }

      row.rowEl = this.createRow();

      for (const col of centerLeaves) {
        if (col.hidden) continue;
        const cell = this.createCell(col.instanceID, col.isComputableType());
        row.rowEl.appendChild(cell);
        row.cellEls.push(cell);
      }

      // The full-width host rides in the center row (always present even with zero center leaves).
      // Hidden by default; shown by applyFullWidthLayout for full-width rows only.
      row.rowEl.appendChild(row.fullWidthCellEl);

      centerViewport.appendChild(row.rowEl);

      if (rightLeaves.length > 0) {
        row.rightRowEl = this.createRow();

        for (const col of rightLeaves) {
          if (col.hidden) continue;
          const cell = this.createCell(col.instanceID, col.isComputableType());
          row.rightRowEl.appendChild(cell);
          row.rightCellEls.push(cell);
        }

        rightViewport.appendChild(row.rightRowEl);
      }

      rowPool.push(row);
    }

    return rowPool;
  }

  private createRow() {
    const row = document.createElement("div");
    row.className = "pte-row";
    row.style.height = `${this.params.rowHeight()}px`;
    return row;
  }

  // The per-slot full-width host cell. Carries no dataset.colIdx (it is not a leaf column), so
  // selection hit-testing treats it as non-selectable like a group cell. Hidden until needed.
  private createFullWidthCell() {
    const cell = document.createElement("div");
    cell.className = "pte-cell pte-full-width-cell";
    cell.style.display = "none";
    return cell;
  }

  private createCell(colId: string, isRightAligned: boolean) {
    const cell = document.createElement("div");
    cell.className = "pte-cell";
    const col = this.params.core.getColumnModel().getById(colId);
    if (col?.isRowNumberColumn()) {
      cell.classList.add("pte-row-number-cell");
    }
    const meta = this.params.core.getColumnModel().leafColumnLookup.get(colId);
    if (meta) {
      cell.dataset.colId = colId;
      cell.dataset.colIdx = String(meta.globalIndex);
    }
    if (isRightAligned) cell.classList.add("pte-cell-right-aligned");
    return cell;
  }
}
