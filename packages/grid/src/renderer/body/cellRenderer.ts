import { Column } from "../../column/column";
import { CellClassParams } from "../../interfaces/column";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { IRowNode } from "../../interfaces/iRowNode";
import { INDENT_PER_LEVEL, renderGroupCell, renderTreeCell } from "./groupCellRenderer";
import { CellRefreshReason, createRendererRuntime, getCellRendererParams, RendererRecord } from "../renderer";
import { applyDynamicClasses, applyDynamicStyles } from "./dynamicStyle";
import type { RowPresentation } from "../../interfaces/gridOptions";
import { inheritRowPresentation, mergeClassValues, mergeStyleValues } from "./rowPresentation";

export class BodyCellRenderer {
  private static readonly CUSTOM_RENDERER_CELL_CLASS = "pte-cell-custom-renderer";
  // Reserved key for the full-width renderer instance in a slot's cellRendererInstances map. Prefixed
  // with "__" so it can never collide with a real column instanceID (a crypto.randomUUID()).
  private static readonly FULL_WIDTH_RENDERER_KEY = "__fullWidth";

  constructor(private api: IGridAPI) {}

  // Render a full-width row's single host cell. Uses the grid's fullWidthCellRenderer when set;
  // otherwise falls back to the default group chevron+label for group rows, or blank for a plain
  // full-width row. The renderer instance is kept in the slot's map under FULL_WIDTH_RENDERER_KEY so
  // it is reused across scroll and torn down when the slot stops being full-width (see teardown in
  // renderCell's non-full-width branches via clearFullWidthRenderer).
  renderFullWidthCell(
    cell: HTMLDivElement,
    row: IRowNode,
    cellRendererMap: Map<string, RendererRecord>,
    viewIndex: number = row.viewIndex,
    rowNumber: number = viewIndex + 1,
    rowPresentation?: RowPresentation,
  ) {
    applyDynamicClasses(cell, rowPresentation?.cellClass ?? null);
    applyDynamicStyles(cell, rowPresentation?.cellStyle ?? null);
    const renderer = this.api.getCore().getOptions().fullWidthCellRenderer;

    if (!renderer) {
      this.clearFullWidthRenderer(cellRendererMap);
      cell.classList.add("pte-group-cell");
      if (row.isGroup) {
        renderGroupCell(cell, row);
      } else {
        cell.style.paddingLeft = "";
        cell.replaceChildren();
      }
      return;
    }

    cell.classList.remove("pte-group-cell");
    // A full-width row has no owning column/cell. Expose the row's underlying data object as both
    // `value` and `data` (there's no per-column value), the full node via `node`, and a minimal
    // colDef stub so renderers that read colDef.cellRendererParams (e.g. the React adapter) stay safe.
    const colDefStub = { cellRendererParams: undefined } as unknown as Column;
    const rendererParams = {
      ...getCellRendererParams(row.data, row.data, row, viewIndex, colDefStub, cell, this.api, "data", rowPresentation),
      data: row.data,
      node: row,
    };
    void rowNumber;

    const rec = cellRendererMap.get(BodyCellRenderer.FULL_WIDTH_RENDERER_KEY);
    if (!rec || rec.renderer !== renderer) {
      rec?.runtime.destroy();
      const runtime = createRendererRuntime(renderer, rendererParams);
      cell.replaceChildren(runtime.gui);
      cellRendererMap.set(BodyCellRenderer.FULL_WIDTH_RENDERER_KEY, { renderer, runtime });
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

  // Tear down a slot's full-width renderer instance and clear its host cell. Called when the slot
  // leaves full-width layout (public, invoked by the window renderer's reset path) and before
  // falling back to the default group/blank content.
  clearFullWidthCell(cell: HTMLDivElement, cellRendererMap: Map<string, RendererRecord>) {
    this.clearFullWidthRenderer(cellRendererMap);
    cell.classList.remove("pte-group-cell");
    cell.style.paddingLeft = "";
    cell.replaceChildren();
  }

  private clearFullWidthRenderer(cellRendererMap: Map<string, RendererRecord>) {
    const rec = cellRendererMap.get(BodyCellRenderer.FULL_WIDTH_RENDERER_KEY);
    if (rec) {
      rec.runtime.destroy();
      cellRendererMap.delete(BodyCellRenderer.FULL_WIDTH_RENDERER_KEY);
    }
  }

  renderCell(
    cell: HTMLDivElement,
    row: IRowNode,
    col: Column,
    cellRendererMap: Map<string, RendererRecord>,
    viewIndex: number = row.viewIndex,
    rowNumber: number = viewIndex + 1,
    refreshReason: CellRefreshReason = "data",
    rowPresentation?: RowPresentation,
  ) {
    // Row defaults include utility and group cells. Column callbacks retain their existing leaf-row
    // behavior and are composed below when applicable.
    this.applyCellStyling(cell, row, col, viewIndex, rowPresentation);
    if (col.isSelectionCheckboxColumn()) {
      // Content is the static decorative checkbox span created by the row pool; checked state is
      // CSS-driven from the "selected" class. Nothing to render per row.
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      return;
    }
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

    // Every real tree-data row gets its hierarchy label in the generated tree column. Unlike a
    // synthetic group row it remains a normal data row in every other column.
    if (row.isTreeData && col.isTreeColumn()) {
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
      if (rec) {
        rec.runtime.destroy();
        cellRendererMap.delete(col.instanceID);
      }
      cell.classList.add("pte-group-cell");
      renderTreeCell(cell, row);
      return;
    }
    cell.classList.remove("pte-group-cell");
    cell.style.paddingLeft = "";

    const rawValue = col.getValue(row);
    const displayValue = col.formatValue(rawValue, row);
    const renderer = col.cellRenderer;
    const rendererParams = getCellRendererParams(
      rawValue, displayValue, row, viewIndex, col, cell, this.api, refreshReason, rowPresentation,
    );
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

  // Apply the column's cellClass / cellStyle / ActionFrame indicator to a data cell. For group rows
  // (or when none is configured) it clears any previously-applied dynamic class/style/indicator so
  // recycled cells stay clean.
  private applyCellStyling(
    cell: HTMLDivElement,
    row: IRowNode,
    col: Column,
    viewIndex: number,
    rowPresentation?: RowPresentation,
  ) {
    const hasClass = col.cellClass != null;
    const hasStyle = col.cellStyle != null;
    const hasIndicator = col.actionFrameIndicator != null && col.actionFrameIndicator !== false;

    // A value getter can be expensive and, for generated tree/group columns, may only accept leaf
    // rows. Resolve it only when a column callback actually needs CellClassParams; row defaults do
    // not depend on the cell value.
    let params: CellClassParams | undefined;
    const getParams = (): CellClassParams => params ??= {
      value: col.getValue(row),
      data: row.data,
      rowId: row.id,
      rowIndex: viewIndex,
      colDef: col.col,
      rowPresentation,
    };
    const columnClass = !row.isGroup && hasClass
      ? (typeof col.cellClass === "function" ? col.cellClass(getParams()) : col.cellClass)
      : null;
    const columnStyle = !row.isGroup && hasStyle
      ? (typeof col.cellStyle === "function" ? col.cellStyle(getParams()) : col.cellStyle)
      : null;
    const rowClass = inheritRowPresentation(col, "cellClass") ? rowPresentation?.cellClass : null;
    const rowStyle = inheritRowPresentation(col, "cellStyle") ? rowPresentation?.cellStyle : null;
    applyDynamicClasses(cell, mergeClassValues(rowClass, columnClass));
    applyDynamicStyles(cell, mergeStyleValues(rowStyle, columnStyle));
    if (row.isGroup) {
      if (hasIndicator) cell.classList.remove("pte-action-frame-indicator");
      return;
    }
    if (hasIndicator) {
      cell.classList.toggle("pte-action-frame-indicator", this.hasActionFrameContent(col, row, getParams()));
    }
  }

  // Resolve the column's actionFrameIndicator (true | field name | predicate) for one cell.
  private hasActionFrameContent(col: Column, row: IRowNode, params: CellClassParams): boolean {
    const ind = col.actionFrameIndicator;
    if (ind === true) return true;
    if (typeof ind === "string") return !!row.data?.[ind];
    if (typeof ind === "function") return !!ind(params);
    return false;
  }

  // Render one cell of a group row, dispatching on the column kind:
  //  - "singleColumn": the synthesized auto-group column renders chevron + indented label + count.
  //  - "multipleColumns": each real grouped column (tagged with groupLevel) renders the label for
  //    its own level; other levels stay blank so each grouped field owns one column.
  //  - any other data column → this group's aggregate total for that column, if computed.
  // Note: "groupRows" mode never reaches here — those group rows render as full-width rows and skip
  // per-column cell rendering entirely (see BodyWindowRenderer.applyFullWidthLayout).
  private renderGroupRowCell(cell: HTMLDivElement, row: IRowNode, col: Column) {
    cell.classList.add("pte-group-cell");

    // singleColumn auto column, or a real grouped column in multipleColumns mode.
    if (col.isAutoGroupColumn() || col.isTreeColumn() || col.groupLevel != null) {
      // A level-tagged column only labels its own level; other group rows leave it blank (but may
      // still show an aggregate for that column below).
      if (col.groupLevel != null && col.groupLevel !== row.level) {
        this.renderGroupAggregateOrBlank(cell, row, col);
        return;
      }
      renderGroupCell(cell, row);
      return;
    }

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

  // Expose the indent constant so callers (e.g. groupRows-mode label) can align with the chevron.
  static get indentPerLevel(): number {
    return INDENT_PER_LEVEL;
  }
}
