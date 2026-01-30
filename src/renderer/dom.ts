import { MenuCoordinator } from "../menu/coordinator";
import { GridCore } from "../core/core";
import { GridRenderer } from "./dom_renderer";
import { MenuService } from "@grid/menu";
import type { IGridCore, IMenuAdapter } from "../interfaces";

export function initDomRenderer(core: IGridCore, adapter: IMenuAdapter): GridRenderer {
  const menuSvc = new MenuService(core);
  const renderer = new GridRenderer(core as GridCore, new MenuCoordinator(menuSvc, adapter));
  return renderer;
}
