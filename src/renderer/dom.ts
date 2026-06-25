import { MenuCoordinator } from "../menu/coordinator";
import { GridCore } from "../core/core";
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
): GridRenderer {
  const menuSvc = new ColumnMenuService(core);
  const filterSvc = new ColumnFilterMenuService(core);
  const renderer = new GridRenderer(
    core as GridCore,
    new MenuCoordinator(menuSvc, adapter),
    new FilterMenuCoordinator(core as GridCore, filterSvc),
    (exporter, clipboard) => new BodyMenuCoordinator(
      new BodyMenuService({ core, exporter, clipboard }),
      bodyAdapter,
    ),
  );
  return renderer;
}
