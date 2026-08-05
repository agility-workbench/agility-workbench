import { ApplicationRef, NgZone, TemplateRef } from "@angular/core";
import type {
  BodyMenuContext,
  ColumnMenuContext,
  IBodyMenuAdapter,
  IMenuAdapter,
  MenuItem as GridMenuItem,
} from "@agility-workbench/grid";
import type { NgMenuItem, NgMenuSlot } from "./menu";

/**
 * Shared slot normalization for both menu adapters: app-supplied menu items may carry
 * `TemplateRef` slots; each open menu stamps them into detached spans and destroys the embedded
 * views on close (the core calls `cleanup` when the menu is dismissed).
 */
abstract class NgMenuAdapterBase {
  constructor(
    protected readonly appRef: ApplicationRef,
    protected readonly zone: NgZone,
  ) {}

  protected normalizeItems(items: NgMenuItem[], cleanups: Array<() => void>): GridMenuItem[] {
    return items.map((it) => {
      if (it.isSeparator) return { isSeparator: true };

      const left = this.normalizeSlot(it.left, cleanups);
      const right = this.normalizeSlot(it.right, cleanups);

      return {
        ...it,
        left,
        right,
        subMenu: it.subMenu ? this.normalizeItems(it.subMenu, cleanups) : undefined,
      } as GridMenuItem;
    });
  }

  private normalizeSlot(slot: NgMenuSlot, cleanups: Array<() => void>): string | HTMLElement | undefined {
    if (!slot) return undefined;
    if (typeof slot === "string") return slot;
    if (slot instanceof HTMLElement) return slot;

    if (slot instanceof TemplateRef) {
      const { el, destroy } = this.stampTemplate(slot);
      cleanups.push(destroy);
      return el;
    }

    return undefined;
  }

  private stampTemplate(tpl: TemplateRef<unknown>): { el: HTMLElement; destroy: () => void } {
    return this.zone.run(() => {
      const el = document.createElement("span");
      el.style.display = "inline-flex";
      el.style.alignItems = "center";

      const view = tpl.createEmbeddedView({});
      this.appRef.attachView(view);
      view.detectChanges();
      for (const node of view.rootNodes as Node[]) el.appendChild(node);

      return { el, destroy: () => this.zone.run(() => view.destroy()) };
    });
  }
}

export class NgMenuAdapter extends NgMenuAdapterBase implements IMenuAdapter {
  constructor(
    appRef: ApplicationRef,
    zone: NgZone,
    private readonly opts: {
      getColumnMenuItems?: () =>
        | ((p: { ctx: ColumnMenuContext; items: NgMenuItem[] }) => NgMenuItem[])
        | undefined;
    },
  ) {
    super(appRef, zone);
  }

  resolveMenuItems(
    ctx: ColumnMenuContext,
    defaults: GridMenuItem[],
  ): { items: GridMenuItem[]; cleanup: () => void } {
    const cleanups: Array<() => void> = [];

    const defaultsNg = defaults as unknown as NgMenuItem[];
    // Read the hook through the getter so the adapter stays reactive to input changes without
    // recreating the grid instance (the React wrapper's ref-read, in Angular clothing).
    const hook = this.opts.getColumnMenuItems?.();
    const appItems = hook ? hook({ ctx, items: defaultsNg }) : defaultsNg;

    const items = this.normalizeItems(appItems, cleanups);

    return {
      items,
      cleanup: () => {
        for (const c of cleanups) c();
      },
    };
  }
}

export class NgBodyMenuAdapter extends NgMenuAdapterBase implements IBodyMenuAdapter {
  constructor(
    appRef: ApplicationRef,
    zone: NgZone,
    private readonly opts: {
      getBodyMenuItems?: () =>
        | ((p: { ctx: BodyMenuContext; items: NgMenuItem[] }) => NgMenuItem[])
        | undefined;
    },
  ) {
    super(appRef, zone);
  }

  resolveMenuItems(
    ctx: BodyMenuContext,
    defaults: GridMenuItem[],
  ): { items: GridMenuItem[]; cleanup: () => void } {
    const cleanups: Array<() => void> = [];

    const defaultsNg = defaults as unknown as NgMenuItem[];
    const hook = this.opts.getBodyMenuItems?.();
    const appItems = hook ? hook({ ctx, items: defaultsNg }) : defaultsNg;

    const items = this.normalizeItems(appItems, cleanups);

    return {
      items,
      cleanup: () => {
        for (const c of cleanups) c();
      },
    };
  }
}
