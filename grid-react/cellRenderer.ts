import React from "react";
import { createRoot, Root } from "react-dom/client";
import type { ColDef } from "@grid";
import type {
  CellRenderer,
  CellRendererClass,
  CellRendererParams,
  ICellRenderer,
} from "@grid/renderer/renderer";
import { isClassRenderer } from "@grid/renderer/renderer";

export type ReactCellRenderer =
  | React.ComponentType<CellRendererParams>
  | React.ExoticComponent<CellRendererParams>;

export type ReactColDef = Omit<ColDef, "cellRenderer" | "children"> & {
  cellRenderer?: CellRenderer | ReactCellRenderer;
  children?: ReactColDef[];
};

const reactRendererCache = new WeakMap<object, CellRendererClass>();

function isObjectRenderer(renderer: unknown): renderer is object {
  return (typeof renderer === "function" || typeof renderer === "object") && renderer !== null;
}

function getRendererProps(params: CellRendererParams): CellRendererParams {
  const extraParams = params.colDef.cellRendererParams;
  if (extraParams == null || typeof extraParams !== "object") return params;
  return { ...params, ...extraParams };
}

function createReactRendererClass(Renderer: ReactCellRenderer): CellRendererClass {
  return class ReactCellRendererAdapter implements ICellRenderer {
    private el = document.createElement("span");
    private root: Root | null = null;

    init(params: CellRendererParams): void {
      this.el.style.display = "inline-flex";
      this.el.style.alignItems = "center";
      this.el.style.width = "100%";
      this.el.style.height = "100%";
      this.el.style.overflow = "hidden";
      this.root = createRoot(this.el);
      this.render(params);
    }

    getGui(): HTMLElement {
      return this.el;
    }

    refresh(params: CellRendererParams): boolean {
      this.render(params);
      return true;
    }

    destroy(): void {
      this.root?.unmount();
      this.root = null;
    }

    private render(params: CellRendererParams): void {
      this.root?.render(React.createElement(Renderer, getRendererProps(params)));
    }
  };
}

function adaptCellRenderer(renderer: ReactColDef["cellRenderer"]): CellRenderer | undefined {
  if (!renderer) return undefined;
  if (typeof renderer === "function" && isClassRenderer(renderer as CellRenderer)) {
    return renderer as CellRenderer;
  }
  if (!isObjectRenderer(renderer)) return renderer as CellRenderer;

  const cached = reactRendererCache.get(renderer);
  if (cached) return cached;

  const adapted = createReactRendererClass(renderer as ReactCellRenderer);
  reactRendererCache.set(renderer, adapted);
  return adapted;
}

export function adaptReactColumnDefs(columnDefs?: ReactColDef[] | null): ColDef[] | null | undefined {
  if (columnDefs == null) return columnDefs;

  return columnDefs.map((colDef) => {
    const next: ColDef = {
      ...colDef,
      cellRenderer: adaptCellRenderer(colDef.cellRenderer),
      children: colDef.children ? adaptReactColumnDefs(colDef.children) ?? undefined : undefined,
    };
    return next;
  });
}
