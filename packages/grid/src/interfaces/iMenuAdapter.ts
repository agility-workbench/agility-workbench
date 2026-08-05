import { ColumnMenuContext } from "../menu/context";
import { MenuItem } from "./menuItem";

export interface IMenuAdapter {
  // returns fully normalized (core-safe) menu items and a cleanup fn
  resolveMenuItems(ctx: ColumnMenuContext, defaults: MenuItem[]): { items: MenuItem[]; cleanup: () => void };
}
