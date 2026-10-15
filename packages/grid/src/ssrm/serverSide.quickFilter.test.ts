import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import {
  IServerSideAggregationParams,
  IServerSideAggregationRequest,
  IServerSideGetRowsParams,
  IServerSideRequest,
} from "../interfaces/serverSide";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: i % 2 ? `Acme ${i}` : `Globex ${i}`, amount: i }));

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function makeCore(options: object = {}) {
  const requests: IServerSideRequest[] = [];
  const aggregateRequests: IServerSideAggregationRequest[] = [];
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    quickFilter: true,
    serverSideBlockSize: 50,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "amount", key: "amount", label: "Amount", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource({
    getRows: ({ request, success }: IServerSideGetRowsParams) => {
      requests.push(request);
      const qf = request.quickFilter;
      const rows = qf ? ROWS.filter(r => r.name.toLowerCase().includes(qf.text.toLowerCase())) : ROWS;
      success({ rows: rows.slice(request.startRow ?? 0, request.endRow ?? rows.length), totalRows: rows.length });
    },
    getAggregates: ({ request, success }: IServerSideAggregationParams) => {
      aggregateRequests.push(request);
      success({ values: { amount: 1 } });
    },
  });
  return { core, requests, aggregateRequests };
}

describe("server-side quick filter", () => {
  it("sends the quick filter on the rows request after setQuickFilter", async () => {
    const { core, requests } = makeCore();
    await flush();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(r => !("quickFilter" in r))).toBe(true);

    core.setQuickFilter("abc");
    await flush();
    expect(requests[requests.length - 1].quickFilter).toEqual({ text: "abc", mode: "multiTerm", caseSensitive: false });
    expect(core.getQuickFilterText()).toBe("abc");
  });

  it("a text or mode change resets the store and refetches exactly once", async () => {
    const { core, requests } = makeCore();
    await flush();

    let before = requests.length;
    core.setQuickFilter("acme");
    await flush();
    expect(requests.length - before).toBe(1);
    // The rows the server returned for the search are the view.
    expect(core.getRowModel().getViewTotalCount()).toBe(15);

    before = requests.length;
    core.setQuickFilter("acme", { matchMode: "substring" });
    await flush();
    expect(requests.length - before).toBe(1);
    expect(requests[requests.length - 1].quickFilter).toEqual({ text: "acme", mode: "substring", caseSensitive: false });

    // Same state again: nothing to refetch.
    before = requests.length;
    core.setQuickFilter("acme", { matchMode: "substring" });
    await flush();
    expect(requests.length).toBe(before);
  });

  it("clearing the search removes the field and refetches", async () => {
    const { core, requests } = makeCore();
    await flush();
    core.setQuickFilter("acme");
    await flush();
    const before = requests.length;
    core.setQuickFilter("");
    await flush();
    expect(requests.length - before).toBe(1);
    expect("quickFilter" in requests[requests.length - 1]).toBe(false);
    expect(core.getRowModel().getViewTotalCount()).toBe(30);
  });

  it("whitespace-only text is no search", async () => {
    const { core, requests } = makeCore();
    await flush();
    core.setQuickFilter("   ");
    await flush();
    expect("quickFilter" in requests[requests.length - 1]).toBe(false);
  });

  it("emits filterChanged with source quickFilter", async () => {
    const { core } = makeCore();
    await flush();
    const sources: string[] = [];
    core.on("filterChanged", ev => sources.push(ev.source));
    core.setQuickFilter("acme");
    expect(sources).toEqual(["quickFilter"]);
  });

  it("whole-dataset aggregation requests carry the quick filter too", async () => {
    const { core, aggregateRequests } = makeCore({ pagination: true, pageSize: 10 });
    await flush();
    core.setAggregateModel([{ key: "amount", type: AggregateType.SUM }]);
    core.setAggregateScope("all");
    await flush();
    core.setQuickFilter("acme");
    await flush();
    const last = aggregateRequests[aggregateRequests.length - 1];
    expect(last.quickFilter).toEqual({ text: "acme", mode: "multiTerm", caseSensitive: false });
  });

  it("a requested find behavior filters on the server instead, with one warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { core, requests } = makeCore({ quickFilter: { behavior: "find" } });
      await flush();
      core.setQuickFilter("acme");
      await flush();
      expect(core.getFindState().behavior).toBe("filter");
      expect(requests[requests.length - 1].quickFilter?.text).toBe("acme");
      expect(core.findNext()).toBeNull();
      expect(warn.mock.calls.filter(args => String(args[0]).includes("\"find\""))).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});
