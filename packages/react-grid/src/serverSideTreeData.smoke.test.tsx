// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI, IServerSideDataSource, IServerSideRequest } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

type Node = { id: string; name: string; kind: "folder" | "file"; parent: string | null };

// Ragged: a folder and a file are siblings at the root, and the folder's children mix both again.
const TREE: Node[] = [
  { id: "docs", name: "docs", kind: "folder", parent: null },
  { id: "readme", name: "readme.md", kind: "file", parent: null },
  { id: "spec", name: "spec.md", kind: "file", parent: "docs" },
  { id: "images", name: "images", kind: "folder", parent: "docs" },
  { id: "logo", name: "logo.png", kind: "file", parent: "images" },
];

const requests: IServerSideRequest[] = [];
const dataSource: IServerSideDataSource = {
  getRows: ({ request, success }) => {
    requests.push(request);
    const parent = request.treeParent?.id ?? null;
    const rows = TREE.filter(node => node.parent === parent);
    success({ rows: rows.map(row => ({ ...row })), totalRows: rows.length });
  },
};

const COLUMNS = [{ colId: "kind", key: "kind", label: "Kind" }];

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

describe("server-side tree data through the React Grid", () => {
  it("renders lazy parents, expands from the DOM, and sends treeParent on the child fetch", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          columnDefs={COLUMNS}
          rowIdKey="id"
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          treeData={{
            mode: "server",
            hasChildren: (row: any) => row.kind === "folder",
            getLabel: (row: any) => row.name,
            columnDef: { label: "Files" },
          }}
          groupRowsSticky
          style={{ width: "100%", height: "100%" }}
        />,
      );
    });
    await act(async () => { await settle(); });

    const core = apiRef.current!.getCore();
    expect(core.getColumnModel().getHierarchyColumn()?.label).toBe("Files");
    expect(core.getRowModel().getViewCount()).toBe(2);
    // The root request carries no treeParent at all.
    expect(requests[0].treeParent).toBeUndefined();
    expect(requests[0].groupBy).toEqual([]);
    // A parent shows the chevron; the sibling file shows the alignment spacer.
    const parentRow = container.querySelector<HTMLElement>(".pte-viewport > .pte-row[row-id='docs']")!;
    const leafRow = container.querySelector<HTMLElement>(".pte-viewport > .pte-row[row-id='readme']")!;
    expect(parentRow.querySelector(".pte-group-toggle .icon-group-collapsed")).toBeTruthy();
    expect(leafRow.querySelector(".pte-tree-toggle-spacer")).toBeTruthy();
    expect(leafRow.querySelector(".pte-group-label")?.textContent).toBe("readme.md");

    const before = requests.length;
    await act(async () => {
      parentRow.querySelector<HTMLElement>(".pte-group-toggle")!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      await settle();
    });

    const childRequest = requests.slice(before).find(r => r.treeParent?.id === "docs")!;
    expect(childRequest).toBeTruthy();
    expect(childRequest.treeParent!.path).toEqual(["docs"]);
    expect(childRequest.treeParent!.data).toMatchObject({ id: "docs", name: "docs" });
    expect(core.getRowModel().getViewCount()).toBe(4);
    expect(
      Array.from(container.querySelectorAll(".pte-group-label"), el => el.textContent),
    ).toEqual(expect.arrayContaining(["spec.md", "images"]));

    await unmountTestRoot(root);
    container.remove();
  });
});
