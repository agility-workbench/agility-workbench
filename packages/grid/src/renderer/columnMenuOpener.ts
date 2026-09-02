import { GridCore } from "../core/core";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { AggregateType } from "../interfaces/aggregate";
import { MenuCoordinator } from "../menu/coordinator";
import type { InternalColumnMenuContext } from "../menu/context";
import { MenuRenderer } from "./menuRenderer";

type ColumnMenuTrigger = "columnMenuButton" | "headerContextMenu";

type ColumnMenuAnchor = {
  anchorEl?: HTMLElement;
  left?: number;
  top?: number;
};

type ColumnMenuOpenerParams = {
  core: GridCore;
  menuCoordinator: MenuCoordinator;
  filterMenuCoordinator: FilterMenuCoordinator;
  menuRenderer: MenuRenderer;
  selectedColumnIDs: () => Set<string>;
};

export class ColumnMenuOpener {
  constructor(private params: ColumnMenuOpenerParams) {}

  openColumnMenu(trigger: ColumnMenuTrigger, colID: string, { anchorEl, left, top }: ColumnMenuAnchor) {
    const selectedColumnIDs = this.params.selectedColumnIDs();
    const colIds = selectedColumnIDs.size > 1 ? Array.from(selectedColumnIDs) : [colID];
    const session = this.params.menuCoordinator.openColumnMenu({
      trigger,
      targetColId: colID,
      colIds,
      anchorEl,
      clientX: left,
      clientY: top,
    });

    // Empty menus have no interaction to offer and otherwise render as a thin blank frame.
    if (session.items.length === 0) {
      session.onClose();
      return;
    }

    this.params.menuRenderer.open({
      anchorEl,
      clientX: left || 100,
      clientY: top || 100,
      items: session.items,
      level: 0,
      parentId: null,
      parentEl: null,
      position: "bottom-left",
      // The visible scope caption is role="presentation", so assistive technology driving the menu
      // by its items would never reach it. Carry the scope in the menu's own name instead.
      ariaLabel: this.columnMenuAriaLabel(colID, colIds),
      onItemClick: session.onItemClick,
      onClose: session.onClose,
    });
  }

  private columnMenuAriaLabel(targetColId: string, colIds: string[]): string {
    const count = colIds.includes(targetColId) ? colIds.length : colIds.length + 1;
    return count > 1 ? `Column menu, ${count} columns` : "Column menu";
  }

  openFilterMenu(colID: string, anchorEl: HTMLElement) {
    const col = this.params.core.getColumnModel().getById(colID);
    if (!col) return;

    const session = this.params.filterMenuCoordinator.openFilterMenu({
      trigger: "filterButton",
      targetCol: col,
      anchorEl,
    });

    this.params.menuRenderer.open({
      anchorEl,
      clientX: anchorEl.getBoundingClientRect().left,
      clientY: anchorEl.getBoundingClientRect().bottom + 4,
      contentEl: session.contentEl,
      onOpen: session.onOpen,
      onClose: session.onClose,
      items: [],
    });
  }

  openAggregateMenu(colID: string, activeType: AggregateType, anchorEl: HTMLElement) {
    const session = this.params.menuCoordinator.openColumnMenu({
      trigger: "columnMenuButton",
      targetColId: colID,
      colIds: [colID],
      anchorEl,
      // Not a real column menu: this builds the full menu only to lift the aggregate item's
      // submenu out of it. Application getters must not see (or be able to empty) it.
      __suppressAppMenuItems: true,
    } as InternalColumnMenuContext);
    const aggregateItem = session.items.find(item => item.id === "aggregateColumns");
    const items = aggregateItem?.subMenu?.map(item => {
      const active = item.payload?.agg === activeType;
      return {
        ...item,
        disabled: active,
        right: active ? "icon-check" : undefined,
        // The footer cell shows ONE function, so this menu keeps single-choice semantics: picking
        // a function replaces the cell's current one, unlike the column menu's additive toggles.
        payload: item.payload ? { ...item.payload, mode: "replace" } : item.payload,
      };
    });
    if (!items?.length) {
      session.onClose();
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl,
      clientX: rect.left,
      clientY: rect.top - 4,
      items,
      position: "top-left",
      ariaLabel: "Column menu",
      onItemClick: session.onItemClick,
      onClose: session.onClose,
    });
  }
}
