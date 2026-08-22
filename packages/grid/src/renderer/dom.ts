import { MenuCoordinator } from "../menu/coordinator";
import { GridCore } from "../core/core";
import { GridAPI } from "../api";
import { GridRenderer } from "./gridRenderer";
import { ColumnMenuService } from "../menu/columnMenuService";
import type { IBodyMenuAdapter, IMenuAdapter, MenuItem } from "../interfaces";
import type { ColumnMenuContext } from "../menu/context";
import type { BodyMenuContext } from "../menu/bodyContext";
import { ColumnFilterMenuService } from "../filter/filterMenuService";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { BodyMenuCoordinator } from "../menu/bodyMenuCoordinator";
import { BodyMenuService } from "../menu/bodyMenuService";

/** The shape both menu adapters share, differing only in the context they are handed. */
interface AdapterLike<Ctx> {
  resolveMenuItems(ctx: Ctx, defaults: MenuItem[]): { items: MenuItem[]; cleanup: () => void };
}

/**
 * A menu-adapter slot whose occupant can change after the grid is built.
 *
 * Both coordinators take their adapter as a constructor argument, and the body coordinator is
 * built lazily inside the renderer, so neither can be re-pointed once constructed. The coordinators
 * therefore hold this stable delegate and the swappable part is what it forwards to — which is what
 * lets `api.registerMenuAdapter` work on a mounted grid.
 *
 * An empty slot passes the defaults straight through. Menu adapters exist so framework bindings can
 * splice framework-rendered items into the menus the core builds; a plain-DOM host has nothing to
 * splice and wants the built-in items verbatim.
 */
function adapterSlot<Ctx>(initial?: AdapterLike<Ctx>): {
  adapter: AdapterLike<Ctx>;
  set: (next: AdapterLike<Ctx> | null) => void;
} {
  let current: AdapterLike<Ctx> | null = initial ?? null;
  return {
    // Resolved per menu open, so a swap takes effect on the next open with no rebuild. A menu that
    // is already open keeps the cleanup handed out by the adapter that produced its items.
    adapter: {
      resolveMenuItems: (ctx, defaults) => current
        ? current.resolveMenuItems(ctx, defaults)
        : { items: defaults, cleanup: () => undefined },
    },
    set: (next) => { current = next; },
  };
}

/**
 * Build a DOM renderer and API pair for `core`.
 *
 * Both adapters are optional: omitting them yields the grid's built-in column and
 * body menus. Supply them to inject framework-owned menu items (the React and
 * Angular bindings do), or install them later via `api.registerMenuAdapter` /
 * `api.registerBodyMenuAdapter`.
 *
 * Applications should prefer `createGrid`, which owns this assembly along with attachment
 * and teardown, and accepts both adapters as options.
 */
export function initDomRenderer(
  core: GridCore,
  adapter?: IMenuAdapter,
  bodyAdapter?: IBodyMenuAdapter,
): { renderer: GridRenderer; api: GridAPI } {
  const menuSvc = new ColumnMenuService(core);
  const filterSvc = new ColumnFilterMenuService(core);
  const menuSlot = adapterSlot<ColumnMenuContext>(adapter);
  const bodySlot = adapterSlot<BodyMenuContext>(bodyAdapter);
  // Single API instance for the grid: injected into the renderer (cell renderers
  // receive it via CellRendererParams) and returned to the host wrapper.
  const api = new GridAPI(core);
  const renderer = new GridRenderer(
    core as GridCore,
    api,
    new MenuCoordinator(menuSvc, menuSlot.adapter, core),
    new FilterMenuCoordinator(core as GridCore, filterSvc, api),
    (exporter, clipboard, pinning) => new BodyMenuCoordinator(
      new BodyMenuService({ core, exporter, clipboard, pinning }),
      bodySlot.adapter,
      core,
    ),
  );
  // Wired here rather than from the renderer: the slots are owned by this assembly, and the
  // adapters are consulted only when a menu opens, so registration never depends on attachment.
  api.setMenuAdapterController({
    setMenuAdapter: (next) => menuSlot.set(next),
    setBodyMenuAdapter: (next) => bodySlot.set(next),
  });
  return { renderer, api };
}
