export type { IGridCore } from "./interfaces/iGridCore";
export type {
  ExcelExportCellParams,
  ExcelExportCellProcessor,
  ExcelExportCellResult,
  ExcelExportCellStyle,
  ExcelExportRowType,
  ExportParams,
  ExportScope,
  IGridAPI,
  NavDir,
  RowScrollPosition,
} from "./interfaces/iGridAPI";
// The shape `api.getColumnState()` returns and `applyColumnState` accepts.
export type { ColumnState } from "./interfaces/iGridCore";
export type {
  CellPos,
  CellRef,
  SelectionKind,
  SelectionRange,
  SelectionSnapshot,
} from "./interfaces/selection";
// `Column` and `FilterModel` (below) are classes, but only their *shapes* are public
// API: consumers receive instances from the grid and never construct them. Plain
// `export type { Column }` is not enough here — tsup's declaration bundler inlines the
// class into the bundled .d.ts/.d.cts and re-emits it in the final export list without
// the `type` modifier, advertising a runtime value that neither the ESM nor the CJS
// build exports. Re-exporting through a type alias keeps the declarations honest.
import type { Column as ColumnClass } from "./column/column";
export type Column = ColumnClass;
export type { GridAction } from "./events/action";
export { GridCore } from "./core/core";
export { GridRenderer } from "./renderer/gridRenderer";
export { SparklineRenderer } from "./cellRenderers/sparklineRenderer";
export type {
  SparklineData,
  SparklineParams,
  SparklineTuple,
  SparklineTooltipValueFormatterParams,
  SparklineXValue,
} from "./cellRenderers/sparklineRenderer";
export { CanvasMeasurer, initDomRenderer } from "./renderer";
export { createGrid } from "./createGrid";
export type { CreateGridOptions } from "./createGrid";

// Extension-point surface consumed by framework bindings (e.g. the React wrapper).
export { isClassRenderer } from "./renderer/renderer";
export type {
  CellRenderer,
  CellRendererClass,
  CellRendererFn,
  CellRendererParams,
  CellRefreshReason,
  ICellRenderer,
} from "./renderer/renderer";
export { isClassHeaderComponent } from "./renderer/header/headerComponent";
export type {
  HeaderComponent,
  HeaderComponentClass,
  HeaderComponentFn,
  HeaderComponentParams,
  IHeaderComponent,
} from "./renderer/header/headerComponent";
export { isClassTooltipComponent } from "./renderer/tooltip/tooltipComponent";
export type {
  TooltipComponent,
  TooltipComponentClass,
  TooltipComponentFn,
  TooltipComponentParams,
  ITooltipComponent,
} from "./renderer/tooltip/tooltipComponent";
export { isClassActionFrameComponent } from "./renderer/actionFrame/actionFrameComponent";
export type {
  ActionFrameComponent,
  ActionFrameComponentClass,
  ActionFrameComponentFn,
  ActionFrameComponentParams,
  IActionFrameComponent,
} from "./renderer/actionFrame/actionFrameComponent";
export type {
  IBodyMenuAdapter,
  IMenuAdapter,
  MenuItem,
} from "./interfaces";
export type { BodyMenuContext } from "./menu";
export type { ColumnMenuContext } from "./menu";
export { isFalse, isTrue, valuesAreSame } from "./misc";

export { REJECT } from "./interfaces/gridOptions";
export type {
  GridOptions,
  // Accepted by `api.updateGridOptions`; `RuntimeGridOptions` is the slice it applies as a unit.
  UpdatableGridOptions,
  RuntimeGridOptions,
  CellValueChangedParams,
  BeforeCellCommitParams,
  CellCommitSource,
  RowSelectionOptions,
  SortChangedParams,
  ResetPageTrigger,
  RowDataMode,
  RowClassParams,
  GetRowClass,
  GetRowStyle,
  RowPresentation,
  RowPresentationParams,
  RowTooltipPresentation,
  RowAccessibilityPresentation,
  GetRowPresentation,
  GroupDisplayType,
  GroupSortMode,
  TreeDataKeyboardNavigationMode,
  TreeDataKeyboardNavigationOptions,
  TreeDataOptions,
  TreeDataPathOptions,
  TreeDataParentOptions,
  TreeDataChildrenOptions,
  RowPinnedPosition,
  IsRowPinnedParams,
  CellSelectionMode,
  PaginationControl,
  PaginationControlsOptions,
  PaginationPageSelection,
  ResolvedPaginationControlsOptions,
  BodyContextMenuGetter,
  RowInsertionMenuOptions,
  RowInsertionMenuParams,
  QuickFilterOptions,
  QuickFilterPositionOptions,
  QuickFilterMatchMode,
  ColumnPanelOptions,
  ColumnPanelTrigger,
  GridToolbarOptions,
  InitialSortItem,
  SortingOrder,
  ShowSortPriority,
  SortIconVisibility,
  TooltipOptions,
  TooltipColumnOptions,
  TooltipMode,
  TooltipPlacement,
  ActionFrameOptions,
  ActionFramePlacement,
} from "./interfaces/gridOptions";
export type {
  GridViewFilterState,
  GridViewGroupExpansionState,
  GridViewPaginationState,
  GridViewSortState,
  GridViewState,
  SavedGridView,
  SavedViewsOptions,
} from "./interfaces/gridView";
export type { GridIconMap, GridIconName, GridIconSource } from "./theme/icons";
export { getIconClassName } from "./theme/icons";

export type { GridTheme, GridThemeParams } from "./theme/theme";
export { createTheme, themeLight, themeDark } from "./theme/theme";
export type { PteVarName } from "./theme/cssVars.generated";
export { injectGridStyles, areGridStylesInjected } from "./theme/inject";
export type { InjectGridStylesOptions } from "./theme/inject";

export type { MultiColumnMenuItemsGetter } from "./interfaces/gridOptions";
export { ColumnType, NON_DEFAULTABLE_COLDEF_KEYS } from "./interfaces/column";
export type { ColDef, ColumnMenuItemsGetter, DefaultColDef } from "./interfaces/column";
export { AggregateType } from "./interfaces/aggregate";
export type { AggregateModel, AggregateScope } from "./interfaces/aggregate";
export { FilterType } from "./interfaces/filter";
export type {
  ComparatorFn,
  Filter,
  FilterAction,
  FilterDef,
  FilterInputType,
  FilterItem,
  FilterOption,
  FilterParams,
  SetFilterMode,
} from "./interfaces/filter";
// Type-aliased for the same declaration-bundler reason as `Column` above.
import type { FilterModel as FilterModelClass } from "./interfaces/filter";
export type FilterModel = FilterModelClass;
export type { FilterValueAsyncSource, FilterValueAsyncSourceParams } from "./filter/types";
export type { SetFilterSelection } from "./filter/setFilterCore";
export type {
  ISetFilterComponent,
  SetFilterComponent,
  SetFilterComponentClass,
  SetFilterComponentFn,
  SetFilterSpecialValueComponent,
  SetFilterSpecialValueComponentParams,
  SetFilterValueComponent,
  SetFilterValueComponentParams,
} from "./renderer/filter/setFilterValueComponent";
export {
  createSetFilterComponentRuntime,
  isClassSetFilterComponent,
} from "./renderer/filter/setFilterValueComponent";

export type {
  CellValueChangeSource,
  GridEventAggregateChangedParams,
  GridEventCellClickedParams,
  GridEventCellValueChangedParams,
  GridEventFilterChangedParams,
  GridEventHistoryChangedParams,
  HistoryChangeReason,
  GridEventRowClickedParams,
  GridEventCellsChangedParams,
  GridEventColumnWidthsChangedParams,
  GridEventColumnsChangedParams,
  GridEventEditingChangedParams,
  GridEventErrorParams,
  GridEventFocusChangedParams,
  GridEventHandler,
  GridEventMap,
  GridEventModelUpdatedParams,
  GridEventName,
  GridEventOverlayShowParams,
  GridEventPaginationChangedParams,
  GridEventRowsChangedParams,
  GridEventSelectionChangedParams,
  GridEventTooltipParams,
  GridEventActionFrameParams,
  GridEventKeyboardNavigationModeChangedParams,
  GridEventViewportChangedParams,
  Unsubscribe,
} from "./events/events";

export type { GridHistoryState } from "./core/historyModel";

export type {
  IRowModel,
  RowDataDiff,
  RowModelType,
  RowTransaction,
  RowTransactionResult,
  ServerSideRefreshOptions,
} from "./interfaces/iRowModel";
export type { IRowNode } from "./interfaces/iRowNode";

export type {
  IServerSideAggregationParams,
  IServerSideAggregationRequest,
  IServerSideAggregationResult,
  IServerSideDataSource,
  IServerSideFilter,
  IServerSideGetRowsParams,
  IServerSideGroupKey,
  IServerSideRequest,
  IServerSideResult,
  IServerSideSort,
} from "./interfaces/serverSide";

export { ServerSideRowModel } from "./ssrm/serverSide";

export type {
  FormatterOptionsParams,
  ValueFormatterParams,
  ValueParserParams,
} from "./column/formatters";

export type {
  CellEditor,
  CellEditorAlias,
  CellEditorClass,
  ICellEditor,
  ICellEditorFn,
  ICellEditorParams,
  SelectCellEditorParams,
  SelectEditorOption,
  SelectValueSource,
  SelectValueAsyncParams,
} from "./renderer/editing/cellEditor";

export { ChangeFlashCellRenderer } from "./cellRenderers/changeFlashRenderer";
export type { ChangeFlashParams, FlashDirection } from "./cellRenderers/changeFlashRenderer";
