import { MenuItem } from "../interfaces/menuItem";
import { isTrue } from "../misc";

export class LegacyMenuOverlayRenderer {
  private menuOverlay: HTMLDivElement;
  private submenuOverlay: HTMLDivElement;
  private menuOverlays: HTMLDivElement[] = [];
  private menuItemsByLevel: MenuItem[][] = [];
  private menuParentIds: (string | null)[] = [];
  private menuOpenParentEls: (HTMLElement | null)[] = [];
  private menuOpenTimers: (number | NodeJS.Timeout)[] = [];
  private menuColKey: string | null = null;

  private handleDocumentMouseDown = (e: MouseEvent) => {
    const hasOpenMenu = this.menuOverlays.some((overlay) => overlay.style.display !== "none");
    if (!hasOpenMenu) return;
    const target = e.target as Node | null;
    if (!target) return;
    const insideMenu = this.menuOverlays.some((overlay) =>
      overlay.style.display !== "none" && overlay.contains(target)
    );
    if (!insideMenu) this.close();
  };

  private handleDocumentKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  constructor(private root: HTMLDivElement) {
    this.menuOverlay = document.createElement("div");
    this.submenuOverlay = document.createElement("div");
  }

  bind() {
    this.menuOverlays = [this.menuOverlay, this.submenuOverlay];
    this.menuOverlays.forEach((overlay, level) => this.prepareMenuOverlay(overlay, level));
    document.addEventListener("mousedown", this.handleDocumentMouseDown);
    document.addEventListener("keydown", this.handleDocumentKeyDown);
  }

  close() {
    this.menuColKey = null;
    this.hideMenuLevels(0);
  }

  destroy() {
    this.close();
    document.removeEventListener("mousedown", this.handleDocumentMouseDown);
    document.removeEventListener("keydown", this.handleDocumentKeyDown);
    for (const overlay of this.menuOverlays) {
      overlay.remove();
    }
    this.menuOverlays = [];
  }

  private prepareMenuOverlay(overlay: HTMLDivElement, level: number) {
    overlay.className = level === 0 ? "pte-menu" : "pte-menu pte-submenu";
    overlay.style.position = "fixed";
    overlay.style.zIndex = `${9999 + level}`;
    overlay.style.display = "none";
    overlay.style.visibility = "hidden";
    this.root.appendChild(overlay);
    overlay.addEventListener("mousemove", (e) => this.handleMenuMouseMove(level, e));
    overlay.addEventListener("click", (e) => this.handleMenuClick(level, e));
  }

  private ensureMenuOverlay(level: number) {
    if (this.menuOverlays[level]) return this.menuOverlays[level];
    const overlay = document.createElement("div");
    this.menuOverlays[level] = overlay;
    this.prepareMenuOverlay(overlay, level);
    return overlay;
  }

  private getMenuBounds() {
    const r = this.root.getBoundingClientRect();
    return {
      left: r.left + 8,
      top: r.top + 8,
      right: r.right - 8,
      bottom: r.bottom - 8,
    };
  }

  private getMenuItemById(level: number, id: string | null) {
    if (!id) return null;
    return this.menuItemsByLevel[level]?.find(x => x.id === id) || null;
  }

  private setMenuParentExpanded(level: number, btn: HTMLElement) {
    const prev = this.menuOpenParentEls[level];
    if (prev && prev !== btn) prev.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-expanded", "true");
    this.menuOpenParentEls[level] = btn;
  }

  private hideMenuLevels(fromLevel: number) {
    for (let level = fromLevel; level < this.menuOverlays.length; level++) {
      const overlay = this.menuOverlays[level];
      if (!overlay) continue;
      overlay.style.display = "none";
      overlay.style.opacity = "0";
      overlay.style.visibility = "hidden";
    }

    for (let level = fromLevel; level < this.menuOpenTimers.length; level++) {
      const timer = this.menuOpenTimers[level];
      if (timer != null) clearTimeout(timer);
    }
    this.menuOpenTimers.length = fromLevel;

    const clearFrom = Math.max(0, fromLevel - 1);
    for (let level = clearFrom; level < this.menuOpenParentEls.length; level++) {
      const el = this.menuOpenParentEls[level];
      if (el) el.setAttribute("aria-expanded", "false");
    }
    this.menuOpenParentEls.length = clearFrom;

    this.menuItemsByLevel.length = fromLevel;
    this.menuParentIds.length = fromLevel;
  }

  private handleMenuMouseMove(level: number, e: MouseEvent) {
    const overlay = this.menuOverlays[level];
    if (!overlay || overlay.style.display === "none") return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest(".pte-menu-item[data-item-id]") as HTMLElement | null;
    if (!btn || !overlay.contains(btn)) return;

    const item = this.getMenuItemById(level, btn.getAttribute("data-item-id"));
    const nextLevel = level + 1;
    if (!item || item.disabled || !item.subMenu || item.subMenu.length === 0) {
      const timer = this.menuOpenTimers[nextLevel];
      if (timer != null) clearTimeout(timer);
      this.hideMenuLevels(nextLevel);
      return;
    }

    if (this.menuParentIds[nextLevel] === item.id) return;

    const timer = this.menuOpenTimers[nextLevel];
    if (timer != null) clearTimeout(timer);
    this.menuOpenTimers[nextLevel] = setTimeout(() => {
      this.openSubmenu(nextLevel, btn, item.subMenu || []);
    }, 120);
  }

  private handleMenuClick(level: number, e: MouseEvent) {
    const overlay = this.menuOverlays[level];
    if (!overlay || overlay.style.display === "none") return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest(".pte-menu-item[data-item-id]") as HTMLElement | null;
    if (!btn || !overlay.contains(btn)) return;

    const item = this.getMenuItemById(level, btn.getAttribute("data-item-id"));
    if (!item || item.disabled) return;

    if (item.subMenu && item.subMenu.length > 0) {
      this.openSubmenu(level + 1, btn, item.subMenu);
      return;
    }

    if (item.onClick) {
      this.close();
      if (level === 0) {
        console.time("menuOnClick");
        item.onClick();
        console.timeEnd("menuOnClick");
      } else {
        item.onClick();
      }
    }
  }

  private openSubmenu(level: number, parentBtnEl: HTMLElement, submenuItems: MenuItem[]) {
    const overlay = this.ensureMenuOverlay(level);
    this.hideMenuLevels(level + 1);
    this.menuItemsByLevel[level] = submenuItems;
    this.menuParentIds[level] = parentBtnEl.getAttribute("data-item-id");
    this.renderMenuItems(overlay, submenuItems, { isSubmenu: true });
    if (level > 0) this.setMenuParentExpanded(level - 1, parentBtnEl);

    const r = parentBtnEl.getBoundingClientRect();
    const W = 220;

    let left = r.right;
    let top = r.top;

    const bounds = this.getMenuBounds();

    if (left + W > bounds.right) {
      left = r.left - W;
    }

    overlay.style.minWidth = `${W}px`;
    overlay.style.visibility = "hidden";
    overlay.style.display = "block";
    const submenuRect = overlay.getBoundingClientRect();
    overlay.style.opacity = "1";

    if (left + submenuRect.width > bounds.right) {
      left = bounds.right - submenuRect.width;
    }
    if (left < bounds.left) {
      left = bounds.left;
    }
    if (top + submenuRect.height > bounds.bottom) {
      top = bounds.bottom - submenuRect.height;
    }
    if (top < bounds.top) {
      top = bounds.top;
    }

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.visibility = "visible";
  }

  private renderMenuItems(container: HTMLDivElement, items: MenuItem[], { isSubmenu = false } = {}) {
    container.innerHTML = "";
    let idCounter = 0;
    for (const item of items) {
      item.id = item.id || `menuitem-${Date.now()}-${idCounter++}`;
      if (isTrue(item.isSeparator)) {
        const hr = document.createElement("hr");
        hr.className = "pte-menu-separator";
        container.appendChild(hr);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pte-menu-item";
      const text = document.createElement("span");
      text.className = "pte-menu-item-text";
      text.textContent = item.label || '';
      el.appendChild(text);
      el.disabled = !!item.disabled;
      if (item.subMenu) {
        el.classList.add("has-submenu");
        el.setAttribute("aria-haspopup", "menu");
        el.setAttribute("aria-expanded", "false");
        item.right = "icon-arrow-right";
      }
      if (item.left) {
        const left = document.createElement("span");
        left.className = `pte-menu-item-icon pte-menu-item-icon-left ${item.left}`;
        el.prepend(left);
      }
      if (item.right) {
        const right = document.createElement("span");
        right.className = `pte-menu-item-icon pte-menu-item-icon-right ${item.right}`;
        el.appendChild(right);
      }
      el.setAttribute("data-item-id", item.id);
      container.appendChild(el);
    }
  }
}
