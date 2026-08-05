import { Column } from "../../column/column";
import { IGridAPI } from "../../interfaces/iGridAPI";

/**
 * An ActionFrame component renders the client-owned form body inside the popover attached to a
 * framed body cell (like a Google Sheets comment box). The grid owns the frame border, the popover
 * chrome, positioning, and open/close lifecycle; the contents are entirely up to the consumer.
 *
 * The contract mirrors the tooltip / cell-renderer / header-component contracts: a function form is
 * re-invoked to refresh, a class form gets `init/getGui/refresh/destroy`.
 */
export interface ActionFrameComponentParams {
  /** Raw cell value. */
  value: any;
  /** Formatted display value. */
  valueFormatted?: any;
  /** The full row data object. */
  data: any;
  /** Row id. */
  rowId: string;
  /** Row view index. */
  rowIndex: number;
  /** The runtime column the frame belongs to. */
  colDef: Column;
  /** The grid API. */
  api: IGridAPI;
  /** Dismiss the ActionFrame (e.g. a Save/Cancel button in the form). */
  close: () => void;
  /** Extra params from `colDef.actionFrameComponentParams`, spread in by the React adapter. */
  [key: string]: any;
}

export type ActionFrameComponentFn = (p: ActionFrameComponentParams) =>
  | string
  | number
  | null
  | undefined
  | HTMLElement;

export interface IActionFrameComponent {
  /** Called once when the frame opens. */
  init: (params: ActionFrameComponentParams) => void;
  /** Must return the root element mounted into the popover. */
  getGui: () => HTMLElement;
  /** Called on updates; return true if updated in place, false to have the grid recreate it. */
  refresh: (params: ActionFrameComponentParams) => boolean;
  destroy: () => void;
}

export type ActionFrameComponentClass = new () => IActionFrameComponent;

export type ActionFrameComponent = ActionFrameComponentFn | ActionFrameComponentClass;

export function isClassActionFrameComponent(c: ActionFrameComponent): c is ActionFrameComponentClass {
  // Same heuristic as the other component contracts: class components carry init/getGui on the
  // prototype.
  return (
    typeof c === "function" &&
    !!(c as any).prototype &&
    typeof (c as any).prototype.init === "function" &&
    typeof (c as any).prototype.getGui === "function"
  );
}

export type ActionFrameComponentRuntime = {
  /** Root element mounted into the popover. */
  gui: HTMLElement;
  /** Refresh with new params; true => updated in place, false => caller should recreate. */
  refresh(p: ActionFrameComponentParams): boolean;
  destroy(): void;
};

function createFnRuntime(fn: ActionFrameComponentFn, p: ActionFrameComponentParams): ActionFrameComponentRuntime {
  const root = document.createElement("div");
  root.className = "pte-action-frame-custom-root";

  let childEl: HTMLElement | null = null;

  const apply = (res: ReturnType<ActionFrameComponentFn>) => {
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

function createClassRuntime(Ctor: ActionFrameComponentClass, p: ActionFrameComponentParams): ActionFrameComponentRuntime {
  const comp = new Ctor();
  comp.init(p);
  return {
    gui: comp.getGui(),
    refresh: (p2) => (comp.refresh ? comp.refresh(p2) : false),
    destroy: () => comp.destroy?.(),
  };
}

export function createActionFrameComponentRuntime(
  c: ActionFrameComponent,
  p: ActionFrameComponentParams,
): ActionFrameComponentRuntime {
  if (isClassActionFrameComponent(c)) {
    return createClassRuntime(c, p);
  }
  return createFnRuntime(c, p);
}
