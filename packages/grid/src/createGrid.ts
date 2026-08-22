import { GridCore } from "./core/core";
import type { ColDef } from "./interfaces/column";
import type { GridOptions } from "./interfaces/gridOptions";
import type { IBodyMenuAdapter } from "./interfaces/iBodyMenuAdapter";
import type { IGridAPI } from "./interfaces/iGridAPI";
import type { IMenuAdapter } from "./interfaces/iMenuAdapter";
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
  /**
   * Column-menu adapter, for menu items a framework renders and must later unmount. Omit to get the
   * grid's built-in items. Equivalent to `api.registerMenuAdapter(adapter)` right after creation —
   * see that method for when an adapter is the right tool rather than `ColDef.columnMenu`.
   *
   * This is not a `GridOption`: it is an assembly ingredient (like `columnDefs`), not state the
   * core owns, so it is neither carried by the core nor reachable through `updateGridOptions`.
   */
  menuAdapter?: IMenuAdapter;
  /** Body context-menu adapter. The `bodyContextMenu` counterpart of `menuAdapter`. */
  bodyMenuAdapter?: IBodyMenuAdapter;
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
 * Menus use the grid's built-in items, extended by `ColDef.columnMenu`, `multiColumnMenu`, and
 * `bodyContextMenu`. Hosts that render menu items with a framework can pass `menuAdapter` /
 * `bodyMenuAdapter` here, or install them later with `api.registerMenuAdapter` /
 * `api.registerBodyMenuAdapter`.
 */
export function createGrid(container: HTMLElement, options: CreateGridOptions = {}): IGridAPI {
  if (container == null) {
    throw new Error("createGrid: a container element is required.");
  }

  // The four non-GridOptions ingredients are separated here so the core is handed grid options
  // only — an adapter or a column-def array on the options object it carries would be meaningless.
  const { columnDefs, rowData, menuAdapter, bodyMenuAdapter, ...gridOptions } = options;

  const core = new GridCore(new CanvasMeasurer(), gridOptions);
  // Omitted adapters leave their slot empty, which yields the grid's own menu items — what a host
  // without a framework wants, and what `api.registerMenuAdapter(null)` restores.
  const { renderer, api } = initDomRenderer(core, menuAdapter, bodyMenuAdapter);

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
