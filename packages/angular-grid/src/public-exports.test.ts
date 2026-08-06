import { describe, expect, it } from "vitest";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  FilterType,
  type GridEventEditingChangedParams,
  type NgColDef,
} from "./public-api";

describe("angular-grid public exports", () => {
  it("exports AwbGrid and re-exports core enums and event payload types", () => {
    const column: NgColDef = { colId: "name", key: "name", label: "Name" };
    const event: GridEventEditingChangedParams = {
      state: "started",
      cell: { rowId: "r1", colId: "name" },
    };

    expect(AwbGrid).toBeTypeOf("function");
    expect(ColumnType.STRING).toBe("string");
    expect(AggregateType.SUM).toBe("sum");
    expect(FilterType.CONTAINS).toBe("contains");
    expect(column.colId).toBe(event.cell?.colId);
  });
});
