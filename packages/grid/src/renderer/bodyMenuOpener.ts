import { GridCore } from "../core/core";
import { BodyMenuCoordinator } from "../menu/bodyMenuCoordinator";
import { BodyMenuContext, BodyMenuSelectionSnapshot } from "../menu/bodyContext";
import type { IRowNode } from "../interfaces/iRowNode";
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

    const colIdx = Number(cell.dataset.colIdx);
    const colId = cell.dataset.colId ?? null;
    if (!Number.isFinite(colIdx) || !colId) return;

    const resolved = this.resolveRow(rowEl, rowPinned);
    if (!resolved) return;
    const { viewIdx, node } = resolved;
    const rowId = node.id;

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
      node,
      viewIdx,
      rowPinned,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  // The clicked row's node and the view index the core addresses it by. App-pinned band rows carry a
  // band-local data-view-idx plus a rowPinned marker, so they resolve from the band. A sticky mirror
  // stamps the node's own viewIndex, which is not page-relative once a grouped view paginates, so it
  // resolves by its row id instead (an ancestor docked over a later page is not on the page, so it
  // resolves to nothing rather than to whichever row holds its index there); every other body row's
  // data-view-idx is the page slot.
  private resolveRow(rowEl: HTMLElement, rowPinned: "top" | "bottom" | undefined): { viewIdx: number; node: IRowNode } | null {
    const core = this.params.core;
    if (rowPinned) {
      const viewIdx = Number(rowEl.dataset.viewIdx);
      const node = Number.isFinite(viewIdx) ? core.getDisplayedPinnedRow(rowPinned, viewIdx) : null;
      return node ? { viewIdx, node } : null;
    }
    if (rowEl.classList.contains("pte-sticky-row")) {
      const rowId = rowEl.dataset.rowId;
      const viewIdx = rowId != null ? core.getViewIndexForRowId(rowId) : null;
      const node = viewIdx != null ? core.getRowModel().getRowNodeAtViewIndex(viewIdx) : null;
      return node ? { viewIdx: viewIdx!, node } : null;
    }
    const viewIdx = Number(rowEl.dataset.viewIdx);
    const node = Number.isFinite(viewIdx) ? core.getRowModel().getRowNodeAtViewIndex(viewIdx) : null;
    return node ? { viewIdx, node } : null;
  }

  private open(args: { rowId: string; colId: string; node: IRowNode; viewIdx: number; rowPinned?: "top" | "bottom"; clientX: number; clientY: number; anchorEl?: HTMLElement }) {
    const core = this.params.core;
    const ctx: BodyMenuContext = {
      trigger: "bodyContextMenu",
      rowId: args.rowId,
      colId: args.colId,
      node: args.node,
      isGroup: !!args.node.isGroup,
      isFullWidth: core.isFullWidthNode(args.node),
      groupDisplayType: core.options.groupDisplayType,
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
