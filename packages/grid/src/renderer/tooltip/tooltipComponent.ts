import { Column } from "../../column/column";
import { IGridAPI } from "../../interfaces/iGridAPI";

/**
 * Custom tooltip components let a column (or the grid default) render arbitrary content inside the
 * floating tooltip attached to a cell or header. The contract mirrors the cell renderer
 * (`ICellRenderer`) and header component (`IHeaderComponent`): a function form is re-invoked to
 * refresh, a class form gets `init/getGui/refresh/destroy`.
 *
 * Content resolution precedence for a body cell (computed by the tooltip renderer):
 *   tooltipComponent → tooltipValueGetter → tooltipField → auto-truncation (the cell's own full text
 *   when it is clipped). Grid-wide defaults for any of these come from `defaultColDef`, merged onto
 *   the column before resolution.
 */
export interface TooltipComponentParams {
  /** Raw cell value (body tooltips). Undefined for header tooltips. */
  value?: any;
  /** Formatted display value (body tooltips). Undefined for header tooltips. */
  valueFormatted?: any;
  /** The full row data (body tooltips). Undefined for header tooltips. */
  data?: any;
  /** Row id (body tooltips). */
  rowId?: string;
  /** Row index (body tooltips). */
  rowIndex?: number;
  /** The runtime column this tooltip belongs to. */
  colDef: Column;
  /** Where the tooltip is anchored. */
  location: "body" | "header";
  /** The grid API. */
  api: IGridAPI;
  /** Dismiss the tooltip (useful for interactive tooltips with a close control). */
  hide: () => void;
  /** Scalar content resolved independently from the component (column → row → default → clipped). */
  content?: string | number;
  /** Which layer supplied {@link content}. */
  contentSource?: "column" | "row" | "default" | "truncation";
  /** Resolved row defaults and opaque metadata, when configured. */
  rowPresentation?: import("../../interfaces/gridOptions").RowPresentation;
  /** Extra params from `colDef.tooltipComponentParams`, spread in by the React adapter. */
  [key: string]: any;
}

export type TooltipComponentFn = (p: TooltipComponentParams) =>
  | string
  | number
  | null
  | undefined
  | HTMLElement;

export interface ITooltipComponent {
  /** Called once when the component is created. */
  init: (params: TooltipComponentParams) => void;
  /** Must return the root element mounted into the tooltip. */
  getGui: () => HTMLElement;
  /** Called on updates; return true if updated in place, false to have the grid recreate it. */
  refresh: (params: TooltipComponentParams) => boolean;
  destroy: () => void;
}

export type TooltipComponentClass = new () => ITooltipComponent;

export type TooltipComponent = TooltipComponentFn | TooltipComponentClass;

export function isClassTooltipComponent(c: TooltipComponent): c is TooltipComponentClass {
  // Same heuristic as isClassRenderer/isClassHeaderComponent: class components carry init/getGui on
  // the prototype.
  return (
    typeof c === "function" &&
    !!(c as any).prototype &&
    typeof (c as any).prototype.init === "function" &&
    typeof (c as any).prototype.getGui === "function"
  );
}

export type TooltipComponentRuntime = {
  /** Root element mounted into the tooltip overlay. */
  gui: HTMLElement;
  /** Refresh with new params; true => updated in place, false => caller should recreate. */
  refresh(p: TooltipComponentParams): boolean;
  destroy(): void;
};

function createFnRuntime(fn: TooltipComponentFn, p: TooltipComponentParams): TooltipComponentRuntime {
  const root = document.createElement("div");
  root.className = "pte-tooltip-custom-root";

  let childEl: HTMLElement | null = null;

  const apply = (res: ReturnType<TooltipComponentFn>) => {
    if (res instanceof HTMLElement) {
      if (childEl !== res) {
        root.replaceChildren(res);
        childEl = res;
      }
      return;
    }
    childEl = null;
    root.textContent = res == null ? "" : String(res);
  };

  apply(fn(p));

  return {
    gui: root,
    refresh(p2) {
      apply(fn(p2));
      return true;
    },
    destroy() {
      // no-op, kept for symmetry with the class runtime
    },
  };
}

function createClassRuntime(Ctor: TooltipComponentClass, p: TooltipComponentParams): TooltipComponentRuntime {
  const comp = new Ctor();
  comp.init(p);
  return {
    gui: comp.getGui(),
    refresh: (p2) => (comp.refresh ? comp.refresh(p2) : false),
    destroy: () => comp.destroy?.(),
  };
}

export function createTooltipComponentRuntime(c: TooltipComponent, p: TooltipComponentParams): TooltipComponentRuntime {
  if (isClassTooltipComponent(c)) {
    return createClassRuntime(c, p);
  }
  return createFnRuntime(c, p);
}
