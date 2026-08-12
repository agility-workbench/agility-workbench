import { Component, input } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { ActionFrameComponentParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

@Component({
  standalone: true,
  template: `<div class="angular-action-frame">AF:{{ params()?.data?.name }}</div>`,
})
class CommentFrame {
  static destroys = 0;
  readonly params = input<ActionFrameComponentParams>();
  ngOnDestroy(): void { CommentFrame.destroys++; }
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      (gridReady)="api = $event"
    />
  `,
})
class ActionFrameHost {
  api: IGridAPI | null = null;
  rows = [
    { id: "1", name: "Ava", comment: "hello" },
    { id: "2", name: "Liam", comment: "world" },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    {
      colId: "comment",
      key: "comment",
      label: "Comment",
      actionFrameTrigger: "click",
      actionFrameComponent: CommentFrame,
    },
  ];
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function commentCell(gridEl: HTMLElement, row = 0): HTMLElement {
  return gridEl.querySelector<HTMLElement>(
    `.pte-row[data-view-idx="${row}"] .pte-cell[data-col-idx="1"]`,
  )!;
}

describe("AwbGrid ActionFrame integration", () => {
  it("opens an Angular ActionFrame through the API and frames its cell", async () => {
    const { gridEl, host } = await mountGridHost(ActionFrameHost);
    const colId = host.api!.getColumnModel().getByColId("comment")!.instanceID;
    host.api!.openActionFrame({ rowId: "1", colId });
    await tick();

    expect(gridEl.querySelector(".pte-action-frame-popover")).toBeTruthy();
    expect(gridEl.querySelector(".pte-cell.pte-action-frame")).toBeTruthy();
    expect(gridEl.querySelector(".angular-action-frame")?.textContent).toContain("AF:Ava");
    expect(host.api!.getActionFrameCell()).toEqual({
      rowId: "1", colId: "comment", colInstanceId: colId,
    });
  });

  it("opens from the configured cell click trigger", async () => {
    const { gridEl } = await mountGridHost(ActionFrameHost);
    commentCell(gridEl).click();
    await tick();
    expect(gridEl.querySelector(".pte-action-frame-popover")).toBeTruthy();
  });

  it("does not open from a click when the column has no trigger", async () => {
    const { gridEl } = await mountGridHost(ActionFrameHost, 600, (host) => {
      host.cols = [
        { colId: "name", key: "name", label: "Name" },
        { colId: "comment", key: "comment", label: "Comment", actionFrameComponent: CommentFrame },
      ];
    });
    commentCell(gridEl).click();
    await tick();
    expect(gridEl.querySelector(".pte-action-frame-popover")).toBeNull();
  });

  it("closes and destroys the Angular frame on Escape", async () => {
    CommentFrame.destroys = 0;
    const { gridEl, host } = await mountGridHost(ActionFrameHost);
    const colId = host.api!.getColumnModel().getByColId("comment")!.instanceID;
    host.api!.openActionFrame({ rowId: "1", colId });
    await tick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();

    expect(gridEl.querySelector(".pte-action-frame-popover")).toBeNull();
    expect(host.api!.getActionFrameCell()).toBeNull();
    expect(CommentFrame.destroys).toBe(1);
  });

  it("closes an open frame when editing begins on the same cell", async () => {
    const { gridEl, host } = await mountGridHost(ActionFrameHost, 600, (instance) => {
      instance.cols = [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "comment",
          key: "comment",
          label: "Comment",
          editable: true,
          actionFrameComponent: CommentFrame,
        },
      ];
    });
    const colId = host.api!.getColumnModel().getByColId("comment")!.instanceID;
    host.api!.openActionFrame({ rowId: "1", colId });
    await tick();
    host.api!.startEditingCell({ rowId: "1", colId });
    await tick();

    expect(gridEl.querySelector(".pte-action-frame-popover")).toBeNull();
    expect(host.api!.getCore().getEditingCell()).not.toBeNull();
  });

  it("applies ActionFrame indicators only to matching cells", async () => {
    const { gridEl } = await mountGridHost(ActionFrameHost, 600, (host) => {
      host.cols = [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "comment",
          key: "comment",
          label: "Comment",
          actionFrameComponent: CommentFrame,
          actionFrameIndicator: (params) => params.data?.comment === "hello",
        },
      ];
    });

    expect(commentCell(gridEl, 0).classList).toContain("pte-action-frame-indicator");
    expect(commentCell(gridEl, 1).classList).not.toContain("pte-action-frame-indicator");
  });
});
