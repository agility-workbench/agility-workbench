import { Column } from "../column/column";
import { IGridAPI } from "../interfaces/iGridAPI";
import type { IRowNode } from "../interfaces/iRowNode";
import {
  registerRendererTooltipTarget,
} from "./tooltip/rendererTooltipTarget";

/**
 * Why refresh() is being called. The grid is renderer-agnostic, so it cannot
 * decide whether a given change matters to a renderer — it just reports the
 * reason and each renderer opts in as needed. "data" covers value/row changes;
 * "resize" is fired when the cell's column width changed (e.g. a renderer that
 * draws to pixel dimensions must remeasure).
 */
export type CellRefreshReason = "data" | "resize";

/**
 * What a cell renderer receives. `TData` is the row type (default `any`); it types `node` and
 * `api`.
 */
export interface CellRendererParams<TData = any> {
  value: any;
  valueFormatted?: any;
  /**
   * On a column cell (leaf or group row) this is the row NODE, the same object as `node`; on a
   * full-width row (`fullWidthCellRenderer`) it is the row's data object. Typed `any` for that
   * reason — read the typed row off `node.data`.
   */
  data: any;
  rowId: string;
  rowIndex: number;
  colDef: Column;
  api: IGridAPI<TData>;
  eCell: HTMLElement;
  /**
   * Register an element inside this renderer as a tooltip target. The grid owns tooltip timing,
   * positioning, styling, and teardown; the renderer supplies the target, its text, and optionally
   * a different element to anchor the floating tooltip to.
   * Call the returned cleanup function before discarding the target.
   */
  registerTooltipTarget: (
    target: Element,
    getContent: () => string | number | null | undefined,
    anchor?: Element,
  ) => () => void;
  /** Why the renderer is being (re)invoked. Defaults to "data". */
  refreshReason?: CellRefreshReason;
  /**
   * The full row node, populated on every path: per-column leaf and group cells, and full-width
   * rows (which have no owning column), so a renderer can read group metadata / level.
   */
  node?: IRowNode<TData>;
  /**
   * True on a group row (row grouping, pivot, server-side groups), false on a leaf. On a group row
   * `value` is the group cell value (the column's aggregate, or its `groupValueGetter` result) and
   * `data` is the group node, whose own `data` is a placeholder client-side. A pooled renderer
   * instance is refreshed across leaf ↔ group transitions; return `false` from `refresh` to have it
   * rebuilt instead.
   */
  isGroup?: boolean;
  /** Resolved row defaults and metadata, when `getRowPresentation` is configured. */
  rowPresentation?: import("../interfaces/gridOptions").RowPresentation;
}

export type CellRendererFn<TData = any> = (p: CellRendererParams<TData>) =>
  | string
  | number
  | boolean
  | null
  | undefined
  | HTMLElement;

export interface ICellRenderer<TData = any> {
  /** called once when the renderer is created */
  init: (params: CellRendererParams<TData>) => void;
  /** must return the root element to be mounted into the cell */
  getGui: () => HTMLElement;
  /**
   * called on updates; return true if you updated in-place.
   * return false => grid will destroy + recreate the renderer.
   */
  refresh: (params: CellRendererParams<TData>) => boolean;
  destroy: () => void;
};

export type CellRendererClass<TData = any> = new () => ICellRenderer<TData>;

// --- Unified: what colDef.cellRenderer can accept ---
export type CellRenderer<TData = any> = CellRendererFn<TData> | CellRendererClass<TData>;

export function isClassRenderer(r: CellRenderer): r is CellRendererClass {
  // Heuristic: class renderers have init/getGui on prototype
  return (
    typeof r === "function" &&
    !!(r as any).prototype &&
    typeof (r as any).prototype.init === "function" &&
    typeof (r as any).prototype.getGui === "function"
  );
}

export type RuntimeRenderer = {
  gui: HTMLElement;                               // root mounted into cell
  refresh(p: CellRendererParams): boolean;        // true => updated, false => recreate
  destroy(): void;
};

export type RendererRecord = {
  renderer: CellRenderer;
  runtime: RuntimeRenderer;
};

function createFnRuntime(fn: CellRendererFn, p: CellRendererParams): RuntimeRenderer {
  const root = document.createElement("span");
  root.style.display = "inline-flex";
  root.style.alignItems = "center";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.overflow = "hidden";

  // Keep a reference if the renderer returns an element
  let childEl: HTMLElement | null = null;

  const apply = (res: any) => {
    if (res instanceof HTMLElement) {
      // If it's a new element, replace children
      if (childEl !== res) {
        root.textContent = "";
        root.replaceChildren(res);
        childEl = res;
      }
      return;
    }

    // Scalar / null => set text
    childEl = null;
    root.textContent = res == null ? "" : String(res);
  };

  // initial render
  apply(fn(p));

  return {
    gui: root,
    refresh(p2) {
      apply(fn(p2));
      return true;
    },
    destroy() {
      // no-op, but keep for symmetry
    },
  };
}

function createClassRuntime(Ctor: CellRendererClass, p: CellRendererParams) {
  const comp = new Ctor();
  comp.init(p);
  return {
    gui: comp.getGui(),
    refresh: (p2: CellRendererParams) => (comp.refresh ? comp.refresh(p2) : false),
    destroy: () => comp.destroy?.(),
  };
}

export function createRendererRuntime(r: CellRenderer, p: CellRendererParams): RuntimeRenderer {
  if (isClassRenderer(r)) {
    return createClassRuntime(r, p);
  }
  return createFnRuntime(r, p);
}

export function getCellRendererParams(
  value: any, formattedValue: any, row: any, rowIndex: number, col: Column, eCell: HTMLElement, api: IGridAPI,
  refreshReason: CellRefreshReason = "data",
  rowPresentation?: import("../interfaces/gridOptions").RowPresentation,
): CellRendererParams {
  return {
    value: value,
    valueFormatted: formattedValue,
    data: row,
    rowId: String(row?.id ?? rowIndex),
    rowIndex: rowIndex,
    colDef: col,
    api: api,
    eCell: eCell,
    registerTooltipTarget: registerRendererTooltipTarget,
    refreshReason: refreshReason,
    node: row,
    isGroup: !!row?.isGroup,
    rowPresentation,
  };
}
