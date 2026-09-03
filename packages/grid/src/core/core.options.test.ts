/**
 * Resolution of the Tier-2 configurability options added to GridOptions:
 *  - minResizeWidth / maxColumnWidth (promoted from hardcoded internals)
 *  - loadingMessage / noRowsMessage (overlay text)
 *  - filterDebounceMs / cellFlashDuration / cellFadeDuration (timing defaults)
 * Verifies defaults, explicit overrides, and clamping of invalid values.
 */
import { describe, it, expect, vi } from "vitest";
import { GridCore } from "./core";
import { InternalGridOptions, GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// The resolved options are InternalGridOptions at runtime; getOptions() is typed as GridOptions.
function resolved(options: GridOptions = {}): InternalGridOptions {
  return new GridCore(measurer, options).getOptions() as InternalGridOptions;
}

describe("Tier-2 option resolution", () => {
  it("applies documented defaults when omitted", () => {
    const o = resolved();
    expect(o.minResizeWidth).toBe(75);
    expect(o.maxColumnWidth).toBe(420);
    expect(o.loadingMessage).toBe("Loading data...");
    expect(o.noRowsMessage).toBe("No rows to show");
    expect(o.filterDebounceMs).toBe(300);
    expect(o.cellFlashDuration).toBe(500);
    expect(o.cellFadeDuration).toBe(1000);
    expect(o.toolbar).toEqual({});
  });

  it("honors explicit overrides", () => {
    const o = resolved({
      minResizeWidth: 40,
      maxColumnWidth: 600,
      loadingMessage: "Fetching…",
      noRowsMessage: "Nothing here",
      filterDebounceMs: 0,
      cellFlashDuration: 250,
      cellFadeDuration: 750,
      toolbar: { grouping: true, quickFilter: true, export: true },
    });
    expect(o.minResizeWidth).toBe(40);
    expect(o.maxColumnWidth).toBe(600);
    expect(o.loadingMessage).toBe("Fetching…");
    expect(o.noRowsMessage).toBe("Nothing here");
    expect(o.filterDebounceMs).toBe(0); // 0 is a valid "no debounce" value, not replaced by default
    expect(o.cellFlashDuration).toBe(250);
    expect(o.cellFadeDuration).toBe(750);
    expect(o.toolbar).toEqual({ grouping: true, quickFilter: true, export: true });
  });

  it("clamps invalid (non-positive / negative) values back to defaults", () => {
    const o = resolved({
      minResizeWidth: 0,        // must be > 0
      maxColumnWidth: -10,      // must be > 0
      filterDebounceMs: -5,     // must be >= 0
      cellFlashDuration: -1,    // must be >= 0
      cellFadeDuration: -1,
    });
    expect(o.minResizeWidth).toBe(75);
    expect(o.maxColumnWidth).toBe(420);
    expect(o.filterDebounceMs).toBe(300);
    expect(o.cellFlashDuration).toBe(500);
    expect(o.cellFadeDuration).toBe(1000);
  });
});

describe("resetPageOn resolution", () => {
  it("defaults to [] — no model change resets the page", () => {
    expect(resolved().resetPageOn).toEqual([]);
  });

  it("honors an explicit trigger list", () => {
    expect(resolved({ resetPageOn: ["filter", "sort"] }).resetPageOn).toEqual(["filter", "sort"]);
  });
});

describe("pageSize / pageSizes resolution", () => {
  it("keeps matching defaults untouched", () => {
    const o = resolved();
    expect(o.pageSize).toBe(100);
    expect(o.pageSizes).toEqual([25, 50, 100]);
  });

  it("auto-includes a pageSize missing from the default pageSizes (no warning)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const o = resolved({ pageSize: 75 });
      expect(o.pageSize).toBe(75);
      expect(o.pageSizes).toEqual([25, 50, 75, 100]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("warns and auto-includes when an explicit pageSizes list omits the pageSize", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const o = resolved({ pageSize: 75, pageSizes: [10, 20] });
      expect(o.pageSize).toBe(75);
      expect(o.pageSizes).toEqual([10, 20, 75]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("normalizes pageSizes: sorted, invalid entries dropped, empty list replaced", () => {
    expect(resolved({ pageSizes: [50, 25, 100] }).pageSizes).toEqual([25, 50, 100]);
    expect(resolved({ pageSize: 25, pageSizes: [25, -1, 0, NaN] }).pageSizes).toEqual([25]);
    expect(resolved({ pageSizes: [] }).pageSizes).toEqual([25, 50, 100]);
  });
});

describe("paginationControls resolution", () => {
  it("preserves the historical select and control order by default", () => {
    expect(resolved().paginationControls).toEqual({
      pageSelection: "select",
      showPageLabel: true,
      responsive: "collapse",
      controls: ["pageSize", "firstPage", "previousPage", "pageSelector", "nextPage", "lastPage"],
      maxPageButtons: 7,
    });
  });

  it("honors custom order, removes duplicates, and clamps the button count", () => {
    expect(resolved({
      paginationControls: {
        pageSelection: "buttons",
        showPageLabel: false,
        controls: ["nextPage", "pageSelector", "nextPage", "pageSize"],
        maxPageButtons: 1,
      },
    }).paginationControls).toEqual({
      pageSelection: "buttons",
      responsive: "collapse",
      showPageLabel: false,
      controls: ["nextPage", "pageSelector", "pageSize"],
      maxPageButtons: 3,
    });
  });
});
