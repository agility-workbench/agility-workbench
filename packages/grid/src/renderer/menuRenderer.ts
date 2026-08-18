import { MenuItem } from "../interfaces/menuItem";
import { isTrue } from "../misc";

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
  onOpen?: (renderer: MenuRenderer) => void;
  onClose?: () => void;
  contentEl?: HTMLElement;
  /** Accessible name for the menu (AT reads it when focus enters). Ignored for `contentEl`. */
  ariaLabel?: string;
}

export class MenuRenderer {
  private menuOverlays: HTMLDivElement[] = [];
  private menuItemsByLevel: MenuItem[][] = [];
  private menuParentIds: (string | null)[] = [];
  private menuOpenTimers: (number | NodeJS.Timeout)[] = [];
  private menuOpenParentEls: (HTMLElement | null)[] = [];
  private menuProps: {onItemClick?: ((item: MenuItem) => void), onClose?: (() => void)} = {};
  /**
   * Per level: is this overlay a real menu (a list of items), or arbitrary `contentEl`?
   *
   * The same overlay elements are reused for both — filter menus and the toolbar's views popover
   * pass `contentEl`, which is a form, not a menu. Only items-mode overlays get menu roles and
   * menu keyboard handling; a form must keep its own semantics and its own arrow keys.
   */
  private itemsMode: boolean[] = [];
  /** Where focus was before the level-0 menu opened, so closing can put it back. */
  private focusReturnEl: HTMLElement | null = null;

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
      onOpen,
      onClose,
      contentEl,
      ariaLabel,
    } = params;

    // Captured before close(0) below, which restores focus to the *previous* menu's return target.
    const focusReturnEl = level === 0 ? (document.activeElement as HTMLElement | null) : null;

    if (level === 0) {
      this.close(0);
    }

    this.menuProps = {
      onItemClick,
      onClose,
    };

    const menuOverlay = this.ensureMenuOverlay(level);
    this.menuItemsByLevel[level] = items;
    this.menuParentIds[level] = parentId;
    if (parentEl) this.setMenuParentExpanded(level - 1, parentEl);
    // Overlays are pooled per level and reused across opens, so the role has to be set *and*
    // cleared — a contentEl open landing on an overlay that was previously a menu would otherwise
    // present a filter form as `role="menu"`.
    this.itemsMode[level] = !contentEl;
    if (contentEl) {
      menuOverlay.innerHTML = "";
      menuOverlay.appendChild(contentEl);
      menuOverlay.removeAttribute("role");
      menuOverlay.removeAttribute("aria-label");
    } else {
      this.renderMenuItems(menuOverlay, items);
      menuOverlay.setAttribute("role", "menu");
      menuOverlay.setAttribute("aria-label", ariaLabel ?? "Menu");
    }

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

    // this.root.appendChild(menuOverlay);
    if (level === 0) {
      this.attachGlobalCloseHandlers();
      this.focusReturnEl = focusReturnEl;
      // Move focus into the menu. This is what makes `role="menu"` honest: AT users reach the items
      // by arrow key from here, and closing returns focus to wherever it came from. Only for real
      // item menus — a contentEl overlay focuses its own first field.
      if (this.itemsMode[0]) this.focusItemAt(0, 0);
    }

    if (onOpen) {
      onOpen(this);
    }
  }

  close(level: number) {
    const onClose = level === 0 ? this.menuProps.onClose : undefined;
    this.hideMenuLevels(level);
    if (level === 0) {
      this.detachGlobalCloseHandlers();
      // Closing removes the overlay from the DOM, which would drop focus to <body>; put it back
      // where it was so keyboard users (and the grid's own key handling) carry on from there.
      const returnEl = this.focusReturnEl;
      this.focusReturnEl = null;
      if (returnEl?.isConnected) returnEl.focus();
    }
    onClose?.();
  }

  private handleMenuMouseMove(level: number, e: MouseEvent) {
    const overlay = this.menuOverlays[level];
    if (!overlay || overlay.style.display === "none") return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest(".pte-menu-item[data-item-id]") as HTMLElement | null;
    if (!btn || !overlay.contains(btn)) return;

    // Hover moves the keyboard position. Two reasons: with hover and focus tracked separately, both
    // the hovered and the focused item highlight at once — two "current" items — and arrowing away
    // from a hovered item resumed from wherever focus had been left rather than from what the user
    // was pointing at. Done before hideMenuLevels below, so the hovered item is already focused and
    // the submenu-hide has no focus to rescue. Disabled items are unfocusable and simply keep the
    // current position (they paint no highlight either).
    if (this.itemsMode[level] && btn !== document.activeElement) btn.focus();

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
    // Removing an overlay that contains focus drops focus to <body>. That used to be harmless
    // (focus was never in the menu), but hovering a different item hides deeper levels — so a
    // stray mouse movement during keyboard navigation would strand the user outside the menu.
    // Captured before the parent-element bookkeeping below truncates the array.
    const active = document.activeElement as HTMLElement | null;
    const parentOfHidden = fromLevel > 0 ? this.menuOpenParentEls[fromLevel - 1] : null;
    let focusWasInside = false;
    for (let level = fromLevel; level < this.menuOverlays.length && !focusWasInside; level++) {
      if (active && this.menuOverlays[level]?.contains(active)) focusWasInside = true;
    }

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
    this.menuOverlays.length = fromLevel;
    this.itemsMode.length = fromLevel;
    if (fromLevel === 0) {
      this.menuProps = {};
    }

    // Hand focus back to the item that owned the hidden level. Closing the whole menu (fromLevel 0)
    // is not this method's business — close() restores focus to wherever the menu was opened from.
    if (focusWasInside && parentOfHidden?.isConnected) parentOfHidden.focus();
  }

  private openSubmenu(level: number, parentBtnEl: HTMLElement, submenuItems: MenuItem[]) {
    const overlay = this.ensureMenuOverlay(level);
    this.hideMenuLevels(level + 1);
    this.menuItemsByLevel[level] = submenuItems;
    this.menuParentIds[level] = parentBtnEl.getAttribute("data-item-id");
    this.renderMenuItems(overlay, submenuItems);
    // Submenus never route through open(), so they need the same treatment here: a submenu is a
    // menu, named by the item that owns it, and its level must be marked as items-mode or the
    // keyboard handler would ignore ArrowLeft/Escape inside it.
    this.itemsMode[level] = true;
    overlay.setAttribute("role", "menu");
    const parentLabel = parentBtnEl.querySelector(".pte-menu-item-text")?.textContent?.trim();
    overlay.setAttribute("aria-label", parentLabel || "Submenu");
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
    overlay.addEventListener("keydown", (e) => this.handleActivationKeys(level, e));
  }

  /**
   * Enter/Space are the only menu keys handled here rather than in the document capture handler,
   * and they are handled in the BUBBLE phase on purpose: the item is a real `<button>`, so the key
   * has to reach it for the browser to activate it. Stopping it during capture would cancel the
   * activation outright.
   *
   * What this stops is the event reaching the grid root, whose own keydown handler treats Enter as
   * "start editing the focused cell" and calls preventDefault — which killed the button's
   * activation. That is why Enter over a menu item behaved erratically and did nothing at all in the
   * body context menu. Note the deliberate absence of preventDefault here.
   */
  private handleActivationKeys(level: number, e: KeyboardEvent) {
    if (!this.itemsMode[level]) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.stopPropagation();
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

    const onItemClick = this.menuProps.onItemClick;
    this.closeMenu();
    if (onItemClick) {
      onItemClick(item);
    }
  }

  private closeMenu() {
    this.close(0);
  }

  private renderMenuItems(container: HTMLDivElement, items: MenuItem[]) {
    container.innerHTML = "";
    let idCounter = 0;
    for (const item of items) {
      item.id = item.id || `menuitem-${Date.now()}-${idCounter++}`;
      if (isTrue(item.isSeparator)) {
        const hr = document.createElement("hr");
        hr.className = "pte-menu-separator";
        hr.setAttribute("role", "separator");
        container.appendChild(hr);
        continue;
      }
      if (isTrue(item.isLabel)) {
        // Static caption, not a command. Deliberately not a <button> and not role="menuitem": it
        // must stay out of the arrow-key ring, and announcing it as a (disabled) action would be a
        // lie. role="presentation" strips the div's implicit semantics while leaving its text in
        // the accessibility tree.
        const caption = document.createElement("div");
        caption.className = "pte-menu-item pte-menu-item-label";
        caption.setAttribute("role", "presentation");
        caption.dataset.itemLabelId = item.id;
        const captionText = document.createElement("span");
        captionText.className = "pte-menu-item-text";
        captionText.textContent = item.label || "";
        caption.appendChild(captionText);
        if (item.title) caption.title = item.title;
        this.appendSlot(caption, item.left, "left");
        this.appendSlot(caption, item.right, "right");
        container.appendChild(caption);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pte-menu-item";
      // Inside role="menu" the items are menuitems, not buttons, and the menu itself owns arrow-key
      // navigation — so items are taken out of the Tab order and focused programmatically.
      el.setAttribute("role", "menuitem");
      el.tabIndex = -1;
      const text = document.createElement("span");
      text.className = "pte-menu-item-text";
      text.textContent = item.label || '';
      el.appendChild(text);
      el.disabled = !!item.disabled;
      el.classList.toggle("disabled", !!item.disabled);
      // A disabled <button> is unfocusable, so arrow navigation skips these (permitted by the menu
      // pattern). aria-disabled states it for AT that reads the role rather than the element.
      if (item.disabled) el.setAttribute("aria-disabled", "true");
      if (item.title) {
        // Set on both the button and the label: a disabled <button> can swallow the native tooltip
        // in some browsers, but the inner span still surfaces it.
        el.title = item.title;
        text.title = item.title;
      }
      if (item.subMenu) {
        el.classList.add("has-submenu");
        el.setAttribute("aria-haspopup", "menu");
        el.setAttribute("aria-expanded", "false");
        item.right = "icon-arrow-right";
      }
      this.appendSlot(el, item.left, "left");
      this.appendSlot(el, item.right, "right");
      el.setAttribute("data-item-id", item.id);
      container.appendChild(el);
    }
  }

  /**
   * Render a menu item's icon slot. A string is applied as a CSS class on the icon span; an element
   * is adopted as-is. The left slot leads the label, the right slot trails it.
   */
  private appendSlot(el: HTMLElement, slot: string | HTMLElement | undefined, side: "left" | "right") {
    if (!slot) return;
    const icon = document.createElement("span");
    icon.className = `pte-menu-item-icon pte-menu-item-icon-${side}`;
    if (typeof slot === "string") icon.classList.add(slot);
    else icon.appendChild(slot);
    if (side === "left") el.prepend(icon);
    else el.appendChild(icon);
  }

  /** The focusable (enabled) items of a level, in visual order. */
  private focusableItems(level: number): HTMLElement[] {
    const overlay = this.menuOverlays[level];
    if (!overlay) return [];
    return [...overlay.querySelectorAll<HTMLElement>(".pte-menu-item[data-item-id]:not([disabled])")];
  }

  /** Focus one item of a level, wrapping the index around the ends. */
  private focusItemAt(level: number, index: number) {
    const items = this.focusableItems(level);
    if (items.length === 0) return;
    const wrapped = ((index % items.length) + items.length) % items.length;
    items[wrapped].focus();
  }

  /**
   * Move within a level. Called from the document capture handler, so it works even when focus is
   * not (or no longer) inside the menu — `current` of -1 simply enters at an end.
   */
  private navigateMenu(level: number, key: string) {
    const items = this.focusableItems(level);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);

    switch (key) {
      case "ArrowDown":
        this.focusItemAt(level, current + 1);
        return;
      case "ArrowUp":
        this.focusItemAt(level, current < 0 ? items.length - 1 : current - 1);
        return;
      case "Home":
        this.focusItemAt(level, 0);
        return;
      case "End":
        this.focusItemAt(level, items.length - 1);
        return;
      case "ArrowRight": {
        const btn = items[current];
        const item = btn ? this.getMenuItemById(level, btn.getAttribute("data-item-id")) : null;
        // No submenu: nothing happens, but the key is still consumed by the caller. Letting it fall
        // through would move the grid's cell selection behind the open menu.
        if (!item?.subMenu?.length) return;
        this.openSubmenu(level + 1, btn, item.subMenu);
        this.focusItemAt(level + 1, 0);
        return;
      }
      case "ArrowLeft": {
        if (level === 0) return;
        const parent = this.menuOpenParentEls[level - 1];
        this.close(level);
        parent?.focus();
        return;
      }
    }
  }

  /** The deepest level with a visible overlay (0 when only the root menu is open). */
  private deepestOpenLevel(): number {
    for (let level = this.menuOverlays.length - 1; level > 0; level--) {
      const overlay = this.menuOverlays[level];
      if (overlay?.isConnected && overlay.style.display !== "none") return level;
    }
    return 0;
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
      if (target.closest(".pte-menu")) return;

      this.close(0);
    };

    // All navigation keys are handled here, on the document in the CAPTURE phase, for two reasons:
    // it runs before the grid root's own keydown handler (which would otherwise move the cell
    // selection behind an open menu), and it works regardless of where focus currently is — so the
    // menu stays operable even if something dropped focus outside it.
    this.docKeyDownCapture = (e: KeyboardEvent) => {
      if (this.menuOverlays.length == 0) return;
      const level = this.deepestOpenLevel();
      // A contentEl overlay (filter form) owns its own keyboard entirely.
      if (!this.itemsMode[level]) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT" || target.isContentEditable)) return;

      switch (e.key) {
        case "Escape": {
          // Escape steps out one level at a time, like the rest of the menu pattern: from a submenu
          // it returns to the item that opened it, and only closes the whole menu at the top.
          if (level > 0) {
            const parent = this.menuOpenParentEls[level - 1];
            this.close(level);
            parent?.focus();
            break;
          }
          this.close(0);
          break;
        }
        case "Tab":
          // The pattern is that Tab dismisses the menu rather than walking out of it and leaving it
          // open behind the focus.
          this.close(0);
          break;
        case "ArrowDown":
        case "ArrowUp":
        case "Home":
        case "End":
        case "ArrowRight":
        case "ArrowLeft":
          this.navigateMenu(level, e.key);
          break;
        default:
          // Enter/Space are handled on the overlay in the bubble phase — see handleActivationKeys.
          return;
      }
      e.preventDefault();
      e.stopPropagation();
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
