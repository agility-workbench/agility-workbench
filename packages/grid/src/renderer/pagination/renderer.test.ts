// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { PaginationRenderer } from "./renderer";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(options: Record<string, unknown> = {}) {
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
