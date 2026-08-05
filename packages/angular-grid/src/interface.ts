import type { Type } from "@angular/core";
import type {
  ActionFrameComponent,
  ActionFrameComponentParams,
  CellEditor,
  CellRenderer,
  CellRendererParams,
  ColDef,
  ICellEditorParams,
  TooltipComponent,
  TooltipComponentParams,
  NON_DEFAULTABLE_COLDEF_KEYS,
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

/** An Angular component class usable as a cell renderer / tooltip / ActionFrame / editor. */
export type NgComponent = Type<unknown>;

/**
 * Angular-aware column definition: identical to the core {@link ColDef}, but every component slot
 * (cellRenderer, cellEditor, tooltipComponent, headerTooltip, actionFrameComponent) may also be an
 * Angular component class. Angular components are wrapped in core adapter classes; core renderer
 * classes and string aliases pass through unchanged.
 */
export type NgColDef = Omit<
  ColDef,
  "cellRenderer" | "cellEditor" | "children" | "tooltipComponent" | "headerTooltip" | "actionFrameComponent"
> & {
  cellRenderer?: CellRenderer | NgComponent;
  cellEditor?: CellEditor | NgComponent;
  tooltipComponent?: TooltipComponent | NgComponent;
  headerTooltip?: string | TooltipComponent | NgComponent;
  actionFrameComponent?: ActionFrameComponent | NgComponent;
  children?: NgColDef[];
};

/**
 * Angular-aware shape of the grid-level `defaultColDef`: an {@link NgColDef} minus the per-column
 * identity/structure fields that never inherit (see `NON_DEFAULTABLE_COLDEF_KEYS`). Mirrors core
 * `DefaultColDef`, but its component fields may be Angular components.
 */
export type NgDefaultColDef = Omit<NgColDef, (typeof NON_DEFAULTABLE_COLDEF_KEYS)[number]>;
