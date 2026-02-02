import { MenuCoordinator } from "../menu/coordinator";
import { GridCore } from "../core/core";
import { GridRenderer } from "./domRenderer";
import { ColumnMenuService } from "../menu/columnMenuService";
import type { IGridCore, IMenuAdapter } from "../interfaces";

export function initDomRenderer(core: IGridCore, adapter: IMenuAdapter): GridRenderer {
  const menuSvc = new ColumnMenuService(core);
  const renderer = new GridRenderer(core as GridCore, new MenuCoordinator(menuSvc, adapter));
  return renderer;
}
