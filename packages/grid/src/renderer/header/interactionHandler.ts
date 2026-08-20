import { GridCore } from "../../core/core";
import type { Column } from "../../column/column";
import { hasMod } from "../interaction/keyChord";
import type { KeyboardBinding } from "../interaction/keyboardRouter";

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
   * The header cursor's keymap, registered into the router's `headerCursor` scope — active only
   * while the header holds the cursor, so the body's meanings for these keys (Enter = edit,
   * printable = type-to-edit) never fire on a header cell. The scope is not blocking: a key with no
   * header meaning falls through to the grid's own chords, which is why the movement bindings below
   * accept Shift explicitly rather than by omission. Actions match the mouse path so the two cannot
   * drift.
   */
  keyboardBindings(): KeyboardBinding[] {
    const core = this.params.core;
    const nav = (dir: "left" | "right" | "down" | "home" | "end", jump?: "block") => () => {
      core.dispatch({ type: "headerNavigate", dir, jump });
    };
    // Shift is accepted on every movement chord because it has no header meaning *yet*: extending
    // the column selection with Shift+Arrow is planned (docs/planned-work.md §2), and until then
    // declining the chord would drop it through to the body and move the body cursor instead.
    const move = { shift: "any" } as const;

    return [
      // Alt+Down opens the column menu, Shift+Alt+Down the filter. Mod is not read, so Ctrl+Alt+Down
      // is not this chord (it is AltGr on Windows layouts).
      {
        id: "openColumnMenu",
        chord: "alt+arrowdown",
        scope: "headerCursor",
        label: "Open column menu",
        run: () => this.openMenuOrFilter(false),
      },
      {
        id: "openColumnFilter",
        chord: "shift+alt+arrowdown",
        scope: "headerCursor",
        label: "Open column filter",
        run: () => this.openMenuOrFilter(true),
      },

      // Mod jumps to the row of columns' edge, matching the body's Ctrl+Arrow block jump. These are
      // the same stops Home/End use.
      {
        id: "firstColumn",
        chord: { key: "arrowleft", mod: true, ...move },
        scope: "headerCursor",
        label: "First column",
        run: nav("home"),
      },
      {
        id: "lastColumn",
        chord: { key: "arrowright", mod: true, ...move },
        scope: "headerCursor",
        label: "Last column",
        run: nav("end"),
      },
      {
        id: "moveLeft",
        chord: { key: "arrowleft", ...move },
        scope: "headerCursor",
        label: "Previous column",
        run: nav("left"),
      },
      {
        id: "moveRight",
        chord: { key: "arrowright", ...move },
        scope: "headerCursor",
        label: "Next column",
        run: nav("right"),
      },
      {
        id: "enterBodyLastRow",
        chord: { key: "arrowdown", mod: true, ...move },
        scope: "headerCursor",
        label: "Last row",
        run: nav("down", "block"),
      },
      {
        id: "enterBody",
        chord: { key: "arrowdown", ...move },
        scope: "headerCursor",
        label: "Enter the rows",
        run: nav("down"),
      },
      {
        id: "homeColumn",
        chord: { key: "home", mod: "any", ...move },
        scope: "headerCursor",
        label: "First column",
        run: nav("home"),
      },
      {
        id: "endColumn",
        chord: { key: "end", mod: "any", ...move },
        scope: "headerCursor",
        label: "Last column",
        run: nav("end"),
      },
      // Already on row 0. Consumed anyway: letting it through would move the body cursor behind a
      // header the user is still looking at — the same leak that bit the menus in 6.5.
      {
        id: "consumeArrowUp",
        chord: { key: "arrowup", mod: "any", ...move },
        scope: "headerCursor",
        run: () => undefined,
      },

      // Ctrl+Space selects the column (Excel's binding), Shift making it additive — a deliberate
      // grid extension, since Excel's Ctrl+Shift+Space selects the whole sheet. This is also the
      // tree-data navigation switch's chord, which is a body-cursor binding: same keystroke, two
      // scopes, two meanings. See docs/planned-work.md §2.
      ...this.activationBindings("selectColumn", { mod: true, shift: "any" }, (e) => {
        const col = core.getHeaderFocusColumn();
        if (!col) return;
        if (!col.isLeadingUtilityColumn() && core.options.columnSelection) {
          this.params.toggleColumnSelection(col.instanceID, e.shiftKey ? "toggle" : "replace");
        }
      }, "Select column"),

      ...this.activationBindings("activate", { shift: "any" }, (e) => {
        const col = core.getHeaderFocusColumn();
        if (!col) return;

        // The row-number header's only action is select-all, matching a click on it; same for the
        // checkbox column's header checkbox.
        if (col.isRowNumberColumn()) {
          if (core.options.rowSelection && core.options.selectAllRowsOnHeaderClick) {
            core.dispatch({
              type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "keyboard",
            });
          }
          return;
        }
        if (col.isSelectionCheckboxColumn()) {
          if (core.options.rowSelectionHeaderCheckbox) {
            core.dispatch({
              type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "keyboard",
            });
          }
          return;
        }

        // A leaf carrying the group expander toggles it; otherwise activation sorts. Parent (group)
        // header cells are not reachable by this cursor at all.
        if (col.showExpander) {
          core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: col.instanceID });
          return;
        }
        if (col.sortable) {
          core.dispatch({
            type: "headerAction",
            action: "toggleSort",
            colId: col.instanceID,
            additive: core.options.multiSortKey === "shift" ? e.shiftKey : hasMod(e),
          });
        }
      }, "Activate column header"),
    ];
  }

  /**
   * Enter and Space activate identically, so each activation is registered as the same `run` under
   * both keys rather than duplicated.
   */
  private activationBindings(
    id: string,
    modifiers: { mod?: boolean | "any"; shift?: boolean | "any" },
    run: (e: KeyboardEvent) => void,
    label: string,
  ): KeyboardBinding[] {
    return ["enter", "space"].map(key => ({
      id: `${id}.${key}`,
      chord: { key, ...modifiers },
      scope: "headerCursor" as const,
      label,
      run,
    }));
  }

  private openMenuOrFilter(filter: boolean): void {
    const core = this.params.core;
    const col = core.getHeaderFocusColumn();
    // Consumed either way: the chord belongs to the header even when this cell has no menu.
    if (!col || col.isRowNumberColumn()) return;
    const headerEl = document.getElementById(col.instanceID) ?? undefined;
    if (filter) {
      const anchor = headerEl?.querySelector<HTMLElement>(".pte-hcell-menu-filterBtn") ?? headerEl;
      if (!anchor) return;
      core.dispatch({ type: "headerAction", action: "filterClick", colId: col.instanceID });
      this.params.openColumnFilter(col.instanceID, anchor);
      return;
    }
    core.dispatch({ type: "headerAction", action: "menuClick", colId: col.instanceID });
    this.params.openColumnMenu("columnMenuButton", col.instanceID, {
      anchorEl: headerEl?.querySelector<HTMLElement>(".pte-hcell-menu-menuBtn") ?? headerEl,
    });
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
    this.reconcileColumnSelectionForMenu(col);
    this.params.openColumnMenu("headerContextMenu", header.id, { left: e.clientX, top: e.clientY });
  }

  /**
   * Settle what a column menu is about to act on, before it opens: the menu acts on the current
   * column selection when the target is already part of it, and on the target alone otherwise —
   * replacing the selection so the highlight always matches the menu's scope.
   *
   * Both entry points run this so the ⋮ button and a header right-click open the *same menu* for
   * the same state; without it the button opens a menu about columns the user never clicked, with
   * nothing on screen tying the two together.
   *
   * `onlyIfScopeUnsettled` is what keeps the button from also inheriting right-click's side
   * effects. A header button is a control, not a choice of cell (see `moveCursorToClickedHeader`),
   * and `SelectionModel.toggleColumn` clears the cell range and row selection on its way through —
   * so an unconditional reconcile would make opening a menu discard the user's cell selection.
   *
   * Two situations genuinely need settling, and only those touch state:
   *   - an existing multi-column selection, which the menu would otherwise silently adopt;
   *   - a group header, whose menu is inherently about its leaves — reconciling is what expands
   *     the group into them, and without it the button would offer "Hide Column" where a
   *     right-click on the same header offers "Hide Columns".
   * Anything else already collapses to `[target]` in ColumnMenuOpener, so both gestures open the
   * same menu without either one disturbing the user's selection.
   */
  private reconcileColumnSelectionForMenu(col: Column, opts: { onlyIfScopeUnsettled?: boolean } = {}) {
    const selectedColumnIDs = this.params.selectedColumnIDs();
    if (opts.onlyIfScopeUnsettled && selectedColumnIDs.size <= 1 && col.children.length === 0) return;

    const leaves = col.getLeaves();
    if (leaves.filter(l => selectedColumnIDs.has(l.instanceID)).length != leaves.length) {
      selectedColumnIDs.clear();
      this.params.toggleColumnSelection(col.instanceID, "replace");
    }
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
        // Same reconciliation as a header right-click: the button must not open a menu about
        // columns the user did not click while their selection sits elsewhere.
        const col = this.params.core.getColumnModel().getById(header.id);
        if (col && !col.isRowNumberColumn()) {
          this.reconcileColumnSelectionForMenu(col, { onlyIfScopeUnsettled: true });
        }
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
