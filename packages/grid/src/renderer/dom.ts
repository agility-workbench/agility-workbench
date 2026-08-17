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

// Menu adapters exist so framework bindings can splice framework-rendered items into
// the menus the core builds. A plain-DOM host has nothing to splice, so it wants the
// built-in items verbatim — passing the defaults straight through is the whole
// contract, and every no-framework example was hand-writing this exact object.
const passThroughMenuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

/**
 * Build a DOM renderer and API pair for `core`.
 *
 * Both adapters are optional: omitting them yields the grid's built-in column and
 * body menus. Supply them to inject framework-owned menu items (the React and
 * Angular bindings do).
 */
export function initDomRenderer(
  core: GridCore,
  adapter: IMenuAdapter = passThroughMenuAdapter,
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
    new FilterMenuCoordinator(core as GridCore, filterSvc, api),
    (exporter, clipboard, pinning) => new BodyMenuCoordinator(
      new BodyMenuService({ core, exporter, clipboard, pinning }),
      bodyAdapter,
      core,
    ),
  );
  return { renderer, api };
}
