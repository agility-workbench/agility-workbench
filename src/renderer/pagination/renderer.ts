import { GridCore } from "../../core/core";
import { GridEventPaginationChangedParams } from "../../events/events";
import { isTrue } from "../../misc";
import { createPaginationWrapper } from "./wrapper";

interface PaginationRendererParams {
  core: GridCore;
  root: HTMLElement;
  resetScrollPosition: () => void;
}

export class PaginationRenderer {
  pageSizeSelect!: HTMLSelectElement;
  pageSelect!: HTMLSelectElement;
  firstPageBtn!: HTMLButtonElement;
  prevPageBtn!: HTMLButtonElement;
  nextPageBtn!: HTMLButtonElement;
  lastPageBtn!: HTMLButtonElement;
  private paginator: HTMLDivElement;

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
      pageSizes,
    } = core.getPaginationInfo();
    if (!paginationEnabled) return;

    const sizeSection = document.createElement("div");
    sizeSection.className = "pte-pagination-section";
    const sizeLabel = document.createElement("span");
    sizeLabel.className = "pte-pagination-label";
    sizeLabel.textContent = "Rows per page";
    this.pageSizeSelect = document.createElement("select");
    this.pageSizeSelect.className = "pte-select pte-pagination-select";
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

    this.firstPageBtn = document.createElement("button");
    this.firstPageBtn.type = "button";
    this.firstPageBtn.className = "pte-pagination-btn pte-pagination-btn-first";
    this.firstPageBtn.addEventListener("click", () => this.goToPage(0));

    this.prevPageBtn = document.createElement("button");
    this.prevPageBtn.type = "button";
    this.prevPageBtn.className = "pte-pagination-btn pte-pagination-btn-prev";
    this.prevPageBtn.addEventListener("click", () => {
      this.goToPage(core.getPaginationInfo().pageIndex - 1);
    });

    const pageLabel = document.createElement("span");
    pageLabel.className = "pte-pagination-label";
    pageLabel.textContent = "Page";

    this.pageSelect = document.createElement("select");
    this.pageSelect.className = "pte-select pte-pagination-select pte-pagination-page-select";
    this.pageSelect.name = "pte-page-select";
    this.pageSelect.addEventListener("change", (e) => {
      const val = Number((e.target as HTMLSelectElement).value);
      if (!Number.isFinite(val)) return;
      this.goToPage(val);
    });

    this.nextPageBtn = document.createElement("button");
    this.nextPageBtn.type = "button";
    this.nextPageBtn.className = "pte-pagination-btn pte-pagination-btn-next";
    this.nextPageBtn.addEventListener("click", () => {
      this.goToPage(core.getPaginationInfo().pageIndex + 1);
    });

    this.lastPageBtn = document.createElement("button");
    this.lastPageBtn.type = "button";
    this.lastPageBtn.className = "pte-pagination-btn pte-pagination-btn-last";
    this.lastPageBtn.addEventListener("click", () => {
      this.goToPage(core.getPaginationInfo().totalPageCount - 1);
    });

    navSection.appendChild(this.firstPageBtn);
    navSection.appendChild(this.prevPageBtn);
    navSection.appendChild(pageLabel);
    navSection.appendChild(this.pageSelect);
    navSection.appendChild(this.nextPageBtn);
    navSection.appendChild(this.lastPageBtn);

    paginator.appendChild(sizeSection);
    paginator.appendChild(navSection);
    this.populatePageSelect(pageIndex, totalPageCount);
    this.updateControls();
  }

  populatePageSelect(pageIndex: number, totalPageCount: number) {
    if (!this.pageSelect) return;
    const totalPages = Math.max(totalPageCount, 1);
    if (this.pageSelect.options.length !== totalPages) {
      this.pageSelect.innerHTML = "";
      for (let i = 0; i < totalPages; i++) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `${i + 1} of ${totalPages}`;
        this.pageSelect.appendChild(option);
      }
    } else {
      for (let i = 0; i < totalPages; i++) {
        const option = this.pageSelect.options[i];
        const desiredText = `${i + 1} of ${totalPages}`;
        if (option.textContent !== desiredText) {
          option.textContent = desiredText;
        }
      }
    }
    this.pageSelect.value = String(Math.min(pageIndex, totalPages - 1));
  }

  updateControls(params?: GridEventPaginationChangedParams) {
    const {
      paginationEnabled,
      pageIndex,
      pageSize,
      totalRowCount,
      totalPageCount,
    } = params || this.params.core.getPaginationInfo();
    if (!paginationEnabled) {
      this.paginator.classList.remove("visible");
      return;
    }
    this.paginator.classList.add("visible");

    if (this.pageSizeSelect) {
      this.pageSizeSelect.value = String(pageSize);
    }

    this.populatePageSelect(pageIndex, totalPageCount);

    const atFirstPage = pageIndex <= 0;
    const atLastPage = pageIndex >= Math.max(totalPageCount - 1, 0);
    const hasRows = totalRowCount > 0;

    if (this.pageSizeSelect) this.pageSizeSelect.disabled = !hasRows || !paginationEnabled;

    if (this.firstPageBtn) this.firstPageBtn.disabled = atFirstPage || !hasRows;
    if (this.prevPageBtn) this.prevPageBtn.disabled = atFirstPage || !hasRows;
    if (this.nextPageBtn) this.nextPageBtn.disabled = atLastPage || !hasRows;
    if (this.lastPageBtn) this.lastPageBtn.disabled = atLastPage || !hasRows;
    if (this.pageSelect) this.pageSelect.disabled = totalPageCount <= 1 || !hasRows;
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
