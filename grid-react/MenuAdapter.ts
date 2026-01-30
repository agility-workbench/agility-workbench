import type { IMenuAdapter, MenuItem as GridMenuItem } from "@grid/interfaces";
import { ColumnMenuContext } from "@grid/menu";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { MenuItem, MenuSlotReact } from "./menu";

export class ReactMenuAdapter implements IMenuAdapter {
  constructor(private opts: {
    getColumnMenuItems?: (p: { ctx: ColumnMenuContext; items: MenuItem[] }) => MenuItem[];
  }) {}

  resolveMenuItems(ctx: ColumnMenuContext, defaults: GridMenuItem[]): { items: GridMenuItem[]; cleanup: () => void } {
    const unmounters: Array<() => void> = [];

    // Step 1: treat defaults as MenuItem for the hook boundary
    const defaultsReact = defaults as unknown as MenuItem[];

    // Step 2: call app hook if present
    const appItems = this.opts.getColumnMenuItems
      ? this.opts.getColumnMenuItems({ ctx, items: defaultsReact })
      : defaultsReact;

    // Step 3: normalize React slots -> HTMLElement
    const items = this.normalizeItems(appItems, unmounters);

    return {
      items,
      cleanup: () => {
        // unmount any React roots created for this menu open
        for (const u of unmounters) u();
      },
    };
  }

  private normalizeItems(items: MenuItem[], unmounters: Array<() => void>): GridMenuItem[] {
    return items.map(it => {
      if (it.isSeparator) return { isSeparator: true };

      const left = this.normalizeSlot(it.left, unmounters);
      const right = this.normalizeSlot(it.right, unmounters);

      return {
        ...it,
        left,
        right,
        subMenu: it.subMenu ? this.normalizeItems(it.subMenu, unmounters) : undefined,
      } as GridMenuItem;
    });
  }

  private normalizeSlot(slot: MenuSlotReact, unmounters: Array<() => void>): string | HTMLElement | undefined {
    if (!slot) return undefined;

    if (typeof slot === "string") return slot;
    if (slot instanceof HTMLElement) return slot;

    // React element
    if (React.isValidElement(slot)) {
      const { el, unmount } = this.mountReact(slot);
      unmounters.push(unmount);
      return el;
    }

    return undefined;
  }

  private mountReact(node: React.ReactElement): { el: HTMLElement; unmount: () => void } {
    const el = document.createElement("span");
    el.style.display = "inline-flex";
    el.style.alignItems = "center";

    const root: Root = createRoot(el);
    root.render(node);

    return { el, unmount: () => root.unmount() };
  }
}
