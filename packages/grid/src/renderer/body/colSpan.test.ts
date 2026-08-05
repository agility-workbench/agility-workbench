import { describe, expect, it } from "vitest";
import { normalizeSpan, resolveColSpan } from "./colSpan";

describe("normalizeSpan", () => {
  it("collapses null/undefined/non-finite to 1", () => {
    expect(normalizeSpan(undefined)).toBe(1);
    expect(normalizeSpan(null)).toBe(1);
    expect(normalizeSpan(NaN)).toBe(1);
    expect(normalizeSpan(Infinity)).toBe(1);
  });

  it("collapses values <= 1 (including zero and negatives) to 1", () => {
    expect(normalizeSpan(0)).toBe(1);
    expect(normalizeSpan(1)).toBe(1);
    expect(normalizeSpan(-3)).toBe(1);
  });

  it("floors fractional spans", () => {
    expect(normalizeSpan(2.9)).toBe(2);
    expect(normalizeSpan(3.1)).toBe(3);
  });

  it("passes through integer spans", () => {
    expect(normalizeSpan(2)).toBe(2);
    expect(normalizeSpan(5)).toBe(5);
  });
});

describe("resolveColSpan", () => {
  it("returns 1 when no span requested", () => {
    expect(resolveColSpan(undefined, 5)).toBe(1);
    expect(resolveColSpan(1, 5)).toBe(1);
  });

  it("clamps the span to the leaves remaining in the section (no pinned crossing)", () => {
    // 3 columns remain from this cell; asking for 4 clamps to 3.
    expect(resolveColSpan(4, 3)).toBe(3);
    // Asking for exactly the remaining count is allowed.
    expect(resolveColSpan(3, 3)).toBe(3);
    // A huge span on the last column of a section collapses to 1.
    expect(resolveColSpan(10, 1)).toBe(1);
  });

  it("returns the requested span when it fits", () => {
    expect(resolveColSpan(2, 5)).toBe(2);
  });

  it("treats a non-positive remaining count as at least 1", () => {
    expect(resolveColSpan(3, 0)).toBe(1);
  });
});
