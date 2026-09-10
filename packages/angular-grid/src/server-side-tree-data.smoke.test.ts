import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type {
  GridOptions,
  IGridAPI,
  IServerSideDataSource,
  IServerSideGetRowsParams,
  IServerSideRequest,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

type Node = { id: string; name: string; kind: "folder" | "file"; parent: string | null };

// Ragged: a folder and a file are siblings at the root, and the folder's children mix both again.
const tree: Node[] = [
  { id: "docs", name: "docs", kind: "folder", parent: null },
  { id: "readme", name: "readme.md", kind: "file", parent: null },
  { id: "spec", name: "spec.md", kind: "file", parent: "docs" },
  { id: "images", name: "images", kind: "folder", parent: "docs" },
  { id: "logo", name: "logo.png", kind: "file", parent: "images" },
];

const requests: IServerSideRequest[] = [];
const source: IServerSideDataSource = {
  getRows: ({ request, success }: IServerSideGetRowsParams) => {
    requests.push(request);
    const parent = request.treeParent?.id ?? null;
    const rows = tree.filter((node) => node.parent === parent);
    success({ rows: rows.map((row) => ({ ...row })), totalRows: rows.length });
  },
};

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [columnDefs]="cols"
      rowIdKey="id"
      rowModelType="serverSide"
      [serverSideDataSource]="source"
      [treeData]="treeData"
      [groupRowsSticky]="true"
      (gridReady)="api = $event"
    />
  `,
})
class ServerSideTreeHost {
  readonly source = source;
  api: IGridAPI | null = null;
  cols: NgColDef[] = [{ colId: "kind", key: "kind", label: "Kind" }];
  treeData: GridOptions["treeData"] = {
    mode: "server",
    hasChildren: (row: any) => row.kind === "folder",
    getLabel: (row: any) => row.name,
    columnDef: { label: "Files" },
  };
}

async function settleLoads(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("AwbGrid server-side tree data", () => {
  it("renders lazy parents and sends treeParent when one is expanded from the DOM", async () => {
    const { fixture, gridEl, host } = await mountGridHost(ServerSideTreeHost);
    // The data-source sync effect's first run is what issues the initial block request, and with
    // OnPush that run can land after the mount tick — flush change detection once more before
    // waiting on the server.
    await syncGridInputs(fixture);
    await settleLoads();

    const core = host.api!.getCore();
    expect(core.getColumnModel().getHierarchyColumn()?.label).toBe("Files");
    expect(core.getRowModel().getViewCount()).toBe(2);
    // The root request carries no treeParent at all.
    expect(requests[0].treeParent).toBeUndefined();
    expect(requests[0].groupBy).toEqual([]);

    const parentRow = gridEl.querySelector<HTMLElement>(".pte-viewport > .pte-row[row-id='docs']")!;
    const leafRow = gridEl.querySelector<HTMLElement>(".pte-viewport > .pte-row[row-id='readme']")!;
    expect(parentRow.querySelector(".pte-group-toggle .icon-group-collapsed")).toBeTruthy();
    expect(leafRow.querySelector(".pte-tree-toggle-spacer")).toBeTruthy();
    expect(leafRow.querySelector(".pte-group-label")?.textContent).toBe("readme.md");

    const before = requests.length;
    parentRow.querySelector<HTMLElement>(".pte-group-toggle")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    await settleLoads();

    const childRequest = requests.slice(before).find((request) => request.treeParent?.id === "docs")!;
    expect(childRequest).toBeTruthy();
    expect(childRequest.treeParent!.path).toEqual(["docs"]);
    expect(childRequest.treeParent!.data).toMatchObject({ id: "docs", name: "docs" });
    expect(core.getRowModel().getViewCount()).toBe(4);
    expect(
      Array.from(gridEl.querySelectorAll(".pte-group-label"), (element) => element.textContent),
    ).toEqual(expect.arrayContaining(["spec.md", "images"]));
  });
});
