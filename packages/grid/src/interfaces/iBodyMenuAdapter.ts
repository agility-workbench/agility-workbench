import { BodyMenuContext } from "../menu/bodyContext";
import { MenuItem } from "./menuItem";

export interface IBodyMenuAdapter {
  resolveMenuItems(ctx: BodyMenuContext, defaults: MenuItem[]): { items: MenuItem[]; cleanup: () => void };
}
