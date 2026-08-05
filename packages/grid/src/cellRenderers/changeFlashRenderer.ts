import { CellRendererParams, ICellRenderer } from "../renderer/renderer";

export type FlashDirection = "up" | "down" | "neutral";

export interface ChangeFlashParams {
  cellFlashDuration?: number;
  cellFadeDuration?: number;
  direction?: "numeric" | ((prev: any, next: any, data: any) => FlashDirection);
}

const DEFAULT_FLASH_MS = 500;
const DEFAULT_FADE_MS = 1000;

export class ChangeFlashCellRenderer implements ICellRenderer {
  private static prevByRow = new Map<string, Map<string, any>>();

  private eGui!: HTMLSpanElement;
  private flashTimer: number | null = null;
  private fadeTimer: number | null = null;
  private currentDirClass: string | null = null;

  init(params: CellRendererParams) {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-flash";
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
  }

  private paint(p: CellRendererParams, allowFlash: boolean) {
    const rowKey = p.rowId;
    const colKey = p.colDef.colId || p.colDef.instanceID;

    let row = ChangeFlashCellRenderer.prevByRow.get(rowKey);
    if (!row) {
      row = new Map();
      ChangeFlashCellRenderer.prevByRow.set(rowKey, row);
    }

    const hadPrev = row.has(colKey);
    const prev = row.get(colKey);
    const next = p.value;

    this.eGui.textContent = p.valueFormatted ?? (next == null ? "" : String(next));

    if (allowFlash && hadPrev && !Object.is(prev, next)) {
      this.flash(this.pickDirection(prev, next, p), p);
    }

    row.set(colKey, next);
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
