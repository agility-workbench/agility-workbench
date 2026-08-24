import { GridCore } from "../core/core";
import { BodyMenuCoordinator } from "../menu/bodyMenuCoordinator";
import { BodyMenuContext, BodyMenuSelectionSnapshot } from "../menu/bodyContext";
import { MenuRenderer } from "./menuRenderer";

interface BodyMenuOpenerParams {
  core: GridCore;
  root: HTMLDivElement;
  bodyMenuCoordinator: BodyMenuCoordinator;
  menuRenderer: MenuRenderer;
}

export class BodyMenuOpener {
  constructor(private params: BodyMenuOpenerParams) { }

  onBodyContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const cell = target.closest(".pte-cell") as HTMLDivElement | null;
    if (!cell || !this.params.root.contains(cell)) return;

    const rowEl = cell.closest(".pte-row") as HTMLDivElement | null;
    if (!rowEl) return;

    // App-pinned band rows carry a band-local data-view-idx plus a rowPinned marker; resolve their
    // rowId from the band, not the body view. (Sticky mirrors carry the real body view index and no
    // marker, so they take the body path.)
    const rowPinned = rowEl.dataset.rowPinned === "top" || rowEl.dataset.rowPinned === "bottom"
      ? rowEl.dataset.rowPinned
      : undefined;

    const isRowNumber = cell.classList.contains("pte-row-number-cell");
    const isSelectableRowNumber = isRowNumber && this.params.core.options.rowSelection;
    const isActionableRowNumber = isRowNumber
      && (this.params.core.options.rowSelection || !!this.params.core.options.rowInsertionMenu);
    // A checkbox cell carries no value of its own, so a menu scoped to it would act on nothing. It
    // is independently actionable like the row-number gutter: right-click checks its row (below) so
    // the copy / export / pin items have a row to operate on. Band rows render a blank slot and are
    // not part of the row-id selection model, so theirs stays inert.
    // An app-disabled checkbox cell (isRowSelectable → false) cannot check its row, so the menu the
    // gesture exists to serve has nothing to act on: the grid does not claim the gesture at all —
    // return BEFORE preventDefault, like bodyContextMenu === false, so the native menu appears.
    if (cell.classList.contains("pte-checkbox-cell-disabled")) return;
    const isSelectableCheckbox = cell.classList.contains("pte-checkbox-cell")
      && !!this.params.core.options.rowSelection
      && !rowPinned;
    // Data-cell menus require grid cell selection. An enabled row-number or checkbox cell is
    // independently actionable: right-click can establish a row selection even when ordinary cells
    // are inert.
    if (this.params.core.options.cellSelection !== true
      && !isActionableRowNumber && !isSelectableCheckbox) return;

    // bodyContextMenu === false disables the grid menu entirely: return BEFORE preventDefault so the
    // browser's native context menu appears. (A getter that returns [] is handled downstream — the
    // grid still owns the gesture in that case and shows nothing.)
    if (this.params.core.options.bodyContextMenu === false) return;

    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    const colIdx = Number(cell.dataset.colIdx);
    const colId = cell.dataset.colId ?? null;
    if (!Number.isFinite(viewIdx) || !Number.isFinite(colIdx) || !colId) return;

    const rowId = rowPinned
      ? this.params.core.getDisplayedPinnedRow(rowPinned, viewIdx)?.id ?? null
      : this.params.core.getRowIdAtViewIndex(viewIdx);
    if (!rowId) return;

    e.preventDefault();

    if (!this.params.core.isCellInActiveSelection(viewIdx, colIdx, rowId, colId, rowPinned)) {
      this.params.core.dispatch({ type: "focusSet", viewIdx, colIdx, rowPinned, reason: "mouse" });
      if (isSelectableRowNumber && !rowPinned) {
        // A row-number context menu must operate on row data, never on the internal utility cell.
        // Preserve the utility focus so keyboard navigation still starts where the pointer landed.
        this.params.core.dispatch({
          type: "rowSelectSet",
          viewIdx,
          mode: "replace",
          preserveFocus: true,
          reason: "mouse",
        });
      } else if (isSelectableCheckbox) {
        // The checkbox gesture is additive at both ends: right-click checks the clicked row (it is
        // never already checked here — an already-selected row counts as in-selection above) and
        // never unchecks the rows checked so far. Focus stays on the utility cell, as for a click.
        this.params.core.dispatch({
          type: "rowSelectSet",
          viewIdx,
          mode: "toggle",
          preserveFocus: true,
          reason: "mouse",
        });
      }
    }

    this.open({
      rowId,
      colId,
      viewIdx,
      rowPinned,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  private open(args: { rowId: string; colId: string; viewIdx: number; rowPinned?: "top" | "bottom"; clientX: number; clientY: number; anchorEl?: HTMLElement }) {
    const ctx: BodyMenuContext = {
      trigger: "bodyContextMenu",
      rowId: args.rowId,
      colId: args.colId,
      viewIdx: args.viewIdx,
      rowPinned: args.rowPinned,
      selection: this.snapshotSelection(),
      anchorEl: args.anchorEl,
      clientX: args.clientX,
      clientY: args.clientY,
    };

    const session = this.params.bodyMenuCoordinator.openBodyMenu(ctx);
    if (!session.items || session.items.length === 0) {
      session.onClose();
      return;
    }

    this.params.menuRenderer.open({
      anchorEl: args.anchorEl,
      clientX: args.clientX,
      clientY: args.clientY,
      items: session.items,
      level: 0,
      parentId: null,
      parentEl: null,
      position: "bottom-left",
      ariaLabel: "Cell menu",
      onItemClick: session.onItemClick,
      onClose: session.onClose,
    });
  }

  private snapshotSelection(): BodyMenuSelectionSnapshot {
    const range = this.params.core.getSelectionRange();
    return {
      rowIds: Array.from(this.params.core.getSelectedRowIds()),
      colIds: Array.from(this.params.core.getSelectedColumnIds()),
      range: range ? { ...range } : null,
    };
  }
}
