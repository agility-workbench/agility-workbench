import { IBodyMenuAdapter } from "../interfaces/iBodyMenuAdapter";
import { IGridCore } from "../interfaces";
import { MenuItem } from "../interfaces/menuItem";
import { BodyMenuContext } from "./bodyContext";
import { BodyMenuService } from "./bodyMenuService";

export class BodyMenuCoordinator {
  constructor(
    private menuSvc: BodyMenuService,
    private menuAdapter: IBodyMenuAdapter,
    private core: IGridCore,
  ) { }

  openBodyMenu(ctx: BodyMenuContext): {
    items: MenuItem[];
    onItemClick: (item: MenuItem) => void;
    onClose: () => void;
  } {
    const defaults = this.menuSvc.buildDefaultBodyMenu(ctx);
    // Apply a getter supplied directly via core GridOptions.bodyContextMenu (the vanilla path). In
    // React the option is forwarded to core as a boolean and the getter runs in the body-menu
    // adapter instead, so this is a no-op there — the function arm never reaches core options.
    const optionGetter = this.core.getOptions().bodyContextMenu;
    const afterOption = typeof optionGetter === "function"
      ? optionGetter({ ctx, items: defaults })
      : defaults;
    const { items, cleanup } = this.menuAdapter.resolveMenuItems(ctx, afterOption);

    return {
      items,
      onItemClick: (item) => this.menuSvc.execute(item, ctx),
      onClose: cleanup,
    };
  }
}
