import { Component } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnType } from "@agility-workbench/grid";
import type { ClipboardOptions, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

/**
 * The `clipboard` input through the Angular binding: it reaches the grid at creation, so copy uses
 * its delimiter, header row and cell hook, and `api.pasteText` splits on the same delimiter.
 */

type Row = { id: string; name: string; qty: number };

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [clipboard]="clipboard"
      (gridReady)="api = $event"
    />
  `,
})
class ClipboardHost {
  api: IGridAPI | null = null;
  clipboard: ClipboardOptions<Row> = {
    delimiter: ";",
    copyHeaders: true,
    processCellForClipboard: ({ value, colId }) => (colId === "qty" ? `#${value}` : value),
  };
  rows: Row[] = [
    { id: "1", name: "AAA", qty: 1 },
    { id: "2", name: "BBB", qty: 2 },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AwbGrid clipboard input", () => {
  it("shapes copy and pasteText", async () => {
    const writeText = vi.fn(async (_: string) => {});
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    const { host } = await mountGridHost(ClipboardHost);
    const api = host.api!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    api.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    api.copySelection();
    expect(writeText).toHaveBeenLastCalledWith("Name;Qty\nAAA;#1\nBBB;#2");

    api.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" });
    expect(api.pasteText("ZZZ;9")).toBe(true);
    expect(host.rows[1]).toMatchObject({ name: "ZZZ", qty: 9 });
  });
});
