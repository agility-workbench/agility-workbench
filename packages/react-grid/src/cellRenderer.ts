import React from "react";
import { createRoot, Root } from "react-dom/client";
import type { ColDef } from "@agility-workbench/grid";
import type {
  CellRenderer,
  CellRendererClass,
  CellRendererParams,
  ICellRenderer,
} from "@agility-workbench/grid";
import { isClassRenderer } from "@agility-workbench/grid";
import { isClassTooltipComponent } from "@agility-workbench/grid";
import type {
  TooltipComponent,
  TooltipComponentClass,
  TooltipComponentParams,
  ITooltipComponent,
} from "@agility-workbench/grid";
import { isClassActionFrameComponent } from "@agility-workbench/grid";
import type {
  ActionFrameComponent,
  ActionFrameComponentClass,
  ActionFrameComponentParams,
  IActionFrameComponent,
} from "@agility-workbench/grid";
import type { CellEditor } from "@agility-workbench/grid";
import { adaptCellEditor, ReactCellEditor } from "./cellEditor";

export type ReactCellRenderer =
  | React.ComponentType<CellRendererParams>
  | React.ExoticComponent<CellRendererParams>;

export type ReactTooltipComponent =
  | React.ComponentType<TooltipComponentParams>
  | React.ExoticComponent<TooltipComponentParams>;

export type ReactActionFrameComponent =
  | React.ComponentType<ActionFrameComponentParams>
  | React.ExoticComponent<ActionFrameComponentParams>;

export type ReactColDef = Omit<
  ColDef,
  "cellRenderer" | "cellEditor" | "children" | "tooltipComponent" | "headerTooltip" | "actionFrameComponent"
> & {
  cellRenderer?: CellRenderer | ReactCellRenderer;
  cellEditor?: CellEditor | ReactCellEditor;
  tooltipComponent?: TooltipComponent | ReactTooltipComponent;
  headerTooltip?: string | TooltipComponent | ReactTooltipComponent;
  actionFrameComponent?: ActionFrameComponent | ReactActionFrameComponent;
  children?: ReactColDef[];
};

const reactRendererCache = new WeakMap<object, CellRendererClass>();
const reactTooltipCache = new WeakMap<object, TooltipComponentClass>();
const reactActionFrameCache = new WeakMap<object, ActionFrameComponentClass>();

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

export function adaptCellRenderer(renderer: CellRenderer | ReactCellRenderer | undefined): CellRenderer | undefined {
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

function getTooltipProps(params: TooltipComponentParams): TooltipComponentParams {
  const extraParams = params.colDef?.tooltipComponentParams;
  if (extraParams == null || typeof extraParams !== "object") return params;
  return { ...params, ...extraParams };
}

function createReactTooltipClass(Comp: ReactTooltipComponent): TooltipComponentClass {
  return class ReactTooltipAdapter implements ITooltipComponent {
    private el = document.createElement("div");
    private root: Root | null = null;

    init(params: TooltipComponentParams): void {
      // A single createRoot lives for the life of this tooltip instance; refresh re-renders into it
      // rather than remounting, so interactive content keeps its React state across repositions.
      this.root = createRoot(this.el);
      this.render(params);
    }

    getGui(): HTMLElement {
      return this.el;
    }

    refresh(params: TooltipComponentParams): boolean {
      this.render(params);
      return true;
    }

    destroy(): void {
      this.root?.unmount();
      this.root = null;
    }

    private render(params: TooltipComponentParams): void {
      this.root?.render(React.createElement(Comp, getTooltipProps(params)));
    }
  };
}

export function adaptTooltip(
  comp: TooltipComponent | ReactTooltipComponent | undefined,
): TooltipComponent | undefined {
  if (!comp) return undefined;
  if (typeof comp === "function" && isClassTooltipComponent(comp as TooltipComponent)) {
    return comp as TooltipComponent;
  }
  if (!isObjectRenderer(comp)) return comp as TooltipComponent;

  const cached = reactTooltipCache.get(comp);
  if (cached) return cached;

  const adapted = createReactTooltipClass(comp as ReactTooltipComponent);
  reactTooltipCache.set(comp, adapted);
  return adapted;
}

/** headerTooltip may be a plain string (pass through) or a component (adapt like a tooltip). */
function adaptHeaderTooltip(
  ht: string | TooltipComponent | ReactTooltipComponent | undefined,
): string | TooltipComponent | undefined {
  if (ht == null || typeof ht === "string") return ht;
  return adaptTooltip(ht);
}

function getActionFrameProps(params: ActionFrameComponentParams): ActionFrameComponentParams {
  const extraParams = params.colDef?.actionFrameComponentParams;
  if (extraParams == null || typeof extraParams !== "object") return params;
  return { ...params, ...extraParams };
}

function createReactActionFrameClass(Comp: ReactActionFrameComponent): ActionFrameComponentClass {
  return class ReactActionFrameAdapter implements IActionFrameComponent {
    private el = document.createElement("div");
    private root: Root | null = null;

    init(params: ActionFrameComponentParams): void {
      // One createRoot for the life of the open frame; refresh re-renders into it so the form keeps
      // its React state across repositions (scroll tracking calls reposition, not remount).
      this.root = createRoot(this.el);
      this.render(params);
    }

    getGui(): HTMLElement {
      return this.el;
    }

    refresh(params: ActionFrameComponentParams): boolean {
      this.render(params);
      return true;
    }

    destroy(): void {
      this.root?.unmount();
      this.root = null;
    }

    private render(params: ActionFrameComponentParams): void {
      this.root?.render(React.createElement(Comp, getActionFrameProps(params)));
    }
  };
}

export function adaptActionFrame(
  comp: ActionFrameComponent | ReactActionFrameComponent | undefined,
): ActionFrameComponent | undefined {
  if (!comp) return undefined;
  if (typeof comp === "function" && isClassActionFrameComponent(comp as ActionFrameComponent)) {
    return comp as ActionFrameComponent;
  }
  if (!isObjectRenderer(comp)) return comp as ActionFrameComponent;

  const cached = reactActionFrameCache.get(comp);
  if (cached) return cached;

  const adapted = createReactActionFrameClass(comp as ReactActionFrameComponent);
  reactActionFrameCache.set(comp, adapted);
  return adapted;
}

export function adaptReactColumnDefs(columnDefs?: ReactColDef[] | null): ColDef[] | null | undefined {
  if (columnDefs == null) return columnDefs;

  return columnDefs.map((colDef) => {
    const next: ColDef = {
      ...colDef,
      cellRenderer: adaptCellRenderer(colDef.cellRenderer),
      cellEditor: adaptCellEditor(colDef.cellEditor),
      tooltipComponent: adaptTooltip(colDef.tooltipComponent),
      headerTooltip: adaptHeaderTooltip(colDef.headerTooltip),
      actionFrameComponent: adaptActionFrame(colDef.actionFrameComponent),
      children: colDef.children ? adaptReactColumnDefs(colDef.children) ?? undefined : undefined,
    };
    return next;
  });
}
