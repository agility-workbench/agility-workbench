import { ColDef, GridOptions } from "@agility-workbench/grid";
import { IGridAPI } from "@agility-workbench/grid";
import { BodyMenuContext, ColumnMenuContext } from "@agility-workbench/grid";
import { ReactCellRenderer, ReactColDef, ReactDefaultColDef } from "./cellRenderer";
import { MenuItem } from "./menu";

// `bodyContextMenu`'s callback arm is redeclared below to return React-aware MenuItems (slots may be
// React nodes); `fullWidthCellRenderer` is redeclared to also accept a React component; `defaultColDef`
// is redeclared as a React-aware `ReactDefaultColDef` (it may carry React components). All are omitted
// from the inherited core GridOptions.
export interface GridProps extends Omit<GridOptions, "bodyContextMenu" | "fullWidthCellRenderer" | "defaultColDef"> {
  /** Optional className/style for the host div */
  className?: string;
  style?: React.CSSProperties;

  /** Optional initial data/columns; wrapper will forward after init and on change */
  data?: unknown[];
  /** Public row-data prop. Takes precedence over `data` when both are provided. */
  rowData?: unknown[];
  columnDefs?: ReactColDef[] | ColDef[] | null;

  /** Expose API (AG Grid style) */
  apiRef?: React.Ref<IGridAPI | null>;
  onGridReady?: (api: IGridAPI) => void;

  /* If true, shows loading overlay */
  loading?: boolean;

  /**
   * The grid injects its base stylesheet into `document.head` on mount (deduped across instances).
   * Set to true when the application delivers the CSS itself (styles.css import or a scoped
   * `injectGridStyles(shadowRoot)`). Read once at mount — not reconciled live.
   */
  suppressStyleInjection?: boolean;

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
   * Renderer for a full-width row's content (see the core `fullWidthCellRenderer`). May be a plain
   * core CellRenderer or a React component; a React component is adapted like `colDef.cellRenderer`.
   */
  fullWidthCellRenderer?: GridOptions["fullWidthCellRenderer"] | ReactCellRenderer;

  /**
   * Default column definition merged under every column (see core `defaultColDef`). A React-aware
   * `ReactColDef`, so component fields (cellRenderer, tooltipComponent, actionFrameComponent, …) may
   * be React components; they are adapted exactly as they would be on a real column def.
   */
  defaultColDef?: ReactDefaultColDef;
}
