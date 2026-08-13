// Re-export the full framework-agnostic core surface so consumers can import everything they need
// (ColDef, GridOptions, themes, types, …) from the Angular entry alone:
// `import { AwbGrid, themeDark, type ColDef } from "@agility-workbench/angular-grid"`.
export * from "@agility-workbench/grid";

export { AwbGrid } from "./grid.component";
export type {
  ICellRendererNgComp,
  ITooltipNgComp,
  IActionFrameNgComp,
  ICellEditorNgComp,
  ISetFilterSpecialValueNgComp,
  ISetFilterValueNgComp,
  NgComponent,
  NgColDef,
  NgDefaultColDef,
  NgRowTooltipPresentation,
  NgRowPresentation,
  NgGetRowPresentation,
  NgFilterParams,
} from "./interface";
export type { NgMenuItem, NgMenuSlot } from "./menu";
