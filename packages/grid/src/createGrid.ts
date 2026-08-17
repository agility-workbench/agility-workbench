import { GridCore } from "./core/core";
import type { ColDef } from "./interfaces/column";
import type { GridOptions } from "./interfaces/gridOptions";
import type { IGridAPI } from "./interfaces/iGridAPI";
import { CanvasMeasurer, initDomRenderer } from "./renderer";

/**
 * Everything `createGrid` accepts: the core's `GridOptions`, plus the two pieces of grid
 * content the framework bindings expose as props rather than options.
 */
export interface CreateGridOptions extends GridOptions {
  /** Column definitions. Omit to let the grid infer a schema from `rowData`. */
  columnDefs?: ColDef[];
  /** Initial rows. Equivalent to calling `api.setRowData(rows)` after creation. */
  rowData?: unknown[];
}

/**
 * Create, mount, and start a grid inside `container`, returning its API.
 *
 * This is the one-call entry point for applications with no framework binding. It owns the
 * whole assembly a host would otherwise repeat by hand — text measurer, core, DOM renderer,
 * both menu adapters, attachment, and the `init` dispatch — so a plain-JS or plain-TS host
 * writes one statement:
 *
 * ```ts
 * const api = createGrid(document.querySelector("#grid")!, {
 *   columnDefs: [{ key: "name", label: "Name" }],
 *   rowData: [{ name: "Widget" }],
 * });
 * ```
 *
 * The container must have an explicit height, exactly as with the framework bindings.
 *
 * The returned `api.destroy()` tears down the entire instance, unlike the bare `GridAPI`
 * returned by `initDomRenderer`, whose `destroy` does not detach the renderer.
 *
 * Menus use the grid's built-in items. To contribute application- or framework-owned menu
 * items, drop to `initDomRenderer(core, menuAdapter, bodyMenuAdapter)` and drive the
 * lifecycle directly — that is the seam the React and Angular bindings use.
 */
export function createGrid(container: HTMLElement, options: CreateGridOptions = {}): IGridAPI {
  if (container == null) {
    throw new Error("createGrid: a container element is required.");
  }

  const { columnDefs, rowData, ...gridOptions } = options;

  const core = new GridCore(new CanvasMeasurer(), gridOptions);
  // Both adapters are omitted deliberately: initDomRenderer defaults them to pass-throughs
  // that yield the grid's own menu items, which is what a host without a framework wants.
  const { renderer, api } = initDomRenderer(core);

  renderer.attach(container);
  core.dispatch({ type: "init" });

  // `setColumnDefsFromProps` (not the `columnDefsSet` action) is what the React and Angular
  // bindings call: it marks the schema as caller-owned, so a later `setRowData` cannot have
  // its inferred schema replace these definitions.
  if (columnDefs != null) core.setColumnDefsFromProps(columnDefs);
  if (rowData != null) api.setRowData(rowData);

  // `destroy` is the only teardown handle a createGrid caller holds, but `GridAPI.destroy()`
  // on its own leaves the renderer attached and the core alive. Shadowing the prototype
  // method with an own property means every reference to this api — including the one passed
  // to cell renderers — tears the whole instance down, exactly once. Teardown steps are
  // individually guarded so one failure cannot strand the rest, mirroring the React binding.
  const destroyApi = api.destroy.bind(api);
  let destroyed = false;
  api.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    try {
      renderer.detach();
    } catch { /* keep tearing down */ }
    try {
      renderer.destroy();
    } catch { /* keep tearing down */ }
    try {
      core.destroy();
    } catch { /* keep tearing down */ }
    try {
      destroyApi();
    } catch { /* keep tearing down */ }
  };

  return api;
}
