/**
 * api.getPaginationInfo() — the public read of the pagination state (the `paginationChanged`
 * payload), so hosts never reach for getCore().
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridEventPaginationChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", pageSize: 10, pageSizes: [10, 25] });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
  ]);
  core.setRowData(Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `row ${i}`, n: i })));
  return { core, api: new GridAPI(core) };
}

describe("api.getPaginationInfo", () => {
  it("reports the current page after paging", () => {
    const { core, api } = makeGrid();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 2, pageSize: 10 });

    expect(api.getPaginationInfo()).toEqual({
      paginationEnabled: true,
      pageIndex: 2,
      pageSize: 10,
      totalRowCount: 25,
      totalPageCount: 3,
      totalRowCountKnown: true,
      pageSizes: [10, 25],
    });
  });

  it("matches the paginationChanged payload", () => {
    const { core, api } = makeGrid();
    let emitted: GridEventPaginationChangedParams | null = null;
    api.on("paginationChanged", e => { emitted = e; });
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 10 });

    expect(emitted).not.toBeNull();
    expect(api.getPaginationInfo()).toEqual(emitted);
  });

  it("reports pagination off", () => {
    const { api } = makeGrid();
    expect(api.getPaginationInfo().paginationEnabled).toBe(false);
    expect(api.getPaginationInfo().totalRowCount).toBe(25);
  });
});
