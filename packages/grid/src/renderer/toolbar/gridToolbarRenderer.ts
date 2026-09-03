import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { Unsubscribe } from "../../events/events";
import { ExportOptions } from "../../export/export";
import {
  GridToolbarOptions,
  ResolvedGridToolbarOptions,
  resolveGridToolbarOptions,
} from "../../interfaces/gridOptions";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { SavedGridView, SavedViewsOptions } from "../../interfaces/gridView";
import { MenuItem } from "../../interfaces/menuItem";
import { SortDir } from "../../interfaces/sort";
import { createRecordId } from "../../misc";
import { button, div, span } from "../element";
import { canonicalKey, matchesAnyChord, matchesChord } from "../interaction/keyChord";
import { MenuRenderer } from "../menuRenderer";
import {
  ResponsiveBar,
  type BarItemStage,
  type ResponsiveBarItem,
  type ResponsiveBarMode,
  type ResponsiveBarStep,
} from "../responsive/responsiveBar";
import { registerRendererTooltipTarget } from "../tooltip/rendererTooltipTarget";
import {
  clearGroupDropPosition,
  resolveGroupDropIndex,
  showGroupDropPosition,
  type ChipAxis,
} from "./groupDropPosition";
import {
  applyOrderedSortItems,
  getOrderedSortItems,
  getSortDirections,
  insertSortColumn,
} from "./sortModelOperations";

interface GridToolbarRendererParams {
  core: GridCore;
  api: IGridAPI;
  root: HTMLDivElement;
  menuRenderer: MenuRenderer;
  options?: GridToolbarOptions;
  savedViews?: SavedViewsOptions;
  exportCSV: (options: ExportOptions) => void;
  exportExcel: (options: ExportOptions) => void;
}

/** The toolbar's two chip sections, which share their whole presentation ladder. */
type ChipSection = "group" | "sort";

/** Ids the responsive ladder addresses controls by. Stable, and asserted by tests. */
const BAR_ITEMS = {
  views: "views",
  group: "group",
  sort: "sort",
  quickFilter: "quickFilter",
  pivot: "pivot",
  export: "export",
  columns: "columns",
} as const;

/** Order the overflow menu lists displaced controls in: the bar's own left-to-right order, so the
 *  menu reads the same however many controls happen to be in it. */
const OVERFLOW_MENU_ORDER: readonly string[] = [
  BAR_ITEMS.views,
  BAR_ITEMS.group,
  BAR_ITEMS.sort,
  BAR_ITEMS.pivot,
  BAR_ITEMS.export,
  BAR_ITEMS.columns,
];

function containsFocus(el: HTMLElement | null | undefined): boolean {
  const active = el?.ownerDocument.activeElement;
  return !!el && !!active && el.contains(active);
}

/**
 * Shared grid toolbar chrome. Controls translate toolbar intent into existing renderer/core
 * operations; export construction and download behavior remain owned by ExportRenderer.
 */
export class GridToolbarRenderer {
  private toolbar = div("pte-grid-toolbar");
  private left = div("pte-grid-toolbar-left");
  private groupSection = div("pte-grid-toolbar-group-section");
  private sortSection = div("pte-grid-toolbar-sort-section");
  private right = div("pte-grid-toolbar-right");
  private viewsButton = button("pte-grid-toolbar-views-button");
  private viewsLabel = span("pte-grid-toolbar-views-label", "Views");
  private quickFilterHost = div("pte-grid-toolbar-quick-filter");
  private exportButton = button("pte-grid-toolbar-export-button");
  private pivotButton = button("pte-grid-toolbar-pivot-button");
  private moreButton = button("pte-grid-toolbar-more-button");
  /** Stands in for the quick filter at its narrowest rung, and expands it again in place. */
  private quickFilterTrigger = button("pte-grid-toolbar-quick-filter-trigger");
  /** One button per chip section, standing in for it once its chips cannot fit. */
  private groupSummary = button("pte-grid-toolbar-section-summary");
  private sortSummary = button("pte-grid-toolbar-section-summary");
  private draggedGroupColId: string | null = null;
  private draggedSortColId: string | null = null;
  private groupChipTooltipDisposers: Array<() => void> = [];
  private sortChipTooltipDisposers: Array<() => void> = [];
  private exportTooltipDisposer: (() => void) | null = null;
  private pivotTooltipDisposer: (() => void) | null = null;
  private pivotUnsubscribe: Unsubscribe | null = null;
  private moreTooltipDisposer: (() => void) | null = null;
  private viewsTooltipDisposer: (() => void) | null = null;
  private options: ResolvedGridToolbarOptions = resolveGridToolbarOptions(undefined);
  private savedViewsOptions?: SavedViewsOptions;
  private views: SavedGridView[] = [];
  private activeViewId: string | null = null;
  private columnTrigger: HTMLButtonElement | null = null;
  private responsive: ResponsiveBar | null = null;
  /** Presentation each section is currently rendered at; re-applied after every chip rebuild. */
  private sectionStages: Record<ChipSection, { stage: BarItemStage; level?: number }> = {
    group: { stage: "full" },
    sort: { stage: "full" },
  };
  private quickFilterStage: BarItemStage = "full";
  private quickFilterExpanded = false;
  private chipEditorSection: ChipSection | null = null;
  /** What the overflow menu held at the last fit, so only a real change closes an open menu. */
  private lastOverflowSignature = "";
  private chipEditorContent: HTMLElement | null = null;
  private unsubscribe: Unsubscribe;

  constructor(private params: GridToolbarRendererParams) {
    this.viewsButton.type = "button";
    this.viewsButton.setAttribute("aria-haspopup", "menu");
    this.viewsButton.setAttribute("aria-label", "Saved views");
    const viewsIcon = span("pte-grid-toolbar-views-icon", "▤");
    viewsIcon.setAttribute("aria-hidden", "true");
    this.viewsButton.append(viewsIcon, this.viewsLabel);
    this.viewsButton.addEventListener("click", () => this.openViewsMenu());
    this.viewsTooltipDisposer = registerRendererTooltipTarget(
      this.viewsButton,
      () => this.toolbar.classList.contains("pte-grid-toolbar-compact")
        ? this.activeView()?.name ?? "Views"
        : null,
    );

    this.exportButton.type = "button";
    this.exportButton.setAttribute("aria-label", "Export table");
    this.exportButton.setAttribute("aria-haspopup", "menu");
    const options = this.params.core.getOptions();
    this.exportButton.disabled = !options.allowExportAsCSV && !options.allowExportAsExcel;
    const icon = span("pte-grid-toolbar-export-icon icon-export");
    icon.setAttribute("aria-hidden", "true");
    this.exportButton.append(icon, span("pte-grid-toolbar-export-label", "Export"));
    this.exportButton.addEventListener("click", () => this.openExportMenu());
    this.exportTooltipDisposer = registerRendererTooltipTarget(
      this.exportButton,
      () => this.toolbar.classList.contains("pte-grid-toolbar-compact") ? "Export" : null,
      undefined,
      "left",
    );

    // Pivot indicator + toggle. Pressed state mirrors core pivot mode; kept in sync through the
    // pivotChanged event so API/menu toggles reflect here too.
    this.pivotButton.type = "button";
    this.pivotButton.setAttribute("aria-label", "Toggle pivot mode");
    const pivotIcon = span("pte-grid-toolbar-pivot-icon icon-pivot");
    pivotIcon.setAttribute("aria-hidden", "true");
    this.pivotButton.append(pivotIcon, span("pte-grid-toolbar-pivot-label", "Pivot"));
    this.pivotButton.addEventListener("click", () => {
      this.params.core.dispatch({ type: "pivotModeSet", on: !this.params.core.getPivotMode() });
    });
    this.pivotTooltipDisposer = registerRendererTooltipTarget(
      this.pivotButton,
      () => this.params.core.getPivotMode() ? "Pivot mode on" : "Pivot mode off",
      undefined,
      "left",
    );

    this.moreButton.type = "button";
    this.moreButton.setAttribute("aria-label", "More toolbar actions");
    this.moreButton.setAttribute("aria-haspopup", "menu");
    const moreIcon = span("pte-grid-toolbar-more-icon pte-menu-icon");
    moreIcon.setAttribute("aria-hidden", "true");
    this.moreButton.appendChild(moreIcon);
    this.moreButton.addEventListener("click", () => this.openMoreMenu());
    this.moreTooltipDisposer = registerRendererTooltipTarget(
      this.moreButton,
      () => "More actions",
      undefined,
      "left",
    );

    this.quickFilterTrigger.type = "button";
    this.quickFilterTrigger.setAttribute("aria-label", "Search");
    this.quickFilterTrigger.setAttribute("aria-expanded", "false");
    const quickFilterIcon = span("pte-grid-toolbar-quick-filter-trigger-icon");
    quickFilterIcon.setAttribute("aria-hidden", "true");
    this.quickFilterTrigger.appendChild(quickFilterIcon);
    this.quickFilterTrigger.addEventListener("click", () => this.toggleQuickFilterExpanded());
    this.quickFilterHost.appendChild(this.quickFilterTrigger);

    this.initSectionSummary("group");
    this.initSectionSummary("sort");

    this.bindExternalColumnDrop();
    this.bindSortChipDrop();
    this.toolbar.append(this.left, this.right);
    // Pinning is a function of focus, so the bar re-decides when focus enters or leaves it: a
    // control the user is in stays put, and gives way again as soon as they move on.
    this.toolbar.addEventListener("focusin", () => this.responsive?.refresh());
    this.toolbar.addEventListener("focusout", event => {
      // The icon's overlay is open for as long as the field is in use. Once focus leaves it the
      // intent goes too, so narrowing the bar again shows the icon rather than reopening the
      // overlay on its own.
      const next = (event as FocusEvent).relatedTarget;
      if (this.quickFilterExpanded
        && !(next instanceof Node && this.quickFilterHost.contains(next))) {
        this.setQuickFilterExpanded(false);
      }
      this.responsive?.refresh();
    });
    this.responsive = new ResponsiveBar({
      bar: this.toolbar,
      scrollClass: "pte-grid-toolbar-scrolling",
      items: () => this.barItems(),
      ladder: () => this.barLadder(),
      mode: () => this.responsiveMode(),
      fallbackFocus: () => this.moreButton,
      syncFurniture: () => this.syncOverflowFurniture(),
      onFit: () => this.syncOverflowButton(),
    });
    this.unsubscribe = this.params.core.on("columnsChanged", event => {
      if (event.reason === "group" || event.reason === "defs") this.renderGroupChips();
      if (event.reason === "sort" || event.reason === "defs") this.renderSortChips();
    });
    this.renderGroupChips();
    this.renderSortChips();
    this.pivotUnsubscribe = this.params.core.on("pivotChanged", () => this.updatePivotButton());
    this.updatePivotButton();
    this.setSavedViewsOptions(this.params.savedViews);
    this.setOptions(this.params.options);
  }

  private updatePivotButton(): void {
    const on = this.params.core.getPivotMode();
    this.pivotButton.classList.toggle("pte-grid-toolbar-pivot-active", on);
    this.pivotButton.setAttribute("aria-pressed", String(on));
  }

  setOptions(options: GridToolbarOptions | undefined): void {
    this.options = resolveGridToolbarOptions(options);
    this.syncSections();
  }

  setSavedViewsOptions(options: SavedViewsOptions | undefined): void {
    this.savedViewsOptions = options;
    this.views = [...(options?.views ?? [])];
    if (options?.activeViewId !== undefined) {
      this.activeViewId = options.activeViewId;
    } else if (this.activeViewId && !this.views.some(view => view.id === this.activeViewId)) {
      this.activeViewId = null;
    }
    this.updateViewsButton();
  }

  mountColumnTrigger(trigger: HTMLButtonElement): void {
    this.columnTrigger = trigger;
    this.syncSections();
  }

  unmountColumnTrigger(): void {
    this.columnTrigger?.remove();
    this.columnTrigger = null;
    this.syncSections();
  }

  getQuickFilterHost(): HTMLDivElement {
    return this.quickFilterHost;
  }

  private unmount(): void {
    this.params.menuRenderer.close(0);
    this.toolbar.remove();
  }

  destroy(): void {
    this.unsubscribe();
    this.pivotUnsubscribe?.();
    this.pivotUnsubscribe = null;
    this.responsive?.destroy();
    this.responsive = null;
    this.exportTooltipDisposer?.();
    this.exportTooltipDisposer = null;
    this.pivotTooltipDisposer?.();
    this.pivotTooltipDisposer = null;
    this.moreTooltipDisposer?.();
    this.moreTooltipDisposer = null;
    this.viewsTooltipDisposer?.();
    this.viewsTooltipDisposer = null;
    this.disposeGroupChipTooltips();
    this.disposeSortChipTooltips();
    this.columnTrigger = null;
    this.unmount();
  }

  /**
   * Nominate the one control that takes the bar's leftover width, so a settled bar has no hole in
   * it. A ladder rung frees whatever it frees — the last one applied usually more than was needed —
   * and with every control floored at its own size that leftover used to collect between the two
   * regions as blank space, sitting there while the controls beside it were collapsed.
   *
   * The search field takes it when there is one: it is the only control that is *better* wide, and
   * a stretching search box is what a toolbar with room to spare looks like everywhere else.
   * Without a quick filter the last chip section takes it instead, extending its drop zone — blank
   * either way, but at least it is then a target you can drop a column on.
   *
   * Growth cannot lie to the fit pass: `flex-grow` divides positive free space only, so there is
   * none to take the moment the controls stop fitting (see ResponsiveBar's header note).
   */
  private markElasticSection(leftSections: HTMLElement[]): void {
    const elastic = this.options.quickFilter
      ? this.quickFilterHost
      : leftSections[leftSections.length - 1];
    for (const el of [this.quickFilterHost, this.groupSection, this.sortSection]) {
      el.classList.toggle("pte-bar-elastic", el === elastic);
    }
    // Which *region* may grow follows from that: both growing would split the slack, and half of
    // it would land back in the region whose sections cannot use it.
    this.toolbar.classList.toggle("pte-grid-toolbar-elastic-left", elastic !== this.quickFilterHost);
  }

  private syncSections(): void {
    this.params.menuRenderer.close(0);
    const leftSections: HTMLElement[] = [];
    if (this.options.grouping) leftSections.push(this.groupSection);
    if (this.options.sorting) leftSections.push(this.sortSection);
    this.left.replaceChildren(...leftSections);

    const rightSections: HTMLElement[] = [];
    if (this.options.quickFilter) rightSections.push(this.quickFilterHost);
    if (this.options.pivot) rightSections.push(this.pivotButton);
    if (this.options.export) rightSections.push(this.exportButton);
    if (this.columnTrigger) rightSections.push(this.columnTrigger);
    // The overflow button is always mounted and shown by class, because what it holds is decided by
    // a fit pass — and a pass measures the bar it is already part of. It is not a control, though:
    // it never keeps an otherwise-empty toolbar on screen.
    this.right.replaceChildren(...rightSections, this.moreButton);
    this.toolbar.replaceChildren(
      ...(this.options.views ? [this.viewsButton] : []),
      this.left,
      this.right,
    );
    this.markElasticSection(leftSections);
    this.refreshResponsive();

    const visible = this.options.views || leftSections.length > 0 || rightSections.length > 0;
    if (visible && !this.toolbar.isConnected) {
      this.params.root.insertBefore(this.toolbar, this.params.root.firstChild);
    } else if (!visible) {
      this.toolbar.remove();
    }
  }

  private activeView(): SavedGridView | undefined {
    return this.views.find(view => view.id === this.activeViewId);
  }

  private updateViewsButton(): void {
    const active = this.activeView();
    this.viewsLabel.textContent = active?.name ?? "Views";
    this.viewsButton.classList.toggle("pte-grid-toolbar-views-active", !!active);
    this.viewsButton.setAttribute(
      "aria-label",
      active ? `Saved view: ${active.name}` : "Saved views",
    );
  }

  private setActiveView(viewId: string | null): void {
    this.activeViewId = viewId;
    this.updateViewsButton();
    this.savedViewsOptions?.onActiveViewChange?.(viewId);
  }

  private commitViews(views: SavedGridView[]): void {
    this.views = views;
    if (this.activeViewId && !views.some(view => view.id === this.activeViewId)) {
      this.setActiveView(null);
    } else {
      this.updateViewsButton();
    }
    this.savedViewsOptions?.onChange?.(views);
  }

  /** Where a views popover hangs from: its own button, or the overflow button holding it. */
  private viewsAnchor(): HTMLElement {
    return this.viewsButton.classList.contains("pte-bar-displaced")
      ? this.moreButton
      : this.viewsButton;
  }

  private openViewsMenu(): void {
    const anchor = this.viewsAnchor();
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: anchor,
      clientX: rect.left,
      clientY: rect.bottom,
      items: this.buildViewsMenuItems(),
      position: "bottom-left",
      onItemClick: item => this.executeViewCommand(item),
    });
  }

  private buildViewsMenuItems(): MenuItem[] {
    const active = this.activeView();
    const items: MenuItem[] = this.views.length > 0
      ? this.views.map(view => ({
          id: `toolbarViewApply:${view.id}`,
          label: view.name,
          left: view.id === this.activeViewId ? "icon-check" : undefined,
          command: "toolbar.views.apply",
          payload: { viewId: view.id },
        }))
      : [{
          id: "toolbarViewsEmpty",
          label: "No saved views",
          disabled: true,
        }];

    if (this.savedViewsOptions?.onChange) {
      items.push({ isSeparator: true });
      items.push({
        id: "toolbarViewCreate",
        label: "Save current view…",
        command: "toolbar.views.create",
      });
      if (active) {
        items.push(
          {
            id: "toolbarViewUpdate",
            label: `Update “${active.name}”`,
            command: "toolbar.views.update",
          },
          {
            id: "toolbarViewRename",
            label: `Rename “${active.name}”…`,
            command: "toolbar.views.rename",
          },
          {
            id: "toolbarViewDelete",
            label: `Delete “${active.name}”…`,
            command: "toolbar.views.delete",
          },
        );
      }
    }

    return items;
  }

  private executeViewCommand(item: MenuItem): void {
    if (item.command === "toolbar.views.apply") {
      const view = this.views.find(candidate => candidate.id === item.payload?.viewId);
      if (!view) return;
      this.params.api.applyViewState(view.state);
      this.setActiveView(view.id);
      return;
    }
    if (item.command === "toolbar.views.create") {
      this.openViewNameEditor("Save current view", "", name => {
        const view: SavedGridView = {
          id: createRecordId("view"),
          name,
          state: this.params.api.captureViewState(),
        };
        this.commitViews([...this.views, view]);
        this.setActiveView(view.id);
      });
      return;
    }

    const active = this.activeView();
    if (!active) return;
    if (item.command === "toolbar.views.update") {
      const next = this.views.map(view => view.id === active.id
        ? { ...view, state: this.params.api.captureViewState() }
        : view);
      this.commitViews(next);
    } else if (item.command === "toolbar.views.rename") {
      this.openViewNameEditor("Rename view", active.name, name => {
        this.commitViews(this.views.map(view => view.id === active.id
          ? { ...view, name }
          : view));
      });
    } else if (item.command === "toolbar.views.delete") {
      this.openViewDeleteConfirmation(active);
    }
  }

  private openViewNameEditor(
    title: string,
    initialValue: string,
    onSubmit: (name: string) => void,
  ): void {
    const content = div("pte-grid-toolbar-view-form");
    const heading = span("pte-grid-toolbar-view-form-title", title);
    const input = document.createElement("input");
    input.className = "pte-grid-toolbar-view-input";
    input.type = "text";
    input.value = initialValue;
    input.placeholder = "View name";
    input.setAttribute("aria-label", "View name");
    const actions = div("pte-grid-toolbar-view-form-actions");
    const cancel = button("pte-grid-toolbar-view-form-cancel", "Cancel");
    const save = button("pte-grid-toolbar-view-form-submit", "Save");
    cancel.type = "button";
    save.type = "button";
    const submit = () => {
      const name = input.value.trim();
      if (!name) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      this.params.menuRenderer.close(0);
      onSubmit(name);
    };
    cancel.addEventListener("click", () => this.params.menuRenderer.close(0));
    save.addEventListener("click", submit);
    content.addEventListener("keydown", event => {
      event.stopPropagation();
      if (matchesChord(event, "enter")) {
        event.preventDefault();
        submit();
      }
    });
    actions.append(cancel, save);
    content.append(heading, input, actions);
    this.openViewsContent(content);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private openViewDeleteConfirmation(view: SavedGridView): void {
    const content = div("pte-grid-toolbar-view-form");
    content.appendChild(span(
      "pte-grid-toolbar-view-form-title",
      `Delete “${view.name}”?`,
    ));
    const message = span(
      "pte-grid-toolbar-view-form-message",
      "This removes the view from the application-owned list.",
    );
    const actions = div("pte-grid-toolbar-view-form-actions");
    const cancel = button("pte-grid-toolbar-view-form-cancel", "Cancel");
    const remove = button("pte-grid-toolbar-view-form-delete", "Delete");
    cancel.type = "button";
    remove.type = "button";
    cancel.addEventListener("click", () => this.params.menuRenderer.close(0));
    remove.addEventListener("click", () => {
      this.params.menuRenderer.close(0);
      this.commitViews(this.views.filter(candidate => candidate.id !== view.id));
    });
    actions.append(cancel, remove);
    content.append(message, actions);
    this.openViewsContent(content);
  }

  private openViewsContent(contentEl: HTMLElement): void {
    const anchor = this.viewsAnchor();
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: anchor,
      clientX: rect.left,
      clientY: rect.bottom,
      items: [],
      contentEl,
      position: "bottom-left",
    });
  }

  // ---------------- Responsive layout ----------------

  private responsiveMode(): ResponsiveBarMode {
    return this.options.responsive;
  }

  /** Re-decide the bar's presentation. Called whenever what is in it changes. */
  private refreshResponsive(): void {
    this.responsive?.refresh();
  }

  private barItems(): ResponsiveBarItem[] {
    const items: ResponsiveBarItem[] = [];
    const displaceable = (el: HTMLElement) =>
      (stage: BarItemStage) => stage !== "full" && containsFocus(el);

    if (this.options.views) {
      items.push({
        id: BAR_ITEMS.views,
        el: this.viewsButton,
        stages: ["full", "overflow"],
        applyStage: stage => this.setDisplaced(this.viewsButton, stage === "overflow"),
        isPinned: displaceable(this.viewsButton),
      });
    }
    for (const section of ["group", "sort"] as const) {
      const el = section === "group" ? this.groupSection : this.sortSection;
      const enabled = section === "group" ? this.options.grouping : this.options.sorting;
      if (!enabled) continue;
      items.push({
        id: BAR_ITEMS[section],
        el,
        stages: ["full", "compact", "summary", "overflow"],
        applyStage: (stage, level) => this.applySectionStage(section, stage, level),
        // A chip the user is holding — dragging, or reordering with the arrow keys — is not taken
        // out from under them; the section gives way once focus leaves it.
        isPinned: stage => (stage === "summary" || stage === "overflow") && containsFocus(el),
        refocusTarget: stage => stage === "summary"
          ? (section === "group" ? this.groupSummary : this.sortSummary)
          : this.moreButton,
      });
    }
    if (this.options.quickFilter) {
      items.push({
        id: BAR_ITEMS.quickFilter,
        el: this.quickFilterHost,
        // No `overflow`: a search box that is nowhere on screen is worse than a narrow one, so the
        // icon is its floor and it is never displaced into the menu.
        stages: ["full", "compact", "summary"],
        applyStage: stage => this.applyQuickFilterStage(stage),
        // The icon is refused while the field is in use or holds a query — unless the user opened
        // the icon's own overlay, which IS the summary stage: refusing it there would collapse the
        // overlay they are typing in and make the bar give up other controls to show the field
        // inline instead.
        isPinned: stage => stage === "summary"
          && !this.quickFilterExpanded
          && (containsFocus(this.quickFilterHost) || this.hasQuickFilterQuery()),
        // Collapsing to the icon counts as displacement, so the engine offers focus a new home. It
        // belongs on the icon that replaced the field — and, when the icon's overlay is open, on the
        // field inside it: naming it here is what stops the pass from throwing focus to the
        // overflow button and closing the overlay the user had just opened.
        refocusTarget: stage => stage === "summary"
          ? (this.quickFilterExpanded ? this.quickFilterInput() : this.quickFilterTrigger)
          : undefined,
      });
    }
    if (this.options.pivot) {
      items.push({
        id: BAR_ITEMS.pivot,
        el: this.pivotButton,
        stages: ["full", "overflow"],
        applyStage: stage => this.setDisplaced(this.pivotButton, stage === "overflow"),
        isPinned: displaceable(this.pivotButton),
      });
    }
    if (this.options.export) {
      items.push({
        id: BAR_ITEMS.export,
        el: this.exportButton,
        stages: ["full", "overflow"],
        applyStage: stage => this.setDisplaced(this.exportButton, stage === "overflow"),
        isPinned: displaceable(this.exportButton),
      });
    }
    if (this.columnTrigger) {
      const trigger = this.columnTrigger;
      items.push({
        id: BAR_ITEMS.columns,
        el: trigger,
        stages: ["full", "overflow"],
        applyStage: stage => this.setDisplaced(trigger, stage === "overflow"),
        isPinned: displaceable(trigger),
      });
    }
    return items;
  }

  /**
   * The ladder, cheapest rung first. Captions go before any single control is degraded; the chip
   * lists then give way one chip at a time; the quick filter narrows; the sections collapse to
   * summary buttons; and only then do controls start leaving the bar — Columns last, because the
   * column panel is the escape hatch to everything else in the grid.
   */
  private barLadder(): ResponsiveBarStep[] {
    const steps: ResponsiveBarStep[] = [
      { id: "captions", barClass: "pte-grid-toolbar-compact" },
      // Before any chip folds: the search field gives up slack width, which costs the user
      // nothing — the query stays visible and editable — whereas a folded chip takes away the
      // name of the column being grouped or sorted by. Cheapest rung that hides information last.
      { id: "quickFilter:compact", itemId: BAR_ITEMS.quickFilter, stage: "compact" },
    ];
    // Chips fold from the end of each list, sorting before grouping: a sort is easier to re-read
    // from the column headers than a grouping order is.
    for (const section of ["sort", "group"] as const) {
      const count = this.chipCount(section);
      for (let shown = count - 1; shown >= 0; shown--) {
        steps.push({
          id: `${section}:compact:${shown}`,
          itemId: BAR_ITEMS[section],
          stage: "compact",
          level: shown,
        });
      }
    }
    steps.push(
      { id: "sort:summary", itemId: BAR_ITEMS.sort, stage: "summary" },
      { id: "group:summary", itemId: BAR_ITEMS.group, stage: "summary" },
      { id: "export:overflow", itemId: BAR_ITEMS.export, stage: "overflow" },
      { id: "pivot:overflow", itemId: BAR_ITEMS.pivot, stage: "overflow" },
      { id: "views:overflow", itemId: BAR_ITEMS.views, stage: "overflow" },
      { id: "sort:overflow", itemId: BAR_ITEMS.sort, stage: "overflow" },
      { id: "group:overflow", itemId: BAR_ITEMS.group, stage: "overflow" },
      { id: "quickFilter:summary", itemId: BAR_ITEMS.quickFilter, stage: "summary" },
      { id: "columns:overflow", itemId: BAR_ITEMS.columns, stage: "overflow" },
    );
    return steps;
  }

  private setDisplaced(el: HTMLElement, displaced: boolean): void {
    el.classList.toggle("pte-bar-displaced", displaced);
  }

  /** Ids currently in the overflow menu, in the bar's own reading order. */
  private overflowedIds(): string[] {
    const displaced = new Set(this.responsive?.getOverflowedItemIds() ?? []);
    return OVERFLOW_MENU_ORDER.filter(id => displaced.has(id));
  }

  /**
   * The part a fit pass runs after every rung: the button's own presence (and so its width) plus
   * the dot that says something displaced is still doing something. Cheap, and it must never touch
   * an open menu — {@link syncOverflowButton} owns that, once per pass.
   */
  private syncOverflowFurniture(): void {
    const overflowed = this.overflowedIds();
    this.toolbar.classList.toggle("pte-grid-toolbar-has-overflow", overflowed.length > 0);
    // A control displaced out of sight must not take its state with it silently: the dot says
    // something in here is doing something.
    const active = overflowed.some(id => this.itemCarriesState(id));
    this.moreButton.classList.toggle("pte-grid-toolbar-more-active", active);
    this.moreButton.setAttribute(
      "aria-label",
      active ? "More toolbar actions (active)" : "More toolbar actions",
    );
  }

  private syncOverflowButton(): void {
    this.syncOverflowFurniture();
    const overflowed = this.overflowedIds();
    const signature = overflowed.join(",");
    // Only a change in *what is displaced* invalidates an open menu, because that is what moves the
    // anchors it hangs from. A fold level changing under an open chip editor must not close it —
    // the editor is rebuilt in place, so a chip can be removed and then another.
    const anchorsMoved = signature !== this.lastOverflowSignature;
    this.lastOverflowSignature = signature;
    if (!anchorsMoved) return;
    // What is displaced changed, so the anchors menus hang from have moved and an open menu is
    // stale. The chip editor, though, is the only way to edit grouping at these widths — it
    // follows its anchor instead of closing, so a second chip can be removed without reopening it.
    const reopen = this.chipEditorSection;
    this.params.menuRenderer.close(0);
    if (reopen) this.openChipEditor(reopen);
  }

  /** Whether a control is doing something the user would want to know about while it is hidden. */
  private itemCarriesState(id: string): boolean {
    switch (id) {
      case BAR_ITEMS.views: return this.activeView() != null;
      case BAR_ITEMS.group: return this.chipCount("group") > 0;
      case BAR_ITEMS.sort: return this.chipCount("sort") > 0;
      case BAR_ITEMS.pivot: return this.params.core.getPivotMode();
      default: return false;
    }
  }

  // ---------------- Quick filter ----------------

  private hasQuickFilterQuery(): boolean {
    return this.params.core.getQuickFilterText().trim() !== "";
  }

  private applyQuickFilterStage(stage: BarItemStage): void {
    this.quickFilterStage = stage;
    this.quickFilterHost.classList.toggle("pte-bar-qf-compact", stage === "compact");
    this.quickFilterHost.classList.toggle("pte-bar-qf-summary", stage === "summary");
    // Expansion belongs to the icon: at any richer stage the input is inline, so the overlay is not
    // painted — but the user's intent to have the field open is NOT cleared here. A fit pass resets
    // every item to `full` before it measures, so clearing it here closed the overlay on every
    // resize, every focus change, and every content change. It is dropped when focus leaves.
    this.quickFilterHost.classList.toggle(
      "pte-bar-qf-expanded",
      this.quickFilterExpanded && stage === "summary",
    );
    this.syncQuickFilterOverlayRoom();
    this.syncQuickFilterTrigger();
  }

  private quickFilterInput(): HTMLInputElement | null {
    return this.quickFilterHost.querySelector<HTMLInputElement>(".pte-quick-filter-input");
  }

  private toggleQuickFilterExpanded(): void {
    this.setQuickFilterExpanded(!this.quickFilterExpanded);
    if (this.quickFilterExpanded) this.quickFilterInput()?.focus();
  }

  private setQuickFilterExpanded(expanded: boolean): void {
    this.quickFilterExpanded = expanded;
    this.quickFilterHost.classList.toggle(
      "pte-bar-qf-expanded",
      expanded && this.quickFilterStage === "summary",
    );
    this.syncQuickFilterOverlayRoom();
    this.quickFilterTrigger.setAttribute("aria-expanded", String(expanded));
  }

  /**
   * How wide the expanded field may be. It hangs leftwards off the icon, so its room is the space
   * between the bar's start edge and the icon — and no CSS length says "from my container's edge to
   * mine", which is why the overlay used to be laid out at its content width and spill off the side
   * of the grid. Measured here and passed to CSS, where the field shrinks into it.
   */
  private syncQuickFilterOverlayRoom(): void {
    if (!this.quickFilterExpanded) return;
    const room = this.quickFilterHost.getBoundingClientRect().left
      - this.toolbar.getBoundingClientRect().left;
    this.quickFilterHost.style.setProperty(
      "--pte-qf-overlay-room",
      `${Math.max(0, Math.round(room))}px`,
    );
  }

  private syncQuickFilterTrigger(): void {
    const filtering = this.hasQuickFilterQuery();
    this.quickFilterTrigger.classList.toggle("pte-grid-toolbar-quick-filter-active", filtering);
    this.quickFilterTrigger.setAttribute(
      "aria-label",
      filtering ? `Search — filtering by “${this.params.core.getQuickFilterText()}”` : "Search",
    );
  }

  // ---------------- Chip sections ----------------

  private chipCount(section: ChipSection): number {
    return section === "group"
      ? this.params.core.getRowGroupColumns().length
      : this.params.core.getSortModel().items.length;
  }

  private sectionEl(section: ChipSection): HTMLDivElement {
    return section === "group" ? this.groupSection : this.sortSection;
  }

  private summaryEl(section: ChipSection): HTMLButtonElement {
    return section === "group" ? this.groupSummary : this.sortSummary;
  }

  private chipSelector(section: ChipSection): string {
    return section === "group" ? ".pte-grid-toolbar-group-chip" : ".pte-grid-toolbar-sort-chip";
  }

  private initSectionSummary(section: ChipSection): void {
    const summary = this.summaryEl(section);
    summary.type = "button";
    summary.setAttribute("aria-haspopup", "menu");
    summary.addEventListener("click", () => this.openChipEditor(section));
  }

  private applySectionStage(section: ChipSection, stage: BarItemStage, level?: number): void {
    this.sectionStages[section] = { stage, level };
    this.applySectionPresentation(section);
  }

  /**
   * Render a section at its current stage. Called by the ladder, and again after every chip rebuild
   * — the model can change under a collapsed section, and it has to come back collapsed.
   */
  private applySectionPresentation(section: ChipSection): void {
    const el = this.sectionEl(section);
    const { stage, level } = this.sectionStages[section];
    this.setDisplaced(el, stage === "overflow");
    el.classList.toggle("pte-bar-section-summary", stage === "summary");

    const chips = Array.from(el.querySelectorAll<HTMLElement>(this.chipSelector(section)));
    const shown = stage === "compact"
      ? Math.max(0, Math.min(level ?? chips.length, chips.length))
      : chips.length;
    chips.forEach((chip, index) => {
      const folded = index >= shown;
      chip.classList.toggle("pte-bar-displaced", folded);
      // A folded chip is not reachable, so it must not be a tab stop either.
      chip.tabIndex = folded ? -1 : 0;
    });

    const more = el.querySelector<HTMLElement>(".pte-grid-toolbar-chip-more");
    const folded = chips.length - shown;
    if (more) {
      this.setDisplaced(more, folded === 0);
      more.textContent = `+${folded}`;
      more.setAttribute("aria-label", section === "group"
        ? `${folded} more grouping levels — open the grouping editor`
        : `${folded} more sort columns — open the sort editor`);
    }
    this.updateSectionSummary(section);
  }

  private updateSectionSummary(section: ChipSection): void {
    const summary = this.summaryEl(section);
    const count = this.chipCount(section);
    const caption = section === "group" ? "Grouped by" : "Sort by";
    summary.textContent = count > 0 ? `${caption} ${count}` : caption;
    summary.setAttribute("aria-label", count > 0
      ? `${caption} ${count} ${count === 1 ? "column" : "columns"} — open the editor`
      : `${caption} — open the editor`);
  }

  /** The `+N` fold, and the summary button's own affordance: both open the section's editor. */
  private buildChipMore(section: ChipSection): HTMLButtonElement {
    const more = button("pte-grid-toolbar-chip-more");
    more.type = "button";
    more.setAttribute("aria-haspopup", "menu");
    more.addEventListener("click", () => this.openChipEditor(section, more));
    return more;
  }

  /**
   * The editor behind a `+N` or a summary button: the whole section, stacked, with the same chips.
   * Rebuilt in place when the model changes under it, so removing a chip from inside it does not
   * leave a stale list.
   */
  private openChipEditor(section: ChipSection, anchor?: HTMLElement): void {
    const anchorEl = anchor
      ?? (this.sectionStages[section].stage === "overflow"
        ? this.moreButton
        : this.summaryEl(section));
    const content = div("pte-grid-toolbar-chip-editor");
    content.appendChild(this.buildChipEditorContent(section));
    const rect = anchorEl.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl,
      clientX: rect.left,
      clientY: rect.bottom,
      items: [],
      contentEl: content,
      position: "bottom-left",
      ariaLabel: section === "group" ? "Row grouping" : "Column sorting",
      onClose: () => {
        if (this.chipEditorSection === section) this.chipEditorSection = null;
      },
    });
    this.chipEditorSection = section;
    this.chipEditorContent = content;
  }

  private buildChipEditorContent(section: ChipSection): HTMLElement {
    const list = div("pte-grid-toolbar-chip-editor-list");
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", section === "group"
      ? "Row grouping order"
      : "Column sort priority");
    if (section === "group") {
      const groups = this.params.core.getRowGroupColumns();
      groups.forEach((col, index) => {
        list.appendChild(this.buildGroupChip(col, index, groups.length, "y"));
      });
      this.bindChipEditorDrop(list, section);
    } else {
      const sorts = this.params.core.getSortModel().items;
      sorts.forEach((item, index) => {
        list.appendChild(this.buildSortChip(item.col, item.dir, index, sorts.length, "y"));
      });
      this.bindChipEditorDrop(list, section);
    }

    const available = section === "group"
      ? this.availableGroupColumns()
      : this.availableSortColumns();
    const add = button(
      "pte-grid-toolbar-chip-editor-add",
      section === "group" ? "+ Add group" : "+ Add sort",
    );
    add.type = "button";
    add.setAttribute("aria-haspopup", "menu");
    add.disabled = available.length === 0;
    add.addEventListener("click", () => {
      if (section === "group") this.openAddGroupMenu(add);
      else this.openAddSortMenu(add);
    });

    // A column, so the add button stretches to the editor's width the way the chips above it do —
    // and so the two are separated by the same gap the chips have between them.
    const wrapper = div("pte-grid-toolbar-chip-editor-body");
    wrapper.append(list, add);
    return wrapper;
  }

  /** Reorder by drag inside the editor, the same gesture the bar's own list takes, on the y axis. */
  private bindChipEditorDrop(list: HTMLElement, section: ChipSection): void {
    const chipSelector = this.chipSelector(section);
    const indicatorClass = section === "group"
      ? "pte-grid-toolbar-group-drop-indicator"
      : "pte-grid-toolbar-sort-drop-indicator";
    const draggedId = () => section === "group" ? this.draggedGroupColId : this.draggedSortColId;
    list.addEventListener("dragover", event => {
      if (!draggedId()) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      showGroupDropPosition(
        list,
        resolveGroupDropIndex(list, event.clientY, chipSelector, "y"),
        chipSelector,
        indicatorClass,
        "y",
      );
    });
    list.addEventListener("dragleave", event => {
      const next = event.relatedTarget as Node | null;
      if (!next || !list.contains(next)) clearGroupDropPosition(list, indicatorClass);
    });
    list.addEventListener("drop", event => {
      const colId = draggedId();
      if (!colId) return;
      event.preventDefault();
      const index = resolveGroupDropIndex(list, event.clientY, chipSelector, "y");
      clearGroupDropPosition(list, indicatorClass);
      if (section === "group") {
        this.draggedGroupColId = null;
        this.moveGroupToIndex(colId, index);
      } else {
        this.draggedSortColId = null;
        this.moveSortToIndex(colId, index);
      }
    });
  }

  /** Re-render an open editor after the model changed beneath it. */
  private refreshChipEditor(section: ChipSection): void {
    if (this.chipEditorSection !== section || !this.chipEditorContent) return;
    this.chipEditorContent.replaceChildren(this.buildChipEditorContent(section));
  }

  private renderGroupChips(): void {
    this.disposeGroupChipTooltips();
    this.groupSection.replaceChildren();
    const groups = this.params.core.getRowGroupColumns();
    if (groups.length > 0) {
      const label = span("pte-grid-toolbar-group-label", "Grouped by");
      const list = div("pte-grid-toolbar-group-list");
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", "Row grouping order");
      groups.forEach((col, index) => {
        list.appendChild(this.buildGroupChip(col, index, groups.length, "x"));
      });
      list.appendChild(this.buildChipMore("group"));
      this.groupSection.append(label, list);
    }

    const addGroup = button("pte-grid-toolbar-group-add", "Add group");
    addGroup.type = "button";
    addGroup.setAttribute("aria-haspopup", "menu");
    addGroup.disabled = this.availableGroupColumns().length === 0;
    addGroup.addEventListener("click", event => {
      this.openAddGroupMenu(addGroup, event.detail === 0 ? undefined : event.clientX);
    });
    this.groupSection.appendChild(addGroup);

    if (groups.length > 0) {
      const clear = button("pte-grid-toolbar-group-clear", "×");
      clear.type = "button";
      clear.setAttribute("aria-label", "Clear row grouping");
      clear.addEventListener("click", () => {
        this.params.core.dispatch({ type: "rowGroupSet", colIds: [] });
      });
      this.groupChipTooltipDisposers.push(registerRendererTooltipTarget(
        clear,
        () => "Clear grouping",
      ));
      this.groupSection.appendChild(clear);
    }

    this.groupSection.appendChild(this.groupSummary);
    // The chip set changed, so both the section's own presentation and the ladder that folds it
    // have to be recomputed — one rung per chip.
    this.applySectionPresentation("group");
    this.refreshChipEditor("group");
    this.refreshResponsive();
  }

  /**
   * One grouping chip. Built for the bar (`x`) and for the stacked editor (`y`) from the same code:
   * the drag, the arrow-key reorder, the remove button and the overflow tooltip are the section's
   * behaviour, not the bar's, and a chip that reads differently in the two places would be a second
   * implementation to keep in step.
   */
  private buildGroupChip(col: Column, index: number, total: number, axis: ChipAxis): HTMLElement {
    const chip = div("pte-grid-toolbar-group-chip");
    chip.dataset.groupColId = col.instanceID;
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.setAttribute("role", "listitem");
    const reorderHint = axis === "x"
      ? "Use Left and Right arrows to reorder."
      : "Use Up and Down arrows to reorder.";
    chip.setAttribute(
      "aria-label",
      `${col.label}, grouping level ${index + 1} of ${total}. ${reorderHint}`,
    );

    const handle = span("pte-grid-toolbar-group-drag", "⠿");
    handle.setAttribute("aria-hidden", "true");
    const chipLabel = span("pte-grid-toolbar-group-chip-label", col.label);
    this.groupChipTooltipDisposers.push(registerRendererTooltipTarget(
      chip,
      () => chipLabel.scrollWidth > chipLabel.clientWidth ? col.label : null,
    ));
    const remove = button("pte-grid-toolbar-group-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${col.label} from row grouping`);
    remove.addEventListener("click", event => {
      event.stopPropagation();
      this.removeGroup(col.instanceID);
    });

    chip.addEventListener("keydown", event => {
      if (event.target !== chip) return;
      // Bare arrows only: a modified arrow keeps its platform meaning (Alt+Left is history).
      const keys = axis === "x" ? ["arrowleft", "arrowright"] : ["arrowup", "arrowdown"];
      if (matchesAnyChord(event, keys)) {
        event.preventDefault();
        const back = axis === "x" ? "arrowleft" : "arrowup";
        this.moveGroup(col.instanceID, canonicalKey(event) === back ? -1 : 1);
      }
    });
    chip.addEventListener("dragstart", event => {
      this.draggedGroupColId = col.instanceID;
      chip.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", col.instanceID);
      }
    });
    chip.addEventListener("dragend", () => {
      this.draggedGroupColId = null;
      chip.classList.remove("dragging");
      this.groupSection.classList.remove("drag-over");
      clearGroupDropPosition(this.groupSection);
      const list = chip.parentElement;
      if (list) clearGroupDropPosition(list);
    });

    chip.append(handle, chipLabel, remove);
    return chip;
  }

  private bindExternalColumnDrop(): void {
    this.groupSection.classList.add("pte-grid-toolbar-group-dropzone");
    this.groupSection.addEventListener("dragover", event => {
      if (this.draggedSortColId) return;
      if (!this.draggedGroupColId && this.availableGroupColumns().length === 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.groupSection.classList.add("drag-over");
      showGroupDropPosition(
        this.groupSection,
        resolveGroupDropIndex(this.groupSection, event.clientX),
      );
    });
    this.groupSection.addEventListener("dragleave", event => {
      const next = event.relatedTarget as Node | null;
      if (!next || !this.groupSection.contains(next)) {
        this.groupSection.classList.remove("drag-over");
        clearGroupDropPosition(this.groupSection);
      }
    });
    this.groupSection.addEventListener("drop", event => {
      if (this.draggedSortColId) return;
      event.preventDefault();
      this.groupSection.classList.remove("drag-over");
      // A collapsed section shows no chips to aim between — a summary button is still a drop
      // target, and a column dropped on it joins the end of the grouping.
      const index = this.sectionStages.group.stage === "full"
        ? resolveGroupDropIndex(this.groupSection, event.clientX)
        : this.chipCount("group");
      clearGroupDropPosition(this.groupSection);
      const draggedGroup = this.draggedGroupColId;
      this.draggedGroupColId = null;
      if (draggedGroup) {
        this.moveGroupToIndex(draggedGroup, index);
        return;
      }
      const colId = event.dataTransfer?.getData("text/plain");
      if (colId) this.addGroupColumn(colId, index);
    });
  }

  private renderSortChips(): void {
    this.disposeSortChipTooltips();
    this.sortSection.replaceChildren();
    const sorts = this.params.core.getSortModel().items;
    if (sorts.length > 0) {
      const label = span("pte-grid-toolbar-sort-label", "Sort by");
      const list = div("pte-grid-toolbar-sort-list");
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", "Column sort priority");
      sorts.forEach((sort, index) => {
        list.appendChild(this.buildSortChip(sort.col, sort.dir, index, sorts.length, "x"));
      });
      list.appendChild(this.buildChipMore("sort"));
      this.sortSection.append(label, list);
    }

    const addSort = button("pte-grid-toolbar-sort-add", "Add sort");
    addSort.type = "button";
    addSort.setAttribute("aria-haspopup", "menu");
    addSort.disabled = this.availableSortColumns().length === 0;
    addSort.addEventListener("click", event => {
      this.openAddSortMenu(addSort, event.detail === 0 ? undefined : event.clientX);
    });
    this.sortSection.appendChild(addSort);

    if (sorts.length > 0) {
      const clear = button("pte-grid-toolbar-sort-clear", "×");
      clear.type = "button";
      clear.setAttribute("aria-label", "Clear all sorting");
      clear.addEventListener("click", () => this.applySortModel([]));
      this.sortChipTooltipDisposers.push(registerRendererTooltipTarget(
        clear,
        () => "Clear sorting",
      ));
      this.sortSection.appendChild(clear);
    }

    this.sortSection.appendChild(this.sortSummary);
    this.applySectionPresentation("sort");
    this.refreshChipEditor("sort");
    this.refreshResponsive();
  }

  /** One sort chip — see {@link buildGroupChip} for why the bar and the editor share the builder. */
  private buildSortChip(
    col: Column,
    dir: SortDir,
    index: number,
    total: number,
    axis: ChipAxis,
  ): HTMLElement {
    const chip = div("pte-grid-toolbar-sort-chip");
    chip.dataset.sortColId = col.instanceID;
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.setAttribute("role", "listitem");
    const reorderHint = axis === "x"
      ? "Use Left and Right arrows to reorder."
      : "Use Up and Down arrows to reorder.";
    chip.setAttribute(
      "aria-label",
      `${col.label}, sort priority ${index + 1} of ${total}, ${dir === "asc" ? "ascending" : "descending"}. ${reorderHint}`,
    );

    const handle = span("pte-grid-toolbar-sort-drag", "⠿");
    handle.setAttribute("aria-hidden", "true");
    const chipLabel = span("pte-grid-toolbar-sort-chip-label", col.label);
    this.sortChipTooltipDisposers.push(registerRendererTooltipTarget(
      chip,
      () => chipLabel.scrollWidth > chipLabel.clientWidth ? col.label : null,
    ));
    const nextDirection = this.nextSortDirection(col, dir);
    const direction = button("pte-grid-toolbar-sort-direction");
    direction.type = "button";
    direction.disabled = nextDirection == null;
    direction.setAttribute("aria-label", nextDirection == null
      ? `${col.label} sort direction is fixed to ${dir === "asc" ? "ascending" : "descending"}`
      : `Sort ${col.label} ${nextDirection === "asc" ? "ascending" : "descending"}`);
    direction.addEventListener("click", event => {
      event.stopPropagation();
      if (nextDirection) this.setSortDirection(col.instanceID, nextDirection);
    });
    const directionIcon = span(
      `pte-grid-toolbar-sort-direction-icon ${dir === "asc" ? "icon-asc" : "icon-desc"}`,
    );
    directionIcon.setAttribute("aria-hidden", "true");
    direction.appendChild(directionIcon);
    const remove = button("pte-grid-toolbar-sort-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${col.label} from sorting`);
    remove.addEventListener("click", event => {
      event.stopPropagation();
      this.removeSort(col.instanceID);
    });

    chip.addEventListener("keydown", event => {
      if (event.target !== chip) return;
      const keys = axis === "x" ? ["arrowleft", "arrowright"] : ["arrowup", "arrowdown"];
      if (matchesAnyChord(event, keys)) {
        event.preventDefault();
        const back = axis === "x" ? "arrowleft" : "arrowup";
        this.moveSort(col.instanceID, canonicalKey(event) === back ? -1 : 1);
      } else if (matchesAnyChord(event, ["delete", "backspace"])) {
        event.preventDefault();
        this.removeSort(col.instanceID);
      }
    });
    chip.addEventListener("dragstart", event => {
      this.draggedSortColId = col.instanceID;
      chip.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", col.instanceID);
      }
    });
    chip.addEventListener("dragend", () => {
      this.draggedSortColId = null;
      chip.classList.remove("dragging");
      this.sortSection.classList.remove("drag-over");
      clearGroupDropPosition(this.sortSection, "pte-grid-toolbar-sort-drop-indicator");
      const list = chip.parentElement;
      if (list) clearGroupDropPosition(list, "pte-grid-toolbar-sort-drop-indicator");
    });

    chip.append(handle, chipLabel, direction, remove);
    return chip;
  }

  private bindSortChipDrop(): void {
    const chipSelector = ".pte-grid-toolbar-sort-chip";
    const indicatorClass = "pte-grid-toolbar-sort-drop-indicator";
    this.sortSection.classList.add("pte-grid-toolbar-sort-dropzone");
    this.sortSection.addEventListener("dragover", event => {
      if (!this.draggedSortColId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.sortSection.classList.add("drag-over");
      showGroupDropPosition(
        this.sortSection,
        resolveGroupDropIndex(this.sortSection, event.clientX, chipSelector),
        chipSelector,
        indicatorClass,
      );
    });
    this.sortSection.addEventListener("dragleave", event => {
      const next = event.relatedTarget as Node | null;
      if (!next || !this.sortSection.contains(next)) {
        this.sortSection.classList.remove("drag-over");
        clearGroupDropPosition(this.sortSection, indicatorClass);
      }
    });
    this.sortSection.addEventListener("drop", event => {
      if (!this.draggedSortColId) return;
      event.preventDefault();
      const index = resolveGroupDropIndex(this.sortSection, event.clientX, chipSelector);
      const colId = this.draggedSortColId;
      this.draggedSortColId = null;
      this.sortSection.classList.remove("drag-over");
      clearGroupDropPosition(this.sortSection, indicatorClass);
      this.moveSortToIndex(colId, index);
    });
  }

  private availableGroupColumns() {
    if (this.params.core.getRowModel().getType() !== "clientSide") return [];
    const grouped = new Set(this.params.core.getRowGroupColumns().map(col => col.instanceID));
    return this.params.core.getColumnModel().getLeaves().filter(
      col => col.groupable && !col.isInternal() && !grouped.has(col.instanceID),
    );
  }

  private openAddGroupMenu(anchor: HTMLButtonElement, pointerX?: number): void {
    const items: MenuItem[] = this.availableGroupColumns().map(col => ({
      id: `toolbarGroupAdd-${col.instanceID}`,
      label: col.label,
      command: "toolbar.group.add",
      payload: { colId: col.instanceID },
    }));
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      clientX: pointerX ?? rect.left,
      clientY: rect.bottom,
      items,
      position: "bottom-left",
      onItemClick: item => this.addGroupColumn(item.payload.colId),
    });
  }

  private availableSortColumns() {
    const sorted = new Set(
      this.params.core.getSortModel().items.map(item => item.col.instanceID),
    );
    return this.params.core.getColumnModel().getLeaves().filter(
      col => col.sortable
        && !col.isInternal()
        && !sorted.has(col.instanceID)
        && getSortDirections(col).length > 0,
    );
  }

  private openAddSortMenu(anchor: HTMLButtonElement, pointerX?: number): void {
    const items: MenuItem[] = this.availableSortColumns().map(col => ({
      id: `toolbarSortAdd-${col.instanceID}`,
      label: col.label,
      command: "toolbar.sort.add",
      payload: { colId: col.instanceID },
    }));
    const rect = anchor.getBoundingClientRect();
    this.params.menuRenderer.open({
      clientX: pointerX ?? rect.left,
      clientY: rect.bottom,
      items,
      position: "bottom-left",
      onItemClick: item => this.addSortColumn(item.payload.colId),
    });
  }

  private addSortColumn(colId: string): void {
    const model = this.params.core.getColumnModel();
    const col = model.getById(colId) ?? model.getByColId(colId);
    if (!col || !col.sortable || col.isInternal()) return;
    if (this.params.core.getSortModel().items.some(item => item.col.instanceID === col.instanceID)) {
      return;
    }
    insertSortColumn(this.params.core, col);
  }

  private nextSortDirection(col: Column, current: SortDir): SortDir | null {
    const directions = getSortDirections(col);
    if (directions.length < 2) return null;
    const index = directions.indexOf(current);
    return directions[(index < 0 ? 0 : index + 1) % directions.length];
  }

  private setSortDirection(colId: string, dir: SortDir): void {
    this.params.core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: colId, dir }],
    });
  }

  private removeSort(colId: string): void {
    this.params.core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: colId, dir: null }],
    });
  }

  private moveSort(colId: string, offset: -1 | 1): void {
    const sorts = this.currentSortItems();
    const from = sorts.findIndex(item => item.key === colId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= sorts.length) return;
    [sorts[from], sorts[to]] = [sorts[to], sorts[from]];
    this.applySortModel(sorts);
    this.focusSortChip(colId);
  }

  private moveSortToIndex(colId: string, index: number): void {
    const col = this.params.core.getColumnModel().getById(colId);
    if (!col) return;
    insertSortColumn(this.params.core, col, index);
    this.focusSortChip(colId);
  }

  private currentSortItems(): { key: string; dir: SortDir }[] {
    return getOrderedSortItems(this.params.core);
  }

  private applySortModel(next: { key: string; dir: SortDir }[]): void {
    applyOrderedSortItems(this.params.core, next);
  }

  private focusSortChip(colId: string): void {
    const chip = Array.from(
      this.sortSection.querySelectorAll<HTMLElement>(".pte-grid-toolbar-sort-chip"),
    ).find(item => item.dataset.sortColId === colId);
    chip?.focus();
  }

  private disposeGroupChipTooltips(): void {
    this.groupChipTooltipDisposers.forEach(dispose => dispose());
    this.groupChipTooltipDisposers = [];
  }

  private disposeSortChipTooltips(): void {
    this.sortChipTooltipDisposers.forEach(dispose => dispose());
    this.sortChipTooltipDisposers = [];
  }

  private addGroupColumn(colId: string, index?: number): void {
    const model = this.params.core.getColumnModel();
    const col = model.getById(colId) ?? model.getByColId(colId);
    if (!col || !col.groupable || col.isInternal()) return;
    const colIds = this.params.core.getRowGroupColumns().map(group => group.instanceID);
    if (colIds.includes(col.instanceID)) return;
    const insertAt = index == null ? colIds.length : Math.max(0, Math.min(index, colIds.length));
    colIds.splice(insertAt, 0, col.instanceID);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
  }

  private removeGroup(colId: string): void {
    const colIds = this.params.core.getRowGroupColumns()
      .map(col => col.instanceID)
      .filter(id => id !== colId);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
  }

  private moveGroup(colId: string, offset: -1 | 1): void {
    const colIds = this.params.core.getRowGroupColumns().map(col => col.instanceID);
    const from = colIds.indexOf(colId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= colIds.length) return;
    [colIds[from], colIds[to]] = [colIds[to], colIds[from]];
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
    this.focusGroupChip(colId);
  }

  private moveGroupToIndex(colId: string, index: number): void {
    const colIds = this.params.core.getRowGroupColumns().map(col => col.instanceID);
    const from = colIds.indexOf(colId);
    if (from < 0) return;
    const [moved] = colIds.splice(from, 1);
    const insertAt = Math.max(0, Math.min(index > from ? index - 1 : index, colIds.length));
    colIds.splice(insertAt, 0, moved);
    this.params.core.dispatch({ type: "rowGroupSet", colIds });
    this.focusGroupChip(colId);
  }

  private focusGroupChip(colId: string): void {
    const chip = Array.from(this.left.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"))
      .find(item => item.dataset.groupColId === colId);
    chip?.focus();
  }

  private openExportMenu(): void {
    const items = this.buildExportItems();
    const rect = this.exportButton.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: this.exportButton,
      clientX: rect.right,
      clientY: rect.bottom,
      items,
      position: "bottom-right",
      onItemClick: item => this.executeExport(item),
    });
  }

  /**
   * The bar's one overflow menu. Its contents are whatever the last fit pass displaced — nothing
   * more, so a wide bar's button holds nothing and stays hidden — listed in the bar's own reading
   * order rather than in the order they happened to give way.
   */
  private openMoreMenu(): void {
    const items: MenuItem[] = [];
    for (const id of this.overflowedIds()) {
      switch (id) {
        case BAR_ITEMS.views: {
          const active = this.activeView();
          items.push({
            id: "toolbarMoreViews",
            label: active ? `View: ${active.name}` : "Views",
            subMenu: this.buildViewsMenuItems(),
          });
          break;
        }
        case BAR_ITEMS.group:
          items.push({
            id: "toolbarMoreGroup",
            label: `Grouped by (${this.chipCount("group")})…`,
            left: "icon-group",
            command: "toolbar.group.edit",
          });
          break;
        case BAR_ITEMS.sort: {
          // The primary sort's own direction, so the row says which way it runs. `icon-asc` and
          // `icon-desc` are the classes that exist — `icon-sort-asc` matched no rule at all, so the
          // row reserved the icon slot and drew nothing in it.
          const primary = this.params.core.getSortModel().items[0];
          items.push({
            id: "toolbarMoreSort",
            label: `Sort by (${this.chipCount("sort")})…`,
            left: primary?.dir === "desc" ? "icon-desc" : "icon-asc",
            command: "toolbar.sort.edit",
          });
          break;
        }
        case BAR_ITEMS.pivot:
          items.push({
            id: "toolbarMorePivot",
            label: "Pivot mode",
            left: this.params.core.getPivotMode() ? "icon-check" : "icon-pivot",
            command: "toolbar.pivot.toggle",
          });
          break;
        case BAR_ITEMS.export: {
          const exportItems = this.buildExportItems();
          items.push({
            id: "toolbarMoreExport",
            label: "Export",
            left: "icon-export",
            disabled: exportItems.length === 0,
            subMenu: exportItems.length > 0 ? exportItems : undefined,
          });
          break;
        }
        case BAR_ITEMS.columns:
          items.push({
            id: "toolbarMoreColumns",
            label: "Columns…",
            command: "toolbar.columns.open",
          });
          break;
      }
    }
    const rect = this.moreButton.getBoundingClientRect();
    this.params.menuRenderer.open({
      anchorEl: this.moreButton,
      clientX: rect.right,
      clientY: rect.bottom,
      items,
      position: "bottom-right",
      ariaLabel: "More toolbar actions",
      onItemClick: item => this.executeMoreCommand(item),
    });
  }

  private executeMoreCommand(item: MenuItem): void {
    switch (item.command) {
      case "toolbar.columns.open":
        this.columnTrigger?.click();
        return;
      case "toolbar.pivot.toggle":
        this.params.core.dispatch({
          type: "pivotModeSet",
          on: !this.params.core.getPivotMode(),
        });
        return;
      case "toolbar.group.edit":
        this.openChipEditor("group", this.moreButton);
        return;
      case "toolbar.sort.edit":
        this.openChipEditor("sort", this.moreButton);
        return;
      default:
        break;
    }
    if (item.command?.startsWith("toolbar.views.")) {
      this.executeViewCommand(item);
      return;
    }
    this.executeExport(item);
  }

  private buildExportItems(): MenuItem[] {
    const selection = this.params.core.getSelectionSnapshot();
    const hasSelection = selection.kind !== "none";
    const selectionScope: ExportOptions["scope"] =
      selection.kind === "column" ? "selectedColumns" : "selection";
    return hasSelection
      ? [
          {
            id: "toolbarExportSelection",
            label: "Selection",
            subMenu: this.formatItems("Selection", selectionScope),
          },
          {
            id: "toolbarExportAll",
            label: "Entire table",
            subMenu: this.formatItems("All", "all"),
          },
        ]
      : this.formatItems("All", "all", "Table as ");
  }

  private formatItems(
    prefix: "Selection" | "All",
    scope: ExportOptions["scope"],
    labelPrefix = "",
  ): MenuItem[] {
    const options = this.params.core.getOptions();
    const items: MenuItem[] = [];
    if (options.allowExportAsCSV) {
      items.push({
        id: `toolbarExport${prefix}CSV`,
        label: `${labelPrefix}CSV`,
        command: "toolbar.export.csv",
        payload: { scope },
      });
    }
    if (options.allowExportAsExcel) {
      items.push({
        id: `toolbarExport${prefix}Excel`,
        label: `${labelPrefix}Excel`,
        command: "toolbar.export.excel",
        payload: { scope },
      });
    }
    return items;
  }

  private executeExport(item: MenuItem): void {
    const options: ExportOptions = { scope: item.payload?.scope };
    if (item.command === "toolbar.export.csv") {
      this.params.exportCSV(options);
    } else if (item.command === "toolbar.export.excel") {
      this.params.exportExcel(options);
    }
  }
}

