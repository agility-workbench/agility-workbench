import { describe, expect, it } from "vitest";
import { AggregateType } from "./aggregate";
import {
  isPivotResultColId,
  parsePivotLeafColId,
  pivotLeafColId,
  pivotLeafColIdFromKey,
  pivotPathId,
} from "./pivot";

describe("parsePivotLeafColId", () => {
  // The property that matters: the decoder is the encoder's inverse, whatever the values contain.
  it.each([
    [["Q1"], "revenue", AggregateType.SUM],
    [[], "revenue", AggregateType.COUNT],
    [["Q1", "EMEA"], "net_sales", AggregateType.AVG],
    [["a/b", "c|d"], "we|rd/colId", AggregateType.MAX],
    [["100%", "a b"], "50% margin", AggregateType.MEDIAN],
    [["(Blanks)"], "revenue", AggregateType.MIN],
  ])("round-trips path %j / %s / %s", (path, valueColId, type) => {
    const colId = pivotLeafColId(path as string[], valueColId as string, type as AggregateType);
    const parsed = parsePivotLeafColId(colId)!;
    expect(parsed).not.toBeNull();
    expect(parsed.path).toEqual(path);
    expect(parsed.valueColId).toBe(valueColId);
    expect(parsed.type).toBe(type);
    // The encoded key it reports rebuilds the same id — this is what the stamper keys by.
    expect(pivotLeafColIdFromKey(parsed.pathKey, parsed.valueColId, parsed.type)).toBe(colId);
  });

  it("returns null for anything that is not a generated value leaf", () => {
    // A plain column.
    expect(parsePivotLeafColId("revenue")).toBeNull();
    // A generated GROUP header: a path, no measure.
    const groupId = pivotPathId(["Q1"]);
    expect(isPivotResultColId(groupId)).toBe(true);
    expect(parsePivotLeafColId(groupId)).toBeNull();
    // Malformed ids, including percent-encoding a decoder must not throw on.
    expect(parsePivotLeafColId("pv:Q1|revenue")).toBeNull();
    expect(parsePivotLeafColId("pv:Q1|revenue|")).toBeNull();
    expect(parsePivotLeafColId("pv:Q1|%ZZ|sum")).toBeNull();
  });
});
