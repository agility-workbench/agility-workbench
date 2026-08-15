interface GridScrollSyncRendererParams {
  leadingScroller: HTMLDivElement;
  leftScroller: HTMLDivElement;
  centerScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  vScroll: HTMLDivElement;
  leadingSpacer: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  centerSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  hScrollLeft: HTMLDivElement;
  hScrollCenter: HTMLDivElement;
  hScrollRight: HTMLDivElement;
  leftHeader: HTMLDivElement;
  centerHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  aggregateLeft: HTMLDivElement;
  aggregateCenter: HTMLDivElement;
  aggregateRight: HTMLDivElement;
  onWindowUpdate: (scrollSrc: HTMLDivElement) => void;
  onHorizontalSync?: (left: number, center: number, right: number) => void;
}

export class GridScrollSyncRenderer {
  private rafPending = false;
  private readonly verticalScrollers: HTMLDivElement[];
  /** The scrollTop most recently fanned out by {@link syncVerticalScroll}; see bindWindowScroll. */
  private lastBroadcastTop: number | null = null;

  constructor(private params: GridScrollSyncRendererParams) {
    this.verticalScrollers = [
      params.leadingScroller,
      params.leftScroller,
      params.centerScroller,
      params.rightScroller,
      params.vScroll,
    ];
  }

  bind() {
    for (const scroller of this.verticalScrollers) {
      this.bindWindowScroll(scroller);
    }

    this.params.leftSpacer.addEventListener("scroll", () => {
      this.syncLeftScroll(this.params.leftSpacer.scrollLeft);
    });
    this.params.centerSpacer.addEventListener("scroll", () => {
      this.syncCenterScroll(this.params.centerSpacer.scrollLeft);
    });
    this.params.rightSpacer.addEventListener("scroll", () => {
      this.syncRightScroll(this.params.rightSpacer.scrollLeft);
    });
    this.params.hScrollLeft.addEventListener("scroll", () => {
      this.syncLeftScroll(this.params.hScrollLeft.scrollLeft);
    });
    this.params.hScrollCenter.addEventListener("scroll", () => {
      this.syncCenterScroll(this.params.hScrollCenter.scrollLeft);
    });
    this.params.hScrollRight.addEventListener("scroll", () => {
      this.syncRightScroll(this.params.hScrollRight.scrollLeft);
    });
    this.params.leftHeader.addEventListener("scroll", () => {
      this.syncLeftScroll(this.params.leftHeader.scrollLeft);
    });
    this.params.centerHeader.addEventListener("scroll", () => {
      this.syncCenterScroll(this.params.centerHeader.scrollLeft);
    });
    this.params.rightHeader.addEventListener("scroll", () => {
      this.syncRightScroll(this.params.rightHeader.scrollLeft);
    });
    this.params.aggregateLeft.addEventListener("scroll", () => {
      this.syncLeftScroll(this.params.aggregateLeft.scrollLeft);
    });
    this.params.aggregateCenter.addEventListener("scroll", () => {
      this.syncCenterScroll(this.params.aggregateCenter.scrollLeft);
    });
    this.params.aggregateRight.addEventListener("scroll", () => {
      this.syncRightScroll(this.params.aggregateRight.scrollLeft);
    });
  }

  scheduleWindowUpdate(scrollSrc: HTMLDivElement) {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.params.onWindowUpdate(scrollSrc);
    });
  }

  /**
   * Align every vertical scroller except `source` to `scrollTop`. Sections are independent scroll
   * boxes, so only the one under the pointer moves natively; the rest are moved from here. Called
   * straight out of the scroll listener rather than from the rAF that patches rows, so realignment
   * cannot be delayed behind — or starved by — the window update's frame coalescing.
   */
  syncVerticalScroll(scrollTop: number, source?: HTMLDivElement) {
    this.lastBroadcastTop = scrollTop;
    for (const target of this.verticalScrollers) {
      if (target === source) continue;
      if (target.scrollTop === scrollTop) continue;
      target.scrollTop = scrollTop;
    }
  }

  private bindWindowScroll(source: HTMLDivElement) {
    source.addEventListener("scroll", () => {
      const scrollTop = source.scrollTop;
      // A scroller resting on the value we last broadcast is echoing our own write, not reporting a
      // gesture; re-broadcasting it would drag the section the user is actually scrolling back to a
      // stale position. Keying the guard on the value rather than on which frame the echo arrives in
      // keeps it correct however the browser schedules delivery. A scroller that cannot reach the
      // broadcast value (clamped to its own range) reports a different one, so it counts as a real
      // scroll and the sections converge on the reachable position instead of oscillating.
      if (scrollTop === this.lastBroadcastTop) return;
      this.syncVerticalScroll(scrollTop, source);
      this.scheduleWindowUpdate(source);
    });
  }

  private syncLeftScroll(scrollLeft: number) {
    this.params.leftSpacer.scrollLeft = scrollLeft;
    this.params.leftHeader.scrollLeft = scrollLeft;
    this.params.hScrollLeft.scrollLeft = scrollLeft;
    this.params.aggregateLeft.scrollLeft = scrollLeft;
    this.notifyHorizontalSync();
  }

  private syncCenterScroll(scrollLeft: number) {
    this.params.centerSpacer.scrollLeft = scrollLeft;
    this.params.centerHeader.scrollLeft = scrollLeft;
    this.params.hScrollCenter.scrollLeft = scrollLeft;
    this.params.aggregateCenter.scrollLeft = scrollLeft;
    this.notifyHorizontalSync();
  }

  private syncRightScroll(scrollLeft: number) {
    this.params.rightSpacer.scrollLeft = scrollLeft;
    this.params.rightHeader.scrollLeft = scrollLeft;
    this.params.hScrollRight.scrollLeft = scrollLeft;
    this.params.aggregateRight.scrollLeft = scrollLeft;
    this.notifyHorizontalSync();
  }

  private notifyHorizontalSync() {
    this.params.onHorizontalSync?.(
      this.params.leftSpacer.scrollLeft,
      this.params.centerSpacer.scrollLeft,
      this.params.rightSpacer.scrollLeft,
    );
  }
}
