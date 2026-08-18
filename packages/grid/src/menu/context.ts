/**
 * Internal extension of {@link ColumnMenuContext}. The aggregate flyout is built by running the
 * whole column-menu pipeline and lifting one item's `subMenu` out of the result, so it must not
 * hand that synthetic menu to application getters — a getter that replaced the items rather than
 * extending them would silently empty the flyout.
 */
export type InternalColumnMenuContext = ColumnMenuContext & {
  __suppressAppMenuItems?: boolean;
};

export interface ColumnMenuContext {
  trigger: "columnMenuButton" | "headerContextMenu";
  targetColId: string;
  colIds: string[];        // selection set (includes targetColId)
  anchorEl?: HTMLElement;  // where to position
  clientX?: number;        // for right click positioning
  clientY?: number;
}
