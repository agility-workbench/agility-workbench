import { describe, expect, it } from "vitest";
import {
  AggregateType,
  ColumnType,
  FilterType,
  type GridEventEditingChangedParams,
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
});
