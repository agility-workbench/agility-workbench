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
}

export class GridScrollSyncRenderer {
  private rafPending = false;
  private syncingScrollTargets = new Set<HTMLDivElement>();
  private syncingScrollRaf: number | null = null;

  constructor(private params: GridScrollSyncRendererParams) { }

  bind() {
    this.bindWindowScroll(this.params.leadingScroller);
    this.bindWindowScroll(this.params.leftScroller);
    this.bindWindowScroll(this.params.centerScroller);
    this.bindWindowScroll(this.params.rightScroller);
    this.bindWindowScroll(this.params.vScroll);

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

  beginScrollSync(targets: HTMLDivElement[]) {
    if (targets.length === 0) return;
    for (const target of targets) {
      this.syncingScrollTargets.add(target);
    }
    if (this.syncingScrollRaf !== null) return;
    this.syncingScrollRaf = requestAnimationFrame(() => {
      this.syncingScrollTargets.clear();
      this.syncingScrollRaf = null;
    });
  }

  private bindWindowScroll(source: HTMLDivElement) {
    source.addEventListener("scroll", () => {
      if (this.syncingScrollTargets.has(source)) return;
      this.scheduleWindowUpdate(source);
    });
  }

  private syncLeftScroll(scrollLeft: number) {
    this.params.leftSpacer.scrollLeft = scrollLeft;
    this.params.leftHeader.scrollLeft = scrollLeft;
    this.params.hScrollLeft.scrollLeft = scrollLeft;
    this.params.aggregateLeft.scrollLeft = scrollLeft;
  }

  private syncCenterScroll(scrollLeft: number) {
    this.params.centerSpacer.scrollLeft = scrollLeft;
    this.params.centerHeader.scrollLeft = scrollLeft;
    this.params.hScrollCenter.scrollLeft = scrollLeft;
    this.params.aggregateCenter.scrollLeft = scrollLeft;
  }

  private syncRightScroll(scrollLeft: number) {
    this.params.rightSpacer.scrollLeft = scrollLeft;
    this.params.rightHeader.scrollLeft = scrollLeft;
    this.params.hScrollRight.scrollLeft = scrollLeft;
    this.params.aggregateRight.scrollLeft = scrollLeft;
  }
}
