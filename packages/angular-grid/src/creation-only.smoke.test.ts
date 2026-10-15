import { Component } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATION_ONLY_OPTION_KEYS, UPDATABLE_OPTION_KEYS } from "@agility-workbench/grid";
import type { GridOptions } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import { CREATION_ONLY_INPUT_CANDIDATES } from "./creation-only";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowHeight]="rowHeight"
      [zebraRows]="zebraRows"
      [rowHover]="rowHover"
      [getRowId]="getRowId"
      [initialSort]="initialSort"
      [fillOperation]="fillOperation"
    />
  `,
})
class CreationOnlyHost {
  rows = [{ id: "1", name: "a" }, { id: "2", name: "b" }];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
  rowHeight: GridOptions["rowHeight"] = 30;
  zebraRows = false;
  rowHover = true;
  getRowId: GridOptions["getRowId"] = (row: any) => String(row.id);
  initialSort: GridOptions["initialSort"] = [{ colId: "name", dir: "asc" }];
  fillOperation: GridOptions["fillOperation"] = undefined;
}

const creationOnlyWarnings = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls
    .map((args: unknown[]) => String(args[0]))
    .filter((msg: string) => msg.includes("read only at creation"));

afterEach(() => vi.restoreAllMocks());

describe("AwbGrid creation-only inputs", () => {
  it("derives its watch list from core's key lists", () => {
    for (const key of CREATION_ONLY_INPUT_CANDIDATES) {
      expect(CREATION_ONLY_OPTION_KEYS).toContain(key);
      expect(UPDATABLE_OPTION_KEYS as readonly string[]).not.toContain(key);
    }
    expect(CREATION_ONLY_INPUT_CANDIDATES).toContain("rowHeight");
    expect(CREATION_ONLY_INPUT_CANDIDATES).not.toContain("pivotColumns");
    expect(CREATION_ONLY_INPUT_CANDIDATES).not.toContain("fillOperation");
  });

  it("warns once, naming the input, when a creation-only input changes after creation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fixture, host } = await mountGridHost(CreationOnlyHost);
    expect(creationOnlyWarnings(warn)).toEqual([]);

    host.rowHeight = 40;
    await syncGridInputs(fixture);
    host.rowHeight = 50;
    await syncGridInputs(fixture);

    const warnings = creationOnlyWarnings(warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('<awb-grid> input "rowHeight" changed after the grid was created');
    expect(warnings[0]).toContain("Re-create the grid");
  });

  it("does not warn when a live input changes, or when values are re-created unchanged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fixture, host } = await mountGridHost(CreationOnlyHost);

    host.zebraRows = true;
    host.rowHover = false;
    host.getRowId = (row: any) => String(row.id);
    host.initialSort = [{ colId: "name", dir: "asc" }];
    host.fillOperation = () => undefined;
    await syncGridInputs(fixture);

    expect(creationOnlyWarnings(warn)).toEqual([]);
  });
});
