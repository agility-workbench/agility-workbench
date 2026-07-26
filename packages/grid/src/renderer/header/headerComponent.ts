import { Column } from "../../column/column";
import { IGridAPI } from "../../interfaces/iGridAPI";
import type { SortDir } from "../../interfaces/sort";

/**
 * Custom header components let a column replace the grid-built header UI at one of two scopes:
 *
 * - **Level 1 (`headerComponent`)** — replaces the header *content* only (the label + sort icon +
 *   group expander that normally live in `.pte-hcell-content`). The grid keeps the resize handle
 *   and the filter/menu button row.
 * - **Level 2 (`headerCellComponent`)** — replaces the whole header cell interior *including* the
 *   filter/menu buttons. The grid keeps only the resize handle.
 *
 * A component may reuse the grid's header CSS classes (`.pte-hcell-sort`, `.pte-hcell-menu-btn`,
 * `.pte-hcell-menu-filterBtn`, `.pte-hcell-content`) to inherit the grid's default click routing
 * for sort/filter/menu/select. Components that render their own controls drive those interactions
 * through the callbacks on {@link HeaderComponentParams} instead.
 *
 * The contract mirrors the cell renderer (`ICellRenderer` in ../renderer): a function form is
 * re-invoked to refresh, a class form gets `init/getGui/refresh/destroy`.
 */
export interface HeaderComponentParams {
  /** The runtime column this header belongs to. */
  column: Column;
  /** The resolved display name (`col.label ?? col.key`). */
  displayName: string;
  /** Which slot the component was mounted into: 1 = content-only, 2 = whole cell. */
  level: 1 | 2;
  /** The grid API, for anything the convenience callbacks don't cover. */
  api: IGridAPI;
  /** The owning `.pte-hcell` element. */
  eGridHeader: HTMLElement;
  /**
   * Current sort state for this column, recomputed on every refresh. `direction` is null when the
   * column is not part of the sort; `index` is its 0-based position in the multi-column sort (-1
   * when unsorted); `count` is the total number of sorted columns.
   */
  sort: { direction: SortDir | null; index: number; count: number };
  /** Whether an active filter targets this column, recomputed on every refresh. */
  filterActive: boolean;
  /** Advance this column's sort. `additive` adds it to a multi-column sort instead of replacing. */
  progressSort: (additive?: boolean) => void;
  /** Open the column menu anchored to the given element. */
  showColumnMenu: (anchorEl: HTMLElement) => void;
  /** Open the column filter popover anchored to the given element. */
  showFilterMenu: (anchorEl: HTMLElement) => void;
  /** Select (or toggle) this column. */
  selectColumn: (mode?: "replace" | "toggle") => void;
}

export type HeaderComponentFn = (p: HeaderComponentParams) =>
  | string
  | number
  | null
  | undefined
  | HTMLElement;

export interface IHeaderComponent {
  /** Called once when the component is created. */
  init: (params: HeaderComponentParams) => void;
  /** Must return the root element mounted into the header slot. */
  getGui: () => HTMLElement;
  /**
   * Called when sort/filter state changes. Return true if updated in place; return false to have
   * the grid destroy + recreate the component.
   */
  refresh: (params: HeaderComponentParams) => boolean;
  destroy: () => void;
}

export type HeaderComponentClass = new () => IHeaderComponent;

export type HeaderComponent = HeaderComponentFn | HeaderComponentClass;

export function isClassHeaderComponent(c: HeaderComponent): c is HeaderComponentClass {
  // Same heuristic as isClassRenderer: class components carry init/getGui on the prototype.
  return (
    typeof c === "function" &&
    !!(c as any).prototype &&
    typeof (c as any).prototype.init === "function" &&
    typeof (c as any).prototype.getGui === "function"
  );
}

export type HeaderComponentRuntime = {
  /** Root element mounted into the header slot. */
  gui: HTMLElement;
  /** Refresh with new state; true => updated in place, false => caller should recreate. */
  refresh(p: HeaderComponentParams): boolean;
  destroy(): void;
};

function createFnRuntime(fn: HeaderComponentFn, p: HeaderComponentParams): HeaderComponentRuntime {
  const root = document.createElement("div");
  root.className = "pte-hcell-custom-root";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.overflow = "hidden";

  let childEl: HTMLElement | null = null;

  const apply = (res: ReturnType<HeaderComponentFn>) => {
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

function createClassRuntime(Ctor: HeaderComponentClass, p: HeaderComponentParams): HeaderComponentRuntime {
  const comp = new Ctor();
  comp.init(p);
  return {
    gui: comp.getGui(),
    refresh: (p2) => (comp.refresh ? comp.refresh(p2) : false),
    destroy: () => comp.destroy?.(),
  };
}

export function createHeaderComponentRuntime(c: HeaderComponent, p: HeaderComponentParams): HeaderComponentRuntime {
  if (isClassHeaderComponent(c)) {
    return createClassRuntime(c, p);
  }
  return createFnRuntime(c, p);
}
