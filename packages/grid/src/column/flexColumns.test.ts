import { describe, expect, it } from "vitest";
import { distributeFlexWidths, normalizeFlex } from "./flexColumns";

const item = (flex: number, min = 0, max = Infinity) => ({ flex, min, max });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("distributeFlexWidths", () => {
  it("splits by flex weight", () => {
    expect(distributeFlexWidths(600, [item(1), item(2), item(3)])).toEqual([100, 200, 300]);
  });

  it("hands the rounding remainder out so the widths sum to the space exactly", () => {
    const widths = distributeFlexWidths(1000, [item(1), item(1), item(1)]);
    expect(sum(widths)).toBe(1000);
    expect(widths).toEqual([334, 333, 333]);
    for (const available of [1, 7, 99, 101, 997, 1003]) {
      const ws = distributeFlexWidths(available, [item(1), item(2), item(1.5), item(0.25)]);
      expect(sum(ws)).toBe(available);
      expect(ws.every(Number.isInteger)).toBe(true);
    }
  });

  it("is deterministic: the same inputs give the same widths", () => {
    const a = distributeFlexWidths(811, [item(1), item(1), item(1), item(1)]);
    const b = distributeFlexWidths(811, [item(1), item(1), item(1), item(1)]);
    expect(a).toEqual(b);
  });

  it("floors fractional space", () => {
    expect(sum(distributeFlexWidths(300.7, [item(1), item(1)]))).toBe(300);
  });

  it("freezes a column at its max and re-splits the rest", () => {
    expect(distributeFlexWidths(600, [item(1, 0, 100), item(1), item(1)])).toEqual([100, 250, 250]);
  });

  it("freezes a column at its min and re-splits the rest", () => {
    expect(distributeFlexWidths(300, [item(1, 200), item(1), item(1)])).toEqual([200, 50, 50]);
  });

  it("resolves mixed violations by the larger total violation first", () => {
    // Shares of 100 each: A over its max by 50, B under its min by 100 — the min side wins first,
    // then A still fits its max in the re-split.
    expect(distributeFlexWidths(300, [item(1, 0, 50), item(1, 200), item(1)])).toEqual([50, 200, 50]);
  });

  it("never goes below a min: the result overflows the space", () => {
    expect(distributeFlexWidths(100, [item(1, 75), item(1, 75)])).toEqual([75, 75]);
  });

  it("falls short of the space when every column sits at its max", () => {
    expect(distributeFlexWidths(1000, [item(1, 0, 100), item(2, 0, 200)])).toEqual([100, 200]);
  });

  it("treats non-positive space as nothing to share (mins still hold)", () => {
    expect(distributeFlexWidths(-50, [item(1, 75), item(1)])).toEqual([75, 0]);
    expect(distributeFlexWidths(Number.NaN, [item(1)])).toEqual([0]);
  });

  it("keeps rounding inside integer bounds", () => {
    const ws = distributeFlexWidths(301, [item(1, 0, 100.5), item(1, 0, 100.5), item(1, 0, 100.5)]);
    expect(ws.every(w => w <= 100)).toBe(true);
    expect(ws.every(w => w >= 100)).toBe(true);
  });

  it("returns nothing for no items", () => {
    expect(distributeFlexWidths(500, [])).toEqual([]);
  });
});

describe("normalizeFlex", () => {
  it("keeps positive finite numbers only", () => {
    expect(normalizeFlex(1)).toBe(1);
    expect(normalizeFlex(0.5)).toBe(0.5);
    expect(normalizeFlex(0)).toBeUndefined();
    expect(normalizeFlex(-1)).toBeUndefined();
    expect(normalizeFlex(Infinity)).toBeUndefined();
    expect(normalizeFlex(Number.NaN)).toBeUndefined();
    expect(normalizeFlex("1")).toBeUndefined();
    expect(normalizeFlex(null)).toBeUndefined();
  });
});
