import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import type { SortIconVisibility } from "../../interfaces/gridOptions";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { SortDir } from "../../interfaces/sort";
import { isFalse } from "../../misc";
import { createElement } from "../element";
import {
  HeaderComponent,
  HeaderComponentParams,
  HeaderComponentRuntime,
  createHeaderComponentRuntime,
} from "./headerComponent";
import { createHeaderWrapper, HeaderWrapperElements } from "./wrapper";

interface HeaderRendererParams {
  core: GridCore;
  root: HTMLElement;
  api: IGridAPI;
  rowHeight: () => number;
  /** The body's outer frame — the element that owns the body's height budget. Sizing the scroller
   * inside it instead would subtract the header twice, since the frame is already header-less. */
  getBodyFrame: () => HTMLDivElement;
  getContainerEl: () => HTMLElement;
  openColumnMenu: (colID: string, anchorEl: HTMLElement) => void;
  openColumnFilter: (colID: string, anchorEl: HTMLElement) => void;
}

/** A mounted custom header component plus which slot (1 = content, 2 = whole cell) it filled. */
type MountedHeaderComponent = { runtime: HeaderComponentRuntime; level: 1 | 2 };

export class HeaderRenderer {
  private elements: HeaderWrapperElements;
  /** Live custom header components, keyed by column instanceID. Rebuilt each buildDOM. */
  private components = new Map<string, MountedHeaderComponent>();
  /** The header cell currently painted as holding the keyboard cursor. */
  private activeHeaderEl: HTMLElement | null = null;
  /** The select-all checkbox visual in the checkbox column's header, when rendered. */
  private selectAllCheckboxEl: HTMLElement | null = null;

  constructor(private params: HeaderRendererParams) {
    this.elements = createHeaderWrapper();
    this.params.root.appendChild(this.elements.wrapper);
  }

  getRefs() {
    return this.elements;
  }

  destroy(): void {
    for (const { runtime } of this.components.values()) runtime.destroy();
    this.components.clear();
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
    const bodyFrame = this.params.getBodyFrame();
    const headerHeight = core.options.headerHeight * core.getColumnModel().maxHeaderDepth;
    this.params.root.style.setProperty("--pte-rendered-header-height", `${headerHeight}px`);
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
    bodyFrame.style.height = `calc(100% - ${headerHeight}px)`;
    bodyFrame.style.maxHeight = `calc(100% - ${headerHeight}px)`;
    // Tear down any custom header components from the previous build before wiping their DOM, so
    // class components can release listeners/state. buildHeaderCell repopulates this map.
    for (const { runtime } of this.components.values()) runtime.destroy();
    this.components.clear();
    this.selectAllCheckboxEl = null;
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
    this.applyHeaderAria(leadingHeader, leftHeader, centerHeader, rightHeader);
    const containerEl = this.params.getContainerEl();
    const headerProbe = getComputedStyle(centerHeader.querySelector(".pte-hcell") || containerEl);
    const cellProbe = getComputedStyle(bodyFrame.querySelector(".pte-cell") || containerEl);
    core.dispatch({
      type: "themeFontSet",
      headerFont: `${headerProbe.fontWeight} ${headerProbe.fontSize} ${headerProbe.fontFamily}`,
      cellFont: `${cellProbe.fontWeight} ${cellProbe.fontSize} ${cellProbe.fontFamily}`,
      reason: reason,
    });
  }

  /**
   * ARIA: the center header section is THE header row (role stamped by createHeaderWrapper); leaf
   * header cells across all four sections become its columnheaders via aria-owns, in visual order.
   * Group (parent) header cells are presentational — the group hierarchy is not exposed. Rebuilt with
   * the header DOM on every column change.
   */
  private applyHeaderAria(
    leadingHeader: HTMLDivElement,
    leftHeader: HTMLDivElement,
    centerHeader: HTMLDivElement,
    rightHeader: HTMLDivElement,
  ) {
    const lookup = this.params.core.getColumnModel().leafColumnLookup;
    const ownedIds: string[] = [];
    for (const section of [leadingHeader, leftHeader, centerHeader, rightHeader]) {
      for (const hcell of section.querySelectorAll<HTMLElement>(".pte-hcell")) {
        const meta = lookup.get(hcell.id);
        if (hcell.classList.contains("pte-hcell-leaf") && meta) {
          hcell.setAttribute("role", "columnheader");
          hcell.setAttribute("aria-colindex", String(meta.globalIndex + 1));
          // The row-number gutter renders a deliberately blank label, which leaves its
          // columnheader with no accessible name (axe: empty-table-header). Name it here rather
          // than painting text into the cell.
          if (hcell.classList.contains("pte-hcell-row-number")) {
            hcell.setAttribute("aria-label", "Row number");
          }
          if (hcell.classList.contains("pte-hcell-checkbox")) {
            hcell.setAttribute("aria-label", "Select all rows");
          }
          ownedIds.push(hcell.id);
        } else {
          hcell.setAttribute("role", "presentation");
        }
      }
    }
    if (ownedIds.length) centerHeader.setAttribute("aria-owns", ownedIds.join(" "));
    else centerHeader.removeAttribute("aria-owns");
  }

  buildHeaderCell(col: Column, maxDepth: number): HTMLDivElement {
    const header = document.createElement("div");
    header.className = "pte-hcell";
    const isRowNumberColumn = col.isLeadingUtilityColumn();
    if (col.isRowNumberColumn()) {
      header.classList.add("pte-hcell-row-number");
    } else if (col.isSelectionCheckboxColumn()) {
      header.classList.add("pte-hcell-checkbox");
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
    // Resolve a custom header component (never for the internal row-number column). Level 2 (whole
    // cell) takes precedence over Level 1 (content only); see resolveHeaderComponent.
    const custom = isRowNumberColumn ? null : this.resolveHeaderComponent(col);
    const headerContainer = document.createElement("div");
    headerContainer.className = "pte-hcell-container";
    headerContainer.style.height = `${this.params.rowHeight() * contentHeight}px`;
    if (col.isComputableType()) {
      headerContainer.classList.add("pte-hcell-computable");
    }
    headerWrapper.appendChild(headerContainer);

    if (custom?.level === 2) {
      // Whole-cell component: it owns everything inside the container (content + filter/menu). The
      // grid keeps the wrapper + resize handle already built above.
      headerContainer.classList.add("pte-hcell-custom-cell");
      const runtime = createHeaderComponentRuntime(custom.comp, this.buildComponentParams(col, header, 2));
      headerContainer.appendChild(runtime.gui);
      this.components.set(col.instanceID, { runtime, level: 2 });
      this.appendHeaderChildren(col, header, maxDepth);
      if (col.children.length === 0) header.style.width = `${col.computedWidth}px`;
      return header;
    }

    const headerContent = document.createElement("div");
    headerContent.className = "pte-hcell-content";
    headerContainer.appendChild(headerContent);

    if (custom?.level === 1) {
      // Content-only component: it replaces the label/expander/sort inside .pte-hcell-content. The
      // grid still renders the filter/menu row below. A level-1 component that needs the group
      // expander must render its own (or use a level-2 headerCellComponent).
      headerContent.classList.add("pte-hcell-custom-content");
      const runtime = createHeaderComponentRuntime(custom.comp, this.buildComponentParams(col, header, 1));
      headerContent.appendChild(runtime.gui);
      this.components.set(col.instanceID, { runtime, level: 1 });
      this.appendHeaderChildren(col, header, maxDepth);
      if (col.children.length === 0) header.style.width = `${col.computedWidth}px`;
      if (!isRowNumberColumn) {
        headerContainer.appendChild(this.getHeaderMenuElement(col));
      }
      return header;
    }

    const headerLabel = document.createElement("div");
    headerLabel.className = "pte-hcell-label";
    headerLabel.textContent = isRowNumberColumn ? "" : col.label ?? col.key;
    headerContent.appendChild(headerLabel);
    if (col.isSelectionCheckboxColumn() && this.params.core.options.rowSelectionHeaderCheckbox) {
      // Tri-state select-all visual. State classes are driven by refreshSelectAllCheckbox();
      // semantics live on the hcell's aria-label (a columnheader cannot carry aria-checked).
      this.selectAllCheckboxEl = createElement("span", "pte-checkbox pte-select-all-checkbox");
      this.selectAllCheckboxEl.setAttribute("aria-hidden", "true");
      headerContent.appendChild(this.selectAllCheckboxEl);
      this.refreshSelectAllCheckbox();
    }
    this.appendHeaderChildren(col, header, maxDepth);
    if (col.children.length === 0) {
      header.style.width = `${col.computedWidth}px`;
    }
    if (col.showExpander) {
      const expander = document.createElement("div");
      expander.className = "pte-hcell-menu-btn pte-hcell-expander";
      const span = createElement("span", "pte-hcell-expander-icon");
      expander.appendChild(span);
      if (col.groupExpandState === "open") {
        span.classList.add("icon-group-expanded");
      } else {
        span.classList.add("icon-group-collapsed");
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
    this.updateSortAria(col, header);
    return header;
  }

  /** Build the nested group-header row (recursing into visible children). No-op for leaf columns. */
  private appendHeaderChildren(col: Column, header: HTMLDivElement, maxDepth: number) {
    if (col.children.length === 0) return;
    const children = document.createElement("div");
    children.className = "pte-hcell-children";
    header.appendChild(children);
    for (const child of col.getVisibleChildren()) {
      children.append(this.buildHeaderCell(child, maxDepth));
    }
  }

  /**
   * Resolve the custom header component for a column, if any. A whole-cell component (Level 2 —
   * `headerCellComponent`) takes precedence over a content-only component (Level 1 —
   * `headerComponent`). When a column has both a Level 1 and Level 2 component, Level 2 wins and a
   * one-time dev warning fires. (Grid-wide defaults arrive via `defaultColDef`, already merged onto
   * the column.)
   */
  private resolveHeaderComponent(col: Column): { comp: HeaderComponent; level: 1 | 2 } | null {
    const cellComp = col.headerCellComponent;
    const contentComp = col.headerComponent;
    if (cellComp) {
      if (col.headerComponent && col.headerCellComponent && !this.warnedBothComponents.has(col.instanceID)) {
        this.warnedBothComponents.add(col.instanceID);
        console.warn(
          `[grid] Column "${col.colId || col.key}" defines both headerComponent and ` +
          `headerCellComponent; the whole-cell headerCellComponent takes precedence and the ` +
          `content-only headerComponent is ignored.`,
        );
      }
      return { comp: cellComp, level: 2 };
    }
    if (contentComp) return { comp: contentComp, level: 1 };
    return null;
  }

  /** Columns already warned about defining both header components (warn once each). */
  private warnedBothComponents = new Set<string>();

  /** Current sort state for a column: its direction, 0-based multi-sort index, and total sorted count. */
  private getColumnSortState(col: Column): { direction: SortDir | null; index: number; count: number } {
    const items = this.params.core.getSortModel().items;
    const index = items.findIndex(s => s.col.instanceID === col.instanceID);
    return { direction: index === -1 ? null : items[index].dir, index, count: items.length };
  }

  /** Build the params passed to a custom header component (init + every refresh). */
  private buildComponentParams(col: Column, header: HTMLElement, level: 1 | 2): HeaderComponentParams {
    const core = this.params.core;
    const filterActive = core.getFilterModel().items.some(f => this.filterMatchesColumn(f, col));
    return {
      column: col,
      displayName: col.label ?? col.key,
      level,
      api: this.params.api,
      eGridHeader: header,
      sort: this.getColumnSortState(col),
      filterActive,
      progressSort: (additive?: boolean) =>
        core.dispatch({ type: "headerAction", action: "toggleSort", colId: col.instanceID, additive: !!additive }),
      showColumnMenu: (anchorEl: HTMLElement) => this.params.openColumnMenu(col.instanceID, anchorEl),
      showFilterMenu: (anchorEl: HTMLElement) => this.params.openColumnFilter(col.instanceID, anchorEl),
      selectColumn: (mode: "replace" | "toggle" = "replace") =>
        core.dispatch({ type: "columnSelectSet", colId: col.instanceID, mode }),
    };
  }

  /** A column's `sortIconVisibility` (its own or inherited from `defaultColDef`), defaulting to
   * "hover": whether/when the sort icon renders. */
  private resolveSortIconVisibility(col: Column): SortIconVisibility {
    return col.sortIconVisibility ?? "hover";
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
   * `aria-sort` on the OUTER `.pte-hcell`: a custom header component may own the cell interior, but the
   * outer element is grid-owned in every case. Separate from updateSortIcon because the audiences
   * differ — a column with `sortIconVisibility: "never"` has no icon element and updateSortIcon returns
   * early, yet it is still sortable and must say so. Sortable-but-unsorted carries `aria-sort="none"`
   * rather than nothing, which is what tells AT the column is sortable at all.
   */
  private updateSortAria(col: Column, hcell?: HTMLElement | null) {
    const el = hcell ?? document.getElementById(col.instanceID);
    if (!el) return;
    if (!col.sortable || col.children.length > 0 || col.isRowNumberColumn()) {
      el.removeAttribute("aria-sort");
      return;
    }
    const sorted = this.params.core.getSortModel().items
      .find(s => s.col.instanceID === col.instanceID);
    el.setAttribute("aria-sort", !sorted ? "none" : sorted.dir === "asc" ? "ascending" : "descending");
  }

  /**
   * Paint the header cursor, returning the cell it landed on so the caller can name it in
   * `aria-activedescendant`. A class rather than DOM focus, since focus stays on the root — which also
   * means the `:focus-within` rules revealing the sort icon and hover-only buttons never fire, so
   * `.pte-hcell-active` is wired into those rules in the stylesheet.
   */
  setActiveHeader(colIdx: number | null): HTMLElement | null {
    const target = colIdx == null
      ? null
      : this.params.core.getColumnModel().getLeaves()[colIdx] ?? null;
    const targetEl = target ? document.getElementById(target.instanceID) : null;
    if (this.activeHeaderEl === targetEl) return targetEl;
    this.activeHeaderEl?.classList.remove("pte-hcell-active");
    this.activeHeaderEl = targetEl;
    targetEl?.classList.add("pte-hcell-active");
    return targetEl;
  }

  /** Re-apply the cursor after a header rebuild, which replaces the element it was painted on. */
  restoreActiveHeader(): HTMLElement | null {
    this.activeHeaderEl = null;
    return this.setActiveHeader(this.params.core.getHeaderFocusColIdx());
  }

  /**
   * Refresh sort icons across all sortable columns. Called on every sort change because adding or
   * removing a sorted column renumbers the priority badges of the others — a per-changed-column
   * update would leave stale numbers behind.
   */
  /**
   * Sync the header select-all checkbox with the current selection: checked when every row in the
   * select-all scope is selected, indeterminate when some are, empty otherwise. The hcell's
   * aria-label mirrors the action a click would perform.
   */
  refreshSelectAllCheckbox() {
    const box = this.selectAllCheckboxEl;
    if (!box) return;
    const core = this.params.core;
    const all = core.areAllRowsSelected();
    const some = !all && core.getSelectedRowIds().size > 0;
    box.classList.toggle("selected", all);
    box.classList.toggle("pte-checkbox-indeterminate", some);
    const hcell = box.closest(".pte-hcell");
    hcell?.setAttribute("aria-label", all ? "Deselect all rows" : "Select all rows");
  }

  refreshSortIndicators() {
    for (const col of this.params.core.getColumnModel().getLeaves()) {
      if (col.sortable) this.updateSortIcon(col);
      // Every leaf, not just sortable ones: a column that stopped being sortable has to lose its
      // aria-sort, and only this pass would clear it.
      this.updateSortAria(col);
    }
    this.refreshHeaderComponents();
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
    this.refreshHeaderComponents();
  }

  /**
   * Push fresh sort/filter state into every mounted custom header component. Covers both leaf and
   * group columns (the default indicator passes above only walk leaves). A component whose refresh()
   * returns false is destroyed and recreated in place from the same slot element.
   */
  private refreshHeaderComponents() {
    for (const [instanceID, mounted] of this.components) {
      const col = this.params.core.getColumnModel().getById(instanceID);
      const header = document.getElementById(instanceID);
      if (!col || !header) continue;
      const params = this.buildComponentParams(col, header, mounted.level);
      const updated = mounted.runtime.refresh(params);
      if (updated) continue;
      // refresh() opted out of in-place update: destroy and recreate into the same slot.
      const slot = mounted.runtime.gui.parentElement;
      mounted.runtime.destroy();
      const comp = this.resolveHeaderComponent(col);
      if (!slot || !comp || comp.level !== mounted.level) continue;
      const runtime = createHeaderComponentRuntime(comp.comp, params);
      slot.replaceChildren(runtime.gui);
      this.components.set(instanceID, { runtime, level: mounted.level });
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
