import { GridCore } from "../core/core";
import { Column } from "../column/column";
import { ColumnFilterContext } from "./context";
import { ColumnFilterMenuService } from "./filterMenuService";
import { FilterController } from "./filterMenuController";
import { FilterRenderer } from "../renderer/filter/filterRenderer";
import { MenuRenderer } from "../renderer/menuRenderer";
import type { IGridAPI } from "../interfaces/iGridAPI";

export class FilterMenuCoordinator {
  /**
   * Tree-layout expansion per column (group key → open?), kept for the grid's lifetime so a filter
   * reopens as it was left: the controller is rebuilt on every open and would otherwise start from
   * `treeDefaultExpanded`. Keyed by the column's public id so it survives a column-def reload.
   */
  private readonly treeExpansion = new Map<string, Map<string, boolean>>();

  constructor(
    private core: GridCore,
    private filterMenuService: ColumnFilterMenuService,
    private api: IGridAPI,
  ) { }

  private treeExpansionFor(col: Column): Map<string, boolean> {
    const id = col.colId || col.key || col.instanceID;
    let memory = this.treeExpansion.get(id);
    if (!memory) {
      memory = new Map();
      this.treeExpansion.set(id, memory);
    }
    return memory;
  }

  openFilterMenu(ctx: ColumnFilterContext): {
    contentEl: HTMLElement,
    onOpen?: (renderer: MenuRenderer) => void,
    onClose: () => void,
  } {
    const panelSpec = this.filterMenuService.buildFilterMenu(ctx);

    const rowModel = this.core.getRowModel();

    const ctrl = new FilterController(
      panelSpec,
      this.core.getFilterModel().items.find(f =>
        f.col.instanceID === ctx.targetCol.instanceID
        || f.col.colId === ctx.targetCol.colId
        || f.col.key === ctx.targetCol.key
        || f.key === ctx.targetCol.colId
        || f.key === ctx.targetCol.key
      ) || null,
      {
        applyModel: (colId, model, meta) => {
          if (model === null) {
            this.core.removeFilterModel(colId);
            return;
          }
          this.core.addFilterModel(model);
        },
        getAllRows: this.core.getRowModel().forEachNode.bind(rowModel),        // for setFilter fromRows
        treeExpansion: panelSpec.tree ? this.treeExpansionFor(ctx.targetCol) : undefined,
      },
    );

    let menuRenderer: MenuRenderer | undefined;
    const renderer = new FilterRenderer(ctrl, panelSpec, this.api, () => menuRenderer?.close(0));

    return {
      contentEl: renderer.getUi(),
      onOpen: (r) => {
        menuRenderer = r;
        renderer.onOpen();
      },
      onClose: () => renderer.destroy(),
    };
  }

}
