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

  /**
   * Keyboard interaction for the header cursor. Runs from the root's keydown handler before the body
   * handlers and only while the header holds the cursor, so the body's meanings for these keys (Enter
   * = edit, printable = type-to-edit) never fire on a header cell. Returns true when consumed.
   * Dispatches the same actions as the mouse path, so the two cannot drift.
   */
  onKeyDown(e: KeyboardEvent): boolean {
    const core = this.params.core;
    const colIdx = core.getHeaderFocusColIdx();
    if (colIdx == null) return false;
    const col = core.getHeaderFocusColumn();
    const ctrl = e.ctrlKey || e.metaKey;

    const nav = (dir: "left" | "right" | "down" | "home" | "end") => {
      core.dispatch({ type: "headerNavigate", dir });
      return true;
    };

    // Alt+Down opens the column menu, Shift+Alt+Down the filter — checked before the bare arrows.
    if (e.altKey && e.key === "ArrowDown") {
      if (!col || col.isRowNumberColumn()) return true;
      const headerEl = document.getElementById(col.instanceID) ?? undefined;
      if (e.shiftKey) {
        const anchor = headerEl?.querySelector<HTMLElement>(".pte-hcell-menu-filterBtn") ?? headerEl;
        if (anchor) {
          core.dispatch({ type: "headerAction", action: "filterClick", colId: col.instanceID });
          this.params.openColumnFilter(col.instanceID, anchor);
        }
      } else {
        core.dispatch({ type: "headerAction", action: "menuClick", colId: col.instanceID });
        this.params.openColumnMenu("columnMenuButton", col.instanceID, {
          anchorEl: headerEl?.querySelector<HTMLElement>(".pte-hcell-menu-menuBtn") ?? headerEl,
        });
      }
      return true;
    }

    switch (e.key) {
      case "ArrowLeft": return nav("left");
      case "ArrowRight": return nav("right");
      case "ArrowDown": return nav("down");
      // Already on row 0. Consumed anyway: letting it through would move the body cursor behind a
      // header the user is still looking at — the same leak that bit the menus in 6.5.
      case "ArrowUp": return true;
      case "Home": return nav("home");
      case "End": return nav("end");
      default: break;
    }

    const isActivate = e.key === "Enter" || e.key === " " || e.code === "Space";
    if (!isActivate) {
      // Anything else with no header meaning is left alone, so page-level and app shortcuts still
      // work while the cursor sits in the header.
      return false;
    }
    if (!col) return true;

    // Ctrl+Space selects the column (Excel's binding), and is the only activation the row-number
    // column ignores — it has no column of its own to select.
    if (ctrl) {
      if (!col.isLeadingUtilityColumn() && core.options.columnSelection) {
        this.params.toggleColumnSelection(col.instanceID, e.shiftKey ? "toggle" : "replace");
      }
      return true;
    }

    // The row-number header's only action is select-all, matching a click on it.
    if (col.isRowNumberColumn()) {
      if (core.options.rowSelection && core.options.selectAllRowsOnHeaderClick) {
        core.dispatch({ type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "keyboard" });
      }
      return true;
    }
    // Same for the checkbox column's header checkbox (Space/Enter mirror a click on it).
    if (col.isSelectionCheckboxColumn()) {
      if (core.options.rowSelectionHeaderCheckbox) {
        core.dispatch({ type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "keyboard" });
      }
      return true;
    }

    // A leaf carrying the group expander toggles it; otherwise activation sorts. Parent (group) header
    // cells are not reachable by this cursor at all.
    if (col.showExpander) {
      core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: col.instanceID });
      return true;
    }
    if (col.sortable) {
      const additive = core.options.multiSortKey === "shift" ? e.shiftKey : ctrl;
      core.dispatch({ type: "headerAction", action: "toggleSort", colId: col.instanceID, additive });
    }
    return true;
  }

  onHeaderContextMenu(e: MouseEvent) {
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    const col = header ? this.params.core.getColumnModel().getById(header.id) : undefined;
    // A locked selection-checkbox column has no header action at all. Suppress both the empty grid
    // frame and the browser-native menu for this internal target.
    if (col?.isSelectionCheckboxColumn() && !col.pinnable) {
      e.preventDefault();
      return;
    }
    // Per-column opt-out: when columnContextMenu is false, do NOT preventDefault so the browser's
    // native context menu appears instead of the grid's column menu. (Checked before the default
    // preventDefault below, which otherwise suppresses the native menu across the whole header.)
    // The auto-group column takes part like any regular column; only row numbers stay inert.
    if (col && !col.isRowNumberColumn() && !col.headerContextMenuEnabled) return;

    e.preventDefault();
    if (!header) return;
    if (!col || col.isRowNumberColumn()) return;
    const selectedColumnIDs = this.params.selectedColumnIDs();
    const leaves = col.getLeaves();
    if (leaves.filter(l => selectedColumnIDs.has(l.instanceID)).length != leaves.length) {
      selectedColumnIDs.clear();
      this.params.toggleColumnSelection(col.instanceID, "replace");
    }
    this.params.openColumnMenu("headerContextMenu", header.id, { left: e.clientX, top: e.clientY });
  }

  /**
   * A click on a header cell is also a cursor move, or the painted ring and the next arrow key
   * disagree about where they are. Driven from the *click*, not the mousedown, so a column drag or a
   * resize — which start on a header but are not a choice of cell — leave the cursor alone. Leaf cells
   * only, the space the cursor walks; a click on a parent (group) header leaves it where it is. The
   * column selection is untouched, so arrow keys afterwards still build one up.
   */
  private moveCursorToClickedHeader(e: MouseEvent, header: Element) {
    // A button inside the header — menu, filter, group expander — is a control, not a choice of cell.
    // Alt+ArrowDown likewise opens the menu for the column the cursor already occupies, so neither
    // route moves it; that also spares a cell selection the menu action may be about.
    if ((e.target as HTMLElement | null)?.closest(".pte-hcell-menu-btn")) return;
    const core = this.params.core;
    const col = core.getColumnModel().getById(header.id);
    if (!col) return;
    const colIdx = core.getColumnModel().getLeaves().findIndex(l => l.instanceID === col.instanceID);
    if (colIdx < 0) return;
    core.dispatch({ type: "headerFocusSet", colIdx, reason: "mouse" });
  }

  onHeaderCellClick(e: MouseEvent) {
    // Routing keys off the header CSS classes (.pte-hcell-sort, .pte-hcell-content,
    // .pte-hcell-menu-btn / -filterBtn). Custom header components (ColDef.headerComponent /
    // headerCellComponent) that reuse these classes inherit this default routing; those that render
    // their own controls drive interactions via the callbacks on HeaderComponentParams instead.
    const header = (e.target as HTMLElement)?.closest(".pte-hcell");
    if (!header) return;
    this.moveCursorToClickedHeader(e, header);
    // Clicking the row-number header toggles all-rows selection (consistent with clicking any other
    // header cell), when enabled via selectAllRowsOnHeaderClick. The row-number column is internal,
    // so the normal column-select/sort path below would no-op for it anyway.
    if (header.classList.contains("pte-hcell-row-number")) {
      if (this.params.core.options.rowSelection
        && this.params.core.options.selectAllRowsOnHeaderClick) {
        this.params.core.dispatch({
          type: "rowSelectAll",
          selected: !this.params.core.areAllRowsSelected(),
          reason: "mouse",
        });
      }
      return;
    }
    // The checkbox column's header checkbox always toggles select-all — enabling it IS the opt-in.
    if (header.classList.contains("pte-hcell-checkbox")) {
      if (this.params.core.options.rowSelectionHeaderCheckbox) {
        this.params.core.dispatch({
          type: "rowSelectAll",
          selected: !this.params.core.areAllRowsSelected(),
          reason: "mouse",
        });
      }
      return;
    }
    const headerExpand = (e.target as HTMLElement)?.closest(".pte-hcell-expander");
    if (headerExpand) {
      return this.params.core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: header.id });
    }
    // The sort icon lives inside .pte-hcell-content, so it must be checked before the content branch
    // below. A plain click replaces the sort with this column; the configured multiSortKey modifier
    // makes it additive (multi-column sort).
    const sortIcon = (e.target as HTMLElement)?.closest(".pte-hcell-sort");
    if (sortIcon) {
      const col = this.params.core.getColumnModel().getById(header.id);
      if (!col || !col.sortable) return;
      const additive = this.params.core.options.multiSortKey === "shift"
        ? e.shiftKey
        : e.ctrlKey || e.metaKey;
      return this.params.core.dispatch({ type: "headerAction", action: "toggleSort", colId: header.id, additive });
    }
    const headerContent = (e.target as HTMLElement)?.closest(".pte-hcell-content");
    if (headerContent) {
      const col = this.params.core.getColumnModel().getById(header.id);
      if (!col || col.isRowNumberColumn()) return;
      if (e.shiftKey) {
        // Backward-compatible power-user shortcut: Shift+click on the header body sorts additively.
        return this.params.core.dispatch({ type: "headerAction", action: "toggleSort", colId: header.id, additive: true });
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
