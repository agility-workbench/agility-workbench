// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { IServerSideDataSource } from "../../interfaces/serverSide";
import { PaginationRenderer } from "./renderer";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const DATA = Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), name: `Row ${i + 1}` }));

// Serves blocks without totalRows, so the total stays provisional until an empty block pins it.
const openEndedSource: IServerSideDataSource = {
  getRows: ({ request, success }) => {
    const start = request.startRow ?? 0;
    const end = request.endRow ?? DATA.length;
    success({ rows: DATA.slice(start, end) });
  },
};

const flush = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    pagination: true,
    pageSize: 2,
    serverSideBlockSize: 2,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  ]);
  core.setServerSideDataSource(openEndedSource);
  const renderer = new PaginationRenderer({
    core,
    root: document.createElement("div"),
    resetScrollPosition: () => {},
    setAggregateScope: () => {},
  });
  renderer.buildControls();
  return { core, renderer };
}

describe("pagination controls with a provisional total", () => {
  it("renders a '+' page count, the tooltip, and the approx class while unknown", async () => {
    const { core, renderer } = makeGrid();
    await flush();
    renderer.updateControls();

    expect(core.getPaginationInfo().totalRowCountKnown).toBe(false);
    const selected = renderer.pageSelect.options[renderer.pageSelect.selectedIndex];
    expect(selected.textContent).toBe("1 of 2+");
    expect(renderer.pageSelect.title).toBe("More rows may exist on the server; the total updates as they load");
    expect(renderer.pageSelect.closest(".pte-pagination-approx")).not.toBeNull();
    // There may be more pages: "next" stays enabled even on the last known page's predecessor
    // logic; "last" jumps to the last known page so it is enabled off the frontier.
    expect(renderer.nextPageBtn.disabled).toBe(false);
  });

  it("keeps 'next' enabled on the frontier page and settles once the end pins", async () => {
    const { core, renderer } = makeGrid();
    await flush();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();
    renderer.updateControls();
    // On the last known page with a provisional total, next must remain clickable.
    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(renderer.nextPageBtn.disabled).toBe(false);

    // Walk the frontier to the true end: 6 rows / pageSize 2 → 3 pages, then one probe overshoot
    // that snaps back and pins the total.
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 2, pageSize: 2 });
    await flush();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 3, pageSize: 2 });
    await flush();
    renderer.updateControls();

    expect(core.getPaginationInfo()).toMatchObject({ pageIndex: 2, totalPageCount: 3, totalRowCountKnown: true });
    const selected = renderer.pageSelect.options[renderer.pageSelect.selectedIndex];
    expect(selected.textContent).toBe("3 of 3");
    expect(renderer.pageSelect.title).toBe("");
    expect(renderer.pageSelect.closest(".pte-pagination-approx")).toBeNull();
    expect(renderer.nextPageBtn.disabled).toBe(true);
    expect(renderer.lastPageBtn.disabled).toBe(true);
  });

  it("honors a custom paginationUnknownTotalTooltip", async () => {
    const { renderer } = makeGrid({ paginationUnknownTotalTooltip: "Totale sconosciuto" });
    await flush();
    renderer.updateControls();
    expect(renderer.pageSelect.title).toBe("Totale sconosciuto");
  });

  it("announces provisional totals in numbered-button mode", async () => {
    const { renderer } = makeGrid({
      paginationControls: { pageSelection: "buttons", maxPageButtons: 5 },
    });
    await flush();
    renderer.updateControls();

    expect(renderer.pageButtonsContainer.title)
      .toBe("More rows may exist on the server; the total updates as they load");
    expect(renderer.pageButtonsContainer.getAttribute("aria-label"))
      .toContain("Page 1 of at least 2");
    expect(renderer.pageButtonsContainer.closest(".pte-pagination-approx")).not.toBeNull();
    expect(renderer.nextPageBtn.disabled).toBe(false);
  });
});
