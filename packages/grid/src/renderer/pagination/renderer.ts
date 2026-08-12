import { GridCore } from "../../core/core";
import { GridEventAggregateChangedParams, GridEventPaginationChangedParams } from "../../events/events";
import { AggregateScope } from "../../interfaces/aggregate";
import { isTrue } from "../../misc";
import { createPaginationWrapper } from "./wrapper";

interface PaginationRendererParams {
  core: GridCore;
  root: HTMLElement;
  resetScrollPosition: () => void;
  setAggregateScope: (scope: AggregateScope) => void;
}

/**
 * The glyph for a page-navigation button, as a child rather than on the button itself: the icon is a CSS
 * mask, and a mask clips everything its element paints — background, border, shadow, outline. With the
 * mask on the `<button>` these buttons could not render a focus ring at all. The span is decorative; the
 * button carries the accessible name.
 */
function paginationIcon(): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = "pte-pagination-btn-icon";
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

export class PaginationRenderer {
  pageSizeSelect!: HTMLSelectElement;
  pageSelect!: HTMLSelectElement;
  firstPageBtn!: HTMLButtonElement;
  prevPageBtn!: HTMLButtonElement;
  nextPageBtn!: HTMLButtonElement;
  lastPageBtn!: HTMLButtonElement;
  aggregateScopeSelect!: HTMLSelectElement;
  aggregateClearBtn!: HTMLButtonElement;
  private navSection: HTMLDivElement | null = null;
  private paginator: HTMLDivElement;
  private controlsPaginationEnabled: boolean | null = null;
  private controlsAggregationAvailable: boolean | null = null;

  constructor(private params: PaginationRendererParams) {
    this.paginator = createPaginationWrapper();
    this.params.root.appendChild(this.paginator);
  }

  getElement() {
    return this.paginator;
  }

  buildControls() {
    const { core } = this.params;
    const paginator = this.paginator;
    paginator.innerHTML = "";
    const {
      paginationEnabled,
      pageIndex,
      pageSize,
      totalPageCount,
      totalRowCountKnown,
      pageSizes,
    } = core.getPaginationInfo();
    this.controlsPaginationEnabled = paginationEnabled;
    this.controlsAggregationAvailable = this.hasAggregatableColumns();

    if (this.controlsAggregationAvailable) {
      paginator.appendChild(this.buildAggregationControls());
    }

    if (!paginationEnabled) {
      this.updateControls();
      return;
    }

    const sizeSection = document.createElement("div");
    sizeSection.className = "pte-pagination-section";
    const sizeLabel = document.createElement("span");
    sizeLabel.className = "pte-pagination-label";
    sizeLabel.textContent = "Rows per page";
    // The visible text beside each control is its name; point at it rather than duplicating the
    // string in an aria-label, so the two can never drift. Ids are prefixed with the grid instance
    // id because a page may hold several grids.
    sizeLabel.id = `${core.id}-pagination-size-label`;
    this.pageSizeSelect = document.createElement("select");
    this.pageSizeSelect.className = "pte-select pte-pagination-select";
    this.pageSizeSelect.setAttribute("aria-labelledby", sizeLabel.id);
    for (const size of pageSizes) {
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = String(size);
      this.pageSizeSelect.appendChild(option);
    }
    this.pageSizeSelect.value = String(pageSize);
    this.pageSizeSelect.addEventListener("change", (e) => {
      const next = Number((e.target as HTMLSelectElement).value);
      if (!Number.isFinite(next) || next <= 0) return;
      if (next === core.getPaginationInfo().pageSize) return;
      this.params.resetScrollPosition();
      core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: next });
    });
    sizeSection.appendChild(sizeLabel);
    sizeSection.appendChild(this.pageSizeSelect);

    const navSection = document.createElement("div");
    navSection.className = "pte-pagination-section pte-pagination-nav";

    // These four are icon-only CSS-mask buttons with no text, so without a label AT announces four
    // anonymous buttons.
    this.firstPageBtn = document.createElement("button");
    this.firstPageBtn.type = "button";
    this.firstPageBtn.className = "pte-pagination-btn pte-pagination-btn-first";
    this.firstPageBtn.setAttribute("aria-label", "First page");
    this.firstPageBtn.appendChild(paginationIcon());
    this.firstPageBtn.addEventListener("click", () => this.goToPage(0));

    this.prevPageBtn = document.createElement("button");
    this.prevPageBtn.type = "button";
    this.prevPageBtn.className = "pte-pagination-btn pte-pagination-btn-prev";
    this.prevPageBtn.setAttribute("aria-label", "Previous page");
    this.prevPageBtn.appendChild(paginationIcon());
    this.prevPageBtn.addEventListener("click", () => {
      this.goToPage(core.getPaginationInfo().pageIndex - 1);
    });

    const pageLabel = document.createElement("span");
    pageLabel.className = "pte-pagination-label";
    pageLabel.textContent = "Page";
    pageLabel.id = `${core.id}-pagination-page-label`;

    this.pageSelect = document.createElement("select");
    this.pageSelect.className = "pte-select pte-pagination-select pte-pagination-page-select";
    this.pageSelect.name = "pte-page-select";
    this.pageSelect.setAttribute("aria-labelledby", pageLabel.id);
    this.pageSelect.addEventListener("change", (e) => {
      const val = Number((e.target as HTMLSelectElement).value);
      if (!Number.isFinite(val)) return;
      this.goToPage(val);
    });

    this.nextPageBtn = document.createElement("button");
    this.nextPageBtn.type = "button";
    this.nextPageBtn.className = "pte-pagination-btn pte-pagination-btn-next";
    this.nextPageBtn.setAttribute("aria-label", "Next page");
    this.nextPageBtn.appendChild(paginationIcon());
    this.nextPageBtn.addEventListener("click", () => {
      this.goToPage(core.getPaginationInfo().pageIndex + 1);
    });

    this.lastPageBtn = document.createElement("button");
    this.lastPageBtn.type = "button";
    this.lastPageBtn.className = "pte-pagination-btn pte-pagination-btn-last";
    this.lastPageBtn.setAttribute("aria-label", "Last page");
    this.lastPageBtn.appendChild(paginationIcon());
    this.lastPageBtn.addEventListener("click", () => {
      this.goToPage(core.getPaginationInfo().totalPageCount - 1);
    });

    navSection.appendChild(this.firstPageBtn);
    navSection.appendChild(this.prevPageBtn);
    navSection.appendChild(pageLabel);
    navSection.appendChild(this.pageSelect);
    navSection.appendChild(this.nextPageBtn);
    navSection.appendChild(this.lastPageBtn);
    this.navSection = navSection;

    paginator.appendChild(sizeSection);
    paginator.appendChild(navSection);
    this.populatePageSelect(pageIndex, totalPageCount, totalRowCountKnown);
    this.updateControls();
  }

  private buildAggregationControls() {
    const aggSection = document.createElement("div");
    aggSection.className = "pte-pagination-section pte-aggregate-controls";

    const aggLabel = document.createElement("span");
    aggLabel.className = "pte-pagination-label";
    aggLabel.textContent = "Aggregate";
    aggLabel.id = `${this.params.core.id}-aggregate-label`;

    this.aggregateScopeSelect = document.createElement("select");
    this.aggregateScopeSelect.className = "pte-select pte-pagination-select pte-aggregate-scope";
    this.aggregateScopeSelect.setAttribute("aria-labelledby", aggLabel.id);
    const aggOptions: Array<{ value: AggregateScope; label: string }> = [
      { value: "none", label: "None" },
      { value: "page", label: "Current page" },
      { value: "all", label: "Entire dataset" },
    ];
    for (const optDef of aggOptions) {
      const opt = document.createElement("option");
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      this.aggregateScopeSelect.appendChild(opt);
    }
    this.aggregateScopeSelect.addEventListener("change", (e) => {
      const next = (e.target as HTMLSelectElement).value as AggregateScope;
      this.params.setAggregateScope(next);
    });

    this.aggregateClearBtn = document.createElement("button");
    this.aggregateClearBtn.type = "button";
    this.aggregateClearBtn.className = "pte-pagination-btn pte-aggregate-clear";
    this.aggregateClearBtn.title = "Hide aggregate row";
    this.aggregateClearBtn.setAttribute("aria-label", "Hide aggregate row");
    this.aggregateClearBtn.textContent = "x";
    this.aggregateClearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.params.setAggregateScope("none");
    });

    aggSection.appendChild(aggLabel);
    aggSection.appendChild(this.aggregateScopeSelect);
    aggSection.appendChild(this.aggregateClearBtn);

    return aggSection;
  }

  populatePageSelect(pageIndex: number, totalPageCount: number, totalRowCountKnown: boolean = true) {
    if (!this.pageSelect) return;
    const totalPages = Math.max(totalPageCount, 1);
    // A provisional total (server hasn't reported it and the end hasn't been reached) renders with
    // a "+" suffix — "3 of 12+" — so a growing page count reads as discovery, not as a bug.
    const totalLabel = totalRowCountKnown ? String(totalPages) : `${totalPages}+`;
    if (this.pageSelect.options.length !== totalPages) {
      this.pageSelect.innerHTML = "";
      for (let i = 0; i < totalPages; i++) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `${i + 1} of ${totalLabel}`;
        this.pageSelect.appendChild(option);
      }
    } else {
      for (let i = 0; i < totalPages; i++) {
        const option = this.pageSelect.options[i];
        const desiredText = `${i + 1} of ${totalLabel}`;
        if (option.textContent !== desiredText) {
          option.textContent = desiredText;
        }
      }
    }
    this.pageSelect.value = String(Math.min(pageIndex, totalPages - 1));

    const tooltip = totalRowCountKnown
      ? ""
      : this.params.core.options.paginationUnknownTotalTooltip;
    if (this.pageSelect.title !== tooltip) this.pageSelect.title = tooltip;
    const ariaLabel = totalRowCountKnown
      ? `Page ${Math.min(pageIndex, totalPages - 1) + 1} of ${totalPages}`
      : `Page ${Math.min(pageIndex, totalPages - 1) + 1} of at least ${totalPages}. ${tooltip}`;
    this.pageSelect.setAttribute("aria-label", ariaLabel);
    this.navSection?.classList.toggle("pte-pagination-approx", !totalRowCountKnown);
  }

  updateControls(params?: GridEventPaginationChangedParams) {
    const {
      paginationEnabled,
      pageIndex,
      pageSize,
      totalRowCount,
      totalPageCount,
      totalRowCountKnown,
    } = params || this.params.core.getPaginationInfo();
    if (
      this.controlsPaginationEnabled !== paginationEnabled
      || this.controlsAggregationAvailable !== this.hasAggregatableColumns()
    ) {
      this.buildControls();
      return;
    }
    if (!paginationEnabled) {
      this.updateAggregateControls();
      this.paginator.classList.toggle("visible", this.params.core.getAggregateModel().length > 0);
      return;
    }
    this.paginator.classList.add("visible");
    this.updateAggregateControls();

    if (this.pageSizeSelect) {
      this.pageSizeSelect.value = String(pageSize);
    }

    this.populatePageSelect(pageIndex, totalPageCount, totalRowCountKnown);

    const atFirstPage = pageIndex <= 0;
    // While the total is provisional there may be pages past the last known one: "next" stays
    // enabled (navigating onto the frontier page is what probes for more rows) and "last" jumps to
    // the last *known* page rather than disabling.
    const atLastPage = pageIndex >= Math.max(totalPageCount - 1, 0) && totalRowCountKnown;
    const atLastKnownPage = pageIndex >= Math.max(totalPageCount - 1, 0);
    const hasRows = totalRowCount > 0;

    if (this.pageSizeSelect) this.pageSizeSelect.disabled = !hasRows || !paginationEnabled;

    if (this.firstPageBtn) this.firstPageBtn.disabled = atFirstPage || !hasRows;
    if (this.prevPageBtn) this.prevPageBtn.disabled = atFirstPage || !hasRows;
    if (this.nextPageBtn) this.nextPageBtn.disabled = atLastPage || !hasRows;
    if (this.lastPageBtn) this.lastPageBtn.disabled = atLastKnownPage || !hasRows;
    if (this.pageSelect) this.pageSelect.disabled = (totalPageCount <= 1 && totalRowCountKnown) || !hasRows;
  }

  updateAggregateControls(_params?: GridEventAggregateChangedParams) {
    if (!this.controlsAggregationAvailable || !this.aggregateScopeSelect || !this.aggregateClearBtn) return;
    const aggregateCount = this.params.core.getAggregateModel().length;
    const lockedToPage = this.params.core.isAggregateScopeLockedToPage();
    this.aggregateScopeSelect.value = lockedToPage ? "page" : this.params.core.getAggregateScope();
    this.aggregateScopeSelect.disabled = aggregateCount === 0 || lockedToPage;
    this.aggregateClearBtn.disabled = aggregateCount === 0;

    const paginationEnabled = this.params.core.getPaginationInfo().paginationEnabled;
    this.paginator.classList.toggle("visible", paginationEnabled || aggregateCount > 0);
  }

  private hasAggregatableColumns(): boolean {
    return this.params.core.getColumnModel().getLeaves().some(
      column => !column.isInternal() && column.aggregatable,
    );
  }

  togglePagination(pagination: boolean) {
    const current = this.params.core.getPaginationInfo();
    const next = isTrue(pagination);
    if (current.paginationEnabled === next) return;
    this.params.resetScrollPosition();
    this.params.core.dispatch({
      type: "paginationSet",
      enabled: next,
      pageIndex: 0,
      pageSize: current.pageSize,
    });
  }

  goToPage(pageIdx: number) {
    this.params.resetScrollPosition();
    this.params.core.dispatch({
      type: "paginationSet",
      enabled: true,
      pageIndex: pageIdx,
      pageSize: this.params.core.getPaginationInfo().pageSize,
    });
  }
}
