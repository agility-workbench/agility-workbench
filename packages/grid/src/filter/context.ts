import { Column } from "../column/column";

export type FilterMenuSource = "filterButton" | "headerContextMenu" | "api";
export type FilterMenuCloseReason = "outsideClick" | "escape" | "apply" | "cancel" | "programmatic";

export interface ColumnFilterContext {
  trigger: FilterMenuSource;
  targetCol: Column;
  anchorEl?: HTMLElement;  // where to position
  clientX?: number;        // for right click positioning
  clientY?: number;
}
