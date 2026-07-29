/**
 * Resolution of the Tier-2 configurability options added to GridOptions:
 *  - minResizeWidth / maxColumnWidth (promoted from hardcoded internals)
 *  - loadingMessage / noRowsMessage (overlay text)
 *  - filterDebounceMs / cellFlashDuration / cellFadeDuration (timing defaults)
 * Verifies defaults, explicit overrides, and clamping of invalid values.
 */
import { describe, it, expect } from "vitest";
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
