import { ColDef, GridOptions } from "@agility-workbench/grid";
import { IGridAPI } from "@agility-workbench/grid";
import { BodyMenuContext, ColumnMenuContext } from "@agility-workbench/grid";
import { ReactColDef } from "./cellRenderer";
import { MenuItem } from "./menu";

export interface GridProps extends GridOptions{
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

  /** Hook to customize column menu items */
  getColumnMenuItems?: (p: { ctx: ColumnMenuContext; items: MenuItem[] }) => MenuItem[];

  /** Hook to customize body context menu items (right-click anywhere in the body, including row-number cells) */
  getBodyMenuItems?: (p: { ctx: BodyMenuContext; items: MenuItem[] }) => MenuItem[];
}
