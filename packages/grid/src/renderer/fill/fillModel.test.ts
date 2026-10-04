import { describe, expect, it } from "vitest";
import {
  adjacentBlockEnd,
  computeFillTarget,
  copyAt,
  fillValueAt,
  resolveLineMode,
  seriesAt,
  seriesKind,
  textSeries,
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


describe("textSeries", () => {
  it("reads a counter from the last run of digits, keeping prefix, suffix, and width", () => {
    expect(textSeries(["Item 1"])).toEqual({ kind: "counter", prefix: "Item ", suffix: "", width: 1, numbers: [1] });
    expect(textSeries(["Week 1 of 09"])).toEqual({ kind: "counter", prefix: "Week 1 of ", suffix: "", width: 2, numbers: [9] });
    expect(textSeries(["Q1 (draft)", "Q2 (draft)"]))
      .toMatchObject({ kind: "counter", prefix: "Q", suffix: " (draft)", numbers: [1, 2] });
  });

  it("needs one shape across the line, and text that is only a number is not a counter", () => {
    expect(textSeries(["Item 1", "Part 2"])).toBeNull();
    expect(textSeries(["Item 1", "Item 2 (old)"])).toBeNull();
    expect(textSeries(["12"])).toBeNull();
    expect(textSeries(["-5", "-6"])).toBeNull();
    expect(textSeries(["alpha"])).toBeNull();
    expect(textSeries(["Item 1", 2])).toBeNull();
    expect(textSeries([])).toBeNull();
    expect(textSeries(["2026-05-06 09:30"])).toBeNull();
  });

  it("reads YYYY-MM-DD text as dates", () => {
    expect(textSeries(["2026-05-06"])).toEqual({ kind: "isoDate", dates: [new Date(2026, 4, 6)] });
    expect(textSeries(["2026-05-06", "2026-02-30"])).toBeNull();
  });

  it("recognises weekday and month names, long or short, in any casing, unwrapping the cycle", () => {
    expect(textSeries(["Monday"])).toMatchObject({ kind: "cycle", indices: [1] });
    expect(textSeries(["sat", "SUN"])).toMatchObject({ kind: "cycle", indices: [6, 7] });
    expect(textSeries(["January", "March"])).toMatchObject({ kind: "cycle", indices: [0, 2] });
    expect(textSeries(["Jan", "February"])).toBeNull();
    expect(seriesKind(["Mon", "Tue"])).toBe("text");
  });

  it("cycles quarters out of the box, and application lists before the built-ins and the counter", () => {
    expect(textSeries(["Q1"])).toMatchObject({ kind: "cycle", names: ["Q1", "Q2", "Q3", "Q4"], indices: [0] });
    expect(textSeries(["qtr 4", "Qtr 1"])).toMatchObject({ kind: "cycle", indices: [3, 4] });
    expect(textSeries(["Quarter 2"])).toMatchObject({ kind: "cycle", names: ["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"] });

    const lists = [["Low", "Medium", "High"], ["Mon", "Wed", "Fri"], ["Item 1", "Item 2", "Item 9"], ["lonely"], ["", "blank"]];
    expect(textSeries(["low"], lists)).toMatchObject({ kind: "cycle", names: lists[0], indices: [0] });
    // The app's weekday list wins over the built-in one, so Mon, Wed are neighbours.
    expect(textSeries(["Mon", "Wed"], lists)).toMatchObject({ kind: "cycle", names: lists[1], indices: [0, 1] });
    // A list beats the counter, so Item 1 cycles instead of counting.
    expect(textSeries(["Item 1"], lists)).toMatchObject({ kind: "cycle", names: lists[2] });
    // Lists that cannot cycle are ignored, and a line must sit on ONE list.
    expect(textSeries(["lonely"], lists)).toBeNull();
    expect(textSeries(["blank"], lists)).toBeNull();
    expect(textSeries(["Low", "Monday"], lists)).toBeNull();
    expect(seriesKind(["Low"], lists)).toBe("text");
    expect(seriesKind(["Low"])).toBeNull();
  });
});

describe("seriesAt with text", () => {
  const series = (values: unknown[], ...indices: number[]) => indices.map(i => seriesAt(values, i));

  it("counts a lone counter up by one, pads to its width, and continues backward", () => {
    expect(series(["Item 1"], 1, 2, 3)).toEqual(["Item 2", "Item 3", "Item 4"]);
    expect(series(["File 08"], 1, 2)).toEqual(["File 09", "File 10"]);
    expect(series(["Item 1"], -1, -2)).toEqual(["Item 0", "Item -1"]);
  });

  it("follows the step of two or more counters", () => {
    expect(series(["Item 1", "Item 3"], 2, 3)).toEqual(["Item 5", "Item 7"]);
    expect(series(["v10", "v20", "v30"], 3)).toEqual(["v40"]);
  });

  it("steps YYYY-MM-DD text by the day, across month ends, and keeps it text", () => {
    expect(series(["2026-05-31"], 1, 2)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(series(["2026-01-01", "2026-01-08"], 2, -1)).toEqual(["2026-01-15", "2025-12-25"]);
  });

  it("cycles weekdays and months, wrapping, in the first value's casing and form", () => {
    expect(series(["Saturday"], 1, 2)).toEqual(["Sunday", "Monday"]);
    expect(series(["Nov", "Dec"], 2, 3)).toEqual(["Jan", "Feb"]);
    expect(series(["MON"], 1)).toEqual(["TUE"]);
    expect(series(["monday", "wednesday"], 2, 3)).toEqual(["friday", "sunday"]);
    expect(series(["Fri", "Sat", "Sun", "Mon"], 4)).toEqual(["Tue"]);
    expect(series(["May"], 1)).toEqual(["June"]);
  });

  it("wraps quarters and application lists in the first value's casing, keeping the step", () => {
    expect(series(["Q1"], 1, 2, 3, 4)).toEqual(["Q2", "Q3", "Q4", "Q1"]);
    expect(series(["Quarter 4"], 1)).toEqual(["Quarter 1"]);
    expect(series(["qtr2", "qtr4"], 2)).toEqual(["qtr2"]);

    const lists = [["Low", "Medium", "High"]];
    const at = (values: unknown[], ...indices: number[]) => indices.map(i => seriesAt(values, i, lists));
    expect(at(["low"], 1, 2, 3)).toEqual(["medium", "high", "low"]);
    expect(at(["HIGH"], -1)).toEqual(["MEDIUM"]);
    // Low, High is one step backward on a three-entry cycle (the nearest turn), as Fri, Sun is
    // two forward on the week — and on three entries that lands where two forward would anyway.
    expect(at(["Low", "High"], 2, 3)).toEqual(["Medium", "Low"]);
    expect(resolveLineMode(["Low"], "auto", false, lists)).toBe("series");
    expect(resolveLineMode(["Low"], "auto", false)).toBe("copy");
    expect(fillValueAt(["Low"], 1, "series", lists)).toBe("Medium");
    expect(fillValueAt(["Low"], 1, "copy", lists)).toBe("Low");

    // Spelled as listed, the list's own spelling comes out; typed in another casing, that casing.
    const ladder = [["Analyst", "Associate", "Manager", "Senior", "Lead", "Director", "VP"]];
    expect([4, 5, 6].map(i => seriesAt(["Associate"], i, ladder))).toEqual(["Director", "VP", "Analyst"]);
    expect(seriesAt(["associate"], 5, ladder)).toBe("vp");
    expect(seriesAt(["ASSOCIATE"], 2, ladder)).toBe("SENIOR");
  });

  it("makes a lone text pattern a series, like a date, unless flipped", () => {
    expect(resolveLineMode(["Item 1"], "auto", false)).toBe("series");
    expect(resolveLineMode(["Item 1"], "auto", true)).toBe("copy");
    expect(resolveLineMode(["Tue"], "auto", false)).toBe("series");
    expect(resolveLineMode(["alpha"], "auto", false)).toBe("copy");
    expect(resolveLineMode(["alpha"], "auto", true)).toBe("copy");
    expect(resolveLineMode(["Item 1"], "copy", false)).toBe("copy");
  });
});
