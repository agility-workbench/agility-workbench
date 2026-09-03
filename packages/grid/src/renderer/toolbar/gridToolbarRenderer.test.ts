// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { GridAPI } from "../../api/api";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { MenuRenderer } from "../menuRenderer";
import { GridToolbarRenderer } from "./gridToolbarRenderer";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeCore() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData([
    { id: "1", name: "A", region: "East", country: "India", year: 2025 },
    { id: "2", name: "B", region: "West", country: "USA", year: 2026 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name" },
    { colId: "region", key: "region", label: "Region" },
    { colId: "country", key: "country", label: "Country" },
    { colId: "year", key: "year", label: "Year", sortingOrder: ["desc", "asc", null] },
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getLeaves().find(col => col.key === key)!.instanceID;
}

function groupColIds(core: GridCore, keys: string[]): string[] {
  return keys.map(key => colId(core, key));
}

/**
 * The right-hand region always ends with the bar's overflow button — it is mounted whether or not it
 * holds anything, because a fit pass measures the bar it is already part of. It is the bar's own
 * affordance rather than one of the application's controls, so assertions about control order look
 * past it.
 */
function controls(region: Element): Element[] {
  return Array.from(region.children)
    .filter(child => !child.classList.contains("pte-grid-toolbar-more-button"));
}

describe("GridToolbarRenderer", () => {
  it("applies and manages application-owned saved views through the public view API", () => {
    const core = makeCore();
    const api = new GridAPI(core);
    const baseline = {
      id: "baseline",
      name: "Baseline",
      state: api.captureViewState(),
    };
    const onChange = vi.fn();
    const onActiveViewChange = vi.fn();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      api,
      root,
      menuRenderer: new MenuRenderer(root),
      options: { views: true },
      savedViews: {
        views: [baseline],
        activeViewId: "baseline",
        onChange,
        onActiveViewChange,
      },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    const viewsButton = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-views-button")!;
    expect(viewsButton.textContent).toContain("Baseline");

    viewsButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewApply:baseline"]',
    )!.click();
    expect(onActiveViewChange).toHaveBeenLastCalledWith("baseline");

    core.dispatch({ type: "quickFilterSet", text: "updated query" });
    viewsButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewUpdate"]',
    )!.click();
    expect(onChange.mock.calls.at(-1)?.[0][0].state.quickFilterText).toBe("updated query");

    viewsButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewRename"]',
    )!.click();
    const renameInput = root.querySelector<HTMLInputElement>(".pte-grid-toolbar-view-input")!;
    renameInput.value = "Renamed";
    root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-view-form-submit")!.click();
    expect(onChange.mock.calls.at(-1)?.[0][0].name).toBe("Renamed");
    expect(viewsButton.textContent).toContain("Renamed");

    viewsButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewDelete"]',
    )!.click();
    root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-view-form-delete")!.click();
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(onActiveViewChange).toHaveBeenLastCalledWith(null);

    viewsButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewCreate"]',
    )!.click();
    const createInput = root.querySelector<HTMLInputElement>(".pte-grid-toolbar-view-input")!;
    createInput.value = "New view";
    root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-view-form-submit")!.click();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ name: "New view" }),
    ]);

    toolbar.destroy();
    root.remove();
  });

  /**
   * happy-dom has no layout, so the fit check is modelled: the toolbar reports a content width built
   * from what is currently visible in it, and the harness sets the width it has to fit into. The
   * model only has to be monotonic in the same direction the real layout is — what these tests pin
   * is the *order* controls give way in, which is the part that is a decision rather than a measure.
   */
  function withModelledLayout(run: (setWidth: (width: number) => void) => void): void {
    const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const originalObserver = globalThis.ResizeObserver;
    const callbacks: ResizeObserverCallback[] = [];
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
    let barWidth = 1400;

    const visible = (el: Element) => !el.classList.contains("pte-bar-displaced");
    const modelWidth = (bar: HTMLElement): number => {
      const captionsOff = bar.classList.contains("pte-grid-toolbar-compact");
      let total = 0;
      for (const section of bar.querySelectorAll<HTMLElement>(
        ".pte-grid-toolbar-group-section, .pte-grid-toolbar-sort-section",
      )) {
        if (!visible(section)) continue;
        if (section.classList.contains("pte-bar-section-summary")) {
          total += 110;
          continue;
        }
        total += 130;  // caption, add button and clear
        total += Array.from(section.querySelectorAll(
          ".pte-grid-toolbar-group-chip, .pte-grid-toolbar-sort-chip",
        )).filter(visible).length * 90;
        const more = section.querySelector(".pte-grid-toolbar-chip-more");
        if (more && visible(more)) total += 40;
      }
      const host = bar.querySelector<HTMLElement>(".pte-grid-toolbar-quick-filter");
      if (host && visible(host)) {
        total += host.classList.contains("pte-bar-qf-summary") ? 42
          : host.classList.contains("pte-bar-qf-compact") ? 130
          : 200;
      }
      for (const selector of [
        ".pte-grid-toolbar-views-button",
        ".pte-grid-toolbar-pivot-button",
        ".pte-grid-toolbar-export-button",
      ]) {
        const el = bar.querySelector<HTMLElement>(selector);
        if (el && visible(el)) total += captionsOff ? 42 : 110;
      }
      if (bar.classList.contains("pte-grid-toolbar-has-overflow")) total += 42;
      return total;
    };

    const isBar = (el: HTMLElement) => el.classList.contains("pte-grid-toolbar");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) { return isBar(this) ? barWidth : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get(this: HTMLElement) { return isBar(this) ? modelWidth(this) : 0; },
    });

    try {
      run(width => {
        barWidth = width;
        // What a real ResizeObserver would deliver. The engine reads the width itself rather than
        // trusting the entry, so an empty notification is enough to make it re-decide.
        for (const callback of callbacks) {
          callback([], undefined as unknown as ResizeObserver);
        }
      });
    } finally {
      globalThis.ResizeObserver = originalObserver;
      if (originalClient) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClient);
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScroll);
    }
  }

  it("gives way one rung at a time: captions, then chips, then summaries, then the overflow menu", () => {
    withModelledLayout(setWidth => {
      const core = makeCore();
      core.dispatch({ type: "rowGroupSet", colIds: groupColIds(core, ["region", "country"]) });
      const root = document.createElement("div");
      document.body.appendChild(root);
      const exportCSV = vi.fn();
      const toolbar = new GridToolbarRenderer({
        core,
        api: new GridAPI(core),
        root,
        menuRenderer: new MenuRenderer(root),
        options: { grouping: true, sorting: true, quickFilter: true, export: true, views: true },
        exportCSV,
        exportExcel: vi.fn(),
      });
      const columns = document.createElement("button");
      const openColumns = vi.fn();
      columns.addEventListener("click", openColumns);
      toolbar.mountColumnTrigger(columns);
      const bar = root.querySelector<HTMLElement>(".pte-grid-toolbar")!;
      const groupSection = root.querySelector<HTMLElement>(".pte-grid-toolbar-group-section")!;
      const displaced = (selector: string) =>
        root.querySelector(selector)!.classList.contains("pte-bar-displaced");

      setWidth(1400);
      expect(bar.classList.contains("pte-grid-toolbar-compact")).toBe(false);
      expect(bar.classList.contains("pte-grid-toolbar-has-overflow")).toBe(false);
      expect(displaced(".pte-grid-toolbar-chip-more")).toBe(true);

      // Cheapest rung first: every caption at once, and no control has moved or folded.
      setWidth(780);
      expect(bar.classList.contains("pte-grid-toolbar-compact")).toBe(true);
      expect(displaced(".pte-grid-toolbar-chip-more")).toBe(true);
      expect(bar.classList.contains("pte-grid-toolbar-has-overflow")).toBe(false);

      // The search box gives up its slack width before any chip folds: narrowing a field the user
      // can still read and type in costs less than hiding the name of a grouped column.
      setWidth(700);
      expect(root.querySelector(".pte-grid-toolbar-quick-filter")!
        .classList.contains("pte-bar-qf-compact")).toBe(true);
      expect(displaced(".pte-grid-toolbar-chip-more")).toBe(true);
      expect(groupSection.querySelectorAll(
        ".pte-grid-toolbar-group-chip:not(.pte-bar-displaced)",
      ).length).toBe(2);

      // Then chips fold into a `+N` rather than being squeezed to nothing — one at a time.
      setWidth(620);
      expect(root.querySelector(".pte-grid-toolbar-chip-more")!.textContent).toBe("+1");
      expect(groupSection.querySelectorAll(
        ".pte-grid-toolbar-group-chip:not(.pte-bar-displaced)",
      ).length).toBe(1);

      setWidth(560);
      expect(root.querySelector(".pte-grid-toolbar-chip-more")!.textContent).toBe("+2");
      expect(groupSection.querySelectorAll(
        ".pte-grid-toolbar-group-chip:not(.pte-bar-displaced)",
      ).length).toBe(0);
      expect(bar.classList.contains("pte-grid-toolbar-has-overflow")).toBe(false);

      // Then whole sections become summary buttons that still carry their state — and still with
      // nothing displaced: the overflow button's own width is counted from the rung that fills it,
      // so the bar never ends a pass overflowing by the button it just revealed.
      setWidth(440);
      expect(groupSection.classList.contains("pte-bar-section-summary")).toBe(true);
      expect(root.querySelector(".pte-grid-toolbar-section-summary")!.textContent)
        .toBe("Grouped by 2");

      // Only then do controls leave the bar, Export before Columns.
      setWidth(200);
      expect(bar.classList.contains("pte-grid-toolbar-has-overflow")).toBe(true);
      expect(displaced(".pte-grid-toolbar-export-button")).toBe(true);
      expect(columns.classList.contains("pte-bar-displaced")).toBe(false);

      // And the dot says the state that went with them is still in force.
      expect(root.querySelector(".pte-grid-toolbar-more-button")!
        .classList.contains("pte-grid-toolbar-more-active")).toBe(true);

      // Everything in the menu is still reachable from it.
      root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-more-button")!.click();
      root.querySelector<HTMLButtonElement>(
        '.pte-menu-item[data-item-id="toolbarMoreExport"]',
      )!.click();
      root.querySelector<HTMLButtonElement>(
        '.pte-menu-item[data-item-id="toolbarExportAllCSV"]',
      )!.click();
      expect(exportCSV).toHaveBeenCalledWith({ scope: "all" });

      // Growing back restores every rung.
      setWidth(1400);
      expect(bar.classList.contains("pte-grid-toolbar-compact")).toBe(false);
      expect(bar.classList.contains("pte-grid-toolbar-has-overflow")).toBe(false);
      expect(groupSection.classList.contains("pte-bar-section-summary")).toBe(false);
      expect(displaced(".pte-grid-toolbar-export-button")).toBe(false);

      toolbar.destroy();
      root.remove();
    });
  });

  it("scrolls rather than clipping once every rung has been applied", () => {
    withModelledLayout(setWidth => {
      const core = makeCore();
      const root = document.createElement("div");
      document.body.appendChild(root);
      const toolbar = new GridToolbarRenderer({
        core,
        api: new GridAPI(core),
        root,
        menuRenderer: new MenuRenderer(root),
        options: { grouping: true, sorting: true, quickFilter: true, export: true },
        exportCSV: vi.fn(),
        exportExcel: vi.fn(),
      });
      const bar = root.querySelector<HTMLElement>(".pte-grid-toolbar")!;

      setWidth(300);
      expect(bar.classList.contains("pte-grid-toolbar-scrolling")).toBe(false);

      setWidth(30);
      expect(bar.classList.contains("pte-grid-toolbar-scrolling")).toBe(true);

      setWidth(1400);
      expect(bar.classList.contains("pte-grid-toolbar-scrolling")).toBe(false);

      toolbar.destroy();
      root.remove();
    });
  });

  it("edits grouping from the summary button's editor, which survives its own edits", () => {
    withModelledLayout(setWidth => {
      const core = makeCore();
      core.dispatch({ type: "rowGroupSet", colIds: groupColIds(core, ["region", "country"]) });
      const root = document.createElement("div");
      document.body.appendChild(root);
      const toolbar = new GridToolbarRenderer({
        core,
        api: new GridAPI(core),
        root,
        menuRenderer: new MenuRenderer(root),
        options: { grouping: true, sorting: true, quickFilter: true, export: true },
        exportCSV: vi.fn(),
        exportExcel: vi.fn(),
      });
      const groupSection = root.querySelector<HTMLElement>(".pte-grid-toolbar-group-section")!;

      setWidth(420);
      expect(groupSection.classList.contains("pte-bar-section-summary")).toBe(true);
      const summary = groupSection.querySelector<HTMLButtonElement>(
        ".pte-grid-toolbar-section-summary",
      )!;
      expect(summary.textContent).toBe("Grouped by 2");

      summary.click();
      const editor = () => root.querySelector<HTMLElement>(".pte-grid-toolbar-chip-editor");
      expect(editor()).not.toBeNull();
      expect(editor()!.querySelectorAll(".pte-grid-toolbar-group-chip")).toHaveLength(2);

      // Removing a chip from inside the editor changes what is displaced, which moves the anchors
      // menus hang from — but the editor follows its own anchor rather than closing, so a second
      // chip can be removed without reopening it.
      editor()!.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-remove")!.click();
      expect(core.getRowGroupColumns()).toHaveLength(1);
      expect(editor()).not.toBeNull();
      expect(editor()!.querySelectorAll(".pte-grid-toolbar-group-chip")).toHaveLength(1);

      editor()!.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-remove")!.click();
      expect(core.getRowGroupColumns()).toHaveLength(0);

      toolbar.destroy();
      root.remove();
    });
  });

  it("names the displaced sections in the overflow menu, sort with its own direction", () => {
    withModelledLayout(setWidth => {
      const core = makeCore();
      core.dispatch({ type: "rowGroupSet", colIds: groupColIds(core, ["region"]) });
      const year = core.getColumnModel().getByColId("year")!;
      core.dispatch({
        type: "sortModelSet",
        sortItems: [{ key: year.instanceID, dir: "desc" }],
      });
      const root = document.createElement("div");
      document.body.appendChild(root);
      const toolbar = new GridToolbarRenderer({
        core,
        api: new GridAPI(core),
        root,
        menuRenderer: new MenuRenderer(root),
        options: { grouping: true, sorting: true, quickFilter: true, export: true },
        exportCSV: vi.fn(),
        exportExcel: vi.fn(),
      });

      setWidth(120);
      root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-more-button")!.click();
      const iconOf = (itemId: string) => root
        .querySelector(`.pte-menu-item[data-item-id="${itemId}"] .pte-menu-item-icon-left`)!
        .className;

      expect(iconOf("toolbarMoreGroup")).toContain("icon-group");
      // A descending sort reads `icon-desc`. Both classes have to be ones the stylesheet defines:
      // `icon-sort-asc` matched no rule, so the row drew an empty icon slot.
      expect(iconOf("toolbarMoreSort")).toContain("icon-desc");

      root.querySelector<HTMLButtonElement>(
        '.pte-menu-item[data-item-id="toolbarMoreSort"]',
      )!.click();
      // Ascending once the direction flips back.
      core.dispatch({
        type: "sortModelSet",
        sortItems: [{ key: year.instanceID, dir: "asc" }],
      });
      root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-more-button")!.click();
      expect(iconOf("toolbarMoreSort")).toContain("icon-asc");

      toolbar.destroy();
      root.remove();
    });
  });

  /**
   * At its last stage the search box is an icon that expands over the bar, because at that width
   * there is no room to show the field inline. Every mechanism around it used to close it again: the
   * reset at the top of each pass cleared the expansion, the pinning rule refused the very stage the
   * overlay hangs from, and the engine offered focus a new home outside the field it had collapsed.
   */
  it("keeps the icon's expanded search open across a fit pass, until focus leaves it", () => {
    withModelledLayout(setWidth => {
      const core = makeCore();
      core.dispatch({ type: "rowGroupSet", colIds: groupColIds(core, ["region"]) });
      const root = document.createElement("div");
      document.body.appendChild(root);
      const toolbar = new GridToolbarRenderer({
        core,
        api: new GridAPI(core),
        root,
        menuRenderer: new MenuRenderer(root),
        options: { grouping: true, sorting: true, quickFilter: true, export: true },
        exportCSV: vi.fn(),
        exportExcel: vi.fn(),
      });
      const host = root.querySelector<HTMLElement>(".pte-grid-toolbar-quick-filter")!;
      // The toolbar owns the host; the widget itself is mounted into it by the grid renderer, so
      // stand its field in here — the expansion is about where focus goes and stays.
      const field = document.createElement("input");
      field.className = "pte-quick-filter-input";
      host.appendChild(field);
      const input = () => host.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;

      setWidth(120);
      expect(host.classList.contains("pte-bar-qf-summary")).toBe(true);
      expect(host.classList.contains("pte-bar-qf-expanded")).toBe(false);

      root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-quick-filter-trigger")!.click();
      expect(host.classList.contains("pte-bar-qf-expanded")).toBe(true);
      expect(document.activeElement).toBe(input());

      // The pass that focus itself provokes must leave both the overlay and the focus in place.
      setWidth(120);
      expect(host.classList.contains("pte-bar-qf-summary")).toBe(true);
      expect(host.classList.contains("pte-bar-qf-expanded")).toBe(true);
      expect(document.activeElement).toBe(input());

      // Focus leaving takes the expansion with it, so a later narrowing shows the icon rather than
      // reopening the overlay on its own.
      const outside = document.createElement("button");
      root.appendChild(outside);
      outside.focus();
      expect(host.classList.contains("pte-bar-qf-expanded")).toBe(false);
      setWidth(120);
      expect(host.classList.contains("pte-bar-qf-expanded")).toBe(false);

      toolbar.destroy();
      root.remove();
    });
  });

  it("leaves a control alone while it holds focus, and takes the next rung instead", () => {
    withModelledLayout(setWidth => {
      const core = makeCore();
      core.dispatch({ type: "rowGroupSet", colIds: groupColIds(core, ["region"]) });
      const root = document.createElement("div");
      document.body.appendChild(root);
      const toolbar = new GridToolbarRenderer({
        core,
        api: new GridAPI(core),
        root,
        menuRenderer: new MenuRenderer(root),
        options: { grouping: true, sorting: true, quickFilter: true, export: true },
        exportCSV: vi.fn(),
        exportExcel: vi.fn(),
      });
      const groupSection = root.querySelector<HTMLElement>(".pte-grid-toolbar-group-section")!;
      const sortSection = root.querySelector<HTMLElement>(".pte-grid-toolbar-sort-section")!;

      setWidth(420);
      expect(groupSection.classList.contains("pte-bar-section-summary")).toBe(true);

      // A chip the user is holding stays put, so the pass takes the rungs past it instead — far
      // enough that the sort section leaves the bar altogether.
      setWidth(1400);
      root.querySelector<HTMLElement>(".pte-grid-toolbar-group-chip")!.focus();
      setWidth(420);
      expect(groupSection.classList.contains("pte-bar-section-summary")).toBe(false);
      expect(groupSection.classList.contains("pte-bar-displaced")).toBe(false);
      expect(sortSection.classList.contains("pte-bar-displaced")).toBe(true);

      toolbar.destroy();
      root.remove();
    });
  });

  /**
   * The bar's spare width has to belong to something, or it collects between the two regions as a
   * hole — blank space sitting there while the controls beside it are collapsed, which is what a
   * bar that had already spent rungs looked like.
   */
  it("hands leftover width to the search field, or to the last chip section without one", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      api: new GridAPI(core),
      root,
      menuRenderer: new MenuRenderer(root),
      options: { grouping: true, sorting: true, quickFilter: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    const elastic = () => root.querySelector(".pte-bar-elastic");
    const bar = () => root.querySelector<HTMLElement>(".pte-grid-toolbar")!;

    // The search field is the one control that is better wide.
    expect(elastic()).toBe(root.querySelector(".pte-grid-toolbar-quick-filter"));
    expect(bar().classList.contains("pte-grid-toolbar-elastic-left")).toBe(false);

    // Without one, the last chip section takes it instead — the slack becomes drop zone.
    toolbar.setOptions({ grouping: true, sorting: true });
    expect(elastic()).toBe(root.querySelector(".pte-grid-toolbar-sort-section"));
    expect(bar().classList.contains("pte-grid-toolbar-elastic-left")).toBe(true);

    toolbar.setOptions({ grouping: true });
    expect(elastic()).toBe(root.querySelector(".pte-grid-toolbar-group-section"));

    // And it moves back the moment there is a field again: exactly one control is ever elastic.
    toolbar.setOptions({ grouping: true, quickFilter: true });
    expect(root.querySelectorAll(".pte-bar-elastic")).toHaveLength(1);
    expect(elastic()).toBe(root.querySelector(".pte-grid-toolbar-quick-filter"));
    expect(bar().classList.contains("pte-grid-toolbar-elastic-left")).toBe(false);

    toolbar.destroy();
    root.remove();
  });

  it("mounts only for opted-in sections and reconciles them live", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      api: new GridAPI(core),
      root,
      menuRenderer: new MenuRenderer(root),
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });

    expect(root.querySelector(".pte-grid-toolbar")).toBeNull();

    toolbar.setOptions({ grouping: true });
    expect(root.querySelector(".pte-grid-toolbar-group-section")).not.toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-sort-section")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-export-button")).toBeNull();

    toolbar.setOptions({ sorting: true, export: true });
    expect(root.querySelector(".pte-grid-toolbar-group-section")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-sort-section")).not.toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-export-button")).not.toBeNull();

    toolbar.setOptions(undefined);
    expect(root.querySelector(".pte-grid-toolbar")).toBeNull();

    const columns = document.createElement("button");
    columns.textContent = "Columns";
    toolbar.mountColumnTrigger(columns);
    expect(root.querySelector(".pte-grid-toolbar")).not.toBeNull();
    expect(controls(root.querySelector(".pte-grid-toolbar-right")!).at(-1)).toBe(columns);

    toolbar.setOptions({ export: true });
    expect(root.querySelector(".pte-grid-toolbar-export-button")).not.toBeNull();
    expect(controls(root.querySelector(".pte-grid-toolbar-right")!).at(-1)).toBe(columns);

    toolbar.setOptions(undefined);
    expect(root.querySelector(".pte-grid-toolbar")).not.toBeNull();
    toolbar.unmountColumnTrigger();
    expect(root.querySelector(".pte-grid-toolbar")).toBeNull();

    toolbar.destroy();
    root.remove();
  });

  it("offers explicit selection and entire-table scopes while keeping Columns rightmost", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menuRenderer = new MenuRenderer(root);
    const exportCSV = vi.fn();
    const exportExcel = vi.fn();
    const toolbar = new GridToolbarRenderer({
      core,
      api: new GridAPI(core),
      root,
      menuRenderer,
      options: { grouping: true, sorting: true, export: true },
      exportCSV,
      exportExcel,
    });
    const columns = document.createElement("button");
    columns.textContent = "Columns";
    toolbar.mountColumnTrigger(columns);

    const right = root.querySelector(".pte-grid-toolbar-right")!;
    expect(controls(right).at(-1)).toBe(columns);
    const exportButton = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-export-button")!;
    exportButton.click();
    expect(root.querySelector(
      '.pte-menu-item[data-item-id="toolbarExportSelection"]',
    )).toBeNull();
    expect(root.querySelector(
      '.pte-menu-item[data-item-id="toolbarExportAll"]',
    )).toBeNull();
    expect(root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAllCSV"]',
    )?.textContent).toContain("Table as CSV");
    expect(root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAllExcel"]',
    )?.textContent).toContain("Table as Excel");
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAllCSV"]',
    )!.click();
    expect(exportCSV).toHaveBeenCalledWith({ scope: "all" });

    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    exportButton.click();
    const selection = root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportSelection"]',
    )!;
    expect(selection).not.toBeNull();
    selection.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-submenu .pte-menu-item[data-item-id="toolbarExportSelectionCSV"]',
    )!.click();
    expect(exportCSV).toHaveBeenCalledWith({ scope: "selection" });

    exportButton.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarExportAll"]',
    )!.click();
    root.querySelector<HTMLButtonElement>(
      '.pte-submenu .pte-menu-item[data-item-id="toolbarExportAllExcel"]',
    )!.click();
    expect(exportExcel).toHaveBeenCalledWith({ scope: "all" });

    toolbar.destroy();
    root.remove();
  });

  it("opens group and sort pickers at the pressed point in their trailing targets", () => {
    const core = makeCore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menuRenderer = new MenuRenderer(root);
    const openMenu = vi.spyOn(menuRenderer, "open").mockImplementation(() => {});
    const toolbar = new GridToolbarRenderer({
      core,
      api: new GridAPI(core),
      root,
      menuRenderer,
      options: { grouping: true, sorting: true, export: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    toolbar.mountColumnTrigger(document.createElement("button"));

    const groupTarget = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-group-add",
    )!;
    vi.spyOn(groupTarget, "getBoundingClientRect").mockReturnValue({
      left: 20,
      right: 200,
      top: 0,
      bottom: 42,
      width: 180,
      height: 42,
      x: 20,
      y: 0,
      toJSON: () => ({}),
    });
    groupTarget.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: 143,
      detail: 1,
    }));
    expect(openMenu).toHaveBeenLastCalledWith(expect.objectContaining({
      clientX: 143,
      clientY: 42,
      position: "bottom-left",
    }));

    const sortTarget = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-sort-add",
    )!;
    vi.spyOn(sortTarget, "getBoundingClientRect").mockReturnValue({
      left: 220,
      right: 400,
      top: 0,
      bottom: 42,
      width: 180,
      height: 42,
      x: 220,
      y: 0,
      toJSON: () => ({}),
    });
    sortTarget.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: 347,
      detail: 1,
    }));
    expect(openMenu).toHaveBeenLastCalledWith(expect.objectContaining({
      clientX: 347,
      clientY: 42,
      position: "bottom-left",
    }));

    toolbar.destroy();
    root.remove();
  });

  it("renders active row groups and reuses rowGroupSet for removal and reordering", () => {
    const core = makeCore();
    const region = colId(core, "region");
    const country = colId(core, "country");
    const year = colId(core, "year");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      api: new GridAPI(core),
      root,
      menuRenderer: new MenuRenderer(root),
      options: { grouping: true, sorting: true, export: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    toolbar.mountColumnTrigger(document.createElement("button"));

    expect(root.querySelector(".pte-grid-toolbar-group-label")).toBeNull();
    const addGroup = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!;
    expect(addGroup.disabled).toBe(false);
    addGroup.click();
    const regionItem = root.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarGroupAdd-${region}"]`,
    )!;
    expect(regionItem.textContent).toContain("Region");
    regionItem.click();
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([region]);

    core.dispatch({ type: "rowGroupSet", colIds: [region, country, year] });

    const chipLabels = () => Array.from(
      root.querySelectorAll(".pte-grid-toolbar-group-chip-label"),
      chip => chip.textContent,
    );
    expect(chipLabels()).toEqual(["Region", "Country", "Year"]);

    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${country}"] .pte-grid-toolbar-group-remove`,
    )!.click();
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([region, year]);
    expect(chipLabels()).toEqual(["Region", "Year"]);

    core.dispatch({ type: "rowGroupSet", colIds: [region, country, year] });
    const regionChip = () => root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${region}"]`,
    )!;
    // A modified arrow is not this chord: it keeps its platform meaning (Alt+Left/Right is history
    // navigation) rather than reordering the chip.
    regionChip().dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight", ctrlKey: true, bubbles: true,
    }));
    regionChip().dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight", altKey: true, bubbles: true,
    }));
    expect(chipLabels()).toEqual(["Region", "Country", "Year"]);

    regionChip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([country, region, year]);
    expect(chipLabels()).toEqual(["Country", "Region", "Year"]);

    const dropZone = root.querySelector<HTMLElement>(".pte-grid-toolbar-group-dropzone")!;
    const internalChips = Array.from(
      dropZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"),
    );
    internalChips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    const yearChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${year}"]`,
    )!;
    const countryChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${country}"]`,
    )!;
    yearChip.dispatchEvent(new Event("dragstart", { bubbles: true }));
    countryChip.dispatchEvent(new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(countryChip.classList.contains("drop-before")).toBe(true);
    expect(
      dropZone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")?.style.left,
    ).toBe("0px");
    countryChip.dispatchEvent(new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([year, country, region]);
    expect(chipLabels()).toEqual(["Year", "Country", "Region"]);
    expect(dropZone.querySelector(".pte-grid-toolbar-group-drop-indicator")).toBeNull();

    const dragData = {
      dropEffect: "none",
      getData: (type: string) => type === "text/plain" ? "name" : "",
    };
    const chips = Array.from(
      dropZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"),
    );
    chips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    const dragOver = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
    });
    Object.defineProperty(dragOver, "dataTransfer", { value: dragData });
    dropZone.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    expect(dropZone.classList.contains("drag-over")).toBe(true);
    expect(chips[1].classList.contains("drop-before")).toBe(true);
    expect(
      dropZone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")?.style.left,
    ).toBe("100px");
    const drop = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
    });
    Object.defineProperty(drop, "dataTransfer", { value: dragData });
    dropZone.dispatchEvent(drop);
    expect(core.getRowGroupColumns().map(col => col.key))
      .toEqual(["year", "name", "country", "region"]);
    expect(dropZone.classList.contains("drag-over")).toBe(false);
    expect(dropZone.querySelector(".pte-grid-toolbar-group-drop-indicator")).toBeNull();

    const clearGrouping = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-group-clear",
    )!;
    expect(clearGrouping.getAttribute("aria-label")).toBe("Clear row grouping");
    expect(clearGrouping.hasAttribute("title")).toBe(false);
    clearGrouping.click();
    expect(core.getRowGroupColumns()).toEqual([]);
    expect(root.querySelector(".pte-grid-toolbar-group-chip")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-group-clear")).toBeNull();

    toolbar.destroy();
    root.remove();
  });

  it("manages ordered multi-column sorting through the shared sort model", () => {
    const core = makeCore();
    const region = colId(core, "region");
    const country = colId(core, "country");
    const year = colId(core, "year");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const toolbar = new GridToolbarRenderer({
      core,
      api: new GridAPI(core),
      root,
      menuRenderer: new MenuRenderer(root),
      options: { grouping: true, sorting: true, export: true },
      exportCSV: vi.fn(),
      exportExcel: vi.fn(),
    });
    toolbar.mountColumnTrigger(document.createElement("button"));

    expect(root.querySelector(".pte-grid-toolbar-sort-label")).toBeNull();
    const addSort = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!;
    addSort.click();
    root.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${region}"]`,
    )!.click();
    expect(core.getSortModel().items.map(item => ({
      id: item.col.instanceID,
      dir: item.dir,
    }))).toEqual([{ id: region, dir: "asc" }]);

    core.dispatch({
      type: "headerAction",
      action: "toggleSort",
      colId: country,
      additive: true,
    });
    const chipLabels = () => Array.from(
      root.querySelectorAll(".pte-grid-toolbar-sort-chip-label"),
      chip => chip.textContent,
    );
    expect(chipLabels()).toEqual(["Region", "Country"]);

    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${region}"] .pte-grid-toolbar-sort-direction`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.dir)).toEqual(["desc", "asc"]);
    expect(root.querySelector(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${region}"] .icon-desc`,
    )).not.toBeNull();

    const countryChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${country}"]`,
    )!;
    countryChip.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
    }));
    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([country, region]);
    expect(chipLabels()).toEqual(["Country", "Region"]);

    core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: year, dir: "asc" }],
    });
    expect(chipLabels()).toEqual(["Country", "Region", "Year"]);

    const sortSection = root.querySelector<HTMLElement>(".pte-grid-toolbar-sort-section")!;
    const chips = Array.from(
      sortSection.querySelectorAll<HTMLElement>(".pte-grid-toolbar-sort-chip"),
    );
    chips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    const yearChip = root.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${year}"]`,
    )!;
    yearChip.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const groupDragOver = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    });
    root.querySelector<HTMLElement>(".pte-grid-toolbar-group-section")!
      .dispatchEvent(groupDragOver);
    expect(groupDragOver.defaultPrevented).toBe(false);
    expect(root.querySelector(".pte-grid-toolbar-group-section.drag-over")).toBeNull();

    chips[0].dispatchEvent(new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(chips[0].classList.contains("drop-before")).toBe(true);
    expect(
      sortSection.querySelector<HTMLElement>(".pte-grid-toolbar-sort-drop-indicator")?.style.left,
    ).toBe("0px");
    chips[0].dispatchEvent(new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
    }));
    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([year, country, region]);
    expect(chipLabels()).toEqual(["Year", "Country", "Region"]);
    expect(sortSection.querySelector(".pte-grid-toolbar-sort-drop-indicator")).toBeNull();

    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${country}"] .pte-grid-toolbar-sort-remove`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.col.instanceID)).toEqual([year, region]);

    const sortTarget = root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!;
    expect(sortTarget.textContent).toBe("Add sort");
    expect(sortTarget.disabled).toBe(false);
    const clearSorting = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-sort-clear",
    )!;
    expect(clearSorting.getAttribute("aria-label")).toBe("Clear all sorting");
    expect(clearSorting.hasAttribute("title")).toBe(false);
    clearSorting.click();
    expect(core.getSortModel().items).toEqual([]);
    expect(root.querySelector(".pte-grid-toolbar-sort-chip")).toBeNull();
    expect(root.querySelector(".pte-grid-toolbar-sort-clear")).toBeNull();

    root.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
    root.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${year}"]`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.dir)).toEqual(["desc"]);
    root.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${year}"] .pte-grid-toolbar-sort-direction`,
    )!.click();
    expect(core.getSortModel().items.map(item => item.dir)).toEqual(["asc"]);

    core.dispatch({
      type: "sortModelSet",
      sortItems: [
        { key: region, dir: "asc" },
        { key: country, dir: "asc" },
        { key: colId(core, "name"), dir: "asc" },
      ],
    });
    const allColumnsSortedTarget = root.querySelector<HTMLButtonElement>(
      ".pte-grid-toolbar-sort-add",
    )!;
    expect(allColumnsSortedTarget.disabled).toBe(true);
    expect(root.querySelector(".pte-grid-toolbar-sort-clear")).not.toBeNull();

    toolbar.destroy();
    root.remove();
  });
});
