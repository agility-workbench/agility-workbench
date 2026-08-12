import { GridCore, GridOptions } from "@agility-workbench/grid";
import { CanvasMeasurer } from "@agility-workbench/grid";
import { GridProps } from "./interface";
import { adaptCellRenderer, adaptReactDefaultColDef } from "./cellRenderer";

export function createCore(options: GridOptions): GridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

function setIfDefined<K extends keyof GridOptions>(
  options: GridOptions,
  key: K,
  value: GridOptions[K] | null,
): void {
  if (value != null) options[key] = value;
}

/**
 * Snapshot the props into core GridOptions. Explicit `false`/`0` values are forwarded (only
 * null/undefined fall back to core defaults). Mirrors the Angular wrapper's `getGridOptions`.
 * The six `on*` event callbacks are bridged by the component (stable-ref closures), not here.
 */
export function getGridOptions(props: GridProps): GridOptions {
  const options: GridOptions = {};
  setIfDefined(options, "headerHeight", props.headerHeight);
  setIfDefined(options, "leafHeaderHeight", props.leafHeaderHeight);
  setIfDefined(options, "parentHeaderHeight", props.parentHeaderHeight);
  setIfDefined(options, "rowHeight", props.rowHeight);
  setIfDefined(options, "pinnedTopRowData", props.pinnedTopRowData);
  setIfDefined(options, "pinnedBottomRowData", props.pinnedBottomRowData);
  setIfDefined(options, "getRowId", props.getRowId);
  setIfDefined(options, "rowIdKey", props.rowIdKey);
  setIfDefined(options, "overscanRowCount", props.overscanRowCount);
  setIfDefined(options, "minResizeWidth", props.minResizeWidth);
  setIfDefined(options, "maxColumnWidth", props.maxColumnWidth);
  setIfDefined(options, "autosizeColumnsOnDataChange", props.autosizeColumnsOnDataChange);
  setIfDefined(options, "allowExportAsCSV", props.allowExportAsCSV);
  setIfDefined(options, "allowExportAsExcel", props.allowExportAsExcel);
  setIfDefined(options, "pagination", props.pagination);
  setIfDefined(options, "rowNumbers", props.rowNumbers);
  setIfDefined(options, "rowHover", props.rowHover);
  setIfDefined(options, "columnHover", props.columnHover);
  setIfDefined(options, "zebraRows", props.zebraRows);
  setIfDefined(options, "getRowClass", props.getRowClass);
  setIfDefined(options, "getRowStyle", props.getRowStyle);
  setIfDefined(options, "onCellClicked", props.onCellClicked);
  setIfDefined(options, "onRowClicked", props.onRowClicked);
  setIfDefined(options, "onCellValueChanged", props.onCellValueChanged);
  setIfDefined(options, "onSelectionChanged", props.onSelectionChanged);
  setIfDefined(options, "onSortChanged", props.onSortChanged);
  setIfDefined(options, "onFilterChanged", props.onFilterChanged);
  setIfDefined(options, "onHistoryChanged", props.onHistoryChanged);
  setIfDefined(options, "ariaLabel", props.ariaLabel);
  setIfDefined(options, "ariaLabelledBy", props.ariaLabelledBy);
  setIfDefined(options, "highlightActiveCell", props.highlightActiveCell);
  setIfDefined(options, "rowSelection", props.rowSelection);
  setIfDefined(options, "cellSelection", props.cellSelection);
  setIfDefined(options, "rangeSelection", props.rangeSelection);
  setIfDefined(options, "columnSelection", props.columnSelection);
  setIfDefined(options, "showColumnButtonsOnHover", props.showColumnButtonsOnHover);
  setIfDefined(options, "selectAllRowsOnHeaderClick", props.selectAllRowsOnHeaderClick);
  setIfDefined(options, "clearSelectionOnBodyClick", props.clearSelectionOnBodyClick);
  setIfDefined(options, "resetPageOn", props.resetPageOn);
  setIfDefined(options, "pageSize", props.pageSize);
  setIfDefined(options, "pageSizes", props.pageSizes);
  setIfDefined(options, "serverSideBlockSize", props.serverSideBlockSize);
  setIfDefined(options, "rowModelType", props.rowModelType);
  setIfDefined(options, "getGroupChildCount", props.getGroupChildCount);
  setIfDefined(options, "paginationUnknownTotalTooltip", props.paginationUnknownTotalTooltip);
  setIfDefined(options, "undoLimit", props.undoLimit);
  setIfDefined(options, "editTrigger", props.editTrigger);
  setIfDefined(options, "readOnlyEdit", props.readOnlyEdit);
  setIfDefined(options, "initialSort", props.initialSort);
  setIfDefined(options, "multiSortKey", props.multiSortKey);
  setIfDefined(options, "showSortPriority", props.showSortPriority);
  setIfDefined(options, "pinnedRowsEditable", props.pinnedRowsEditable);
  setIfDefined(options, "rowPinningMenu", props.rowPinningMenu);
  setIfDefined(options, "suppressKeyboardEdit", props.suppressKeyboardEdit);
  setIfDefined(options, "suppressTypeToEdit", props.suppressTypeToEdit);
  setIfDefined(options, "moveAfterEdit", props.moveAfterEdit);
  setIfDefined(options, "commitOnBlur", props.commitOnBlur);
  setIfDefined(options, "reevaluateOnEdit", props.reevaluateOnEdit);
  setIfDefined(options, "groupDisplayType", props.groupDisplayType);
  setIfDefined(options, "groupColumnDef", props.groupColumnDef);
  setIfDefined(options, "groupDefaultExpanded", props.groupDefaultExpanded);
  setIfDefined(options, "groupSortMode", props.groupSortMode);
  setIfDefined(options, "treeData", props.treeData);
  setIfDefined(options, "groupRowsSelectable", props.groupRowsSelectable);
  setIfDefined(options, "isRowPinned", props.isRowPinned);
  setIfDefined(options, "groupRowsSticky", props.groupRowsSticky);
  setIfDefined(options, "isFullWidthRow", props.isFullWidthRow);
  setIfDefined(options, "tooltip", props.tooltip);
  setIfDefined(options, "quickFilter", props.quickFilter);
  setIfDefined(options, "columnPanel", props.columnPanel);
  setIfDefined(options, "toolbar", props.toolbar);
  setIfDefined(options, "savedViews", props.savedViews);
  setIfDefined(options, "loadingMessage", props.loadingMessage);
  setIfDefined(options, "noRowsMessage", props.noRowsMessage);
  setIfDefined(options, "filterDebounceMs", props.filterDebounceMs);
  setIfDefined(options, "cellFlashDuration", props.cellFlashDuration);
  setIfDefined(options, "cellFadeDuration", props.cellFadeDuration);
  setIfDefined(options, "icons", props.icons);
  setIfDefined(options, "theme", props.theme);

  if (props.fullWidthCellRenderer != null) {
    options.fullWidthCellRenderer = adaptCellRenderer(props.fullWidthCellRenderer);
  }
  if (props.defaultColDef != null) options.defaultColDef = adaptReactDefaultColDef(props.defaultColDef);

  // Forward only the boolean intent to core: false disables the menu (native menu shows); everything
  // else (true / omitted / a function) leaves core at its "show menu" default and lets the React
  // body-menu adapter apply the function arm (so React-node slots are handled). This avoids running
  // a user callback twice (once in core, once in the adapter).
  if (props.bodyContextMenu === false) options.bodyContextMenu = false;

  if (props.rowModelType === "serverSide") {
    setIfDefined(options, "serverSideDataSource", props.serverSideDataSource);
    setIfDefined(options, "serverSideAggregationSource", props.serverSideAggregationSource);
  }

  setIfDefined(options, "suppressStyleInjection", props.suppressStyleInjection);
  setIfDefined(options, "styleNonce", props.styleNonce);

  return options;
}
