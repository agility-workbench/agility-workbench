import { ColDef, GridOptions } from "@grid";
import { IGridAPI } from "@grid/interfaces/IApi";

export interface GridReactProps {
  /** Optional className/style for the host div */
  className?: string;
  style?: React.CSSProperties;

  /** Initial options used to create core/renderer */
  options?: GridOptions;

  /** Optional initial data/columns; wrapper will forward after init and on change */
  data?: unknown[];
  columnDefs?: ColDef[];

  /** Expose API (AG Grid style) */
  apiRef?: React.Ref<IGridAPI | null>;
  onGridReady?: (api: IGridAPI) => void;

  /** If true, wrapper will recreate core/renderer when `options` identity changes */
  recreateOnOptionsChange?: boolean;

  /* If true, shows loading overlay */
  loading?: boolean;
}
