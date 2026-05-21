import { Column } from "../../column/column";
import { IRowNode } from "../../interfaces/iRowNode";
import { createRendererRuntime, getCellRendererParams, RendererRecord } from "../renderer";

export class BodyCellRenderer {
  private static readonly CUSTOM_RENDERER_CELL_CLASS = "pte-cell-custom-renderer";

  renderCell(
    cell: HTMLDivElement,
    row: IRowNode,
    col: Column,
    cellRendererMap: Map<string, RendererRecord>,
    viewIndex: number = row.viewIndex,
    rowNumber: number = viewIndex + 1,
  ) {
    if (col.isRowNumberColumn()) {
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
      if (rec) {
        rec.runtime.destroy();
        cellRendererMap.delete(col.instanceID);
      }
      cell.textContent = String(rowNumber);
      return;
    }

    const rawValue = col.getValue(row);
    const displayValue = col.formatValue(rawValue, row);
    const renderer = col.cellRenderer;
    const rendererParams = getCellRendererParams(rawValue, displayValue, row, viewIndex, col, cell, null);
    if (!renderer) {
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
      if (rec) {
        rec.runtime.destroy();
        cellRendererMap.delete(col.instanceID);
      }
      cell.textContent = displayValue;
      return;
    }

    cell.classList.add(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);

    const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
    if (!rec || rec.renderer !== renderer) {
      rec?.runtime.destroy();
      const runtime = createRendererRuntime(renderer, rendererParams);
      cell.replaceChildren(runtime.gui);
      cellRendererMap.set(col.instanceID, { renderer, runtime });
      return;
    }

    const ok = rec.runtime.refresh(rendererParams);
    if (ok === false) {
      rec.runtime.destroy();

      const runtime = createRendererRuntime(renderer, rendererParams);

      cell.replaceChildren(runtime.gui);
      rec.runtime = runtime;
    }
  }
}
