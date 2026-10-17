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
  CellRendererAlias,
  CellRendererClass,
  CellRendererParams,
  ICellRenderer,
  ISetFilterComponent,
  SetFilterComponent,
  SetFilterComponentClass,
  SetFilterSpecialValueComponent,
  SetFilterSpecialValueComponentParams,
  SetFilterGroupComponent,
  SetFilterGroupComponentParams,
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
import { isClassHeaderComponent } from "@agility-workbench/grid";
import type {
  HeaderComponent,
  HeaderComponentClass,
  HeaderComponentParams,
  IHeaderComponent,
} from "@agility-workbench/grid";
import type { CellEditor } from "@agility-workbench/grid";
import { adaptCellEditor, ReactCellEditor } from "./cellEditor";

export type ReactCellRenderer<TData = any> =
  | React.ComponentType<CellRendererParams<TData>>
  | React.ExoticComponent<CellRendererParams<TData>>;

export type ReactTooltipComponent<TData = any> =
  | React.ComponentType<TooltipComponentParams<TData>>
  | React.ExoticComponent<TooltipComponentParams<TData>>;

export type ReactRowTooltipPresentation = Omit<RowTooltipPresentation, "component"> & {
  component?: TooltipComponent | ReactTooltipComponent;
};

export type ReactRowPresentation = Omit<RowPresentation, "tooltip"> & {
  tooltip?: ReactRowTooltipPresentation | false | null;
};

export type ReactGetRowPresentation<TData = any> = (
  params: RowPresentationParams<TData>,
) => ReactRowPresentation | null | undefined;

export type ReactActionFrameComponent<TData = any> =
  | React.ComponentType<ActionFrameComponentParams<TData>>
  | React.ExoticComponent<ActionFrameComponentParams<TData>>;

/**
 * A React component for a column header slot (`headerComponent` = content only, `headerCellComponent`
 * = whole cell). It receives the core {@link HeaderComponentParams} as props and re-renders whenever
 * the grid refreshes the header (sort / filter state changes).
 */
export type ReactHeaderComponent =
  | React.ComponentType<HeaderComponentParams>
  | React.ExoticComponent<HeaderComponentParams>;

export type ReactSetFilterValueComponent =
  | React.ComponentType<SetFilterValueComponentParams>
  | React.ExoticComponent<SetFilterValueComponentParams>;

export type ReactSetFilterSpecialValueComponent =
  | React.ComponentType<SetFilterSpecialValueComponentParams>
  | React.ExoticComponent<SetFilterSpecialValueComponentParams>;

export type ReactSetFilterGroupComponent =
  | React.ComponentType<SetFilterGroupComponentParams>
  | React.ExoticComponent<SetFilterGroupComponentParams>;

export type ReactFilterParams = Omit<
  FilterParams,
  "valueComponent" | "selectAllComponent" | "blanksComponent" | "groupComponent"
> & {
  valueComponent?: SetFilterValueComponent | ReactSetFilterValueComponent;
  selectAllComponent?: SetFilterSpecialValueComponent | ReactSetFilterSpecialValueComponent;
  blanksComponent?: SetFilterSpecialValueComponent | ReactSetFilterSpecialValueComponent;
  groupComponent?: SetFilterGroupComponent | ReactSetFilterGroupComponent;
};

/**
 * A React-aware column definition: a core `ColDef` whose component fields may also be React
 * components. `TData` is the row type (default `any`), exactly as on `ColDef<TData>`.
 */
export type ReactColDef<TData = any> = Omit<
  ColDef<TData>,
  | "cellRenderer"
  | "cellEditor"
  | "children"
  | "tooltipComponent"
  | "headerTooltip"
  | "actionFrameComponent"
  | "filterParams"
  | "headerComponent"
  | "headerCellComponent"
> & {
  cellRenderer?: CellRenderer<TData> | CellRendererAlias | ReactCellRenderer<TData>;
  cellEditor?: CellEditor<TData> | ReactCellEditor<TData>;
  tooltipComponent?: TooltipComponent<TData> | ReactTooltipComponent<TData>;
  headerTooltip?: string | TooltipComponent | ReactTooltipComponent;
  actionFrameComponent?: ActionFrameComponent<TData> | ReactActionFrameComponent<TData>;
  filterParams?: ReactFilterParams;
  headerComponent?: HeaderComponent | ReactHeaderComponent;
  headerCellComponent?: HeaderComponent | ReactHeaderComponent;
  children?: ReactColDef<TData>[];
};

/**
 * React-aware shape of the grid-level `defaultColDef`: a {@link ReactColDef} minus the per-column
 * identity/structure fields that never inherit (see `NON_DEFAULTABLE_COLDEF_KEYS`). Mirrors core
 * `DefaultColDef`, but its component fields may be React components.
 */
export type ReactDefaultColDef<TData = any> = Omit<ReactColDef<TData>, (typeof NON_DEFAULTABLE_COLDEF_KEYS)[number]>;

/**
 * React-aware shape of the partial column defs the grid layers over a synthesized column
 * (`groupColumnDef`, `pivotResultColumnDef`): a `Partial<ReactColDef>`, so component fields may be
 * React components.
 */
export type ReactPartialColDef<TData = any> = Partial<Omit<ReactColDef<TData>, "children">>;

const reactRendererCache = new WeakMap<object, CellRendererClass>();
const reactTooltipCache = new WeakMap<object, TooltipComponentClass>();
const reactActionFrameCache = new WeakMap<object, ActionFrameComponentClass>();
const reactSetFilterComponentCache = new WeakMap<object, SetFilterComponentClass<any>>();
const reactHeaderComponentCache = new WeakMap<object, HeaderComponentClass>();

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

// Overloads: a plain renderer input (the full-width renderer, which has no alias) adapts to a
// plain renderer, so callers assigning into `CellRenderer`-typed option fields stay typed.
export function adaptCellRenderer(
  renderer: CellRenderer | ReactCellRenderer | undefined,
): CellRenderer | undefined;
export function adaptCellRenderer(
  renderer: CellRenderer | CellRendererAlias | ReactCellRenderer | undefined,
): CellRenderer | CellRendererAlias | undefined;
export function adaptCellRenderer(
  renderer: CellRenderer | CellRendererAlias | ReactCellRenderer | undefined,
): CellRenderer | CellRendererAlias | undefined {
  if (!renderer) return undefined;
  if (typeof renderer === "function" && isClassRenderer(renderer as CellRenderer)) {
    return renderer as CellRenderer;
  }
  // A class, a plain function, or the `"text"` alias: all pass through unchanged.
  if (!isObjectRenderer(renderer)) return renderer as CellRenderer | CellRendererAlias;

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

/**
 * Mounts a DOM node a header function returned (the core contract's function form) inside React's
 * tree, so a pre-existing DOM-returning header function keeps working through the React binding.
 */
function DomHeaderSlot({ node }: { node: HTMLElement }): React.ReactElement {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const host = ref.current;
    if (host && host.firstChild !== node) host.replaceChildren(node);
  }, [node]);
  return React.createElement("span", { ref, style: { display: "contents" } });
}

/**
 * The element a header adapter renders. A plain function is invoked as a component from inside a
 * host component (its hooks belong to that host and run in a stable order), which lets the adapter
 * accept both a React function component and the core contract's DOM function form
 * (`(params) => HTMLElement | string`), the only form this slot took before React components were
 * adapted. Class components and exotic components (memo, forwardRef, lazy) render normally.
 */
function headerElementFactory(
  Comp: ReactHeaderComponent,
): (params: HeaderComponentParams) => React.ReactElement {
  const isPlainFunction =
    typeof Comp === "function" &&
    !(Comp as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent;
  if (!isPlainFunction) return (params) => React.createElement(Comp, params);

  const render = Comp as (props: HeaderComponentParams) => unknown;
  function ReactHeaderHost(params: HeaderComponentParams): React.ReactNode {
    const out = render(params);
    if (out instanceof HTMLElement) return React.createElement(DomHeaderSlot, { node: out });
    return out as React.ReactNode;
  }
  return (params) => React.createElement(ReactHeaderHost, params);
}

function createReactHeaderComponentClass(Comp: ReactHeaderComponent): HeaderComponentClass {
  const element = headerElementFactory(Comp);
  return class ReactHeaderComponentAdapter implements IHeaderComponent {
    private el = document.createElement("div");
    private root: ManagedReactRoot | null = null;

    init(params: HeaderComponentParams): void {
      // Same box the core gives its function form, so a React header lays out like a native one.
      this.el.className = "pte-hcell-custom-root";
      this.el.style.display = "flex";
      this.el.style.alignItems = "center";
      this.el.style.width = "100%";
      this.el.style.height = "100%";
      this.el.style.overflow = "hidden";
      // One root for the life of this header cell; refresh re-renders into it so component state
      // survives sort/filter changes. The header is rebuilt (destroy + init) on structural changes.
      this.root = new ManagedReactRoot(this.el);
      this.render(params);
    }

    getGui(): HTMLElement {
      return this.el;
    }

    refresh(params: HeaderComponentParams): boolean {
      this.render(params);
      return true;
    }

    destroy(): void {
      this.root?.destroy();
      this.root = null;
    }

    private render(params: HeaderComponentParams): void {
      this.root?.render(element(params));
    }
  };
}

/**
 * Adapt a `headerComponent` / `headerCellComponent`. A core class component (`init`/`getGui`) passes
 * through untouched; anything else callable is mounted in a React root (see
 * {@link headerElementFactory} for how a DOM-returning function is still honored).
 */
export function adaptHeaderComponent(
  comp: HeaderComponent | ReactHeaderComponent | undefined,
): HeaderComponent | undefined {
  if (!comp) return undefined;
  if (typeof comp === "function" && isClassHeaderComponent(comp as HeaderComponent)) {
    return comp as HeaderComponent;
  }
  if (!isObjectRenderer(comp)) return comp as HeaderComponent;

  const cached = reactHeaderComponentCache.get(comp);
  if (cached) return cached;

  const adapted = createReactHeaderComponentClass(comp as ReactHeaderComponent);
  reactHeaderComponentCache.set(comp, adapted);
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
    groupComponent: adaptSetFilterComponent(filterParams.groupComponent),
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
    headerComponent: adaptHeaderComponent(colDef.headerComponent),
    headerCellComponent: adaptHeaderComponent(colDef.headerCellComponent),
    children: colDef.children ? adaptReactColumnDefs(colDef.children) ?? undefined : undefined,
  };
}

export function adaptReactColumnDefs(columnDefs?: ReactColDef[] | null): ColDef[] | null | undefined {
  if (columnDefs == null) return columnDefs;
  return columnDefs.map((colDef) => adaptReactColDef(colDef));
}

/**
 * Adapt a partial column def (the grid-level `defaultColDef`, `groupColumnDef`,
 * `pivotResultColumnDef`): same per-field component adaptation as a real column def, but only the
 * fields actually present are adapted, so an omitted field stays omitted rather than being forced to
 * `undefined` (the core layers these partials with object spread, where an explicit `undefined`
 * would clobber the layer beneath).
 */
function adaptReactPartialColDef<T extends object>(def: ReactPartialColDef): T {
  const next = { ...def } as Record<string, unknown>;
  if ("cellRenderer" in def) next.cellRenderer = adaptCellRenderer(def.cellRenderer);
  if ("cellEditor" in def) next.cellEditor = adaptCellEditor(def.cellEditor);
  if ("tooltipComponent" in def) next.tooltipComponent = adaptTooltip(def.tooltipComponent);
  if ("headerTooltip" in def) next.headerTooltip = adaptHeaderTooltip(def.headerTooltip);
  if ("actionFrameComponent" in def) next.actionFrameComponent = adaptActionFrame(def.actionFrameComponent);
  if ("filterParams" in def) next.filterParams = adaptReactFilterParams(def.filterParams);
  if ("headerComponent" in def) next.headerComponent = adaptHeaderComponent(def.headerComponent);
  if ("headerCellComponent" in def) next.headerCellComponent = adaptHeaderComponent(def.headerCellComponent);
  return next as T;
}

/** Adapt a grid-level `defaultColDef` (see {@link adaptReactPartialColDef}). */
export function adaptReactDefaultColDef(
  defaultColDef?: ReactDefaultColDef | null,
): DefaultColDef | undefined {
  if (defaultColDef == null) return undefined;
  return adaptReactPartialColDef<DefaultColDef>(defaultColDef);
}

/** Adapt `groupColumnDef` / `pivotResultColumnDef` (see {@link adaptReactPartialColDef}). */
export function adaptReactPartialColumnDef(
  def?: ReactPartialColDef | null,
): Partial<ColDef> | undefined {
  if (def == null) return undefined;
  return adaptReactPartialColDef<Partial<ColDef>>(def);
}
