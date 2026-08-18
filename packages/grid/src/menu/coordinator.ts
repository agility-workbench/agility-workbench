import { MenuItem } from "../interfaces/menuItem";
import { IMenuAdapter } from "../interfaces/iMenuAdapter";
import { IGridCore } from "../interfaces";
import {
  ColumnMenuService,
  ColumnMenuExportTarget,
  ColumnPanelMenuTarget,
} from "./columnMenuService";
import { ColumnMenuContext, InternalColumnMenuContext } from "./context";

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
    // `multiColumnMenu: false` is a hard veto: unlike an application getter returning `[]`, the
    // adapter never runs, so a framework binding cannot put items back.
    if (this.isVetoedMultiColumnMenu(ctx)) {
      return { items: [], onItemClick: () => undefined, onClose: () => undefined };
    }

    const defaults = this.menuSvc.buildDefaultColumnMenu(ctx);
    const { items, cleanup } = this.menuAdapter.resolveMenuItems(ctx, this.applyAppGetter(ctx, defaults));

    return {
      items,
      onItemClick: (item) => this.menuSvc.execute(item, ctx),
      onClose: cleanup,
    };
  }

  private isVetoedMultiColumnMenu(ctx: ColumnMenuContext): boolean {
    if ((ctx as InternalColumnMenuContext).__suppressAppMenuItems) return false;
    return ctx.colIds.length > 1 && this.core.getOptions().multiColumnMenu === false;
  }

  /**
   * Apply the application's own item getter — the vanilla path, mirroring how `BodyMenuCoordinator`
   * applies `GridOptions.bodyContextMenu`. Which getter depends on what the menu targets:
   *
   * - one column → that column's `ColDef.columnMenu` (inheritable from `defaultColDef`),
   * - several    → the grid-level `GridOptions.multiColumnMenu`, because the built-in items act on
   *   the whole set and no one column's configuration can speak for all of them.
   *
   * Framework bindings supply their items through the adapter instead, which runs after this.
   */
  private applyAppGetter(ctx: ColumnMenuContext, defaults: MenuItem[]): MenuItem[] {
    // The aggregate flyout builds a whole column menu only to lift one item's submenu out of it.
    // Handing that synthetic menu to an application getter would let a getter that replaces the
    // items — rather than extending them — silently empty the flyout.
    if ((ctx as InternalColumnMenuContext).__suppressAppMenuItems) return defaults;

    return ctx.colIds.length > 1
      ? this.applyMultiColumnGetter(ctx, defaults)
      : this.applySingleColumnGetter(ctx, defaults);
  }

  private applySingleColumnGetter(ctx: ColumnMenuContext, defaults: MenuItem[]): MenuItem[] {
    const column = this.core.getColumnModel().getById(ctx.targetColId);
    if (!column || typeof column.columnMenu !== "function") return defaults;

    // `column` is passed because ctx.targetColId is an internal instance id; the getter needs the
    // resolved column to reach the public `colId` it was configured with.
    return column.columnMenu({ ctx, column, items: defaults });
  }

  private applyMultiColumnGetter(ctx: ColumnMenuContext, defaults: MenuItem[]): MenuItem[] {
    const getter = this.core.getOptions().multiColumnMenu;
    if (typeof getter !== "function") return defaults;

    // Target first, then the rest of the selection — the same set and order the built-in items
    // were built from (see ColumnMenuService.summarize), so the getter and the items it receives
    // can never describe different columns. The ⋮ button does not reconcile the selection, so the
    // target is not always among ctx.colIds.
    const columnModel = this.core.getColumnModel();
    const columns = [ctx.targetColId, ...ctx.colIds.filter(id => id !== ctx.targetColId)]
      .map(id => columnModel.getById(id))
      .filter((col): col is NonNullable<typeof col> => col != null);

    return getter({ ctx, columns, items: defaults });
  }
}
