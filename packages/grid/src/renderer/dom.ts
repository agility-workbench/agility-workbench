import { MenuCoordinator } from "../menu/coordinator";
import { GridCore } from "../core/core";
import { GridAPI } from "../api";
import { GridRenderer } from "./gridRenderer";
import { ColumnMenuService } from "../menu/columnMenuService";
import type { IBodyMenuAdapter, IMenuAdapter } from "../interfaces";
import { ColumnFilterMenuService } from "../filter/filterMenuService";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { BodyMenuCoordinator } from "../menu/bodyMenuCoordinator";
import { BodyMenuService } from "../menu/bodyMenuService";

const noopBodyAdapter: IBodyMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

export function initDomRenderer(
  core: GridCore,
  adapter: IMenuAdapter,
  bodyAdapter: IBodyMenuAdapter = noopBodyAdapter,
): { renderer: GridRenderer; api: GridAPI } {
  const menuSvc = new ColumnMenuService(core);
  const filterSvc = new ColumnFilterMenuService(core);
  // Single API instance for the grid: injected into the renderer (cell renderers
  // receive it via CellRendererParams) and returned to the host wrapper.
  const api = new GridAPI(core);
  const renderer = new GridRenderer(
    core as GridCore,
    api,
    new MenuCoordinator(menuSvc, adapter),
    new FilterMenuCoordinator(core as GridCore, filterSvc),
    (exporter, clipboard, pinning) => new BodyMenuCoordinator(
      new BodyMenuService({ core, exporter, clipboard, pinning }),
      bodyAdapter,
      core,
    ),
  );
  return { renderer, api };
}
