import type { MenuItem as GridMenuItem } from "@grid/interfaces";

export type MenuSlotReact = string | HTMLElement | React.ReactElement | null | false | undefined;

export interface MenuItem extends Omit<GridMenuItem, "left" | "right" | "subMenu"> {
  left?: MenuSlotReact;
  right?: MenuSlotReact;
  subMenu?: MenuItem[];
}
