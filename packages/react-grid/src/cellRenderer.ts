import React from "react";
import type {
  ColDef,
  DefaultColDef,
  FilterParams,
  RowPresentation,
  RowPresentationParams,
  RowTooltipPresentation,
} from "@agility-workbench/grid";
import { ManagedReactRoot } from "./managedReactRoot";
import type {
  CellRenderer,
  CellRendererClass,
  CellRendererParams,
  ICellRenderer,
  ISetFilterComponent,
  SetFilterComponent,
  SetFilterComponentClass,
  SetFilterSpecialValueComponent,
  SetFilterSpecialValueComponentParams,
  SetFilterValueComponent,
  SetFilterValueComponentParams,
} from "@agility-workbench/grid";
import {
  isClassRenderer,
  isClassSetFilterComponent,
  NON_DEFAULTABLE_COLDEF_KEYS,
} from "@agility-workbench/grid";
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

export type ReactRowTooltipPresentation = Omit<RowTooltipPresentation, "component"> & {
  component?: TooltipComponent | ReactTooltipComponent;
};

export type ReactRowPresentation = Omit<RowPresentation, "tooltip"> & {
  tooltip?: ReactRowTooltipPresentation | false | null;
};

export type ReactGetRowPresentation = (
  params: RowPresentationParams,
) => ReactRowPresentation | null | undefined;

export type ReactActionFrameComponent =
  | React.ComponentType<ActionFrameComponentParams>
  | React.ExoticComponent<ActionFrameComponentParams>;

export type ReactSetFilterValueComponent =
  | React.ComponentType<SetFilterValueComponentParams>
  | React.ExoticComponent<SetFilterValueComponentParams>;

export type ReactSetFilterSpecialValueComponent =
  | React.ComponentType<SetFilterSpecialValueComponentParams>
  | React.ExoticComponent<SetFilterSpecialValueComponentParams>;

export type ReactFilterParams = Omit<
  FilterParams,
  "valueComponent" | "selectAllComponent" | "blanksComponent"
> & {
  valueComponent?: SetFilterValueComponent | ReactSetFilterValueComponent;
  selectAllComponent?: SetFilterSpecialValueComponent | ReactSetFilterSpecialValueComponent;
  blanksComponent?: SetFilterSpecialValueComponent | ReactSetFilterSpecialValueComponent;
};

export type ReactColDef = Omit<
  ColDef,
  "cellRenderer" | "cellEditor" | "children" | "tooltipComponent" | "headerTooltip" | "actionFrameComponent" | "filterParams"
> & {
  cellRenderer?: CellRenderer | ReactCellRenderer;
  cellEditor?: CellEditor | ReactCellEditor;
  tooltipComponent?: TooltipComponent | ReactTooltipComponent;
  headerTooltip?: string | TooltipComponent | ReactTooltipComponent;
  actionFrameComponent?: ActionFrameComponent | ReactActionFrameComponent;
  filterParams?: ReactFilterParams;
  children?: ReactColDef[];
};

/**
 * React-aware shape of the grid-level `defaultColDef`: a {@link ReactColDef} minus the per-column
 * identity/structure fields that never inherit (see `NON_DEFAULTABLE_COLDEF_KEYS`). Mirrors core
 * `DefaultColDef`, but its component fields may be React components.
 */
export type ReactDefaultColDef = Omit<ReactColDef, (typeof NON_DEFAULTABLE_COLDEF_KEYS)[number]>;

const reactRendererCache = new WeakMap<object, CellRendererClass>();
const reactTooltipCache = new WeakMap<object, TooltipComponentClass>();
const reactActionFrameCache = new WeakMap<object, ActionFrameComponentClass>();
const reactSetFilterComponentCache = new WeakMap<object, SetFilterComponentClass<any>>();

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
    private root: ManagedReactRoot | null = null;

    init(params: CellRendererParams): void {
      this.el.style.display = "inline-flex";
      this.el.style.alignItems = "center";
      this.el.style.width = "100%";
      this.el.style.height = "100%";
      this.el.style.overflow = "hidden";
      this.root = new ManagedReactRoot(this.el);
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
      this.root?.destroy();
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
    private root: ManagedReactRoot | null = null;

    init(params: TooltipComponentParams): void {
      // A single createRoot lives for the life of this tooltip instance; refresh re-renders into it
      // rather than remounting, so interactive content keeps its React state across repositions.
      // Tooltip mounting is imperative: the floating layer measures getGui() in the same call stack.
      // Commit now so it never measures an empty React host and so a superseded root's deferred
      // unmount cannot race the initial render of the next tooltip.
      this.root = new ManagedReactRoot(this.el);
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
      this.root?.destroy();
      this.root = null;
    }

    private render(params: TooltipComponentParams): void {
      this.root?.renderSync(React.createElement(Comp, getTooltipProps(params)));
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

/** Adapt a React tooltip component returned dynamically by `getRowPresentation`. */
export function adaptReactGetRowPresentation(
  getter: ReactGetRowPresentation | undefined,
): ((params: RowPresentationParams) => RowPresentation | null | undefined) | undefined {
  if (!getter) return undefined;
  return (params) => {
    const presentation = getter(params);
    if (!presentation || typeof presentation.tooltip !== "object" || presentation.tooltip == null) {
      return presentation as RowPresentation | null | undefined;
    }
    return {
      ...presentation,
      tooltip: {
        ...presentation.tooltip,
        component: adaptTooltip(presentation.tooltip.component),
      },
    } as RowPresentation;
  };
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
    private root: ManagedReactRoot | null = null;

    init(params: ActionFrameComponentParams): void {
      // One createRoot for the life of the open frame; refresh re-renders into it so the form keeps
      // its React state across repositions (scroll tracking calls reposition, not remount).
      this.root = new ManagedReactRoot(this.el);
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
      this.root?.destroy();
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

function createReactSetFilterComponentClass<P extends object>(
  Component: React.ComponentType<P> | React.ExoticComponent<P>,
): SetFilterComponentClass<P> {
  return class ReactSetFilterComponentAdapter implements ISetFilterComponent<P> {
    private el = document.createElement("span");
    private root: ManagedReactRoot | null = null;

    init(params: P): void {
      this.root = new ManagedReactRoot(this.el);
      this.render(params);
    }

    getGui(): HTMLElement {
      return this.el;
    }

    refresh(params: P): boolean {
      this.render(params);
      return true;
    }

    destroy(): void {
      this.root?.destroy();
      this.root = null;
    }

    private render(params: P): void {
      this.root?.render(React.createElement(Component, params));
    }
  };
}

function adaptSetFilterComponent<P extends object>(
  component: SetFilterComponent<P> | React.ComponentType<P> | React.ExoticComponent<P> | undefined,
): SetFilterComponent<P> | undefined {
  if (!component) return undefined;
  if (
    typeof component === "function" &&
    isClassSetFilterComponent(component as SetFilterComponent<P>)
  ) {
    return component as SetFilterComponent<P>;
  }
  if (!isObjectRenderer(component)) return component as SetFilterComponent<P>;

  const cached = reactSetFilterComponentCache.get(component);
  if (cached) return cached as SetFilterComponentClass<P>;

  const adapted = createReactSetFilterComponentClass(
    component as React.ComponentType<P> | React.ExoticComponent<P>,
  );
  reactSetFilterComponentCache.set(component, adapted);
  return adapted;
}

function adaptReactFilterParams(filterParams: ReactFilterParams | undefined): FilterParams | undefined {
  if (!filterParams) return undefined;
  return {
    ...filterParams,
    valueComponent: adaptSetFilterComponent(filterParams.valueComponent),
    selectAllComponent: adaptSetFilterComponent(filterParams.selectAllComponent),
    blanksComponent: adaptSetFilterComponent(filterParams.blanksComponent),
  };
}

/**
 * Adapt the React-aware components carried by a single column def into their core equivalents. Used
 * for real column defs and, via {@link adaptReactDefaultColDef}, for the grid-level `defaultColDef`.
 */
export function adaptReactColDef(colDef: ReactColDef): ColDef {
  return {
    ...colDef,
    cellRenderer: adaptCellRenderer(colDef.cellRenderer),
    cellEditor: adaptCellEditor(colDef.cellEditor),
    tooltipComponent: adaptTooltip(colDef.tooltipComponent),
    headerTooltip: adaptHeaderTooltip(colDef.headerTooltip),
    actionFrameComponent: adaptActionFrame(colDef.actionFrameComponent),
    filterParams: adaptReactFilterParams(colDef.filterParams),
    children: colDef.children ? adaptReactColumnDefs(colDef.children) ?? undefined : undefined,
  };
}

export function adaptReactColumnDefs(columnDefs?: ReactColDef[] | null): ColDef[] | null | undefined {
  if (columnDefs == null) return columnDefs;
  return columnDefs.map((colDef) => adaptReactColDef(colDef));
}

/**
 * Adapt a grid-level `defaultColDef`: same per-field component adaptation as a real column def, but
 * only the fields actually present are adapted (it is a `Partial<ColDef>`), so an omitted field
 * stays omitted rather than being forced to `undefined`.
 */
export function adaptReactDefaultColDef(
  defaultColDef?: ReactDefaultColDef | null,
): DefaultColDef | undefined {
  if (defaultColDef == null) return undefined;
  const next = { ...defaultColDef } as unknown as DefaultColDef;
  if ("cellRenderer" in defaultColDef) next.cellRenderer = adaptCellRenderer(defaultColDef.cellRenderer);
  if ("cellEditor" in defaultColDef) next.cellEditor = adaptCellEditor(defaultColDef.cellEditor);
  if ("tooltipComponent" in defaultColDef) next.tooltipComponent = adaptTooltip(defaultColDef.tooltipComponent);
  if ("headerTooltip" in defaultColDef) next.headerTooltip = adaptHeaderTooltip(defaultColDef.headerTooltip);
  if ("actionFrameComponent" in defaultColDef) next.actionFrameComponent = adaptActionFrame(defaultColDef.actionFrameComponent);
  if ("filterParams" in defaultColDef) next.filterParams = adaptReactFilterParams(defaultColDef.filterParams);
  return next;
}
