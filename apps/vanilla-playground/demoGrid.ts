import {
  CanvasMeasurer,
  GridCore,
  initDomRenderer,
  type ColDef,
  type GridOptions,
  type GridRenderer,
  type IGridAPI,
} from "@grid";
// The runtime-option slice is not re-exported from the package entry today, so this names it
// through its declaring module.
import type { RuntimeGridOptions } from "@grid/interfaces/gridOptions";

export interface MountGridOptions extends GridOptions {
  /** Column definitions. Omit to let the grid infer a schema from `rowData`. */
  columnDefs?: ColDef[];
  /** Initial rows. */
  rowData?: unknown[];
}

export interface MountedGrid {
  core: GridCore;
  renderer: GridRenderer;
  api: IGridAPI;
  /** Tears down renderer + core + api, in that order. Safe to call twice. */
  destroy(): void;
}

/**
 * Mount a grid and keep the renderer handle.
 *
 * Most demos here should — and do — use the one-call `createGrid(container, options)` from
 * `@agility-workbench/grid`: it is the supported entry point for an application with no framework
 * binding, and it returns the `IGridAPI`.
 *
 * A handful of these demos exist specifically to change *renderer-owned* configuration after
 * mount — toolbar sections, quick-filter layout, tooltip mode, pinned-row bands, theme vars, the
 * runtime interaction options. Those live on `GridRenderer` (`setToolbarOptions`,
 * `setQuickFilterOptions`, `setRuntimeOptions`, …), which is the same seam the React and Angular
 * bindings drive, and it is reachable only from `initDomRenderer`. This helper is that seam, and
 * nothing more: it repeats what `createGrid` does internally and hands back all three objects.
 *
 * Menu adapters are omitted deliberately: `initDomRenderer` defaults them to pass-throughs that
 * yield the grid's own items, and per-column `columnMenu` / grid-level `bodyContextMenu` options
 * already cover application-contributed items without an adapter.
 */
export function mountGrid(container: HTMLElement, options: MountGridOptions = {}): MountedGrid {
  const { columnDefs, rowData, ...gridOptions } = options;

  const core = new GridCore(new CanvasMeasurer(), gridOptions);
  const { renderer, api } = initDomRenderer(core);

  renderer.attach(container);
  core.dispatch({ type: "init" });

  // `setColumnDefsFromProps` (not the `columnDefsSet` action) marks the schema as caller-owned, so
  // a later `setRowData` cannot replace these definitions with an inferred schema.
  if (columnDefs != null) core.setColumnDefsFromProps(columnDefs);
  if (rowData != null) api.setRowData(rowData as any[]);

  let destroyed = false;
  return {
    core,
    renderer,
    api,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Each step is guarded so one failure cannot strand the rest.
      try { renderer.detach(); } catch { /* keep tearing down */ }
      try { renderer.destroy(); } catch { /* keep tearing down */ }
      try { core.destroy(); } catch { /* keep tearing down */ }
      try { api.destroy(); } catch { /* keep tearing down */ }
    },
  };
}

const RUNTIME_OPTION_KEYS = [
  "rowHover", "columnHover", "zebraRows", "getRowClass", "getRowStyle", "getRowPresentation",
  "ariaLabel", "ariaLabelledBy", "highlightActiveCell", "cellSelection", "rangeSelection",
  "columnSelection", "showColumnButtonsOnHover", "bodyContextMenu", "editTrigger", "readOnlyEdit",
  "pinnedRowsEditable", "rowPinningMenu", "rowInsertionMenu", "suppressKeyboardEdit",
  "suppressTypeToEdit", "moveAfterEdit", "commitOnBlur", "asyncTransactionWaitMs",
] as const satisfies readonly (keyof RuntimeGridOptions)[];

/**
 * Change one or more runtime options without disturbing the rest.
 *
 * `renderer.setRuntimeOptions` takes the complete slice — a missing key reads as "set this to
 * undefined", which would drop a default. The framework bindings always pass the full set because
 * they own every value as a prop; a plain-JS host does not, so this reads the current resolved
 * values off the core and layers the overrides on top.
 */
export function setRuntimeOptions(grid: MountedGrid, overrides: Partial<RuntimeGridOptions>): void {
  const current = {} as Record<string, unknown>;
  const resolved = grid.core.options as unknown as Record<string, unknown>;
  for (const key of RUNTIME_OPTION_KEYS) current[key] = resolved[key];
  grid.renderer.setRuntimeOptions({ ...current, ...overrides } as RuntimeGridOptions);
}
