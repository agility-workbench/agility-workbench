// Re-export the full framework-agnostic core surface so consumers can import
// everything they need (ColDef, GridOptions, themes, types, …) from the React
// entry alone: `import { Grid, themeDark, type ColDef } from
// "@agility-workbench/react-grid"`.
export * from "@agility-workbench/grid";

export { Grid } from "./grid";
export type { GridProps } from "./interface";
export type {
  ReactCellRenderer,
  ReactColDef,
  ReactDefaultColDef,
  ReactTooltipComponent,
  ReactActionFrameComponent,
  ReactRowTooltipPresentation,
  ReactRowPresentation,
  ReactGetRowPresentation,
} from "./cellRenderer";
export type { ReactCellEditor, ReactCellEditorHandle } from "./cellEditor";
// Aliased: `export *` above already publishes core's plain `MenuItem`; this is the React-aware
// item type (slots may be React nodes) used by `getColumnMenuItems` / `bodyContextMenu`.
export type { MenuItem as ReactMenuItem, MenuSlotReact } from "./menu";
