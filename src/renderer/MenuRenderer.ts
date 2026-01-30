import { MenuItem } from "@grid/interfaces";
import { isTrue } from "@grid/misc";

export interface MenuParams {
  anchorEl?: HTMLElement;
  clientX: number;
  clientY: number;
  items: MenuItem[];
  level?: number;
  parentId?: string | null;
  parentEl?: HTMLElement | null;
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  onItemClick?: (item: MenuItem) => void;
  onClose?: () => void;
}

interface MenuProps {
  onItemClick?: (item: MenuItem) => void;
  onClose?: () => void;
}

export class MenuRenderer {
  private menuOverlays: HTMLDivElement[] = [];
  private menuItemsByLevel: MenuItem[][] = [];
  private menuParentIds: (string | null)[] = [];
  private menuOpenTimers: (number | NodeJS.Timeout)[] = [];
  private menuOpenParentEls: (HTMLElement | null)[] = [];
  private menuPropsByLevel: MenuProps[] = [];

  private docPointerDownCapture?: (e: PointerEvent) => void;
  private docKeyDownCapture?: (e: KeyboardEvent) => void;
  private winBlur?: () => void;

  constructor(private root: HTMLElement) { }

  open(params: MenuParams) {
    const {
      anchorEl,
      clientX,
      clientY,
      items,
      level = 0,
      parentId = null,
      parentEl = null,
      position = "bottom-left",
      onItemClick,
      onClose,
    } = params;

    if (level === 0) {
      this.hideMenuLevels(0);
    }

    this.menuPropsByLevel[level] = {
      onItemClick,
      onClose,
    };

    const menuOverlay = this.ensureMenuOverlay(level);
    this.menuItemsByLevel[level] = items;
    this.menuParentIds[level] = parentId;
    if (parentEl) this.setMenuParentExpanded(level - 1, parentEl);
    this.renderMenuItems(menuOverlay, items);

    let left = clientX;
    let top = clientY;
    const W = 220;

    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      switch (position) {
        case "bottom-left":
          left = r.left;
          top = r.bottom + 4;
          break;
        case "bottom-right":
          left = r.right - W;
          top = r.bottom + 4;
          break;
        case "top-left":
          left = r.left;
          top = r.top - 4;
          break;
        case "top-right":
          left = r.right - W;
          top = r.top - 4;
          break;
        default:
          left = r.left;
          top = r.bottom + 4;
      }
    }

    const bounds = this.getMenuBounds();

    if (position.includes("right")) {
      left = clientX - W;
    }
    if (position.includes("top")) {
      top = clientY - menuOverlay.offsetHeight;
    }

    menuOverlay.style.minWidth = `${W}px`;
    menuOverlay.style.visibility = "hidden";
    menuOverlay.style.display = "flex";
    const menuRect = menuOverlay.getBoundingClientRect();
    menuOverlay.style.opacity = "1";

    if (left + menuRect.width > bounds.right) {
      left = bounds.right - menuRect.width;
    }
    if (left < bounds.left) {
      left = bounds.left;
    }
    if (top + menuRect.height > bounds.bottom) {
      top = bounds.bottom - menuRect.height;
    }
    if (top < bounds.top) {
      top = bounds.top;
    }

    menuOverlay.style.left = `${left}px`;
    menuOverlay.style.top = `${top}px`;
    menuOverlay.style.visibility = "visible";

    this.root.appendChild(menuOverlay);
    if (level === 0) {
      this.attachGlobalCloseHandlers();
    }
  }

  close(level: number) {
    while (this.menuOverlays.length > level) {
      const overlay = this.menuOverlays.pop();
      if (overlay && overlay.parentElement) {
        overlay.parentElement.removeChild(overlay);
      }
    }
    this.detachGlobalCloseHandlers();
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

  private getMenuItemById(level: number, id: string | null) {
    if (!id) return null;
    return this.menuItemsByLevel[level]?.find(x => x.id === id) || null;
  }

  private hideMenuLevels(fromLevel: number) {
    for (let level = fromLevel; level < this.menuOverlays.length; level++) {
      const overlay = this.menuOverlays[level];
      if (!overlay) continue;
      overlay.style.display = "none";
      overlay.style.opacity = "0";
      overlay.style.visibility = "hidden";
      overlay.remove();
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
    this.menuPropsByLevel.length = fromLevel;
  }

  private openSubmenu(level: number, parentBtnEl: HTMLElement, submenuItems: MenuItem[]) {
    const overlay = this.ensureMenuOverlay(level);
    this.hideMenuLevels(level + 1);
    this.menuItemsByLevel[level] = submenuItems;
    this.menuParentIds[level] = parentBtnEl.getAttribute("data-item-id");
    this.renderMenuItems(overlay, submenuItems);
    if (level > 0) this.setMenuParentExpanded(level - 1, parentBtnEl);

    const r = parentBtnEl.getBoundingClientRect();
    const W = 220;

    // Default: open to the right
    let left = r.right;
    let top = r.top;

    const bounds = this.getMenuBounds();

    // If would overflow right edge, open to the left
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

  private getMenuBounds() {
    const r = this.root.getBoundingClientRect();
    return {
      left: r.left + 8,
      top: r.top + 8,
      right: r.right - 8,
      bottom: r.bottom - 8,
    };
  }

  private ensureMenuOverlay(level: number) {
    if (this.menuOverlays[level]) return this.menuOverlays[level];
    const overlay = document.createElement("div");
    this.menuOverlays[level] = overlay;
    this.prepareMenuOverlay(overlay, level);
    return overlay;
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

    const props = this.menuPropsByLevel[level];
    if (props?.onClose) {
      props.onClose();
    }
    this.closeMenu();
    if (props?.onItemClick) {
      props.onItemClick(item);
    }
  }

  private closeMenu() {
    this.hideMenuLevels(0);
  }

  private renderMenuItems(container: HTMLDivElement, items: MenuItem[]) {
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

  private setMenuParentExpanded(level: number, btn: HTMLElement) {
    const prev = this.menuOpenParentEls[level];
    if (prev && prev !== btn) prev.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-expanded", "true");
    this.menuOpenParentEls[level] = btn;
  }

  private attachGlobalCloseHandlers() {
    // Outside click
    this.docPointerDownCapture = (e: PointerEvent) => {
      // if menu already closed, ignore
      if (this.menuOverlays.length == 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If click is within any menu element, ignore
      if (target.closest(".grid-menu")) return;

      this.close(0);
    };

    // Escape
    this.docKeyDownCapture = (e: KeyboardEvent) => {
      if (this.menuOverlays.length == 0) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close(0);
      }
    };

    // optional: close when window loses focus
    this.winBlur = () => this.close(0);

    document.addEventListener("pointerdown", this.docPointerDownCapture, true); // capture
    document.addEventListener("keydown", this.docKeyDownCapture, true);
    window.addEventListener("blur", this.winBlur);
  }

  private detachGlobalCloseHandlers() {
    if (this.docPointerDownCapture) {
      document.removeEventListener("pointerdown", this.docPointerDownCapture, true);
      this.docPointerDownCapture = undefined;
    }
    if (this.docKeyDownCapture) {
      document.removeEventListener("keydown", this.docKeyDownCapture, true);
      this.docKeyDownCapture = undefined;
    }
    if (this.winBlur) {
      window.removeEventListener("blur", this.winBlur);
      this.winBlur = undefined;
    }
  }
}
