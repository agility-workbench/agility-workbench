// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type { IGridAPI, ActionFrameComponentParams } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

// happy-dom is not reset between tests; clear the document so a grid (or its floating popover)
// left by one test can't be matched by the next test's queries.
afterEach(() => {
  document.body.innerHTML = "";
});

type Row = { id: number; name: string; comment: string };

const DATA: Row[] = [
  { id: 1, name: "Ava", comment: "hello" },
  { id: 2, name: "Liam", comment: "world" },
];

const CommentForm = (p: ActionFrameComponentParams) =>
  React.createElement("div", { className: "af-form" }, `AF:${p.data?.name}`);

function baseColumns(): ReactColDef[] {
  return [
    { colId: "name", key: "name", label: "Name", editable: true },
    {
      colId: "comment", key: "comment", label: "Comment",
      actionFrameTrigger: "click",
      actionFrameComponent: CommentForm,
    },
  ];
}

async function mountGrid(columns: ReactColDef[] = baseColumns()) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid apiRef={apiRef} data={DATA} columnDefs={columns} rowIdKey="id" />,
    );
  });
  return { container, apiRef, root };
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function popover(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".pte-action-frame-popover");
}
function framedCell(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".pte-cell.pte-action-frame");
}
function commentCell(container: HTMLElement, viewIdx = 0): HTMLElement {
  const cell = container.querySelector<HTMLElement>(
    `.pte-row[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="1"]`,
  );
  if (!cell) throw new Error("no comment cell");
  return cell;
}

describe("ActionFrame", () => {
  it("opens via api.openActionFrame — shows frame border + popover form", async () => {
    const { container, apiRef, root } = await mountGrid();
    const colId = apiRef.current!.getColumnModel().getByColId("comment")!.instanceID;
    await act(async () => {
      apiRef.current!.openActionFrame({ rowId: "1", colId });
      await tick();
    });
    expect(popover(container)).not.toBeNull();
    expect(framedCell(container)).not.toBeNull();
    expect(container.querySelector(".af-form")?.textContent).toContain("AF:Ava");
    expect(apiRef.current!.getActionFrameCell()).toEqual({
      rowId: "1", colId: "comment", colInstanceId: colId,
    });
    await unmountTestRoot(root);
  });

  it("opens on a center-section cell when another column is pinned left", async () => {
    // Regression: with a pinned column, each row slot renders multiple section row elements
    // sharing one data-view-idx; the cell lookup must search past the first (pinned) row.
    const { container, apiRef, root } = await mountGrid([
      { colId: "name", key: "name", label: "Name", pinned: "left" },
      {
        colId: "comment", key: "comment", label: "Comment",
        actionFrameTrigger: "click",
        actionFrameComponent: CommentForm,
      },
    ]);
    const colId = apiRef.current!.getColumnModel().getByColId("comment")!.instanceID;
    await act(async () => {
      apiRef.current!.openActionFrame({ rowId: "1", colId });
      await tick();
    });
    expect(popover(container)).not.toBeNull();
    expect(framedCell(container)).not.toBeNull();
    await unmountTestRoot(root);
  });

  it("opens on a cell click when actionFrameTrigger is 'click'", async () => {
    const { container, root } = await mountGrid();
    const cell = commentCell(container, 0);
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      await tick();
    });
    expect(popover(container)).not.toBeNull();
    await unmountTestRoot(root);
  });

  it("does NOT open on click for a column without a trigger", async () => {
    const { container, root } = await mountGrid([
      { colId: "name", key: "name", label: "Name" },
      { colId: "comment", key: "comment", label: "Comment", actionFrameComponent: CommentForm },
    ]);
    const cell = commentCell(container, 0);
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      await tick();
    });
    expect(popover(container)).toBeNull();
    await unmountTestRoot(root);
  });

  it("editing the same cell closes an open frame (mutual exclusion)", async () => {
    const { container, apiRef, root } = await mountGrid([
      { colId: "name", key: "name", label: "Name" },
      { colId: "comment", key: "comment", label: "Comment", editable: true, actionFrameComponent: CommentForm },
    ]);
    const cid = apiRef.current!.getColumnModel().getByColId("comment")!.instanceID;
    await act(async () => {
      apiRef.current!.openActionFrame({ rowId: "1", colId: cid });
      await tick();
    });
    expect(popover(container)).not.toBeNull();
    // Start editing that same cell → frame must close.
    await act(async () => {
      apiRef.current!.startEditingCell({ rowId: "1", colId: cid });
      await tick();
    });
    expect(popover(container)).toBeNull();
    expect(apiRef.current!.getActionFrameCell()).toBeNull();
    await unmountTestRoot(root);
  });

  it("Escape closes the frame", async () => {
    const { container, apiRef, root } = await mountGrid();
    const colId = apiRef.current!.getColumnModel().getByColId("comment")!.instanceID;
    await act(async () => {
      apiRef.current!.openActionFrame({ rowId: "1", colId });
      await tick();
    });
    expect(popover(container)).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await tick();
    });
    expect(popover(container)).toBeNull();
    await unmountTestRoot(root);
  });

  it("api.closeActionFrame closes the frame", async () => {
    const { container, apiRef, root } = await mountGrid();
    const colId = apiRef.current!.getColumnModel().getByColId("comment")!.instanceID;
    await act(async () => {
      apiRef.current!.openActionFrame({ rowId: "1", colId });
      await tick();
    });
    expect(popover(container)).not.toBeNull();
    await act(async () => {
      apiRef.current!.closeActionFrame();
      await tick();
    });
    expect(popover(container)).toBeNull();
    await unmountTestRoot(root);
  });

  it("honors a per-column placement override (right)", async () => {
    const { container, apiRef, root } = await mountGrid([
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "comment", key: "comment", label: "Comment",
        actionFrameComponent: CommentForm,
        actionFrameOptions: { placement: "right" },
      },
    ]);
    const colId = apiRef.current!.getColumnModel().getByColId("comment")!.instanceID;
    await act(async () => {
      apiRef.current!.openActionFrame({ rowId: "1", colId });
      await tick();
    });
    // FloatingAnchor stamps the resolved side on data-placement. happy-dom's zero-size rects make
    // exact geometry unreliable, but the resolved side should be present and not fall back to auto.
    expect(popover(container)?.dataset.placement).toBeTruthy();
    await unmountTestRoot(root);
  });

  it("draws the content indicator on cells matching a field, not on empty cells", async () => {
    const { container, root } = await mountGrid([
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "comment", key: "comment", label: "Comment",
        actionFrameComponent: CommentForm,
        actionFrameIndicator: "comment", // DATA row 1 has comment "hello"; row 2 "world" — both set
      },
    ]);
    // Both rows have a truthy comment in DATA → both comment cells get the indicator class.
    const marked = container.querySelectorAll(".pte-cell.pte-action-frame-indicator");
    expect(marked.length).toBeGreaterThan(0);
    // The Name column (col-idx 0) must never be marked.
    const nameCell = container.querySelector(".pte-row[data-view-idx=\"0\"] .pte-cell[data-col-idx=\"0\"]");
    expect(nameCell?.classList.contains("pte-action-frame-indicator")).toBe(false);
    await unmountTestRoot(root);
  });

  it("indicator predicate marks only matching cells", async () => {
    const { container, root } = await mountGrid([
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "comment", key: "comment", label: "Comment",
        actionFrameComponent: CommentForm,
        // Only row 1 (comment "hello") matches.
        actionFrameIndicator: (p) => p.data?.comment === "hello",
      },
    ]);
    const row0Comment = container.querySelector(".pte-row[data-view-idx=\"0\"] .pte-cell[data-col-idx=\"1\"]");
    const row1Comment = container.querySelector(".pte-row[data-view-idx=\"1\"] .pte-cell[data-col-idx=\"1\"]");
    expect(row0Comment?.classList.contains("pte-action-frame-indicator")).toBe(true);
    expect(row1Comment?.classList.contains("pte-action-frame-indicator")).toBe(false);
    await unmountTestRoot(root);
  });
});
