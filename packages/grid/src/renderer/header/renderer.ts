import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import type { SortIconVisibility } from "../../interfaces/gridOptions";
import { isFalse } from "../../misc";
import { createElement } from "../element";
import { createHeaderWrapper, HeaderWrapperElements } from "./wrapper";

interface HeaderRendererParams {
  core: GridCore;
  root: HTMLElement;
  rowHeight: () => number;
  getBody: () => HTMLDivElement;
  getContainerEl: () => HTMLElement;
}

export class HeaderRenderer {
  private elements: HeaderWrapperElements;

  constructor(private params: HeaderRendererParams) {
    this.elements = createHeaderWrapper();
    this.params.root.appendChild(this.elements.wrapper);
  }

  getRefs() {
    return this.elements;
  }

  buildDOM(reason: string) {
    const {
      core,
    } = this.params;
    const {
      wrapper: headerWrapper,
      leading: leadingHeader,
      left: leftHeader,
      center: centerHeader,
      right: rightHeader,
    } = this.elements;
    const body = this.params.getBody();
    const headerHeight = core.options.headerHeight * core.getColumnModel().maxHeaderDepth;
    headerWrapper.style.height = `${headerHeight}px`;
    headerWrapper.style.minHeight = `${headerHeight}px`;
    leadingHeader.style.height = `${headerHeight}px`;
    leadingHeader.style.minHeight = `${headerHeight}px`;
    leftHeader.style.height = `${headerHeight}px`;
    leftHeader.style.minHeight = `${headerHeight}px`;
    centerHeader.style.height = `${headerHeight}px`;
    centerHeader.style.minHeight = `${headerHeight}px`;
    rightHeader.style.height = `${headerHeight}px`;
    rightHeader.style.minHeight = `${headerHeight}px`;
    body.style.height = `calc(100% - ${headerHeight}px`;
    body.style.maxHeight = `calc(100% - ${headerHeight}px`;
    leadingHeader.innerHTML = "";
    leftHeader.innerHTML = "";
    centerHeader.innerHTML = "";
    rightHeader.innerHTML = "";
    for (const col of core.getColumnModel().getLeadingColumns()) {
      if (!col.hidden) {
        leadingHeader.appendChild(this.buildHeaderCell(col, core.getColumnModel().maxHeaderDepth));
      }
    }
    for (const col of core.getColumnModel().getLeftColumns()) {
      if (!col.hidden) {
        leftHeader.appendChild(this.buildHeaderCell(col, core.getColumnModel().maxHeaderDepth));
      }
    }
    for (const col of core.getColumnModel().getCenterColumns()) {
      if (!col.hidden) {
        centerHeader.appendChild(this.buildHeaderCell(col, core.getColumnModel().maxHeaderDepth));
      }
    }
    for (const col of core.getColumnModel().getRightColumns()) {
      if (!col.hidden) {
        rightHeader.appendChild(this.buildHeaderCell(col, core.getColumnModel().maxHeaderDepth));
      }
    }
    const containerEl = this.params.getContainerEl();
    const headerProbe = getComputedStyle(centerHeader.querySelector(".pte-hcell") || containerEl);
    const cellProbe = getComputedStyle(body.querySelector(".pte-cell") || containerEl);
    core.dispatch({
      type: "themeFontSet",
      headerFont: `${headerProbe.fontWeight} ${headerProbe.fontSize} ${headerProbe.fontFamily}`,
      cellFont: `${cellProbe.fontWeight} ${cellProbe.fontSize} ${cellProbe.fontFamily}`,
      reason: reason,
    });
  }

  buildHeaderCell(col: Column, maxDepth: number): HTMLDivElement {
    const header = document.createElement("div");
    header.className = "pte-hcell";
    const isRowNumberColumn = col.isRowNumberColumn();
    if (isRowNumberColumn) {
      header.classList.add("pte-hcell-row-number");
    }
    if (col.children.length === 0) {
      header.classList.add("pte-hcell-leaf");
    }
    const contentHeight = maxDepth / col.depth!;
    header.style.height = `${this.params.rowHeight() * maxDepth}px`;
    maxDepth--;
    header.id = col.instanceID;
    const headerWrapper = document.createElement("div");
    headerWrapper.className = "pte-hcell-wrapper";
    header.appendChild(headerWrapper);
    const headerResize = document.createElement("div");
    headerResize.className = "pte-hcell-resize-handle";
    if (!col.resizable) headerResize.classList.add("pte-hcell-resize-disabled");
    if (!isRowNumberColumn) {
      headerWrapper.appendChild(headerResize);
    }
    const headerContainer = document.createElement("div");
    headerContainer.className = "pte-hcell-container";
    headerContainer.style.height = `${this.params.rowHeight() * contentHeight}px`;
    if (col.isComputableType()) {
      headerContainer.classList.add("pte-hcell-computable");
    }
    headerWrapper.appendChild(headerContainer);
    const headerContent = document.createElement("div");
    headerContent.className = "pte-hcell-content";
    headerContainer.appendChild(headerContent);
    const headerLabel = document.createElement("div");
    headerLabel.className = "pte-hcell-label";
    headerLabel.textContent = isRowNumberColumn ? "" : col.label ?? col.key;
    headerContent.appendChild(headerLabel);
    if (col.children.length > 0) {
      const children = document.createElement("div");
      children.className = "pte-hcell-children";
      header.appendChild(children);
      for (const child of col.getVisibleChildren()) {
        children.append(this.buildHeaderCell(child, maxDepth));
      }
    } else {
      header.style.width = `${col.computedWidth}px`;
    }
    if (col.showExpander) {
      const expander = document.createElement("div");
      expander.className = "pte-hcell-menu-btn pte-hcell-expander";
      const span = createElement("span", "pte-hcell-expander-icon");
      expander.appendChild(span);
      if (col.groupExpandState === "open") {
        span.classList.add("icon-minus-frame");
      } else {
        span.classList.add("icon-plus-frame");
      }
      headerContent.appendChild(expander);
    }
    if (!isRowNumberColumn) {
      const headerMenu = this.getHeaderMenuElement(col);
      headerContainer.appendChild(headerMenu);
    }
    // Sortable leaf columns get a real, clickable sort icon inside the content (after the label). Its
    // resting visibility and current direction/priority are driven by classes updated here and in
    // refreshSortIndicators. Parent columns are excluded — they never carry a direction in the sort
    // model (their leaves do). Non-sortable and row-number columns get no icon, and neither do columns
    // whose sortIconVisibility resolves to "never" (still sortable, just no icon affordance).
    if (!isRowNumberColumn && col.sortable && col.children.length === 0) {
      const visibility = this.resolveSortIconVisibility(col);
      if (visibility !== "never") {
        const sortEl = createElement("div", "pte-hcell-sort");
        if (visibility === "always") sortEl.classList.add("pte-sort-persist");
        sortEl.appendChild(createElement("span", "pte-hcell-sort-arrow"));
        sortEl.appendChild(createElement("span", "pte-hcell-sort-priority"));
        headerContent.appendChild(sortEl);
        this.updateSortIcon(col, sortEl);
      }
    }
    return header;
  }

  /** Grid-level `sortIconVisibility`, overridable per column: whether/when the sort icon renders. */
  private resolveSortIconVisibility(col: Column): SortIconVisibility {
    return col.sortIconVisibility ?? this.params.core.options.sortIconVisibility;
  }

  /**
   * Set a single sort icon's direction (asc / desc / neutral) and priority badge from the current
   * sort model. `sortEl` is the `.pte-hcell-sort` wrapper; falls back to locating it from the column.
   */
  private updateSortIcon(col: Column, sortEl?: HTMLElement | null) {
    if (!sortEl) {
      const hcell = document.getElementById(col.instanceID);
      sortEl = hcell?.querySelector(".pte-hcell-sort") as HTMLElement | null;
    }
    if (!sortEl) return;
    const items = this.params.core.getSortModel().items;
    const idx = items.findIndex(s => s.col.instanceID === col.instanceID);
    const dir = idx === -1 ? null : items[idx].dir;

    sortEl.classList.remove("pte-sort-asc", "pte-sort-desc", "pte-sort-none");
    sortEl.classList.add(dir ? "pte-sort-" + dir : "pte-sort-none");

    const badge = sortEl.querySelector(".pte-hcell-sort-priority") as HTMLElement | null;
    if (badge) {
      const mode = this.params.core.options.showSortPriority;
      const show = dir !== null && (mode === "always" || (mode === "multi" && items.length >= 2));
      badge.textContent = show ? String(idx + 1) : "";
      sortEl.classList.toggle("pte-has-priority", show);
    }
  }

  /**
   * Refresh sort icons across all sortable columns. Called on every sort change because adding or
   * removing a sorted column renumbers the priority badges of the others — a per-changed-column
   * update would leave stale numbers behind.
   */
  refreshSortIndicators() {
    for (const col of this.params.core.getColumnModel().getLeaves()) {
      if (col.sortable) this.updateSortIcon(col);
    }
  }

  setFilterIndicators() {
    const filters = this.params.core.getFilterModel().items;
    for (const col of this.params.core.getColumnModel().getLeaves()) {
      const hcell = document.getElementById(col.instanceID);
      if (!hcell) continue;
      const menuBtn = hcell.querySelector(".pte-hcell-menu-filterBtn");
      if (!menuBtn) continue;
      menuBtn.classList.toggle("active", filters.some(f => this.filterMatchesColumn(f, col)));
    }
  }

  private getHeaderMenuElement(col: Column): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu";

    const buildMenuItem = (btnClass: string, iconClass: string, flyout: HTMLDivElement | null) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pte-hcell-menu-item";

      const btn = document.createElement("div");
      btn.className = `pte-hcell-menu-btn ${btnClass}`;
      const icon = document.createElement("span");
      icon.className = iconClass;
      btn.appendChild(icon);
      wrapper.appendChild(btn);
      if (flyout) {
        const hasFilter = this.params.core.getFilterModel().items.find(f => this.filterMatchesColumn(f, col));
        if (hasFilter) {
          btn.classList.add("pte-hcell-menu-filter-active");
        }
        wrapper.appendChild(flyout);
      }

      return wrapper;
    };

    if (!isFalse(col.filter)) {
      if (col.children.length === 0) {
        menu.appendChild(buildMenuItem("pte-hcell-menu-filterBtn", "pte-filter-icon", this.getFilterMenuElement()));
      }
    }
    if (col.showColumnMenu) {
      menu.appendChild(buildMenuItem("pte-hcell-menu-menuBtn", "pte-menu-icon", null));
    }
    return menu;
  }

  private getFilterMenuElement(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "pte-hcell-menu-flyout";
    return menu;
  }

  private filterMatchesColumn(filter: { col: Column; key: string }, col: Column): boolean {
    return filter.col.instanceID === col.instanceID
      || filter.col.colId === col.colId
      || filter.col.key === col.key
      || filter.key === col.colId
      || filter.key === col.key;
  }
}
