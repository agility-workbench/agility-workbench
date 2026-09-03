// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { MenuRenderer } from "../menuRenderer";
import { PaginationRenderer } from "./renderer";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(
  options: Record<string, unknown> = {},
  rendererParams: { hasSheetTabs?: () => boolean } = {},
) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    pagination: true,
    pageSize: 10,
    pageSizes: [10, 25],
    ...options,
  });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
  core.setRowData(Array.from({ length: 100 }, (_, index) => ({ id: String(index), name: `Row ${index}` })));
  const root = document.createElement("div");
  document.body.appendChild(root);
  const renderer = new PaginationRenderer({
    core,
    root,
    resetScrollPosition: () => undefined,
    setAggregateScope: () => undefined,
    ...rendererParams,
  });
  renderer.buildControls();
  return { core, renderer, root };
}

const controlName = (element: Element): string => {
  if (element.classList.contains("pte-pagination-size-control")) return "pageSize";
  if (element.classList.contains("pte-pagination-btn-first")) return "firstPage";
  if (element.classList.contains("pte-pagination-btn-prev")) return "previousPage";
  if (element.classList.contains("pte-pagination-page-control")) return "pageSelector";
  if (element.classList.contains("pte-pagination-btn-next")) return "nextPage";
  if (element.classList.contains("pte-pagination-btn-last")) return "lastPage";
  return "unknown";
};

describe("pagination control composition", () => {
  it("keeps the historical select and order by default", () => {
    const { root } = makeGrid();
    const nav = root.querySelector(".pte-pagination-nav")!;
    expect([...nav.children].map(controlName)).toEqual([
      "pageSize",
      "firstPage",
      "previousPage",
      "pageSelector",
      "nextPage",
      "lastPage",
    ]);
    expect(root.querySelector(".pte-pagination-page-select")).toBeTruthy();
    expect(root.querySelector(".pte-pagination-page-buttons")).toBeNull();
  });

  it("renders only configured controls in configured order", () => {
    const { root } = makeGrid({
      paginationControls: {
        controls: ["nextPage", "pageSelector", "previousPage"],
      },
    });
    const nav = root.querySelector(".pte-pagination-nav")!;
    expect([...nav.children].map(controlName)).toEqual(["nextPage", "pageSelector", "previousPage"]);
    expect(root.querySelector(".pte-pagination-size-control")).toBeNull();
    expect(root.querySelector(".pte-pagination-btn-first")).toBeNull();
  });

  it("reconciles a live configuration without replacing the footer", () => {
    const { renderer, root } = makeGrid();
    const footer = renderer.getElement();
    renderer.setPaginationControls({
      pageSelection: "buttons",
      controls: ["pageSelector", "nextPage"],
      maxPageButtons: 5,
    });
    expect(renderer.getElement()).toBe(footer);
    expect(root.querySelector(".pte-pagination-page-select")).toBeNull();
    expect([...root.querySelector(".pte-pagination-nav")!.children].map(controlName))
      .toEqual(["pageSelector", "nextPage"]);
  });
});

describe("numbered page selection", () => {
  it("bounds the page-button window, marks the current page, and navigates", () => {
    const { core, renderer, root } = makeGrid({
      paginationControls: { pageSelection: "buttons", maxPageButtons: 5 },
    });
    const labels = () => [...root.querySelectorAll<HTMLElement>(
      ".pte-pagination-page-btn, .pte-pagination-page-ellipsis",
    )].map(element => element.textContent);

    expect(labels()).toEqual(["1", "2", "3", "4", "…", "10"]);
    const current = root.querySelector<HTMLButtonElement>("[aria-current='page']")!;
    expect(current.textContent).toBe("1");
    expect(current.disabled).toBe(false);

    root.querySelector<HTMLButtonElement>(".pte-pagination-page-btn[aria-label='Page 4 of 10']")!.click();
    renderer.updateControls();
    expect(core.getPaginationInfo().pageIndex).toBe(3);
    expect(root.querySelector("[aria-current='page']")?.textContent).toBe("4");
    expect(labels()).toEqual(["1", "…", "3", "4", "5", "…", "10"]);
  });

  it("keeps keyboard focus on the current numbered button after navigation", () => {
    const { renderer, root } = makeGrid({
      paginationControls: { pageSelection: "buttons", maxPageButtons: 5 },
    });
    const pageFour = root.querySelector<HTMLButtonElement>("[aria-label='Page 4 of 10']")!;
    pageFour.focus();
    pageFour.click();
    renderer.updateControls();

    expect(document.activeElement?.getAttribute("aria-current")).toBe("page");
    expect(document.activeElement?.textContent).toBe("4");
  });

  it("uses the page label for the group and accessible names for every numbered button", () => {
    const { root } = makeGrid({ paginationControls: { pageSelection: "buttons" } });
    const group = root.querySelector<HTMLElement>(".pte-pagination-page-buttons")!;
    const label = group.parentElement!.querySelector<HTMLElement>(".pte-pagination-label")!;
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
    expect(label.textContent).toBe("Page");
    for (const button of group.querySelectorAll<HTMLButtonElement>(".pte-pagination-page-btn")) {
      expect(button.getAttribute("aria-label")).toMatch(/^Page \d+ of 10$/);
    }
  });

  it("can omit the visible Page label while retaining accessible names", () => {
    const { root } = makeGrid({
      paginationControls: { pageSelection: "buttons", showPageLabel: false },
    });
    const pageControl = root.querySelector<HTMLElement>(".pte-pagination-page-control")!;
    const group = pageControl.querySelector<HTMLElement>(".pte-pagination-page-buttons")!;

    expect(pageControl.querySelector(".pte-pagination-label")).toBeNull();
    expect(group.hasAttribute("aria-labelledby")).toBe(false);
    expect(group.getAttribute("aria-label")).toBe("Page 1 of 10");
    expect(group.querySelector("[aria-current='page']")?.getAttribute("aria-label"))
      .toBe("Page 1 of 10");
  });
});

describe("responsive footer", () => {
  /**
   * happy-dom has no layout, so the fit check is modelled: the footer reports a content width built
   * from what is visible in it, and the harness sets the width it has to fit into. What these tests
   * pin is the order controls give way in — the part that is a decision rather than a measurement.
   */
  function withModelledLayout(
    run: (harness: {
      setWidth: (width: number) => void;
      setSheetTabs: (mounted: boolean) => void;
      addSheet: ReturnType<typeof vi.fn>;
    }) => void,
  ): void {
    const originalObserver = globalThis.ResizeObserver;
    const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const callbacks: ResizeObserverCallback[] = [];
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

    let footerWidth = 1200;
    let sheetTabs = false;
    let addDisplaced = false;
    const addSheet = vi.fn();

    const visible = (el: Element | null) =>
      !!el && !el.classList.contains("pte-bar-displaced");
    const modelWidth = (footer: HTMLElement): number => {
      const captionsOff = footer.classList.contains("pte-footer-compact");
      let total = 0;
      // The tab strip is elastic with a floor, and the floor is what the footer has to fit.
      if (sheetTabs) total += addDisplaced ? 110 : 140;
      const aggregate = footer.querySelector(".pte-aggregate-controls");
      if (visible(aggregate)) total += captionsOff ? 174 : 240;
      const pageSize = footer.querySelector(".pte-pagination-size-control");
      if (visible(pageSize)) total += captionsOff ? 80 : 172;
      const page = footer.querySelector(".pte-pagination-page-control");
      if (visible(page)) total += captionsOff ? 120 : 158;
      for (const selector of [
        ".pte-pagination-btn-first",
        ".pte-pagination-btn-prev",
        ".pte-pagination-btn-next",
        ".pte-pagination-btn-last",
      ]) {
        if (visible(footer.querySelector(selector))) total += 32;
      }
      if (footer.classList.contains("pte-footer-has-overflow")) total += 32;
      return total;
    };

    const isFooter = (el: HTMLElement) => el.classList.contains("pte-pagination-wrapper");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) { return isFooter(this) ? footerWidth : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get(this: HTMLElement) { return isFooter(this) ? modelWidth(this) : 0; },
    });

    const notify = () => {
      for (const callback of callbacks) callback([], undefined as unknown as ResizeObserver);
    };

    try {
      run({
        setWidth: width => { footerWidth = width; notify(); },
        setSheetTabs: mounted => { sheetTabs = mounted; notify(); },
        addSheet,
      });
    } finally {
      globalThis.ResizeObserver = originalObserver;
      if (originalClient) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClient);
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScroll);
    }
    // The sheet "+" seam is driven through the renderer, so its displaced flag lives here.
    function _unused() { return addDisplaced; }
    void _unused;
  }

  function makeResponsiveGrid(harness: {
    addSheet: ReturnType<typeof vi.fn>;
    sheetTabs?: boolean;
  }) {
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      pagination: true,
      pageSize: 10,
      pageSizes: [10, 25, 50],
    });
    core.dispatch({
      type: "themeFontSet",
      headerFont: "12px sans",
      cellFont: "12px sans",
      reason: "test",
    });
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name" },
      { colId: "amount", key: "amount", label: "Amount", type: ColumnType.NUMBER },
    ]);
    core.setRowData(Array.from({ length: 120 }, (_, index) => ({
      id: String(index),
      name: `Row ${index}`,
      amount: index,
    })));
    const root = document.createElement("div");
    document.body.appendChild(root);
    let addDisplaced = false;
    const renderer = new PaginationRenderer({
      core,
      root,
      resetScrollPosition: () => undefined,
      setAggregateScope: scope => core.setAggregateScope(scope),
      hasSheetTabs: () => harness.sheetTabs === true,
      menuRenderer: new MenuRenderer(root),
      sheetAdd: {
        canAdd: () => harness.sheetTabs === true,
        add: harness.addSheet,
        setDisplaced: displaced => { addDisplaced = displaced; },
      },
    });
    renderer.buildControls();
    const footer = root.querySelector<HTMLElement>(".pte-pagination-wrapper")!;
    return { core, renderer, root, footer, isAddDisplaced: () => addDisplaced };
  }

  const displaced = (root: HTMLElement, selector: string) =>
    root.querySelector(selector)!.classList.contains("pte-bar-displaced");

  it("gives way one rung at a time: captions, then the edge pages, then the overflow menu", () => {
    withModelledLayout(harness => {
      const grid = makeResponsiveGrid({ addSheet: harness.addSheet });
      harness.setWidth(1200);
      expect(grid.footer.classList.contains("pte-footer-compact")).toBe(false);
      expect(grid.footer.classList.contains("pte-footer-has-overflow")).toBe(false);

      // Modelled full width is 634 without tabs: captions first.
      harness.setWidth(600);
      expect(grid.footer.classList.contains("pte-footer-compact")).toBe(true);
      expect(displaced(grid.root, ".pte-pagination-btn-first")).toBe(false);

      // Then the two buttons the page picker makes redundant.
      harness.setWidth(420);
      expect(displaced(grid.root, ".pte-pagination-btn-first")).toBe(true);
      expect(displaced(grid.root, ".pte-pagination-btn-last")).toBe(true);
      expect(displaced(grid.root, ".pte-pagination-btn-prev")).toBe(false);

      // Then rows-per-page, into the menu rather than out of reach.
      harness.setWidth(330);
      expect(displaced(grid.root, ".pte-pagination-size-control")).toBe(true);
      expect(grid.footer.classList.contains("pte-footer-has-overflow")).toBe(true);

      // Page navigation itself never gives way.
      expect(displaced(grid.root, ".pte-pagination-page-control")).toBe(false);
      expect(displaced(grid.root, ".pte-pagination-btn-next")).toBe(false);

      // And it all comes back.
      harness.setWidth(1200);
      expect(grid.footer.classList.contains("pte-footer-compact")).toBe(false);
      expect(displaced(grid.root, ".pte-pagination-size-control")).toBe(false);
      expect(grid.footer.classList.contains("pte-footer-has-overflow")).toBe(false);

      grid.renderer.destroy();
      grid.root.remove();
    });
  });

  it("keeps a displaced control usable from the overflow menu", () => {
    withModelledLayout(harness => {
      const grid = makeResponsiveGrid({ addSheet: harness.addSheet });
      harness.setWidth(330);
      expect(displaced(grid.root, ".pte-pagination-size-control")).toBe(true);

      grid.root.querySelector<HTMLButtonElement>(".pte-footer-overflow-button")!.click();
      grid.root.querySelector<HTMLButtonElement>(
        '.pte-menu-item[data-item-id="footerOverflowPageSize"]',
      )!.click();
      grid.root.querySelector<HTMLButtonElement>(
        '.pte-menu-item[data-item-id="footerOverflowPageSize-25"]',
      )!.click();

      expect(grid.core.getPaginationInfo().pageSize).toBe(25);

      grid.renderer.destroy();
      grid.root.remove();
    });
  });

  it("marks the overflow button when the aggregation it hides is still on", () => {
    withModelledLayout(harness => {
      const grid = makeResponsiveGrid({ addSheet: harness.addSheet });
      grid.core.setAggregateScope("all");
      grid.renderer.buildControls();

      const overflowButton = grid.root
        .querySelector<HTMLButtonElement>(".pte-footer-overflow-button")!;
      harness.setWidth(400);
      expect(displaced(grid.root, ".pte-aggregate-controls")).toBe(false);
      expect(overflowButton.classList.contains("pte-footer-overflow-active")).toBe(false);

      harness.setWidth(180);
      expect(displaced(grid.root, ".pte-aggregate-controls")).toBe(true);
      expect(overflowButton.classList.contains("pte-footer-overflow-active")).toBe(true);
      expect(overflowButton.getAttribute("aria-label")).toContain("aggregation on");

      grid.renderer.destroy();
      grid.root.remove();
    });
  });

  it("gives the sheet strip room by displacing its + last, then scrolls", () => {
    withModelledLayout(harness => {
      const grid = makeResponsiveGrid({ addSheet: harness.addSheet, sheetTabs: true });
      harness.setSheetTabs(true);

      harness.setWidth(400);
      expect(grid.isAddDisplaced()).toBe(false);

      harness.setWidth(150);
      expect(grid.isAddDisplaced()).toBe(true);
      grid.root.querySelector<HTMLButtonElement>(".pte-footer-overflow-button")!.click();
      grid.root.querySelector<HTMLButtonElement>(
        '.pte-menu-item[data-item-id="footerOverflowAddSheet"]',
      )!.click();
      expect(harness.addSheet).toHaveBeenCalledTimes(1);

      harness.setWidth(60);
      expect(grid.footer.classList.contains("pte-footer-scrolling")).toBe(true);

      grid.renderer.destroy();
      grid.root.remove();
    });
  });

  it("stops observing on destroy", () => {
    const { renderer } = makeGrid();
    expect(() => renderer.destroy()).not.toThrow();
  });
});
