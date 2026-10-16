/**
 * `api.flashCells`: a timed highlight on live cell elements, drawn with the change-flash renderer's
 * own classes so it needs no CSS of its own and follows the same theme variables.
 *
 * Only the colour classes are used — `pte-cell-flash-neutral`, then `pte-cell-flash-fading` — and
 * not the renderer's base `pte-cell-flash` class, which lays out the renderer's inner span (inline
 * flex, full size, cell padding) and would re-pad the cell it is put on.
 */
export const CELL_FLASH_CLASS = "pte-cell-flash-neutral";
export const CELL_FLASH_FADING_CLASS = "pte-cell-flash-fading";

interface FlashTimers {
  flash: ReturnType<typeof setTimeout> | null;
  fade: ReturnType<typeof setTimeout> | null;
}

export class CellFlasher {
  // Keyed by element: flashing a cell that is still flashing restarts it rather than stacking a
  // second set of timers that would cut the new flash short.
  private readonly timers = new Map<HTMLElement, FlashTimers>();

  flash(el: HTMLElement, flashMs: number, fadeMs: number): void {
    this.clear(el);
    el.classList.remove(CELL_FLASH_FADING_CLASS);
    // Restart the transition from full colour: without a style flush between the removal above
    // and the re-add below, the browser would coalesce them and a re-flash would not show.
    void el.offsetWidth;
    el.style.setProperty("--pte-cell-flash-fade-duration", `${fadeMs}ms`);
    el.classList.add(CELL_FLASH_CLASS);
    const timers: FlashTimers = { flash: null, fade: null };
    this.timers.set(el, timers);
    timers.flash = setTimeout(() => {
      timers.flash = null;
      el.classList.add(CELL_FLASH_FADING_CLASS);
      timers.fade = setTimeout(() => {
        timers.fade = null;
        this.reset(el);
      }, fadeMs);
    }, flashMs);
  }

  /** Stop every running flash and strip its classes (grid teardown). */
  destroy(): void {
    for (const el of [...this.timers.keys()]) this.reset(el);
  }

  private reset(el: HTMLElement): void {
    this.clear(el);
    el.classList.remove(CELL_FLASH_CLASS, CELL_FLASH_FADING_CLASS);
    el.style.removeProperty("--pte-cell-flash-fade-duration");
  }

  private clear(el: HTMLElement): void {
    const timers = this.timers.get(el);
    if (!timers) return;
    if (timers.flash != null) clearTimeout(timers.flash);
    if (timers.fade != null) clearTimeout(timers.fade);
    this.timers.delete(el);
  }
}
