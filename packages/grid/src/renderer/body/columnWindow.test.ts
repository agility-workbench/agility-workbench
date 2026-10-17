import { describe, expect, it } from "vitest";
import { columnRuns, computeColumnWindow, renderedPosition, sameColumns } from "./columnWindow";

const widths = (n: number, w = 100) => Array.from({ length: n }, () => w);
const base = { scrollStart: 0, clientWidth: 600, overscan: 2, enabled: true, hasColSpan: false };

describe("computeColumnWindow", () => {
  it("renders the columns that intersect the viewport plus the overscan on each side", () => {
    const win = computeColumnWindow({ ...base, widths: widths(50), scrollStart: 1000 });
    // Visible: col 10 (1000..1100) through col 15 (1500..1600); overscan 2 each side.
    expect(win.start).toBe(8);
    expect(win.end).toBe(18);
    expect(win.offsetPx).toBe(800);
    expect(win.cols).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("clamps the overscan at both ends", () => {
    const head = computeColumnWindow({ ...base, widths: widths(50) });
    expect([head.start, head.end, head.offsetPx]).toEqual([0, 8, 0]);
    const tail = computeColumnWindow({ ...base, widths: widths(50), scrollStart: 4400 });
    expect([tail.start, tail.end]).toEqual([42, 50]);
  });

  it("treats a column ending exactly at the viewport start as out of view", () => {
    const win = computeColumnWindow({ ...base, widths: widths(50), scrollStart: 1000, overscan: 0 });
    expect(win.start).toBe(10);
    expect(win.end).toBe(16);
  });

  it("handles uneven widths", () => {
    const win = computeColumnWindow({ ...base, widths: [50, 300, 40, 40, 500, 60], clientWidth: 100, scrollStart: 340, overscan: 0 });
    // 340..440 covers col 1 (50..350), col 2 (350..390), col 3 (390..430), col 4 (430..930).
    expect([win.start, win.end, win.offsetPx]).toEqual([1, 5, 50]);
  });

  it("renders everything while unmeasured, disabled, or when a column spans", () => {
    for (const input of [
      { ...base, clientWidth: 0 },
      { ...base, enabled: false },
      { ...base, hasColSpan: true },
    ]) {
      const win = computeColumnWindow({ ...input, widths: widths(30), scrollStart: 900 });
      expect([win.start, win.end, win.offsetPx, win.cols.length]).toEqual([0, 30, 0, 30]);
    }
  });

  it("shows the tail when the offset is past the content", () => {
    const win = computeColumnWindow({ ...base, widths: widths(10), scrollStart: 5000, overscan: 1 });
    expect([win.start, win.end]).toEqual([8, 10]);
  });

  it("returns an empty window for no columns", () => {
    expect(computeColumnWindow({ ...base, widths: [] }).cols).toEqual([]);
  });

  it("adds kept columns outside the range, in order, and ignores ones inside it or out of bounds", () => {
    const win = computeColumnWindow({ ...base, widths: widths(50), scrollStart: 1000, keep: [2, 12, 40, 99, -1] });
    expect(win.cols).toEqual([2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 40]);
    expect([win.start, win.end]).toEqual([8, 18]);
  });
});

describe("columnRuns", () => {
  it("gives one run with the leading offset for a contiguous window", () => {
    expect(columnRuns(widths(20), [5, 6, 7])).toEqual([{ gapPx: 500, from: 0, to: 3 }]);
  });

  it("splits around a kept column with the gap between the runs", () => {
    expect(columnRuns(widths(50), [2, 8, 9, 10, 40])).toEqual([
      { gapPx: 200, from: 0, to: 1 },
      { gapPx: 500, from: 1, to: 4 },
      { gapPx: 2900, from: 4, to: 5 },
    ]);
  });

  it("has no runs for no columns", () => {
    expect(columnRuns(widths(5), [])).toEqual([]);
  });
});

describe("renderedPosition / sameColumns", () => {
  it("finds a column in a contiguous or split window", () => {
    expect(renderedPosition([4, 5, 6], 5)).toBe(1);
    expect(renderedPosition([4, 5, 6], 7)).toBe(-1);
    expect(renderedPosition([1, 8, 9, 30], 30)).toBe(3);
    expect(renderedPosition([1, 8, 9, 30], 10)).toBe(-1);
    expect(renderedPosition([], 0)).toBe(-1);
  });

  it("compares windows by value", () => {
    expect(sameColumns([1, 2], [1, 2])).toBe(true);
    expect(sameColumns([1, 2], [1, 3])).toBe(false);
    expect(sameColumns([1], [1, 2])).toBe(false);
  });
});
