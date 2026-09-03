/**
 * Width management for the grid's two bars — the toolbar above the header and the footer below the
 * body. Both had the same defect: space was handed out by flex/grid *shrink*, and shrink has no
 * floor, so a control squeezed past its min-content width did not compress — its contents overflowed
 * its box and painted over the neighbour.
 *
 * The rule here is that nothing is ever clipped, overlapped, or compressed. Every control is laid
 * out at its natural size in one of its presentation *stages*, or it is displaced into the bar's
 * overflow menu; if even the fully-collapsed bar does not fit, the bar itself scrolls, so nothing
 * is ever unreachable.
 *
 * ## How the fit pass works
 *
 * Reset every item to its richest stage, then walk a fixed ladder of degradations, checking after
 * each one whether the bar's content fits its box, and stop at the first depth that does. Two
 * properties fall out of that shape, and both matter more than the small cost of re-deciding from
 * the top:
 *
 * - **It cannot flap.** The chosen depth is a pure function of the available width, because every
 *   check is made against the same starting state. A pass that started from the *current* collapsed
 *   state would measure a bar whose labels are already hidden, conclude it has room, expand, find it
 *   does not, and oscillate.
 * - **It needs no cached measurements**, so nothing has to be invalidated when a label, a chip set,
 *   a saved-view name, or a page count changes. Callers just call {@link ResponsiveBar.refresh}.
 *
 * ## Why floors live in CSS
 *
 * The fit check is `scrollWidth <= clientWidth`, which reports overflow only when content genuinely
 * cannot fit — and only because every item has a CSS floor (`flex: 0 0 auto`, `min-width:
 * max-content`, or an explicit `min-width` on the elastic ones). Without those floors the flex
 * algorithm would absorb the overflow by compressing controls, `scrollWidth` would equal
 * `clientWidth`, and the bar would report that everything fits while painting controls on top of
 * each other. The floors are what make the measurement true; this class only chooses a stage.
 *
 * Note also that `scrollWidth` counts overflow past the *inline end* only, which is why both bars
 * pack from the start edge (`justify-content: flex-start`) rather than the end.
 *
 * Growing, though, is safe — and is how each bar avoids leaving a hole. A ladder's last rung
 * usually frees more than was needed, so an elastic control (the quick filter's field, the footer's
 * tab strip) takes the leftover with `flex-grow`. Grow only ever distributes *positive* free space:
 * the moment content exceeds the box there is none to distribute, so a grower cannot absorb
 * overflow and hide it from the measurement the way a shrinker would. Shrink is what must stay off.
 */

/**
 * A control's presentation, richest first.
 *
 * - `full` — icon plus its text label; chips at full label.
 * - `compact` — the text gives way: an icon-only button (with a tooltip carrying the label), a
 *   narrower input, or a chip list that shows what fits plus a `+N`.
 * - `summary` — one control stands in for a region, opening the rest in a popover.
 * - `overflow` — displaced out of the bar into its overflow menu.
 * - `hidden` — gone, and reachable nowhere else. Only ever for genuinely redundant controls (the
 *   first/last-page buttons, which the page picker already covers).
 */
export type BarItemStage = "full" | "compact" | "summary" | "overflow" | "hidden";

/** Stages in which a control is no longer in the bar under its own name. */
const DISPLACING_STAGES: readonly BarItemStage[] = ["summary", "overflow", "hidden"];

export interface ResponsiveBarItem {
  /** Stable id, referenced by the ladder and asserted by tests. */
  id: string;
  /**
   * Stages this item supports, richest first. `stages[0]` is its resting presentation, which the
   * reset at the top of each fit pass restores.
   */
  stages: readonly BarItemStage[];
  /**
   * Render the item at `stage`. Must be synchronous, and idempotent for a given `(stage, level)` —
   * the reset at the top of every pass calls it again with the resting stage.
   */
  applyStage: (stage: BarItemStage, level?: number) => void;
  /** The item's element, so the engine can tell whether focus is inside it when it is displaced. */
  el?: HTMLElement;
  /**
   * While this returns true for a rung's stage, the item is not degraded to it and the ladder takes
   * its next rung instead. Asked per stage rather than per item, because the two things worth
   * pinning against are specific: a control that holds focus should not be taken away mid-use, and
   * one that carries state the user is relying on should not become invisible — but neither is a
   * reason to refuse a *narrower* presentation that still shows both.
   */
  isPinned?: (stage: BarItemStage) => boolean;
  /** Where focus should land if this item held it when it was displaced. */
  refocusTarget?: (stage: BarItemStage) => HTMLElement | null | undefined;
}

/**
 * One rung of the ladder: either a stage change for one item, or a class on the bar for a
 * presentation shared by several controls (both bars hide *all* their control captions in one
 * step — one CSS rule, and one visual change rather than a stutter of them).
 */
export interface ResponsiveBarStep {
  id: string;
  itemId?: string;
  stage?: BarItemStage;
  /**
   * Detail for a stage that has degrees, passed through to `applyStage`. A chip list gives way one
   * chip at a time rather than all at once, so its rungs are `compact` at level 2, then 1, then 0 —
   * how many chips may still show their label before the rest fold into a `+N`.
   */
  level?: number;
  barClass?: string;
}

/** How a bar responds to being too narrow for its controls. */
export type ResponsiveBarMode = "collapse" | "scroll" | false;

export interface ResponsiveBarParams {
  /** The bar element: the box whose width the controls have to fit, and which is observed. */
  bar: HTMLElement;
  /** Class marking the bar as horizontally scrollable — the last resort. */
  scrollClass: string;
  /** The controls, in no particular order; the ladder decides what gives way when. */
  items: () => readonly ResponsiveBarItem[];
  /** The degradation ladder, cheapest rung first. */
  ladder: () => readonly ResponsiveBarStep[];
  mode?: () => ResponsiveBarMode;
  /** Focus fallback when a displaced item held focus and named no target of its own. */
  fallbackFocus?: () => HTMLElement | null | undefined;
  /** Called after every pass whose outcome changed. Depth is how many rungs were applied. */
  onFit?: (result: ResponsiveBarFit) => void;
  /**
   * Re-sync furniture whose own size depends on what the pass has displaced so far — the overflow
   * button, which each bar shows only while it holds something. Called after the reset and after
   * every rung, so the button is part of the width the *next* fit check measures. Without it the
   * button appears after the pass has finished and the bar it was never counted in overflows by
   * the button's own width, silently: the check that decides the scroll fallback has already run.
   *
   * Must be cheap and must not close menus — it runs several times per pass. Anything that reacts
   * to the outcome of a pass belongs in {@link onFit}, which runs once.
   */
  syncFurniture?: () => void;
  /** Content width of the bar. Defaults to `scrollWidth`; injected by tests, which have no layout. */
  measureContentWidth?: () => number;
  /** Width available to the content. Defaults to `clientWidth`; injected by tests. */
  measureAvailableWidth?: () => number;
}

export interface ResponsiveBarFit {
  /** Rungs applied. 0 = everything at its richest. */
  depth: number;
  /** True when the bar had to fall back to scrolling. */
  scrolling: boolean;
  /** Stage per item id, after the pass. */
  stages: ReadonlyMap<string, BarItemStage>;
  /** Stage degree per item id, for the stages that have them. */
  levels: ReadonlyMap<string, number | undefined>;
}

/** Sub-pixel slack, so a bar whose content rounds to its box does not collapse a rung for nothing. */
const FIT_EPSILON = 0.5;

/** An item's applied presentation. `level` is only meaningful for stages that have degrees. */
interface AppliedStage {
  stage: BarItemStage;
  level?: number;
}

export class ResponsiveBar {
  private observer: ResizeObserver | null = null;
  private stages = new Map<string, AppliedStage>();
  private appliedClasses = new Set<string>();
  private depth = 0;
  private scrolling = false;
  /** Guards against a fit pass re-entering through the observer it mutates the bar underneath. */
  private fitting = false;

  constructor(private params: ResponsiveBarParams) {
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => {
        if (this.fitting) return;
        this.refresh();
      });
      this.observer.observe(params.bar);
    }
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /**
   * Re-decide the bar's layout. Called on resize, and by the bar whenever its contents change —
   * a chip added, a view renamed, a page count that widens the page picker.
   */
  refresh(): void {
    if (this.fitting) return;
    this.fitting = true;
    try {
      this.runFitPass();
    } finally {
      this.fitting = false;
    }
  }

  /** Stage an item currently sits at. Items are at `full` until a pass says otherwise. */
  getStage(itemId: string): BarItemStage {
    return this.stages.get(itemId)?.stage ?? "full";
  }

  /** Degree of the item's current stage, for the stages that have degrees. */
  getLevel(itemId: string): number | undefined {
    return this.stages.get(itemId)?.level;
  }

  /** Ids of every item the last pass displaced into the overflow menu, in ladder order. */
  getOverflowedItemIds(): string[] {
    return this.params.ladder()
      .filter(step => step.stage === "overflow" && step.itemId != null
        && this.stages.get(step.itemId)?.stage === "overflow")
      .map(step => step.itemId!);
  }

  getDepth(): number {
    return this.depth;
  }

  isScrolling(): boolean {
    return this.scrolling;
  }

  private runFitPass(): void {
    const mode = this.params.mode?.() ?? "collapse";
    const activeAtStart = this.activeElement();
    const previousDepth = this.depth;
    const previousScrolling = this.scrolling;
    let refocusTo: HTMLElement | null | undefined;

    if (mode === false) {
      this.reset();
      this.params.syncFurniture?.();
      this.setScrolling(false);
      this.report(0, previousDepth, previousScrolling);
      return;
    }

    this.reset();
    this.params.syncFurniture?.();

    let depth = 0;
    if (mode === "collapse") {
      const ladder = this.params.ladder();
      const itemsById = new Map(this.params.items().map(item => [item.id, item]));
      for (const step of ladder) {
        if (this.fits()) break;
        const item = step.itemId != null ? itemsById.get(step.itemId) : undefined;
        // A pinned item is passed over, not degraded: the ladder's next rung goes instead. The
        // rung still counts as consumed, so the pass cannot stall on it.
        if (item && step.stage && item.isPinned?.(step.stage)) {
          depth++;
          continue;
        }
        if (item && step.stage) {
          if (activeAtStart && item.el?.contains(activeAtStart)
            && DISPLACING_STAGES.includes(step.stage)) {
            refocusTo = item.refocusTarget?.(step.stage) ?? this.params.fallbackFocus?.();
          }
          this.applyStage(item, step.stage, step.level);
        }
        if (step.barClass) {
          this.params.bar.classList.add(step.barClass);
          this.appliedClasses.add(step.barClass);
        }
        // Before the next rung's fit check: this rung may have just displaced the first control,
        // which is what brings the bar's overflow button into the layout.
        this.params.syncFurniture?.();
        depth++;
      }
    }

    this.setScrolling(!this.fits());
    // Focus is moved only after the layout has settled, so it lands on an element at its final
    // size — and only when the pass actually took it away from something.
    if (refocusTo && this.activeElement() !== refocusTo) refocusTo.focus();
    this.report(depth, previousDepth, previousScrolling);
  }

  /** Every item at its richest stage and every ladder class off — the state each pass judges from. */
  private reset(): void {
    for (const item of this.params.items()) {
      this.applyStage(item, item.stages[0] ?? "full");
    }
    for (const className of this.appliedClasses) {
      this.params.bar.classList.remove(className);
    }
    this.appliedClasses.clear();
  }

  private applyStage(item: ResponsiveBarItem, stage: BarItemStage, level?: number): void {
    // An item that does not support the requested stage falls back to its poorest supported one,
    // so a ladder shared by differently-capable items never asks for a stage that renders nothing.
    const resolved = item.stages.includes(stage)
      ? stage
      : item.stages[item.stages.length - 1] ?? "full";
    const applied = this.stages.get(item.id);
    if (applied?.stage === resolved && applied.level === level) return;
    this.stages.set(item.id, { stage: resolved, level });
    item.applyStage(resolved, level);
  }

  private fits(): boolean {
    const content = this.params.measureContentWidth?.() ?? this.params.bar.scrollWidth;
    const available = this.params.measureAvailableWidth?.() ?? this.params.bar.clientWidth;
    // A bar with no width yet (detached, or in a hidden container) is not a bar that does not fit:
    // deciding from a zero measurement would collapse everything, and the observer will call back
    // with a real width the moment it has one.
    if (available <= 0) return true;
    return content <= available + FIT_EPSILON;
  }

  private setScrolling(scrolling: boolean): void {
    this.scrolling = scrolling;
    this.params.bar.classList.toggle(this.params.scrollClass, scrolling);
  }

  private report(depth: number, previousDepth: number, previousScrolling: boolean): void {
    this.depth = depth;
    if (depth === previousDepth && this.scrolling === previousScrolling) return;
    this.params.onFit?.({
      depth,
      scrolling: this.scrolling,
      stages: new Map([...this.stages].map(([id, applied]) => [id, applied.stage])),
      levels: new Map([...this.stages].map(([id, applied]) => [id, applied.level])),
    });
  }

  private activeElement(): HTMLElement | null {
    const active = this.params.bar.ownerDocument?.activeElement;
    return active instanceof HTMLElement ? active : null;
  }
}
