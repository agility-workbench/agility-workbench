import { GridCore } from "../../core/core";

type HeaderInteractionHandlerParams = {
  core: GridCore;
  root: HTMLElement;
  selectedColumnIDs: () => Set<string>;
  toggleColumnSelection: (colID: string) => void;
  openColumnMenu: (
    trigger: "columnMenuButton" | "headerContextMenu",
    colID: string,
    anchor: { anchorEl?: HTMLElement; left?: number; top?: number },
  ) => void;
  openColumnFilter: (colID: string, anchorEl: HTMLElement) => void;
};

export class HeaderInteractionHandler {
  constructor(private params: HeaderInteractionHandlerParams) {}

  onHeaderContextMenu(e: MouseEvent) {
    e.preventDefault();
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (!header) return;
    const col = this.params.core.getColumnModel().getById(header.id);
    if (!col) return;
    const selectedColumnIDs = this.params.selectedColumnIDs();
    const leaves = col.getLeaves();
    if (leaves.filter(l => selectedColumnIDs.has(l.instanceID)).length != leaves.length) {
      selectedColumnIDs.clear();
      this.params.toggleColumnSelection(col.instanceID);
    }
    this.params.openColumnMenu("headerContextMenu", header.id, { left: e.clientX, top: e.clientY });
  }

  onHeaderCellClick(e: MouseEvent) {
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (!header) return;
    const headerExpand = (e.target as HTMLElement)?.closest(".pte-hcell-expander");
    if (headerExpand) {
      return this.params.core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: header.id });
    }
    const headerContent = (e.target as HTMLElement)?.closest(".pte-hcell-content");
    if (headerContent) {
      const col = this.params.core.getColumnModel().getById(header.id);
      if (!col) return;
      if (e.shiftKey) {
        return this.params.core.dispatch({ type: "headerAction", action: "toggleSort", colId: header.id });
      }
      this.params.toggleColumnSelection(header.id);
      return this.params.core.dispatch({ type: "headerAction", action: "click", colId: header.id });
    }
    const btn: HTMLDivElement | null = (e.target as HTMLElement)?.closest(".pte-hcell-menu-btn");
    if (btn) {
      const isFilter = btn.classList.contains("pte-hcell-menu-filterBtn");
      this.params.core.dispatch({ type: "headerAction", action: (isFilter ? "filter" : "menu") + "Click", colId: header.id });
      if (!isFilter) {
        this.params.openColumnMenu("columnMenuButton", header.id, { anchorEl: btn });
      } else {
        this.params.openColumnFilter(header.id, btn);
      }
      return;
    }
  }

  onDocumentClick(e: MouseEvent) {
    const btn: HTMLDivElement | null = (e.target as HTMLElement)?.closest(".pte-hcell-menu-btn");
    if (btn) {
      if ((btn.parentNode as HTMLElement)?.classList?.contains("active")) {
        const activeMenus = this.params.root.querySelectorAll(".pte-hcell-menu-item.active");
        activeMenus.forEach(m => m != btn.parentNode && m.classList.remove("active"));
        return;
      }
    }

    const activeMenus = this.params.root.querySelectorAll(".pte-hcell-menu-item.active");
    activeMenus.forEach(m => m.classList.remove("active"));

    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (header) {
      this.onHeaderCellClick(e);
      return;
    }
  }
}
