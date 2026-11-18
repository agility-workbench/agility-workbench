// @vitest-environment happy-dom
/**
 * The opt-in footer controls (`rowSummary`, `pageInput`), live page sizes and auto page size as the
 * footer sees them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { GridOptions, PaginationControl } from "../../interfaces/gridOptions";
import type { IServerSideDataSource } from "../../interfaces/serverSide";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { PaginationRenderer } from "./renderer";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function makeGrid(options: GridOptions = {}, rowCount = 1234) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    pagination: true,
    pageSize: 100,
    pageSizes: [50, 100],
    rowHeight: 40,
    paginationControls: {
      controls: ["rowSummary", "pageSize", "previousPage", "pageSelector", "pageInput", "nextPage"],
    },
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);
  core.setRowData(Array.from({ length: rowCount }, (_, index) => ({ id: String(index), name: `Row ${index}` })));
  const root = document.createElement("div");
  root.setAttribute("lang", "en-US");
  document.body.appendChild(root);
  const renderer = new PaginationRenderer({
    core,
    root,
    resetScrollPosition: () => undefined,
    setAggregateScope: () => undefined,
  });
  renderer.buildControls();
  // The grid renderer forwards paginationChanged to the footer; stand in for it.
  core.on("paginationChanged", event => renderer.updateControls(event));
  return { core, renderer, root };
}

const summaryText = (root: HTMLElement) => root.querySelector(".pte-pagination-row-summary")?.textContent;

describe("rowSummary", () => {
  it("is opt-in: the default footer has neither new control", () => {
    const { root } = makeGrid({ paginationControls: undefined });
    expect(root.querySelector(".pte-pagination-row-summary")).toBeNull();
    expect(root.querySelector(".pte-pagination-page-input")).toBeNull();
  });

  it("shows the page's row range and the formatted total in a polite live region", () => {
    const { core, root } = makeGrid();
    const summary = root.querySelector(".pte-pagination-row-summary")!;
    expect(summary.textContent).toBe("1–100 of 1,234");
    expect(summary.getAttribute("aria-live")).toBe("polite");
    expect(summary.getAttribute("aria-atomic")).toBe("true");
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 12, pageSize: 100 });
    expect(summary.textContent).toBe("1,201–1,234 of 1,234");
  });

  it("says so when there are no rows", () => {
    const { root } = makeGrid({}, 0);
    expect(summaryText(root)).toBe("0 of 0");
  });

  it("is localized", () => {
    const { root } = makeGrid({ localeText: { paginationRowSummary: "Zeilen {first} bis {last} von {total}" } });
    expect(summaryText(root)).toBe("Zeilen 1 bis 100 von 1,234");
  });

  it("marks a provisional server-side total as a floor", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `Row ${i}` }));
    const openEnded: IServerSideDataSource = {
      getRows: ({ request, success }) => success({ rows: rows.slice(request.startRow ?? 0, request.endRow ?? rows.length) }),
    };
    const { core, renderer, root } = makeGrid({ rowModelType: "serverSide", pageSize: 2, pageSizes: [2], serverSideBlockSize: 2 }, 0);
    core.setServerSideDataSource(openEnded);
    for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0));
    renderer.updateControls();
    expect(core.getPaginationInfo().totalRowCountKnown).toBe(false);
    const total = core.getPaginationInfo().totalRowCount;
    expect(summaryText(root)).toBe(`1–2 of at least ${total}`);
    expect(root.querySelector<HTMLElement>(".pte-pagination-row-summary")!.title).not.toBe("");
  });
});

describe("pageInput", () => {
  const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>(".pte-pagination-page-input")!;
  const type = (el: HTMLInputElement, value: string, key: "Enter" | "Escape" | "blur") => {
    el.focus();
    el.value = value;
    if (key === "blur") el.dispatchEvent(new FocusEvent("blur"));
    else el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  };

  it("is named by its label and shows the current page", () => {
    const { root } = makeGrid();
    const field = input(root);
    const labelId = field.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelId)?.textContent).toBe("Go to page");
    expect(field.value).toBe("1");
    expect(field.max).toBe("13");
  });

  it("commits on Enter and on blur", () => {
    const { core, root } = makeGrid();
    type(input(root), "5", "Enter");
    expect(core.getPaginationInfo().pageIndex).toBe(4);
    type(input(root), "7", "blur");
    expect(core.getPaginationInfo().pageIndex).toBe(6);
    expect(input(root).value).toBe("7");
  });

  it("clamps to the known pages", () => {
    const { core, root } = makeGrid();
    type(input(root), "99", "Enter");
    expect(core.getPaginationInfo().pageIndex).toBe(12);
    expect(input(root).value).toBe("13");
    type(input(root), "-4", "Enter");
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(input(root).value).toBe("1");
  });

  it("reverts anything that is not a page, and on Escape", () => {
    const { core, root } = makeGrid();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 2, pageSize: 100 });
    type(input(root), "", "Enter");
    expect(input(root).value).toBe("3");
    type(input(root), "9", "Escape");
    expect(input(root).value).toBe("3");
    expect(core.getPaginationInfo().pageIndex).toBe(2);
  });

  it("follows page changes made elsewhere", () => {
    const { core, root } = makeGrid();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 8, pageSize: 100 });
    expect(input(root).value).toBe("9");
  });
});

describe("live page sizes and auto page size in the footer", () => {
  const sizeOptions = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLOptionElement>(".pte-pagination-size-control option")].map(option => option.value);

  it("rebuilds the size selector when pageSizes changes", () => {
    const { core, root } = makeGrid();
    expect(sizeOptions(root)).toEqual(["50", "100"]);
    core.setPageSizeOptions({ pageSizes: [10, 100, 500] });
    expect(sizeOptions(root)).toEqual(["10", "100", "500"]);
    core.setPageSizeOptions({ pageSize: 10 });
    expect(root.querySelector<HTMLSelectElement>(".pte-pagination-size-control select")!.value).toBe("10");
    expect(summaryText(root)).toBe("1–10 of 1,234");
  });

  it("hides the size selector while auto page size is on, and brings it back", () => {
    const { core, root } = makeGrid();
    core.setPageViewportHeight(400);
    core.setPageSizeOptions({ paginationAutoPageSize: true });
    expect(root.querySelector(".pte-pagination-size-control")).toBeNull();
    expect(summaryText(root)).toBe("1–10 of 1,234");
    core.setPageSizeOptions({ paginationAutoPageSize: false });
    expect(root.querySelector(".pte-pagination-size-control")).toBeTruthy();
    expect(summaryText(root)).toBe("1–100 of 1,234");
  });
});

describe("the new controls in the responsive footer", () => {
  function withModelledWidth(run: (setWidth: (width: number) => void) => void) {
    const originalObserver = globalThis.ResizeObserver;
    const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const callbacks: ResizeObserverCallback[] = [];
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    let width = 1200;
    const shown = (footer: HTMLElement, selector: string) => {
      const el = footer.querySelector(selector);
      return !!el && !el.classList.contains("pte-bar-displaced");
    };
    const widths: Record<string, number> = {
      ".pte-pagination-row-summary": 120,
      ".pte-pagination-size-control": 170,
      ".pte-pagination-page-control": 150,
      ".pte-pagination-page-input-control": 140,
      ".pte-pagination-btn-prev": 32,
      ".pte-pagination-btn-next": 32,
    };
    const isFooter = (el: HTMLElement) => el.classList.contains("pte-pagination-wrapper");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) { return isFooter(this) ? width : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (!isFooter(this)) return 0;
        let total = this.classList.contains("pte-footer-has-overflow") ? 32 : 0;
        for (const [selector, w] of Object.entries(widths)) if (shown(this, selector)) total += w;
        return total;
      },
    });
    try {
      run(next => {
        width = next;
        for (const callback of callbacks) callback([], undefined as unknown as ResizeObserver);
      });
    } finally {
      globalThis.ResizeObserver = originalObserver;
      if (originalClient) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClient);
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScroll);
    }
  }

  const displaced = (root: HTMLElement, selector: string) =>
    root.querySelector(selector)!.classList.contains("pte-bar-displaced");

  it("drops the page field before rows-per-page, and the summary after it", () => {
    withModelledWidth(setWidth => {
      const { root } = makeGrid();
      setWidth(1200);
      expect(displaced(root, ".pte-pagination-page-input-control")).toBe(false);
      expect(displaced(root, ".pte-pagination-row-summary")).toBe(false);
      // Full: 644. Without the page field: 504.
      setWidth(520);
      expect(displaced(root, ".pte-pagination-page-input-control")).toBe(true);
      expect(displaced(root, ".pte-pagination-size-control")).toBe(false);
      // Rows-per-page goes to the menu next (334 + the menu button)...
      setWidth(380);
      expect(displaced(root, ".pte-pagination-size-control")).toBe(true);
      expect(displaced(root, ".pte-pagination-row-summary")).toBe(false);
      // ...and the summary last.
      setWidth(260);
      expect(displaced(root, ".pte-pagination-row-summary")).toBe(true);
      expect(displaced(root, ".pte-pagination-page-control")).toBe(false);
      setWidth(1200);
      expect(displaced(root, ".pte-pagination-page-input-control")).toBe(false);
      expect(displaced(root, ".pte-pagination-row-summary")).toBe(false);
    });
  });

  it("keeps the page field when it is the only way to pick a page", () => {
    withModelledWidth(setWidth => {
      const controls: PaginationControl[] = ["previousPage", "pageInput", "nextPage"];
      const { root } = makeGrid({ paginationControls: { controls } });
      setWidth(100);
      expect(displaced(root, ".pte-pagination-page-input-control")).toBe(false);
    });
  });
});
