import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: Record<string, any> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", quickFilter: true, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "Acme Corp", region: "West" },
    { id: "2", name: "Acme Labs", region: "East" },
    { id: "3", name: "Globex", region: "West" },
    { id: "4", name: "Initech", region: "South" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
  ]);
  return core;
}

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) out.push(core.getRowIdAtViewIndex(i)!);
  return out;
}

describe("GridCore quick filter", () => {
  let core: GridCore;
  beforeEach(() => { core = makeGrid(); });

  it("filters rows across all columns via the dispatch path", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(viewIds(core).sort()).toEqual(["1", "2"]);
    expect(core.getQuickFilterText()).toBe("acme");
  });

  it("clears back to the full set when text is emptied", () => {
    core.dispatch({ type: "quickFilterSet", text: "globex" });
    expect(viewIds(core)).toEqual(["3"]);
    core.dispatch({ type: "quickFilterSet", text: "" });
    expect(viewIds(core).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("multiTerm requires all tokens (default match mode)", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme west" });
    expect(viewIds(core)).toEqual(["1"]);
  });

  it("respects substring match mode passed on the action", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme west", matchMode: "substring" });
    expect(viewIds(core)).toEqual([]);
  });

  it("composes (ANDs) with an active column filter", () => {
    const regionCol = core.getColumnModel().getByColId("region")!;
    core.setFilterModel([{ col: regionCol, key: "region", filters: [{ type: "contains" as any, values: ["West"] }] }]);
    expect(viewIds(core).sort()).toEqual(["1", "3"]);
    // Now narrow further to just Acme within the West subset.
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(viewIds(core)).toEqual(["1"]);
  });

  it("is a no-op for the server-side row model", () => {
    const ss = new GridCore(measurer, { rowIdKey: "id", rowModelType: "serverSide", quickFilter: true });
    ss.dispatch({ type: "quickFilterSet", text: "acme" });
    // Server-side ignores quick filter; the text is not recorded.
    expect(ss.getQuickFilterText()).toBe("");
  });

  it("resets to the first page when the search changes", () => {
    const paged = makeGrid({ pagination: true, pageSize: 2 });
    // Move to page 2 first (pageIndex is 0-based).
    paged.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    paged.dispatch({ type: "quickFilterSet", text: "acme" });
    // After filtering to 2 rows with pageSize 2, both are on page 1.
    expect(viewIds(paged).sort()).toEqual(["1", "2"]);
  });
});
