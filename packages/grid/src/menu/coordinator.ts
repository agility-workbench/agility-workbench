import { MenuItem } from "../interfaces/menuItem";
import { IMenuAdapter } from "../interfaces/iMenuAdapter";
import { IGridCore } from "../interfaces";
import {
  ColumnMenuService,
  ColumnMenuExportTarget,
  ColumnPanelMenuTarget,
} from "./columnMenuService";
import { ColumnMenuContext } from "./context";

export class MenuCoordinator {
  constructor(
    private menuSvc: ColumnMenuService,
    private menuAdapter: IMenuAdapter,
    private core: IGridCore,
  ) {}

  /** Wire the column-menu export target through to the service. */
  setExportTarget(exporter: ColumnMenuExportTarget) {
    this.menuSvc.setExportTarget(exporter);
  }

  setColumnPanelTarget(target: ColumnPanelMenuTarget) {
    this.menuSvc.setColumnPanelTarget(target);
  }

  openColumnMenu(ctx: ColumnMenuContext): {
    items: MenuItem[];
    onItemClick: (item: MenuItem) => void;
    onClose: () => void;
  } {
    const defaults = this.menuSvc.buildDefaultColumnMenu(ctx);
    const { items, cleanup } = this.menuAdapter.resolveMenuItems(ctx, this.applyColumnGetter(ctx, defaults));

    return {
      items,
      onItemClick: (item) => this.menuSvc.execute(item, ctx),
      onClose: cleanup,
    };
  }

  /**
   * Apply the target column's `ColDef.columnMenu` getter — the vanilla path, mirroring how
   * `BodyMenuCoordinator` applies `GridOptions.bodyContextMenu`. A getter inherited from
   * `defaultColDef` is how a host customizes every column's menu at once.
   *
   * Only single-column menus consult it. When several columns are selected the built-in items act
   * on the whole set, so no one column's configuration governs the menu; running the target
   * column's getter there would let an arbitrary member of the selection speak for all of them.
   *
   * Framework bindings supply their items through the adapter instead, which runs after this.
   */
  private applyColumnGetter(ctx: ColumnMenuContext, defaults: MenuItem[]): MenuItem[] {
    if (ctx.colIds.length > 1) return defaults;

    const column = this.core.getColumnModel().getById(ctx.targetColId);
    if (!column || typeof column.columnMenu !== "function") return defaults;

    // `column` is passed because ctx.targetColId is an internal instance id; the getter needs the
    // resolved column to reach the public `colId` it was configured with.
    return column.columnMenu({ ctx, column, items: defaults });
  }
}
