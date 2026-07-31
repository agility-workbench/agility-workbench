// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { IGridAPI } from "@agility-workbench/grid";
import { Grid } from "./grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

describe("tree data end-to-end via Grid", () => {
  it("renders data parents and leaves in a generated tree column and toggles from the DOM", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          rowIdKey="id"
          treeData={{
            mode: "parent",
            getParentId: (row: any) => row.parentId,
            getLabel: (row: any) => row.name,
            columnDef: { label: "Organization" },
            keyboardNavigationMode: "grid",
            enableKeyboardNavigationModeSwitch: true,
          }}
          data={[
            { id: "root", parentId: null, name: "Root", value: 1 },
            { id: "child", parentId: "root", name: "Child", value: 2 },
          ]}
          columnDefs={[
            { colId: "name", key: "name", label: "Name" },
            { colId: "value", key: "value", label: "Value" },
          ]}
          groupRowsSticky
        />,
      );
    });

    const core = apiRef.current!.getCore();
    const hierarchy = core.getColumnModel().getHierarchyColumn();
    const hierarchyIndex = core.getColumnModel().getLeaves().findIndex(col => col.isTreeColumn());
    expect(hierarchy?.label).toBe("Organization");
    expect(hierarchy?.pinned).toBeNull();
    expect(hierarchy?.isInternal()).toBe(false);
    expect(core.getRowModel().getViewCount()).toBe(1);
    expect(container.querySelector(".pte-group-label")?.textContent).toBe("Root");
    expect(container.querySelector(".pte-group-toggle .icon-group-collapsed")).toBeTruthy();

    await act(async () => {
      (container.querySelector(".pte-group-toggle") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
    });

    expect(core.getRowModel().getViewCount()).toBe(2);
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: hierarchyIndex });
    expect(document.activeElement).toBe(container.querySelector(".pte-root"));
    expect(container.querySelector(".pte-group-toggle .icon-group-expanded")).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll(".pte-group-label")).map(element => element.textContent),
    ).toContain("Child");
    expect(container.textContent).toContain("2");

    await act(async () => {
      const scroller = container.querySelector<HTMLDivElement>(".pte-scroller")!;
      scroller.scrollTop = 1;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    const body = gridRoot.querySelector<HTMLElement>(".pte-body")!;
    const stickyParent = gridRoot.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const stickyCell = stickyParent.querySelector<HTMLElement>(".pte-cell")!;
    expect(stickyParent.parentElement).toBe(gridRoot);
    expect(body.querySelector(".pte-pinned-rows")).toBeNull();
    expect(stickyParent.textContent).toContain("Root");
    expect(stickyCell.closest(".pte-row")?.dataset.rowPinned).toBe("top");
    expect(stickyCell.closest(".pte-row")?.dataset.viewIdx).toBe("0");
    expect(stickyCell.dataset.colIdx).toBe(String(hierarchyIndex));

    await act(async () => {
      stickyCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(core.getActiveCell()).toEqual({
      row: 0,
      colIdx: hierarchyIndex,
      rowPinned: "top",
    });

    await act(async () => {
      core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 1 });
    });
    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(container.querySelector(".pte-body .pte-group-label")?.textContent).toBe("Child");

    await act(async () => {
      core.dispatch({ type: "groupToggleExpand", groupId: "root", expanded: false });
    });
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(container.querySelector(".pte-pinned-rows-top .pte-group-label")?.textContent).toBe("Root");
    expect(container.querySelector(".pte-body [data-row-id='root']")).toBeNull();
    expect(container.querySelector<HTMLButtonElement>(".pte-pagination-btn-first")?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(".pte-pagination-btn-prev")?.disabled).toBe(true);

    await act(async () => {
      core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: hierarchyIndex, reason: "keyboard" });
      container.querySelector(".pte-root")!.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(core.getKeyboardNavigationMode()).toBe("grid");
    expect(core.getActiveCell()?.colIdx).not.toBe(hierarchyIndex);

    await act(async () => {
      container.querySelector(".pte-root")!.dispatchEvent(new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(core.getKeyboardNavigationMode()).toBe("hierarchy");
    expect(container.querySelector(".pte-root")?.getAttribute("data-keyboard-navigation-mode"))
      .toBe("hierarchy");
    expect(container.querySelector(".pte-grid-announcer")?.textContent)
      .toBe("Hierarchy navigation mode");
    expect(container.querySelector(".pte-grid-announcer")?.classList.contains("is-visible"))
      .toBe(true);
    expect(container.querySelector(".pte-grid-announcer")?.getAttribute("role")).toBe("status");

    await act(async () => {
      core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: hierarchyIndex, reason: "keyboard" });
      container.querySelector(".pte-root")!.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(core.getRowModel().getRowNode("root")?.isExpanded).toBe(true);

    await act(async () => {
      core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 1 });
      core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: hierarchyIndex, reason: "keyboard" });
      container.querySelector(".pte-root")!.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowUp",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(container.querySelector(".pte-pinned-rows-top .pte-group-label")?.textContent).toBe("Root");
    expect(container.querySelector(".pte-body [data-row-id='root']")).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
