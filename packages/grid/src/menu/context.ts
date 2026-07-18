export interface ColumnMenuContext {
  trigger: "columnMenuButton" | "headerContextMenu";
  targetColId: string;
  colIds: string[];        // selection set (includes targetColId)
  anchorEl?: HTMLElement;  // where to position
  clientX?: number;        // for right click positioning
  clientY?: number;
}
