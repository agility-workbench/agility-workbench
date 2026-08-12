import { GridCore } from "../core/core";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { AggregateType } from "../interfaces/aggregate";
import { MenuCoordinator } from "../menu/coordinator";
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
    const session = this.params.menuCoordinator.openColumnMenu({
      trigger,
      targetColId: colID,
      colIds: selectedColumnIDs.size > 1 ? Array.from(selectedColumnIDs) : [colID],
      anchorEl,
      clientX: left,
      clientY: top,
    });

    this.params.menuRenderer.open({
      anchorEl,
      clientX: left || 100,
      clientY: top || 100,
      items: session.items,
      level: 0,
      parentId: null,
      parentEl: null,
      position: "bottom-left",
      ariaLabel: "Column menu",
      onItemClick: session.onItemClick,
      onClose: session.onClose,
    });
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
    });
    const aggregateItem = session.items.find(item => item.id === "aggregateColumns");
    const items = aggregateItem?.subMenu?.map(item => {
      const active = item.payload?.agg === activeType;
      return {
        ...item,
        disabled: active,
        right: active ? "icon-check" : undefined,
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
