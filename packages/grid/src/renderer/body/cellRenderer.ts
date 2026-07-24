import { Column } from "../../column/column";
import { CellClassParams } from "../../interfaces/column";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { IRowNode } from "../../interfaces/iRowNode";
import { INDENT_PER_LEVEL, renderGroupCell } from "./groupCellRenderer";
import { CellRefreshReason, createRendererRuntime, getCellRendererParams, RendererRecord } from "../renderer";
import { applyDynamicClasses, applyDynamicStyles } from "./dynamicStyle";

export class BodyCellRenderer {
  private static readonly CUSTOM_RENDERER_CELL_CLASS = "pte-cell-custom-renderer";

  constructor(private api: IGridAPI) {}

  renderCell(
    cell: HTMLDivElement,
    row: IRowNode,
    col: Column,
    cellRendererMap: Map<string, RendererRecord>,
    viewIndex: number = row.viewIndex,
    rowNumber: number = viewIndex + 1,
    refreshReason: CellRefreshReason = "data",
  ) {
    if (col.isRowNumberColumn()) {
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
      if (rec) {
        rec.runtime.destroy();
        cellRendererMap.delete(col.instanceID);
      }
      // rowNumber is the row's display position (viewIndex + page offset + 1), so group rows and
      // leaves share one continuous sequence — showing it on every row avoids gaps.
      cell.textContent = String(rowNumber);
      return;
    }

    // Conditional per-column class/style. Applied for data cells below; cleared here on the group /
    // row-number branches so a recycled cell never keeps a prior data cell's dynamic styling.
    this.applyCellStyling(cell, row, col, viewIndex);

    // Group rows: the auto-group column renders the chevron + indented label + count; other data
    // columns render this group's aggregate total (if any) and everything else is blank. Any
    // per-column custom renderer instance is torn down so a group row never reuses a leaf renderer.
    if (row.isGroup) {
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
      if (rec) {
        rec.runtime.destroy();
        cellRendererMap.delete(col.instanceID);
      }
      this.renderGroupRowCell(cell, row, col);
      return;
    }
    cell.classList.remove("pte-group-cell");
    cell.style.paddingLeft = "";

    const rawValue = col.getValue(row);
    const displayValue = col.formatValue(rawValue, row);
    const renderer = col.cellRenderer;
    const rendererParams = getCellRendererParams(rawValue, displayValue, row, viewIndex, col, cell, this.api, refreshReason);
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

  // Apply the column's cellClass / cellStyle to a data cell. For group rows (or when neither is
  // configured) it clears any previously-applied dynamic class/style so recycled cells stay clean.
  private applyCellStyling(cell: HTMLDivElement, row: IRowNode, col: Column, viewIndex: number) {
    const hasClass = col.cellClass != null;
    const hasStyle = col.cellStyle != null;
    if (!hasClass && !hasStyle) return;

    if (row.isGroup) {
      if (hasClass) applyDynamicClasses(cell, null);
      if (hasStyle) applyDynamicStyles(cell, null);
      return;
    }

    const params: CellClassParams = {
      value: col.getValue(row),
      data: row.data,
      rowId: row.id,
      rowIndex: viewIndex,
      colDef: col.col,
    };
    if (hasClass) {
      const cls = typeof col.cellClass === "function" ? col.cellClass(params) : col.cellClass;
      applyDynamicClasses(cell, cls);
    }
    if (hasStyle) {
      const style = typeof col.cellStyle === "function" ? col.cellStyle(params) : col.cellStyle;
      applyDynamicStyles(cell, style);
    }
  }

  // Render one cell of a group row, dispatching on the column kind:
  //  - "singleColumn": the synthesized auto-group column renders chevron + indented label + count.
  //  - "multipleColumns": each real grouped column (tagged with groupLevel) renders the label for
  //    its own level; other levels stay blank so each grouped field owns one column.
  //  - "groupRows": no auto column, so the first center column carries the label (sticky-left).
  //  - any other data column → this group's aggregate total for that column, if computed.
  private renderGroupRowCell(cell: HTMLDivElement, row: IRowNode, col: Column) {
    cell.classList.add("pte-group-cell");

    // singleColumn auto column, or a real grouped column in multipleColumns mode.
    if (col.isAutoGroupColumn() || col.groupLevel != null) {
      // A level-tagged column only labels its own level; other group rows leave it blank (but may
      // still show an aggregate for that column below).
      if (col.groupLevel != null && col.groupLevel !== row.level) {
        cell.classList.remove("pte-group-cell-sticky");
        this.renderGroupAggregateOrBlank(cell, row, col);
        return;
      }
      renderGroupCell(cell, row);
      return;
    }

    // "groupRows" mode has no auto-group column, so the group label rides in the first center
    // column (sticky to the left edge so it stays visible while the body scrolls horizontally).
    if (this.isGroupLabelHostColumn(col)) {
      cell.classList.add("pte-group-cell-sticky");
      renderGroupCell(cell, row);
      return;
    }
    cell.classList.remove("pte-group-cell-sticky");
    this.renderGroupAggregateOrBlank(cell, row, col);
  }

  // A group row's non-label cell: show the per-group aggregate total for this column if one was
  // computed, otherwise leave it blank.
  private renderGroupAggregateOrBlank(cell: HTMLDivElement, row: IRowNode, col: Column) {
    cell.style.paddingLeft = "";
    const agg = row.aggregateValues?.[col.instanceID];
    if (agg != null && agg !== "") {
      cell.textContent = col.formatValue(agg, row);
    } else {
      cell.replaceChildren();
    }
  }

  // True when `col` should host the group label in "groupRows" mode: the mode is groupRows and this
  // is the first center leaf column. (Only groupRows routes the label through a data column;
  // multipleColumns puts it on the level-tagged grouped columns instead.)
  private isGroupLabelHostColumn(col: Column): boolean {
    if (this.api.getCore().getOptions().groupDisplayType !== "groupRows") return false;
    const centerLeaves = this.api.getColumnModel().getCenterLeaves();
    return centerLeaves.length > 0 && centerLeaves[0].instanceID === col.instanceID;
  }

  // Expose the indent constant so callers (e.g. groupRows-mode label) can align with the chevron.
  static get indentPerLevel(): number {
    return INDENT_PER_LEVEL;
  }
}
