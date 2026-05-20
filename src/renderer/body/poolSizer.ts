import { GridCore } from "../../core/core";

interface BodyPoolSizerParams {
  core: GridCore;
  rowHeight: () => number;
  height: () => number | undefined;
  getContainerEl: () => HTMLElement | undefined;
  headerWrapper: HTMLDivElement;
  hScrollContainer: HTMLDivElement;
  paginator: HTMLDivElement;
  getAggregateRowHeight: () => number;
}

export class BodyPoolSizer {
  constructor(private params: BodyPoolSizerParams) { }

  computePoolSize(rowHeightPx: number, overscanRowCount: number) {
    const bodyHeight = this.getBodyHeight();
    return Math.max(1, Math.ceil(bodyHeight / rowHeightPx) + overscanRowCount * 2);
  }

  getBodyHeight() {
    const headerHeight = this.params.headerWrapper.getBoundingClientRect().height || 0;
    const hScrollHeight = this.params.hScrollContainer.getBoundingClientRect().height || 0;
    const paginationVisible = this.params.paginator?.classList.contains("visible");
    const paginationHeight = paginationVisible ? (this.params.paginator?.getBoundingClientRect().height || 0) : 0;
    const aggregateHeight = this.params.getAggregateRowHeight();
    const chromeHeight = headerHeight + hScrollHeight + paginationHeight + aggregateHeight;

    const containerHeight = this.params.getContainerEl()?.clientHeight ?? 0;
    const fallbackHeight = this.params.height() ?? window.innerHeight ?? 0;

    const availableHeight = Math.max(
      0,
      Math.min(Math.max(containerHeight, fallbackHeight), window.innerHeight || fallbackHeight) - chromeHeight
    );
    if (availableHeight > 0) return availableHeight;

    return this.params.rowHeight();
  }
}
