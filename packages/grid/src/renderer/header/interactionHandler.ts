import { GridCore } from "../../core/core";
import type { Column } from "../../column/column";
import { DEFAULT_SORTING_ORDER, nextSortDir, type SortDir } from "../../interfaces/sort";
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
    // Shift is accepted on the vertical chords because it has no meaning of its own there: the body
    // clears the column selection as the cursor arrives, and declining would move the body cursor
    // behind a header the user is still looking at.
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

      // Shift extends the column selection instead of moving the cursor alone — and only when the
      // cursor already sits on a selected column, which is what keeps the rule to one sentence. The
      // chord is claimed either way: declining it would drop a header keystroke into the body.
      {
        id: "extendLeft",
        chord: { key: "arrowleft", shift: true },
        scope: "headerCursor",
        label: "Extend the column selection left",
        run: () => this.extendColumnSelection("left"),
      },
      {
        id: "extendRight",
        chord: { key: "arrowright", shift: true },
        scope: "headerCursor",
        label: "Extend the column selection right",
        run: () => this.extendColumnSelection("right"),
      },
      {
        id: "extendToFirst",
        chord: { key: "arrowleft", mod: true, shift: true },
        scope: "headerCursor",
        label: "Extend the column selection to the first column",
        run: () => this.extendColumnSelection("home"),
      },
      {
        id: "extendToLast",
        chord: { key: "arrowright", mod: true, shift: true },
        scope: "headerCursor",
        label: "Extend the column selection to the last column",
        run: () => this.extendColumnSelection("end"),
      },
      {
        id: "extendHome",
        chord: { key: "home", mod: "any", shift: true },
        scope: "headerCursor",
        label: "Extend the column selection to the first column",
        run: () => this.extendColumnSelection("home"),
      },
      {
        id: "extendEnd",
        chord: { key: "end", mod: "any", shift: true },
        scope: "headerCursor",
        label: "Extend the column selection to the last column",
        run: () => this.extendColumnSelection("end"),
      },

      // Mod jumps to the row of columns' edge, matching the body's Ctrl+Arrow block jump. These are
      // the same stops Home/End use.
      {
        id: "firstColumn",
        chord: { key: "arrowleft", mod: true },
        scope: "headerCursor",
        label: "First column",
        run: nav("home"),
      },
      {
        id: "lastColumn",
        chord: { key: "arrowright", mod: true },
        scope: "headerCursor",
        label: "Last column",
        run: nav("end"),
      },
      {
        id: "moveLeft",
        chord: "arrowleft",
        scope: "headerCursor",
        label: "Previous column",
        run: nav("left"),
      },
      {
        id: "moveRight",
        chord: "arrowright",
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
        chord: { key: "home", mod: "any" },
        scope: "headerCursor",
        label: "First column",
        run: nav("home"),
      },
      {
        id: "endColumn",
        chord: { key: "end", mod: "any" },
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

      // Space selects, Enter sorts — one job per key, matching the body, where Space on a checkbox
      // cell already means "select this thing". Each is a single binding that branches on the column
      // type rather than several bindings claiming one chord, so the router's conflict check has
      // nothing to complain about. Shift+Space is deliberately unclaimed, and Ctrl/Cmd+Shift+Space
      // with it — the tree-navigation switch takes that chord at `grid` scope.
      {
        id: "selectColumn",
        chord: { key: "space", mod: "any" },
        scope: "headerCursor",
        label: "Select column",
        run: (e) => {
          const col = core.getHeaderFocusColumn();
          if (!col || this.utilityHeaderActivation(col)) return;
          if (!core.options.columnSelection) return;
          this.params.toggleColumnSelection(col.instanceID, hasMod(e) ? "toggle" : "replace");
        },
      },
      {
        id: "sortColumn",
        chord: { key: "enter", mod: "any", shift: "any" },
        scope: "headerCursor",
        label: "Sort column",
        run: (e) => {
          const col = core.getHeaderFocusColumn();
          if (!col || this.utilityHeaderActivation(col)) return;

          // A leaf carrying the group expander toggles it and never sorts. Parent (group) header
          // cells are not reachable by this cursor at all.
          if (col.showExpander) {
            core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId: col.instanceID });
            return;
          }
          if (!col.sortable) return;
          if (e.shiftKey) {
            this.sortColumnSelection(col);
            return;
          }
          core.dispatch({
            type: "headerAction",
            action: "toggleSort",
            colId: col.instanceID,
            additive: hasMod(e),
          });
        },
      },
    ];
  }

  /**
   * A row-number or checkbox header has exactly one action — select all rows — on either key, and
   * never sorts or selects a column. Returns true when the column is one of those, whether or not
   * its action is enabled: the key belongs to the header either way.
   */
  private utilityHeaderActivation(col: Column): boolean {
    const core = this.params.core;
    const selectAll = () => core.dispatch({
      type: "rowSelectAll", selected: !core.areAllRowsSelected(), reason: "keyboard",
    });
    if (col.isRowNumberColumn()) {
      if (core.options.rowSelection && core.options.selectAllRowsOnHeaderClick) selectAll();
      return true;
    }
    if (col.isSelectionCheckboxColumn()) {
      if (core.options.rowSelectionHeaderCheckbox) selectAll();
      return true;
    }
    return false;
  }

  /**
   * Shift+Enter sorts every selected column at once — the keyboard's counterpart of the
   * multi-column menu's Sort Ascending/Descending, and like the menu it leaves columns outside the
   * selection alone. The menu can offer a direction per state; a keystroke has to pick one, so the
   * group's shared direction (mixed counts as unsorted) is advanced through the cursor column's
   * configured `sortingOrder`. A selection of one degrades to plain Enter.
   */
  private sortColumnSelection(target: Column): void {
    const core = this.params.core;
    const selected = core.getSelectedColumnIds();
    const cols = core.getColumnModel().getLeaves()
      .filter(col => col.sortable && !col.isInternal()
        && (col.instanceID === target.instanceID || selected.has(col.instanceID)));
    if (cols.length <= 1) {
      core.dispatch({
        type: "headerAction", action: "toggleSort", colId: target.instanceID, additive: false,
      });
      return;
    }

    const sorted = core.getSortModel().items;
    let groupDir: SortDir | null | "mixed" = null;
    for (const [idx, col] of cols.entries()) {
      const dir = sorted.find(item => item.col.instanceID === col.instanceID)?.dir ?? null;
      if (idx === 0) groupDir = dir;
      else if (groupDir !== dir) groupDir = "mixed";
    }
    const dir = nextSortDir(
      groupDir === "mixed" ? null : groupDir,
      target.sortingOrder ?? DEFAULT_SORTING_ORDER,
    );
    core.dispatch({
      type: "sortModelSet",
      sortItems: cols.map(col => ({ key: col.instanceID, dir })),
    });
  }

  /**
   * Grow (or shrink) the column selection from the cursor. Strict by design: unless the cursor is
   * already on a selected column this does nothing at all — not even move the cursor — so
   * `Shift+Arrow` can never look like plain movement that quietly starts selecting. Utility headers
   * are never column-selected, which is why they need no special case here: `Ctrl+A` selects the
   * body, so pressing Space on a row-number header must not seed a *header* selection.
   */
  private extendColumnSelection(dir: "left" | "right" | "home" | "end"): void {
    const core = this.params.core;
    if (!core.options.columnSelection) return;
    const at = core.getHeaderFocusColIdx();
    const from = core.getHeaderFocusColumn();
    if (at == null || !from || !this.params.selectedColumnIDs().has(from.instanceID)) return;

    // Selectable stops, not cursor stops: an extension steps over the columns a range cannot cover
    // (row numbers, the checkbox column — which is the *last* leaf when pinned right — and the
    // generated group column) rather than parking the cursor on one and growing nothing.
    const leaves = core.getColumnModel().getLeaves();
    const stops = leaves.map((col, idx) => col.isInternal() ? -1 : idx).filter(idx => idx >= 0);
    const stopIdx = stops.indexOf(at);
    if (stopIdx < 0) return;
    const next = dir === "left" ? stops[Math.max(0, stopIdx - 1)]
      : dir === "right" ? stops[Math.min(stops.length - 1, stopIdx + 1)]
        : dir === "home" ? stops[0]
          : stops[stops.length - 1];

    core.dispatch({ type: "headerFocusSet", colIdx: next, reason: "keyboard" });
    core.dispatch({ type: "columnSelectSet", colId: leaves[next].instanceID, mode: "range" });
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
    // below. A plain click replaces the sort with this column; Ctrl/Cmd *or* Shift makes it additive.
    // Both modifiers, not one configured modifier: Shift+click on the header body was already
    // unconditionally additive, so a `multiSortKey` of "ctrl" made the same modifier mean two things
    // depending on where in the cell the user clicked.
    const sortIcon = (e.target as HTMLElement)?.closest(".pte-hcell-sort");
    if (sortIcon) {
      const col = this.params.core.getColumnModel().getById(header.id);
      if (!col || !col.sortable) return;
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
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
