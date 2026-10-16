import type { Type } from "@angular/core";
import type {
  ActionFrameComponent,
  ActionFrameComponentParams,
  CellEditor,
  CellRenderer,
  CellRendererAlias,
  CellRendererParams,
  ColDef,
  FilterParams,
  HeaderComponent,
  HeaderComponentParams,
  ICellEditorParams,
  TooltipComponent,
  TooltipComponentParams,
  SetFilterGroupComponent,
  SetFilterGroupComponentParams,
  SetFilterSpecialValueComponent,
  SetFilterSpecialValueComponentParams,
  SetFilterValueComponent,
  SetFilterValueComponentParams,
  NON_DEFAULTABLE_COLDEF_KEYS,
  RowPresentation,
  RowPresentationParams,
  RowTooltipPresentation,
} from "@agility-workbench/grid";

/**
 * Optional contract for an Angular cell-renderer component. A renderer component may either
 * implement `awbInit` (and optionally `awbRefresh`) or simply declare a signal/decorator input named
 * `params` — the adapter detects which style is in use.
 */
export interface ICellRendererNgComp<P extends CellRendererParams = CellRendererParams> {
  /** Called once after the component is created, with the (merged) renderer params. */
  awbInit(params: P): void;
  /** Called when the cell refreshes. Return false to have the grid recreate the component. */
  awbRefresh?(params: P): boolean;
}

/** Same contract as {@link ICellRendererNgComp}, for tooltip components. */
export interface ITooltipNgComp<P extends TooltipComponentParams = TooltipComponentParams> {
  awbInit(params: P): void;
  awbRefresh?(params: P): boolean;
}

/** Same contract as {@link ICellRendererNgComp}, for ActionFrame components. */
export interface IActionFrameNgComp<P extends ActionFrameComponentParams = ActionFrameComponentParams> {
  awbInit(params: P): void;
  awbRefresh?(params: P): boolean;
}

/**
 * Same contract as {@link ICellRendererNgComp}, for `headerComponent` / `headerCellComponent`.
 * `awbRefresh` runs when the header's sort/filter state changes; without it the params are simply
 * re-delivered.
 */
export interface IHeaderNgComp<P extends HeaderComponentParams = HeaderComponentParams> {
  awbInit(params: P): void;
  awbRefresh?(params: P): boolean;
}

/** Angular component contract for a regular set-filter value label. */
export interface ISetFilterValueNgComp<P extends SetFilterValueComponentParams = SetFilterValueComponentParams> {
  awbInit(params: P): void;
  awbRefresh?(params: P): boolean;
}

/** Angular component contract for a tree-layout group row's label. */
export interface ISetFilterGroupNgComp<P extends SetFilterGroupComponentParams = SetFilterGroupComponentParams> {
  awbInit(params: P): void;
  awbRefresh?(params: P): boolean;
}

/** Angular component contract for the dedicated Select All and Blanks labels. */
export interface ISetFilterSpecialValueNgComp<
  P extends SetFilterSpecialValueComponentParams = SetFilterSpecialValueComponentParams,
> {
  awbInit(params: P): void;
  awbRefresh?(params: P): boolean;
}

/**
 * Contract for an Angular cell-editor component. The grid reads `getValue()` on commit and calls
 * the optional lifecycle methods; mount, synchronous change detection, focus sequencing, and
 * teardown are handled by the adapter. Params arrive via `awbInit` or a `params` input, exactly as
 * for renderers.
 */
export interface ICellEditorNgComp<P extends ICellEditorParams = ICellEditorParams> {
  awbInit?(params: P): void;
  /** The value to commit. */
  getValue(): unknown;
  /** Whether getValue() is already the final typed value (skip the column's valueParser). */
  isParsed?(): boolean;
  /** Focus the editor after mount. */
  focus?(): void;
  /** Return true to abort opening the editor. */
  isCancelBeforeStart?(): boolean;
}

/** An Angular component class usable as a cell renderer / tooltip / ActionFrame / editor / header. */
export type NgComponent = Type<unknown>;

export type NgFilterParams = Omit<
  FilterParams,
  "valueComponent" | "selectAllComponent" | "blanksComponent" | "groupComponent"
> & {
  valueComponent?: SetFilterValueComponent | NgComponent;
  selectAllComponent?: SetFilterSpecialValueComponent | NgComponent;
  blanksComponent?: SetFilterSpecialValueComponent | NgComponent;
  groupComponent?: SetFilterGroupComponent | NgComponent;
};

export type NgRowTooltipPresentation = Omit<RowTooltipPresentation, "component"> & {
  component?: TooltipComponent | NgComponent;
};

export type NgRowPresentation = Omit<RowPresentation, "tooltip"> & {
  tooltip?: NgRowTooltipPresentation | false | null;
};

export type NgGetRowPresentation<TData = any> = (
  params: RowPresentationParams<TData>,
) => NgRowPresentation | null | undefined;

/**
 * Angular-aware column definition: identical to the core {@link ColDef}, but every component slot
 * (cellRenderer, cellEditor, tooltipComponent, headerTooltip, actionFrameComponent, headerComponent,
 * headerCellComponent, and the set-filter components in filterParams) may also be an
 * Angular component class. Angular components are wrapped in core adapter classes; core renderer
 * classes and string aliases pass through unchanged.
 *
 * `TData` is the row type (default `any`), exactly as on `ColDef<TData>`. Angular component
 * classes stay untyped slots (`Type<unknown>`); type a component's params through its contract,
 * e.g. `ITooltipNgComp<TooltipComponentParams<Trade>>`.
 */
export type NgColDef<TData = any> = Omit<
  ColDef<TData>,
  | "cellRenderer"
  | "cellEditor"
  | "children"
  | "tooltipComponent"
  | "headerTooltip"
  | "actionFrameComponent"
  | "filterParams"
  | "headerComponent"
  | "headerCellComponent"
> & {
  cellRenderer?: CellRenderer<TData> | CellRendererAlias | NgComponent;
  cellEditor?: CellEditor<TData> | NgComponent;
  tooltipComponent?: TooltipComponent<TData> | NgComponent;
  headerTooltip?: string | TooltipComponent | NgComponent;
  actionFrameComponent?: ActionFrameComponent<TData> | NgComponent;
  filterParams?: NgFilterParams;
  headerComponent?: HeaderComponent | NgComponent;
  headerCellComponent?: HeaderComponent | NgComponent;
  children?: NgColDef<TData>[];
};

/**
 * Angular-aware shape of the grid-level `defaultColDef`: an {@link NgColDef} minus the per-column
 * identity/structure fields that never inherit (see `NON_DEFAULTABLE_COLDEF_KEYS`). Mirrors core
 * `DefaultColDef`, but its component fields may be Angular components.
 */
export type NgDefaultColDef<TData = any> = Omit<NgColDef<TData>, (typeof NON_DEFAULTABLE_COLDEF_KEYS)[number]>;

/**
 * Angular-aware shape of the partial column defs the grid layers over a synthesized column
 * (`groupColumnDef`, `pivotResultColumnDef`): a `Partial<NgColDef>`, so component fields may be
 * Angular components.
 */
export type NgPartialColDef<TData = any> = Partial<Omit<NgColDef<TData>, "children">>;
