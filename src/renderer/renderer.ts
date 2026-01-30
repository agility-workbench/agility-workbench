import { Column } from "../column/Column";

export interface CellRendererParams {
  value: any;
  valueFormatted?: any;
  data: any;
  rowIndex: number;
  colDef: Column;
  api: any;
  eCell: HTMLElement;
}

export type CellRendererFn = (p: CellRendererParams) =>
  | string
  | number
  | boolean
  | null
  | undefined
  | HTMLElement;

export interface ICellRenderer {
  /** called once when the renderer is created */
  init: (params: CellRendererParams) => void;
  /** must return the root element to be mounted into the cell */
  getGui: () => HTMLElement;
  /**
   * called on updates; return true if you updated in-place.
   * return false => grid will destroy + recreate the renderer.
   */
  refresh: (params: CellRendererParams) => boolean;
  destroy: () => void;
};

export type CellRendererClass = new () => ICellRenderer;

// --- Unified: what colDef.cellRenderer can accept ---
export type CellRenderer = CellRendererFn | CellRendererClass;

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
  value: any, formattedValue: any, row: any, rowIndex: number, col: Column, eCell: HTMLElement, api: any,
): CellRendererParams {
  return {
    value: value,
    valueFormatted: formattedValue,
    data: row,
    rowIndex: rowIndex,
    colDef: col,
    api: api,
    eCell: eCell
  };
}
