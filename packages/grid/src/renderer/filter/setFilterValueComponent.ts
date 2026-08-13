import type { Column } from "../../column/column";
import type { IGridAPI } from "../../interfaces/iGridAPI";

/** Params supplied to the component that replaces a regular set-filter value's text label. */
export interface SetFilterValueComponentParams {
  /** The raw value represented by this option. */
  value: any;
  /** The text used by the built-in label, mini-filter, and checkbox accessible name. */
  valueFormatted: string;
  /** The runtime column that owns the set filter. */
  colDef: Column;
  /** The grid API. */
  api: IGridAPI;
  /** Extra params from `filterParams.valueComponentParams`. */
  [key: string]: any;
}

/** Params supplied to the dedicated Select All and Blanks label components. */
export interface SetFilterSpecialValueComponentParams {
  /** The text used by the built-in label and checkbox accessible name. */
  label: string;
  /** The runtime column that owns the set filter. */
  colDef: Column;
  /** The grid API. */
  api: IGridAPI;
  /** Extra params from the corresponding component params option. */
  [key: string]: any;
}

type SetFilterComponentResult = string | number | boolean | null | undefined | HTMLElement;

export type SetFilterComponentFn<P extends object> = (params: P) => SetFilterComponentResult;

export interface ISetFilterComponent<P extends object> {
  /** Called once when the component is created. */
  init(params: P): void;
  /** Must return the root element mounted inside the grid-owned label span. */
  getGui(): HTMLElement;
  /** Called on updates; return false to have the grid recreate the component. */
  refresh(params: P): boolean;
  destroy(): void;
}

export type SetFilterComponentClass<P extends object> = new () => ISetFilterComponent<P>;
export type SetFilterComponent<P extends object> = SetFilterComponentFn<P> | SetFilterComponentClass<P>;

export type SetFilterValueComponent = SetFilterComponent<SetFilterValueComponentParams>;
export type SetFilterSpecialValueComponent = SetFilterComponent<SetFilterSpecialValueComponentParams>;

export function isClassSetFilterComponent<P extends object>(
  component: SetFilterComponent<P>,
): component is SetFilterComponentClass<P> {
  return (
    typeof component === "function" &&
    !!(component as any).prototype &&
    typeof (component as any).prototype.init === "function" &&
    typeof (component as any).prototype.getGui === "function"
  );
}

export interface SetFilterComponentRuntime<P extends object> {
  gui: HTMLElement;
  refresh(params: P): boolean;
  destroy(): void;
}

function createFnRuntime<P extends object>(
  component: SetFilterComponentFn<P>,
  params: P,
): SetFilterComponentRuntime<P> {
  const root = document.createElement("span");
  root.className = "pte-set-filter-value-component";
  let childEl: HTMLElement | null = null;

  const apply = (result: SetFilterComponentResult): void => {
    if (result instanceof HTMLElement) {
      if (childEl !== result) {
        root.replaceChildren(result);
        childEl = result;
      }
      return;
    }
    childEl = null;
    // A configured component returning nullish content intentionally renders an empty label slot.
    root.textContent = result == null ? "" : String(result);
  };

  apply(component(params));
  return {
    gui: root,
    refresh(nextParams) {
      apply(component(nextParams));
      return true;
    },
    destroy() {
      // no-op, kept for symmetry with the class runtime
    },
  };
}

function createClassRuntime<P extends object>(
  Component: SetFilterComponentClass<P>,
  params: P,
): SetFilterComponentRuntime<P> {
  const instance = new Component();
  instance.init(params);
  return {
    gui: instance.getGui(),
    refresh: (nextParams) => instance.refresh?.(nextParams) ?? false,
    destroy: () => instance.destroy?.(),
  };
}

export function createSetFilterComponentRuntime<P extends object>(
  component: SetFilterComponent<P>,
  params: P,
): SetFilterComponentRuntime<P> {
  return isClassSetFilterComponent(component)
    ? createClassRuntime(component, params)
    : createFnRuntime(component, params);
}
