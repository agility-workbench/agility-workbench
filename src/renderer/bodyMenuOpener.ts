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

    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    const colIdx = Number(cell.dataset.colIdx);
    const colId = cell.dataset.colId ?? null;
    if (!Number.isFinite(viewIdx) || !Number.isFinite(colIdx) || !colId) return;

    const rowId = this.params.core.getRowIdAtViewIndex(viewIdx);
    if (!rowId) return;

    e.preventDefault();

    if (!this.params.core.isCellInActiveSelection(viewIdx, colIdx, rowId, colId)) {
      this.params.core.dispatch({ type: "focusSet", viewIdx, colIdx, reason: "mouse" });
    }

    this.open({
      rowId,
      colId,
      viewIdx,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  private open(args: { rowId: string; colId: string; viewIdx: number; clientX: number; clientY: number; anchorEl?: HTMLElement }) {
    const ctx: BodyMenuContext = {
      trigger: "bodyContextMenu",
      rowId: args.rowId,
      colId: args.colId,
      viewIdx: args.viewIdx,
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
