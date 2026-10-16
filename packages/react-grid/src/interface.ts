import { ColDef, GridOptions } from "@agility-workbench/grid";
import { IGridAPI } from "@agility-workbench/grid";
import { BodyMenuContext, Column, ColumnMenuContext } from "@agility-workbench/grid";
import {
  ReactCellRenderer,
  ReactColDef,
  ReactDefaultColDef,
  ReactGetRowPresentation,
  ReactPartialColDef,
} from "./cellRenderer";
import { MenuItem } from "./menu";

// `bodyContextMenu`'s and `multiColumnMenu`'s callback arms are redeclared below to return React-aware
// MenuItems (slots may be React nodes); `fullWidthCellRenderer` is redeclared to also accept a React component; `defaultColDef`
// is redeclared as a React-aware `ReactDefaultColDef` (it may carry React components). All are omitted
// from the inherited core GridOptions.
// `TData` is the row type (default `any`), as on the core `GridOptions<TData>`: it types
// `columnDefs`, the callbacks that receive a row, `apiRef` and `onGridReady`. It is never inferred
// from `rowData` / `data` (an empty `[]` would otherwise pin it to `never`); pass it as
// `<Grid<Trade> …>` or let typed `columnDefs` (`ReactColDef<Trade>[]`) supply it.
export interface GridProps<TData = any> extends Omit<
  GridOptions<TData>,
  | "bodyContextMenu"
  | "multiColumnMenu"
  | "fullWidthCellRenderer"
  | "defaultColDef"
  | "getRowPresentation"
  | "groupColumnDef"
  | "pivotResultColumnDef"
> {
  /** Optional className/style for the host div */
  className?: string;
  style?: React.CSSProperties;

  /** Optional initial data/columns; wrapper will forward after init and on change */
  data?: NoInfer<TData>[];
  /** Public row-data prop. Takes precedence over `data` when both are provided. */
  rowData?: NoInfer<TData>[];
  columnDefs?: ReactColDef<TData>[] | ColDef<TData>[] | null;

  /** Expose API (AG Grid style) */
  apiRef?: React.Ref<IGridAPI<TData> | null>;
  /**
   * Called once per grid instance, in the mounting commit (synchronously, before paint), with the
   * `columnDefs` and row data already applied — so colId- and rowId-addressed API calls made here
   * resolve. Prop-driven option syncing still runs after it.
   */
  onGridReady?: (api: IGridAPI<TData>) => void;

  /* If true, shows loading overlay */
  loading?: boolean;

  /** Hook to customize column menu items */
  getColumnMenuItems?: (p: { ctx: ColumnMenuContext; items: MenuItem[] }) => MenuItem[];

  /**
   * Controls the body (right-click) context menu:
   * - `true` / omitted (default): the grid's default body menu (Copy, Export, …).
   * - `false`: no grid menu — the browser's native context menu appears instead.
   * - a function: called with the menu context and the default items; return the items to show
   *   (menu-item slots may be React nodes). Return `[]` to show nothing while still suppressing the
   *   native menu. Fires on right-click anywhere in the body, including row-number cells.
   */
  bodyContextMenu?: boolean | ((p: { ctx: BodyMenuContext; items: MenuItem[] }) => MenuItem[]);

  /**
   * Customizes the column menu opened for several selected columns at once (see the core
   * `multiColumnMenu`):
   * - omitted (default): the grid's built-in multi-column items.
   * - a function: called with the built-in items and the columns they act on (target first); return
   *   the items to show (menu-item slots may be React nodes), or `[]` for no menu. The latest
   *   function passed is the one called. `getColumnMenuItems` still runs afterwards.
   * - `false` at mount: no multi-column menu, and `getColumnMenuItems` does not run for one either.
   *   Switching to `false` after mount behaves like a function returning `[]`.
   */
  multiColumnMenu?:
    | false
    | ((p: { ctx: ColumnMenuContext; columns: Column[]; items: MenuItem[] }) => MenuItem[]);

  /**
   * Renderer for a full-width row's content (see the core `fullWidthCellRenderer`). May be a plain
   * core CellRenderer or a React component; a React component is adapted like `colDef.cellRenderer`.
   */
  fullWidthCellRenderer?: GridOptions<TData>["fullWidthCellRenderer"] | ReactCellRenderer<TData>;

  /**
   * Default column definition merged under every column (see core `defaultColDef`). A React-aware
   * `ReactColDef`, so component fields (cellRenderer, tooltipComponent, actionFrameComponent, …) may
   * be React components; they are adapted exactly as they would be on a real column def.
   */
  defaultColDef?: ReactDefaultColDef<TData>;
  /**
   * The auto-group column's definition (see core `groupColumnDef`), React-aware like `defaultColDef`:
   * component fields (cellRenderer, tooltipComponent, headerComponent, …) may be React components.
   */
  groupColumnDef?: ReactPartialColDef<TData>;
  /**
   * Layered over every pivot result column (see core `pivotResultColumnDef`), React-aware like
   * `defaultColDef`.
   */
  pivotResultColumnDef?: ReactPartialColDef<TData>;
  /** React-aware row presentation callback; row tooltip components may be React components. */
  getRowPresentation?: ReactGetRowPresentation<TData>;
}
