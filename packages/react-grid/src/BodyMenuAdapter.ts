import type { IBodyMenuAdapter, MenuItem as GridMenuItem } from "@agility-workbench/grid";
import { BodyMenuContext } from "@agility-workbench/grid";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { MenuItem, MenuSlotReact } from "./menu";

export class ReactBodyMenuAdapter implements IBodyMenuAdapter {
  constructor(private opts: {
    getBodyMenuItems?: (p: { ctx: BodyMenuContext; items: MenuItem[] }) => MenuItem[];
  }) {}

  resolveMenuItems(ctx: BodyMenuContext, defaults: GridMenuItem[]): { items: GridMenuItem[]; cleanup: () => void } {
    const unmounters: Array<() => void> = [];

    const defaultsReact = defaults as unknown as MenuItem[];
    const appItems = this.opts.getBodyMenuItems
      ? this.opts.getBodyMenuItems({ ctx, items: defaultsReact })
      : defaultsReact;

    const items = this.normalizeItems(appItems, unmounters);

    return {
      items,
      cleanup: () => {
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
