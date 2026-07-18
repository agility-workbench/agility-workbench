import { GridCore } from "../core/core";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
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
}
