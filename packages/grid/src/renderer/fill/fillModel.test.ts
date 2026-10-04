import { describe, expect, it } from "vitest";
import {
  adjacentBlockEnd,
  computeFillTarget,
  copyAt,
  fillValueAt,
  resolveLineMode,
  seriesAt,
  seriesKind,
  unionRect,
} from "./fillModel";

const source = { rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 };

describe("computeFillTarget", () => {
  it("fills down to the pointer row, keeping the source columns", () => {
    expect(computeFillTarget(source, { row: 6, col: 1 }, "xy")).toEqual({
      axis: "down", rect: { rowStart: 4, rowEnd: 6, colStart: 1, colEnd: 2 },
    });
  });

  it("fills up, right, and left", () => {
    expect(computeFillTarget(source, { row: 0, col: 2 }, "xy")).toEqual({
      axis: "up", rect: { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 2 },
    });
    expect(computeFillTarget(source, { row: 3, col: 5 }, "xy")).toEqual({
      axis: "right", rect: { rowStart: 2, rowEnd: 3, colStart: 3, colEnd: 5 },
    });
    expect(computeFillTarget(source, { row: 2, col: 0 }, "xy")).toEqual({
      axis: "left", rect: { rowStart: 2, rowEnd: 3, colStart: 0, colEnd: 0 },
    });
  });

  it("picks the axis the pointer travelled further along, rows winning a tie", () => {
    // 3 rows down, 1 column right → down.
    expect(computeFillTarget(source, { row: 6, col: 3 }, "xy")?.axis).toBe("down");
    // 1 row down, 3 columns right → right.
    expect(computeFillTarget(source, { row: 4, col: 5 }, "xy")?.axis).toBe("right");
    // 2 and 2 → down.
    expect(computeFillTarget(source, { row: 5, col: 4 }, "xy")?.axis).toBe("down");
  });

  it("targets nothing from inside the source", () => {
    expect(computeFillTarget(source, { row: 2, col: 1 }, "xy")).toBeNull();
    expect(computeFillTarget(source, { row: 3, col: 2 }, "xy")).toBeNull();
  });

  it("honours a single-axis direction", () => {
    expect(computeFillTarget(source, { row: 6, col: 1 }, "x")).toBeNull();
    expect(computeFillTarget(source, { row: 3, col: 5 }, "y")).toBeNull();
    // Off on both axes with the dominant one forbidden: the other axis still fills.
    expect(computeFillTarget(source, { row: 6, col: 3 }, "x")?.axis).toBe("right");
    expect(computeFillTarget(source, { row: 4, col: 5 }, "y")?.axis).toBe("down");
  });
});

describe("unionRect", () => {
  it("covers both rectangles", () => {
    expect(unionRect(source, { rowStart: 4, rowEnd: 6, colStart: 1, colEnd: 2 }))
      .toEqual({ rowStart: 2, rowEnd: 6, colStart: 1, colEnd: 2 });
  });
});

describe("seriesKind", () => {
  it("recognises all-number and all-date lines", () => {
    expect(seriesKind([1, 2.5, -3])).toBe("number");
    expect(seriesKind([new Date(2026, 0, 1), new Date(2026, 0, 2)])).toBe("date");
  });

  it("refuses mixed, blank, textual, or invalid lines", () => {
    expect(seriesKind([1, "2"])).toBeNull();
    expect(seriesKind([1, null])).toBeNull();
    expect(seriesKind(["a", "b"])).toBeNull();
    expect(seriesKind([1, NaN])).toBeNull();
    expect(seriesKind([new Date("nope")])).toBeNull();
    expect(seriesKind([])).toBeNull();
  });
});

describe("resolveLineMode", () => {
  it("auto: two or more numbers extend, a lone number repeats, dates always step", () => {
    expect(resolveLineMode([1, 2], "auto", false)).toBe("series");
    expect(resolveLineMode([7], "auto", false)).toBe("copy");
    expect(resolveLineMode([new Date(2026, 0, 1)], "auto", false)).toBe("series");
    expect(resolveLineMode(["a"], "auto", false)).toBe("copy");
  });

  it("the modifier flips the choice wherever a series is possible", () => {
    expect(resolveLineMode([1, 2], "auto", true)).toBe("copy");
    expect(resolveLineMode([7], "auto", true)).toBe("series");
    expect(resolveLineMode([new Date(2026, 0, 1)], "auto", true)).toBe("copy");
    // Text has no series to flip to.
    expect(resolveLineMode(["a"], "auto", true)).toBe("copy");
  });

  it("copy mode ignores both the values and the modifier", () => {
    expect(resolveLineMode([1, 2], "copy", false)).toBe("copy");
    expect(resolveLineMode([1, 2], "copy", true)).toBe("copy");
  });
});

describe("copyAt", () => {
  it("repeats the pattern forward and continues it backward", () => {
    const abc = ["A", "B", "C"];
    expect([3, 4, 5, 6].map(i => copyAt(abc, i))).toEqual(["A", "B", "C", "A"]);
    expect([-1, -2, -3, -4].map(i => copyAt(abc, i))).toEqual(["C", "B", "A", "C"]);
  });
});

describe("seriesAt", () => {
  it("continues an arithmetic progression exactly, in both directions", () => {
    expect([2, 3, 4].map(i => seriesAt([10, 20], i))).toEqual([30, 40, 50]);
    expect([-1, -2].map(i => seriesAt([10, 20], i))).toEqual([0, -10]);
  });

  it("fits a trend through a non-linear run", () => {
    // Least squares through 1, 2, 6 → slope 2.5, intercept 0.5: 8, 10.5, 13 (as spreadsheets do).
    expect([3, 4, 5].map(i => seriesAt([1, 2, 6], i))).toEqual([8, 10.5, 13]);
  });

  it("removes floating-point crumbs without quantizing the trend", () => {
    expect(seriesAt([0.1, 0.2], 2)).toBe(0.3);
    expect(seriesAt([1.25, 1.5], 2)).toBe(1.75);
    expect(seriesAt([1e-7, 2e-7], 2)).toBe(3e-7);
    expect(seriesAt([1, 2.5], 2)).toBe(4);
  });

  it("a lone number counts by one", () => {
    expect([1, 2, 3].map(i => seriesAt([5], i))).toEqual([6, 7, 8]);
    expect(seriesAt([5], -1)).toBe(4);
  });

  it("a lone date steps a calendar day; a run of dates continues its day step across month ends", () => {
    expect(seriesAt([new Date(2026, 0, 31, 9, 30)], 1)).toEqual(new Date(2026, 1, 1, 9, 30));
    const weekly = [new Date(2026, 2, 2), new Date(2026, 2, 9)];
    expect(seriesAt(weekly, 2)).toEqual(new Date(2026, 2, 16));
    expect(seriesAt(weekly, -1)).toEqual(new Date(2026, 1, 23));
  });

  it("dates at different times of day advance in milliseconds", () => {
    const a = new Date(2026, 0, 1, 8, 0);
    const b = new Date(2026, 0, 1, 9, 30);
    expect(seriesAt([a, b], 2)).toEqual(new Date(2026, 0, 1, 11, 0));
  });
});

describe("fillValueAt", () => {
  it("dispatches on the line mode", () => {
    expect(fillValueAt([1, 2], 2, "copy")).toBe(1);
    expect(fillValueAt([1, 2], 2, "series")).toBe(3);
  });
});

describe("adjacentBlockEnd", () => {
  const src = { rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 2 };
  // Column 1 holds data in rows 0-5, column 3 in rows 0-3 and 6-7; everything else is blank.
  const data: Record<number, number[]> = { 1: [0, 1, 2, 3, 4, 5], 3: [0, 1, 2, 3, 6, 7] };
  const hasData = (row: number, col: number) => (data[col] ?? []).includes(row);

  it("follows the run in the column to the left, stopping at its first blank", () => {
    expect(adjacentBlockEnd(src, [1, 3], 10, hasData)).toBe(5);
  });

  it("falls back to the column on the right when the left one is blank below the source", () => {
    // Rows 0-5 selected: column 1 is blank in row 6, column 3 runs 6-7.
    expect(adjacentBlockEnd({ ...src, rowEnd: 5 }, [1, 3], 10, hasData)).toBe(7);
  });

  it("runs to the last row when the guide never goes blank", () => {
    expect(adjacentBlockEnd(src, [1], 5, hasData)).toBe(4);
  });

  it("is null with no guide, with blank guides below the source, or on the last row", () => {
    expect(adjacentBlockEnd(src, [], 10, hasData)).toBeNull();
    expect(adjacentBlockEnd({ ...src, rowEnd: 7 }, [1, 3], 10, hasData)).toBeNull();
    expect(adjacentBlockEnd({ ...src, rowEnd: 9 }, [1, 3], 10, hasData)).toBeNull();
  });
});
