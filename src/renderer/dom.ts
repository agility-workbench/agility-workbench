import { MenuCoordinator } from "../menu/coordinator";
import { GridCore } from "../core/core";
import { GridRenderer } from "./domRenderer";
import { ColumnMenuService } from "../menu/columnMenuService";
import type { IMenuAdapter } from "../interfaces";
import { ColumnFilterMenuService } from "../filter/filterMenuService";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";

export function initDomRenderer(core: GridCore, adapter: IMenuAdapter): GridRenderer {
  const menuSvc = new ColumnMenuService(core);
  const filterSvc = new ColumnFilterMenuService(core);
  const renderer = new GridRenderer(
    core as GridCore,
    new MenuCoordinator(menuSvc, adapter),
    new FilterMenuCoordinator(core as GridCore, filterSvc),
  );
  return renderer;
}
