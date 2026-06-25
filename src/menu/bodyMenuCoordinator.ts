import { IBodyMenuAdapter } from "../interfaces/iBodyMenuAdapter";
import { MenuItem } from "../interfaces/menuItem";
import { BodyMenuContext } from "./bodyContext";
import { BodyMenuService } from "./bodyMenuService";

export class BodyMenuCoordinator {
  constructor(
    private menuSvc: BodyMenuService,
    private menuAdapter: IBodyMenuAdapter,
  ) { }

  openBodyMenu(ctx: BodyMenuContext): {
    items: MenuItem[];
    onItemClick: (item: MenuItem) => void;
    onClose: () => void;
  } {
    const defaults = this.menuSvc.buildDefaultBodyMenu(ctx);
    const { items, cleanup } = this.menuAdapter.resolveMenuItems(ctx, defaults);

    return {
      items,
      onItemClick: (item) => this.menuSvc.execute(item, ctx),
      onClose: cleanup,
    };
  }
}
