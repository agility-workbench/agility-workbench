import { GridCore } from "../core/core";
import { ColumnFilterContext } from "./context";
import { ColumnFilterMenuService } from "./filterMenuService";
import { FilterController } from "./filterMenuController";
import { FilterRenderer } from "../renderer/filter/filterRenderer";
import { MenuRenderer } from "../renderer/menuRenderer";
import type { IGridAPI } from "../interfaces/iGridAPI";

export class FilterMenuCoordinator {
  constructor(
    private core: GridCore,
    private filterMenuService: ColumnFilterMenuService,
    private api: IGridAPI,
  ) { }

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
      },
    );

    const renderer = new FilterRenderer(ctrl, panelSpec, this.api);

    return {
      contentEl: renderer.getUi(),
      onOpen: (r) => renderer.onOpen(),
      onClose: () => renderer.destroy(),
    };
  }

}
