import { CellRendererParams, ICellRenderer } from "../renderer/renderer";
import { valuesAreSame } from "../misc";

export type FlashDirection = "up" | "down" | "neutral";

export interface ChangeFlashParams {
  cellFlashDuration?: number;
  cellFadeDuration?: number;
  direction?: "numeric" | ((prev: any, next: any, data: any) => FlashDirection);
}

const DEFAULT_FLASH_MS = 500;
const DEFAULT_FADE_MS = 1000;

/** Sweep rows that left the model once the map outgrows this (then twice its post-sweep size). */
const MIN_PRUNE_THRESHOLD = 256;

/**
 * Last-seen values for one grid, by row id then column. Keyed by row id rather than by renderer
 * instance because body slots are pooled by view index: when a sort or transaction moves a row to
 * another slot, that slot's renderer must still compare against the row's own previous value.
 */
interface FlashGridState {
  rows: Map<string, Map<string, unknown>>;
  /** Live renderer instances for this grid; the state is released when the last one is destroyed. */
  liveRenderers: number;
  pruneAt: number;
}

/**
 * One state per grid, keyed by the grid's API object (renderers without one key on themselves), so
 * two grids with overlapping row ids never compare against each other's values, and a grid that is
 * dropped takes its state with it.
 */
const stateByGrid = new WeakMap<object, FlashGridState>();

/** Test-only: how many rows the renderer currently remembers values for in `api`'s grid. */
export function changeFlashTrackedRowCount(api: object): number {
  return stateByGrid.get(api)?.rows.size ?? 0;
}

export class ChangeFlashCellRenderer implements ICellRenderer {
  private eGui!: HTMLSpanElement;
  private flashTimer: number | null = null;
  private fadeTimer: number | null = null;
  private currentDirClass: string | null = null;

  private gridKey: object = this;
  private state: FlashGridState | null = null;
  /** What this instance last painted. Preferred over the shared map when it painted the same cell,
   * so two instances showing one cell (a sticky group mirror and its body row) each flash. */
  private lastCell: { rowId: string; colKey: string; value: unknown } | null = null;

  init(params: CellRendererParams) {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-flash";
    this.gridKey = params.api ?? this;
    let state = stateByGrid.get(this.gridKey);
    if (!state) {
      state = { rows: new Map(), liveRenderers: 0, pruneAt: MIN_PRUNE_THRESHOLD };
      stateByGrid.set(this.gridKey, state);
    }
    state.liveRenderers++;
    this.state = state;
    this.paint(params, false);
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(params: CellRendererParams): boolean {
    this.paint(params, true);
    return true;
  }

  destroy(): void {
    this.clearTimers();
    const state = this.state;
    this.state = null;
    this.lastCell = null;
    if (!state) return;
    // Every renderer of the grid is gone (the grid was destroyed, or the column left): nothing can
    // flash against the remembered values any more, so drop them rather than wait for GC of the API.
    if (--state.liveRenderers <= 0 && stateByGrid.get(this.gridKey) === state) {
      stateByGrid.delete(this.gridKey);
    }
  }

  private paint(p: CellRendererParams, allowFlash: boolean) {
    const rowKey = p.rowId;
    const colKey = p.colDef.colId || p.colDef.instanceID;
    const rows = this.state?.rows ?? new Map<string, Map<string, unknown>>();

    let row = rows.get(rowKey);
    if (!row) {
      row = new Map();
      rows.set(rowKey, row);
    }

    const own = this.lastCell;
    const ownCell = own != null && own.rowId === rowKey && own.colKey === colKey;
    const hadPrev = ownCell || row.has(colKey);
    const prev = ownCell ? own.value : row.get(colKey);
    const next = p.value;

    this.eGui.textContent = p.valueFormatted ?? (next == null ? "" : String(next));

    // Same primitive as the write path's no-op suppression, so the flash and the cellValueChanged
    // event agree on what "changed" means (equal Dates and +0/-0 no longer flash).
    if (allowFlash && hadPrev && !valuesAreSame(prev, next)) {
      this.flash(this.pickDirection(prev, next, p), p);
    }

    row.set(colKey, next);
    this.lastCell = { rowId: rowKey, colKey, value: next };
    this.pruneRemovedRows(p);
  }

  /** Forget rows the grid no longer holds, amortized: only once the map doubles since the last sweep. */
  private pruneRemovedRows(p: CellRendererParams) {
    const state = this.state;
    if (!state || state.rows.size <= state.pruneAt || typeof p.api?.getRowNode !== "function") return;
    for (const rowId of state.rows.keys()) {
      if (p.api.getRowNode(rowId) == null) state.rows.delete(rowId);
    }
    state.pruneAt = Math.max(MIN_PRUNE_THRESHOLD, state.rows.size * 2);
  }

  private pickDirection(prev: any, next: any, p: CellRendererParams): FlashDirection {
    const cfg = (p.colDef.cellRendererParams ?? {}) as ChangeFlashParams;
    if (typeof cfg.direction === "function") {
      return cfg.direction(prev, next, p.data);
    }
    const a = Number(prev);
    const b = Number(next);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (b > a) return "up";
      if (b < a) return "down";
    }
    return "neutral";
  }

  private flash(dir: FlashDirection, p: CellRendererParams) {
    const cfg = (p.colDef.cellRendererParams ?? {}) as ChangeFlashParams;
    // Resolution order: per-column cellRendererParams → grid-level option → built-in default.
    const opts = p.api?.getCore?.().getOptions?.();
    const flashMs = cfg.cellFlashDuration ?? opts?.cellFlashDuration ?? DEFAULT_FLASH_MS;
    const fadeMs = cfg.cellFadeDuration ?? opts?.cellFadeDuration ?? DEFAULT_FADE_MS;

    this.clearTimers();

    if (this.currentDirClass) {
      this.eGui.classList.remove(this.currentDirClass);
    }
    this.eGui.classList.remove("pte-cell-flash-fading");
    void this.eGui.offsetWidth;

    this.eGui.style.setProperty("--pte-cell-flash-fade-duration", `${fadeMs}ms`);

    const dirClass = `pte-cell-flash-${dir}`;
    this.eGui.classList.add(dirClass);
    this.currentDirClass = dirClass;

    this.flashTimer = window.setTimeout(() => {
      this.flashTimer = null;
      this.eGui.classList.add("pte-cell-flash-fading");

      this.fadeTimer = window.setTimeout(() => {
        this.fadeTimer = null;
        if (this.currentDirClass) {
          this.eGui.classList.remove(this.currentDirClass);
          this.currentDirClass = null;
        }
        this.eGui.classList.remove("pte-cell-flash-fading");
      }, fadeMs);
    }, flashMs);
  }

  private clearTimers() {
    if (this.flashTimer != null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    if (this.fadeTimer != null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }
}
