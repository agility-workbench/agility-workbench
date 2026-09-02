import { describe, expect, it } from "vitest";
import { createRecordId, valuesAreSame } from "./misc";

// The grid's "did this cell value change?" rule: SameValueZero plus Date-by-instant. Drives no-op
// write suppression (core editCommit/cellsCommit) and the change-flash renderer.
describe("valuesAreSame", () => {
  it("compares primitives by SameValueZero", () => {
    expect(valuesAreSame(1, 1)).toBe(true);
    expect(valuesAreSame("a", "a")).toBe(true);
    expect(valuesAreSame(1, "1")).toBe(false);
    expect(valuesAreSame(true, false)).toBe(false);
  });

  it("treats NaN as equal to NaN (unlike ===)", () => {
    expect(valuesAreSame(NaN, NaN)).toBe(true);
    expect(valuesAreSame(NaN, 1)).toBe(false);
  });

  it("treats +0 and -0 as equal (unlike Object.is)", () => {
    expect(valuesAreSame(+0, -0)).toBe(true);
  });

  it("separates null from undefined", () => {
    expect(valuesAreSame(null, undefined)).toBe(false);
    expect(valuesAreSame(null, null)).toBe(true);
    expect(valuesAreSame(undefined, undefined)).toBe(true);
  });

  it("compares Dates by instant, not reference", () => {
    expect(valuesAreSame(new Date(86400000), new Date(86400000))).toBe(true);
    expect(valuesAreSame(new Date(86400000), new Date(86400001))).toBe(false);
  });

  it("treats two invalid Dates as equal", () => {
    expect(valuesAreSame(new Date("nope"), new Date("also nope"))).toBe(true);
    expect(valuesAreSame(new Date("nope"), new Date(86400000))).toBe(false);
  });

  it("does not unwrap a Date against a non-Date", () => {
    expect(valuesAreSame(new Date(86400000), 86400000)).toBe(false);
  });

  it("compares everything else by reference — structural equality is the application's business", () => {
    const obj = { a: 1 };
    expect(valuesAreSame(obj, obj)).toBe(true);
    expect(valuesAreSame(obj, { a: 1 })).toBe(false);
    expect(valuesAreSame([1], [1])).toBe(false);
  });
});

// Ids the grid mints for application-owned records (saved views, sheets).
describe("createRecordId", () => {
  it("mints distinct ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createRecordId("view")));
    expect(ids.size).toBe(50);
  });

  it("falls back to a prefixed id where crypto.randomUUID is unavailable", () => {
    // randomUUID needs a secure context, so an app served over plain http does not get one — the
    // fallback is why "Save view" does not throw there.
    const crypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      expect(createRecordId("sheet")).toMatch(/^sheet-[a-z0-9]+-[a-z0-9]+$/);
      expect(createRecordId("view")).toMatch(/^view-/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: crypto, configurable: true });
    }
  });
});
