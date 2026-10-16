import { Column } from "../../column/column";
import { CellClassParams } from "../../interfaces/column";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { IRowNode } from "../../interfaces/iRowNode";
import { INDENT_PER_LEVEL, renderGroupCell, renderTreeCell } from "./groupCellRenderer";
import {
  CellRefreshReason, CellRenderer, CellRendererParams, createRendererRuntime, getCellRendererParams, RendererRecord,
} from "../renderer";
import { applyDynamicClasses, applyDynamicStyles } from "./dynamicStyle";
import type { RowPresentation } from "../../interfaces/gridOptions";
import { BooleanCellRenderer } from "../../cellRenderers/booleanRenderer";
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
    refreshReason: CellRefreshReason = "data",
  ) {
    applyDynamicClasses(cell, rowPresentation?.cellClass ?? null);
    applyDynamicStyles(cell, rowPresentation?.cellStyle ?? null);
    this.applyFullWidthIndicator(cell, row, viewIndex, rowPresentation);
    const renderer = this.api.getCore().getOptions().fullWidthCellRenderer;

    if (!renderer) {
      this.clearFullWidthRenderer(cellRendererMap);
      cell.classList.add("pte-group-cell");
      if (row.isGroup) {
        renderGroupCell(cell, row, this.api.getCore().getGroupRowLabel(row));
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
      ...getCellRendererParams(row.data, row.data, row, viewIndex, colDefStub, cell, this.api, refreshReason, rowPresentation),
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

  // A full-width group host is the nominal column's one cell in that row (it is where that column's
  // frame opens), so it carries that column's indicator. Other full-width rows host no frame.
  private applyFullWidthIndicator(
    cell: HTMLDivElement,
    row: IRowNode,
    viewIndex: number,
    rowPresentation?: RowPresentation,
  ) {
    const nominal = row.isGroup ? this.api.getCore().getColumnModel().getFullWidthNominalLeaf() : null;
    const marked = !!nominal
      && nominal.actionFrameIndicator != null
      && nominal.actionFrameIndicator !== false
      && this.hasActionFrameContent(nominal, row, this.cellClassParams(row, nominal, viewIndex, rowPresentation));
    cell.classList.toggle("pte-action-frame-indicator", marked);
  }

  // Tear down a slot's full-width renderer instance and clear its host cell. Called when the slot
  // leaves full-width layout (public, invoked by the window renderer's reset path) and before
  // falling back to the default group/blank content.
  clearFullWidthCell(cell: HTMLDivElement, cellRendererMap: Map<string, RendererRecord>) {
    this.clearFullWidthRenderer(cellRendererMap);
    cell.classList.remove("pte-group-cell", "pte-action-frame-indicator");
    cell.style.paddingLeft = "";
    cell.replaceChildren();
  }

  // Tear down every per-column renderer instance a slot holds and empty the given cells. Called
  // when a slot switches into full-width layout: the per-column cells are only hidden under the
  // host, so without this they would keep the previous leaf's live instances (mounted framework
  // components, timers, tooltip targets) and DOM until the slot is reused for a normal row. The
  // full-width host's own instance is left alone; the checkbox cell's decorative box is pool-built
  // once and never repainted, so it is kept.
  releaseColumnRenderers(cells: HTMLDivElement[], cellRendererMap: Map<string, RendererRecord>) {
    for (const [key, rec] of cellRendererMap) {
      if (key === BodyCellRenderer.FULL_WIDTH_RENDERER_KEY) continue;
      rec.runtime.destroy();
      cellRendererMap.delete(key);
    }
    for (const cell of cells) {
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      if (cell.classList.contains("pte-checkbox-cell")) continue;
      cell.replaceChildren();
    }
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
      // CSS-driven from the "selected" class. The only per-row state is the app's isRowSelectable
      // gate: a disabled row keeps its checkbox visible but inert (toggled both ways — cells are
      // pool-recycled across rows). A group / tree parent under groupSelectsChildren is repainted
      // by the selection renderer, whose checkbox stands for the subtree (paintSubtreeCheckbox).
      cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
      // A footer row is never selectable: its box is hidden by the theme and the cell reads as
      // unavailable to AT.
      const disabled = !!row.footer || this.api.getCore().getOptions().isRowSelectable?.(row) === false;
      cell.classList.toggle("pte-checkbox-cell-disabled", disabled);
      if (disabled) cell.setAttribute("aria-disabled", "true");
      else cell.removeAttribute("aria-disabled");
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
    // Group rows: label columns (auto-group, tree, and every level-tagged column of
    // multipleColumns) render the chevron + indented label at their own level and text elsewhere;
    // other columns run their cellRenderer with the group cell value, or show that value as text
    // when they have none. Label columns and renderer-less columns tear down any pooled custom
    // renderer instance so a group row never keeps a leaf renderer's DOM.
    if (row.isGroup) {
      const renderer = col.cellRenderer;
      // Label columns never run a renderer on a group row: an app renderer written for the leaf
      // value cannot be expected to keep the chevron, indent and label the row depends on.
      const isLabelColumn = col.isAutoGroupColumn() || col.isTreeColumn() || col.groupLevel != null
        || this.api.getCore().isGroupLabelColumn(col, row);
      if (isLabelColumn || !renderer) {
        cell.classList.remove(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);
        const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
        if (rec) {
          rec.runtime.destroy();
          cellRendererMap.delete(col.instanceID);
        }
        this.renderGroupRowCell(cell, row, col);
        return;
      }
      // pte-group-cell only sets flex layout; the row carries the group weight, so it stays on
      // whether or not a renderer paints the cell.
      cell.classList.add("pte-group-cell");
      cell.style.paddingLeft = "";
      const { value, formatted } = this.api.getCore().getGroupCellValue(col, row);
      const params = getCellRendererParams(
        value, formatted, row, viewIndex, col, cell, this.api, refreshReason, rowPresentation,
      );
      this.mountRenderer(cell, col, renderer, params, cellRendererMap);
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
    // A boolean column without a renderer of its own draws the built-in checkbox. Leaf rows only:
    // the group branch above keeps reading `col.cellRenderer`, so a group row's aggregate stays text.
    const renderer = col.cellRenderer
      ?? (col.usesDefaultCheckboxRenderer() ? BooleanCellRenderer : undefined);
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

    this.mountRenderer(cell, col, renderer, rendererParams, cellRendererMap);
  }

  // Create, refresh or rebuild a column's pooled custom renderer instance. Shared by leaf and group
  // rows so a slot recycled between them follows one lifecycle: the same instance is refreshed
  // across the transition, and `refresh` returning false rebuilds it.
  private mountRenderer(
    cell: HTMLDivElement,
    col: Column,
    renderer: CellRenderer,
    params: CellRendererParams,
    cellRendererMap: Map<string, RendererRecord>,
  ) {
    cell.classList.add(BodyCellRenderer.CUSTOM_RENDERER_CELL_CLASS);

    const rec: RendererRecord | undefined = cellRendererMap.get(col.instanceID);
    if (!rec || rec.renderer !== renderer) {
      rec?.runtime.destroy();
      const runtime = createRendererRuntime(renderer, params);
      cell.replaceChildren(runtime.gui);
      cellRendererMap.set(col.instanceID, { renderer, runtime });
      return;
    }

    const ok = rec.runtime.refresh(params);
    if (ok === false) {
      rec.runtime.destroy();

      const runtime = createRendererRuntime(renderer, params);

      cell.replaceChildren(runtime.gui);
      rec.runtime = runtime;
    }
  }

  // Apply the column's cellClass / cellStyle / ActionFrame indicator to a data cell. Column
  // class/style skip group rows (cleared so recycled cells stay clean); the indicator is a pure
  // function of row + column, so recycling re-evaluates it.
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
    const getParams = (): CellClassParams => params ??= this.cellClassParams(row, col, viewIndex, rowPresentation);
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
    // Group rows evaluate the indicator like leaves: a group cell can host a frame, so it can be
    // marked as holding content.
    if (hasIndicator) {
      cell.classList.toggle("pte-action-frame-indicator", this.hasActionFrameContent(col, row, getParams()));
    }
  }

  // A group row has no data row; its cell's value is the core's group value rule, which also keeps
  // generated group/tree columns' value getters (leaf-only) from ever seeing a group node.
  private cellClassParams(
    row: IRowNode,
    col: Column,
    viewIndex: number,
    rowPresentation?: RowPresentation,
  ): CellClassParams {
    const isGroup = !!row.isGroup;
    return {
      value: isGroup ? this.api.getCore().getGroupCellValue(col, row).value : col.getValue(row),
      data: row.data,
      rowId: row.id,
      rowIndex: viewIndex,
      colDef: col.col,
      rowPresentation,
      node: row,
      isGroup,
    };
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
  //  - any other data column with a cellRenderer → never reaches here; renderCell runs the renderer
  //    with the group cell value instead.
  //  - any other data column → the group cell value as text: this group's aggregate total for that
  //    column if computed, else the column's groupValueGetter result.
  // Note: "groupRows" mode never reaches here — those group rows render as full-width rows and skip
  // per-column cell rendering entirely (see BodyWindowRenderer.applyFullWidthLayout).
  // A footer row (groupTotalRow / grandTotalRow) takes the same path: its label column draws the
  // "Total …" label behind a spacer (a footer is non-expandable, so no chevron), and under
  // "groupRows" its label column is the nominal first column (see GridCore.isGroupLabelColumn).
  private renderGroupRowCell(cell: HTMLDivElement, row: IRowNode, col: Column) {
    cell.classList.add("pte-group-cell");

    // singleColumn auto column, a real grouped column in multipleColumns mode at its own level
    // (other levels leave it blank, or show an aggregate for that column below), or a footer's
    // groupRows label column.
    if (this.api.getCore().isGroupLabelColumn(col, row)) {
      renderGroupCell(cell, row, this.api.getCore().getGroupRowLabel(row));
      return;
    }

    this.renderGroupAggregateOrBlank(cell, row, col);
  }

  // A group row's non-label cell: the formatted group cell value (the aggregate, else the column's
  // groupValueGetter result), otherwise blank. Read through the core's rule rather than the node's
  // aggregates so the screen cannot disagree with the clipboard or the click payloads.
  private renderGroupAggregateOrBlank(cell: HTMLDivElement, row: IRowNode, col: Column) {
    cell.style.paddingLeft = "";
    const text = this.api.getCore().getGroupCellValue(col, row).formatted;
    if (text) {
      cell.textContent = text;
    } else {
      cell.replaceChildren();
    }
  }

  // Expose the indent constant so callers (e.g. groupRows-mode label) can align with the chevron.
  static get indentPerLevel(): number {
    return INDENT_PER_LEVEL;
  }
}
