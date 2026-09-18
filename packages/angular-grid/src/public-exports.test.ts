import { describe, expect, it } from "vitest";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  FilterType,
  ServerSideDataError,
  isServerSideDataError,
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
    // Runtime values the core exports for error handling reach Angular consumers too.
    const refused = new ServerSideDataError({ reason: "empty_row_id", rowId: "", parentId: undefined, path: [], row: null });
    expect(isServerSideDataError(refused)).toBe(true);
    expect(refused.reason).toBe("empty_row_id");
  });
});
