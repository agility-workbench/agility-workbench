import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { CellRef } from "../../interfaces/selection";
import { GridEventActionFrameParams, GridEventCellClickedParams, Unsubscribe } from "../../events/events";
import { FloatingAnchor } from "../floating/floatingAnchor";
import { resolveActionFrameOptions } from "../../interfaces/gridOptions";
import {
  ActionFrameComponentParams,
  createActionFrameComponentRuntime,
  ActionFrameComponentRuntime,
} from "./actionFrameComponent";

export interface ActionFrameRendererParams {
  core: GridCore;
  api: IGridAPI;
  /** The body element (live cells are queried under it; click trigger resolves here). */
  body: HTMLElement;
  /** The grid root — focus is returned here on close. */
  root: HTMLElement;
  /** Dedicated floating layer for the popover (z above tooltips, below menus). */
  floating: FloatingAnchor;
  /** Current leaf columns, in colIdx order (matches `data-col-idx`). */
  leafColumns: () => Column[];
  /** Resolve a column by its instanceID. */
  getColumnById: (id: string) => Column | null | undefined;
  /** Scroll the given cell into the row pool before anchoring to it. */
  ensureCellVisible: (viewIdx: number, colIdx: number) => void;
}

/**
 * Drives the ActionFrame: a persistent, visually-distinct border on a body cell plus an attached
 * popover holding a client-built form (à la a Google Sheets comment).
 *
 * State ownership follows the cell editor: the *core* owns the open cell (`actionFrameCell`), this
 * renderer holds no authoritative state and reacts to the `actionFrameChanged` event. Mounting
 * follows the tooltip: the popover lives in a {@link FloatingAnchor} layer (NOT inside the recycled
 * cell), anchored by a `getAnchorRect` thunk keyed to the live cell, using the anchor's *sticky*
 * mode so it tracks the cell across scroll and re-appears when a scrolled-out cell returns.
 *
 * The frame border is a CSS class re-stamped on the live cell after every window update (rows
 * recycle, so it must be a pure function of the open-cell state, never set once).
 */
export class ActionFrameRenderer {
  private unsubscribers: Unsubscribe[] = [];
  /** The cell whose frame is currently mounted (mirrors core; used for teardown + frame paint). */
  private openCell: CellRef | null = null;
  private runtime: ActionFrameComponentRuntime | null = null;
  private bound = false;

  constructor(private params: ActionFrameRendererParams) {}

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.unsubscribers.push(
      this.params.core.on("actionFrameChanged", (p: GridEventActionFrameParams) => this.onActionFrameChanged(p)),
      this.params.core.on("cellClicked", (p: GridEventCellClickedParams) => this.onCellClicked(p)),
    );
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("pointerdown", this.handleOutsidePointerDown, true);
  }

  destroy() {
    if (!this.bound) return;
    this.bound = false;
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("pointerdown", this.handleOutsidePointerDown, true);
    this.teardown();
  }

  /** Called once per animation frame during scroll (from the grid's window-update tick) and on any
   * layout change: keep the popover pinned to the (possibly recycled) cell and re-stamp the frame
   * border. Cheap and idempotent. */
  onWindowUpdate() {
    if (!this.openCell) return;
    this.params.floating.reposition();
    this.refreshFrame();
  }

  // ---------------- event reactions ----------------

  private onActionFrameChanged(p: GridEventActionFrameParams) {
    if (p.state === "opened" && p.cell) {
      this.mount(p.cell);
    } else {
      this.teardown();
    }
  }

  private onCellClicked(p: GridEventCellClickedParams) {
    const col = this.params.getColumnById(String(p.colId));
    if (!col || col.actionFrameTrigger !== "click") return;
    if (!col.actionFrameComponent) return;
    this.params.core.dispatch({
      type: "actionFrameOpen",
      cell: { rowId: String(p.rowId), colId: String(p.colId) },
      source: "mouse",
    });
  }

  // ---------------- mount / teardown ----------------

  private mount(cell: CellRef) {
    // Replace any previous frame (only one open at a time — core enforces this, but be safe).
    this.teardown();

    const col = this.params.getColumnById(cell.colId);
    if (!col) return;
    const comp = col.actionFrameComponent;
    if (!comp) return;

    const rowNode = this.params.core.getRowModel().getRowNode(cell.rowId);
    if (!rowNode || rowNode.isGroup) return;

    const viewIdx = this.params.core.getViewIndexForRowId(cell.rowId);
    const colIdx = this.colIdxFor(cell.colId);
    if (viewIdx == null || viewIdx < 0 || colIdx < 0) return;

    // Scroll the cell into the pool so the initial anchor rect resolves.
    this.params.ensureCellVisible(viewIdx, colIdx);

    const value = col.getValue(rowNode);
    const params: ActionFrameComponentParams = {
      value,
      valueFormatted: col.formatValue(value, rowNode),
      data: rowNode.data,
      rowId: cell.rowId,
      rowIndex: viewIdx,
      colDef: col,
      api: this.params.api,
      close: () => this.params.core.dispatch({ type: "actionFrameClose" }),
      ...(col.actionFrameComponentParams ?? {}),
    };

    this.runtime = createActionFrameComponentRuntime(comp, params);
    this.openCell = cell;

    // Grid-wide presentation defaults arrive via `defaultColDef.actionFrameOptions`, already merged
    // onto the column, so the column value is the sole source here.
    const opts = resolveActionFrameOptions(undefined, col.actionFrameOptions);
    const overlay = this.params.floating.show(this.runtime.gui, {
      mode: {
        kind: "anchored",
        getAnchorRect: () => this.getCellRect(cell),
        placement: opts.placement,
      },
      offset: opts.offset,
      escapeRootClip: opts.escapeRootClip,
      sticky: true,
      className: "pte-action-frame-popover",
    });
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "false");

    this.refreshFrame();
  }

  private teardown() {
    if (!this.openCell && !this.runtime) return;
    const overlayHadFocus = this.popoverHasFocus();
    this.clearFrame();
    this.params.floating.hide();
    this.runtime?.destroy();
    this.runtime = null;
    this.openCell = null;
    // Return focus to the grid root so keyboard nav resumes (mirrors the cell editor's teardown).
    if (overlayHadFocus && typeof (this.params.root as HTMLElement).focus === "function") {
      this.params.root.focus();
    }
  }

  // ---------------- frame border (recycle-safe) ----------------

  /** Re-stamp the `.pte-action-frame` class on the open cell's live element (if currently
   * rendered), clearing it from any stale element. A no-op-safe pure function of `openCell`.
   *
   * ARIA rides along with the class rather than being tracked separately: the anchor is a pooled
   * cell, so the same re-stamp-and-sweep that keeps the border on the right element is exactly what
   * keeps `aria-haspopup`/`aria-expanded` off a recycled one. */
  private refreshFrame() {
    this.clearFrame();
    if (!this.openCell) return;
    const el = this.getCellEl(this.openCell);
    if (el) {
      el.classList.add("pte-action-frame");
      el.setAttribute("aria-haspopup", "dialog");
      el.setAttribute("aria-expanded", "true");
    }
  }

  private clearFrame() {
    this.params.body.querySelectorAll(".pte-action-frame").forEach((c) => {
      c.classList.remove("pte-action-frame");
      c.removeAttribute("aria-haspopup");
      c.removeAttribute("aria-expanded");
    });
  }

  // ---------------- dismissal ----------------

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.openCell) return;
    e.preventDefault();
    e.stopPropagation();
    this.params.core.dispatch({ type: "actionFrameClose" });
  };

  private handleOutsidePointerDown = (e: PointerEvent) => {
    if (!this.openCell) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // Ignore clicks inside the popover or on the framed cell itself.
    if (target.closest(".pte-action-frame-popover")) return;
    if (target.closest(".pte-action-frame")) return;
    this.params.core.dispatch({ type: "actionFrameClose" });
  };

  // ---------------- DOM helpers ----------------

  private popoverHasFocus(): boolean {
    const overlay = this.params.floating.getOverlay();
    return !!overlay && overlay.contains(document.activeElement);
  }

  private colIdxFor(colId: string): number {
    return this.params.leafColumns().findIndex((c) => c.instanceID === colId);
  }

  private getCellEl(cell: CellRef): HTMLElement | null {
    const viewIdx = this.params.core.getViewIndexForRowId(cell.rowId);
    if (viewIdx == null || viewIdx < 0) return null;
    const colIdx = this.colIdxFor(cell.colId);
    if (colIdx < 0) return null;
    // A row slot renders up to four section rows (leading/left/center/right) sharing one
    // view-idx; the cell lives in exactly one of them.
    const rowEls = this.params.body.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
    for (let i = 0; i < rowEls.length; i++) {
      const cellEl = rowEls[i].querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
      if (cellEl) return cellEl;
    }
    return null;
  }

  private getCellRect(cell: CellRef): DOMRect | null {
    const el = this.getCellEl(cell);
    return el ? el.getBoundingClientRect() : null;
  }
}
