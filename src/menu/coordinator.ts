import { MenuItem } from "../interfaces/menuItem";
import { IMenuAdapter } from "../interfaces/iMenuAdapter";
import { ColumnMenuService, ColumnMenuExportTarget } from "./columnMenuService";
import { ColumnMenuContext } from "./context";

export class MenuCoordinator {
  constructor(
    private menuSvc: ColumnMenuService,
    private menuAdapter: IMenuAdapter
  ) {}

  /** Wire the column-menu export target through to the service. */
  setExportTarget(exporter: ColumnMenuExportTarget) {
    this.menuSvc.setExportTarget(exporter);
  }

  openColumnMenu(ctx: ColumnMenuContext): {
    items: MenuItem[];
    onItemClick: (item: MenuItem) => void;
    onClose: () => void;
  } {
    const defaults = this.menuSvc.buildDefaultColumnMenu(ctx);

    const { items, cleanup } = this.menuAdapter.resolveMenuItems(ctx, defaults);

    return {
      items,
      onItemClick: (item) => this.menuSvc.execute(item, ctx),
      onClose: cleanup,
    };
  }
}
