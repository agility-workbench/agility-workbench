import type { MenuItem as GridMenuItem } from "@agility-workbench/grid";

export type MenuSlotReact = string | HTMLElement | React.ReactElement | null | false | undefined;

export interface MenuItem extends Omit<GridMenuItem, "left" | "right" | "subMenu"> {
  left?: MenuSlotReact;
  right?: MenuSlotReact;
  subMenu?: MenuItem[];
}
