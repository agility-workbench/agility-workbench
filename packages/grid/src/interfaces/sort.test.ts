import { describe, it, expect } from "vitest";
import { nextSortDir, DEFAULT_SORTING_ORDER } from "./sort";

describe("nextSortDir", () => {
  it("cycles asc → desc → none → asc with the default order", () => {
    const o = DEFAULT_SORTING_ORDER;
    expect(nextSortDir(null, o)).toBe("asc");
    expect(nextSortDir("asc", o)).toBe("desc");
    expect(nextSortDir("desc", o)).toBe(null);
  });

  it("supports a descending-first order", () => {
    const o: ("asc" | "desc" | null)[] = ["desc", "asc", null];
    expect(nextSortDir(null, o)).toBe("desc");
    expect(nextSortDir("desc", o)).toBe("asc");
    expect(nextSortDir("asc", o)).toBe(null);
  });

  it("supports a two-state order with no unsorted state (always sorted)", () => {
    const o: ("asc" | "desc" | null)[] = ["asc", "desc"];
    expect(nextSortDir(null, o)).toBe("asc");
    expect(nextSortDir("asc", o)).toBe("desc");
    expect(nextSortDir("desc", o)).toBe("asc"); // wraps, never lands on null
  });

  it("starts from the first entry when current isn't in the cycle", () => {
    // e.g. the configured order changed and the column is mid-cycle on a now-absent direction
    expect(nextSortDir("asc", ["desc", null])).toBe("desc");
  });

  it("falls back to the default order when order is empty or missing", () => {
    expect(nextSortDir(null, [])).toBe("asc");
    // A missing order (e.g. neither column nor grid specified one) still advances via the default.
    expect(nextSortDir("asc", undefined as never)).toBe("desc");
  });
});
