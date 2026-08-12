import { describe, expect, it } from "vitest";
import {
  AggregateType,
  ColumnType,
  FilterType,
  type GridEventEditingChangedParams,
  type GridEventFilterChangedParams,
  type ResetPageTrigger,
} from "./index";

describe("react-grid public exports", () => {
  it("re-exports grid enums and public event payload types", () => {
    const event: GridEventEditingChangedParams = {
      state: "started",
      cell: { rowId: "r1", colId: "name" },
    };

    expect(ColumnType.STRING).toBe("string");
    expect(AggregateType.SUM).toBe("sum");
    expect(FilterType.CONTAINS).toBe("contains");
    expect(event.cell?.colId).toBe("name");
  });

  it("re-exports the filterChanged payload and ResetPageTrigger types", () => {
    const event: GridEventFilterChangedParams = {
      source: "filter",
      changedColIds: ["name"],
      changedColInstanceIds: ["uuid-1"],
    };
    const triggers: ResetPageTrigger[] = ["filter", "sort", "quickFilter"];

    expect(event.source).toBe("filter");
    expect(triggers).toHaveLength(3);
  });
});
