import { GridCore } from "../../core/core";

type HeaderInteractionHandlerParams = {
  core: GridCore;
  root: HTMLElement;
  selectedColumnIDs: () => Set<string>;
  toggleColumnSelection: (colID: string, mode: "replace" | "toggle") => void;
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
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    const col = header ? this.params.core.getColumnModel().getById(header.id) : undefined;
    // Per-column opt-out: when columnContextMenu is false, do NOT preventDefault so the browser's
    // native context menu appears instead of the grid's column menu. (Checked before the default
    // preventDefault below, which otherwise suppresses the native menu across the whole header.)
    if (col && !col.isInternal() && !col.columnContextMenu) return;

    e.preventDefault();
    if (!header) return;
    if (!col || col.isInternal()) return;
    const selectedColumnIDs = this.params.selectedColumnIDs();
    const leaves = col.getLeaves();
    if (leaves.filter(l => selectedColumnIDs.has(l.instanceID)).length != leaves.length) {
      selectedColumnIDs.clear();
      this.params.toggleColumnSelection(col.instanceID, "replace");
    }
    this.params.openColumnMenu("headerContextMenu", header.id, { left: e.clientX, top: e.clientY });
  }

  onHeaderCellClick(e: MouseEvent) {
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (!header) return;
    // Clicking the row-number header toggles all-rows selection (consistent with clicking any other
    // header cell), when enabled via selectAllRowsOnHeaderClick. The row-number column is internal,
    // so the normal column-select/sort path below would no-op for it anyway.
    if (header.classList.contains("pte-hcell-row-number")) {
      if (this.params.core.options.selectAllRowsOnHeaderClick) {
        this.params.core.dispatch({ type: "rowSelectAll", selected: !this.params.core.areAllRowsSelected() });
      }
      return;
    }
    const headerExpand = (e.target as HTMLElement)?.closest(".pte-hcell-expander");
    if (headerExpand) {
      return this.params.core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: header.id });
    }
    const headerContent = (e.target as HTMLElement)?.closest(".pte-hcell-content");
    if (headerContent) {
      const col = this.params.core.getColumnModel().getById(header.id);
      if (!col || col.isInternal()) return;
      if (e.shiftKey) {
        return this.params.core.dispatch({ type: "headerAction", action: "toggleSort", colId: header.id });
      }
      // Column selection is opt-out: when disabled, a header click still counts as a header action
      // (e.g. for sort affordances) but does not select the column.
      if (this.params.core.options.columnSelection) {
        const additive = e.ctrlKey || e.metaKey;
        this.params.toggleColumnSelection(header.id, additive ? "toggle" : "replace");
      }
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
