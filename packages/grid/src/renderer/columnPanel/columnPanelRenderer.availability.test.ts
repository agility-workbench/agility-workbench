// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnPanelOptions } from "../../interfaces/gridOptions";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { ColumnMenuService } from "../../menu/columnMenuService";
import { MenuCoordinator } from "../../menu/coordinator";
import { MenuRenderer } from "../menuRenderer";
import { ColumnPanelRenderer } from "./columnPanelRenderer";

// `availability: "pivot"` — the panel exists only while pivot mode is on, for apps that manage
// columns themselves but want the grid's pivot customizer — plus the auto-open that makes the
// blank pivot canvas reachable however pivot mode was entered.

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(options: boolean | ColumnPanelOptions) {
  // The panel renderer takes its options as a param; the column menu reads them off the core.
  const core = new GridCore(measurer, { rowIdKey: "id", columnPanel: options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setRowData([{ id: "1", region: "West", revenue: 10 }]);
  const root = document.createElement("div");
  document.body.appendChild(root);
  const menuRenderer = new MenuRenderer(document.body);
  const menuCoordinator = new MenuCoordinator(
    new ColumnMenuService(core),
    { resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }) },
    core,
  );
  const renderer = new ColumnPanelRenderer({
    core,
    root: root as HTMLDivElement,
    options,
    onLayoutChange: () => undefined,
    toolbar: { mountColumnTrigger: () => undefined, unmountColumnTrigger: () => undefined },
    menuCoordinator,
    menuRenderer,
  });
  return { core, root, renderer };
}

const mounted = (root: HTMLElement) => root.classList.contains("pte-column-panel-enabled");
const isOpen = (root: HTMLElement) => root.classList.contains("pte-column-panel-open");

describe("column panel availability", () => {
  it("stays mounted outside pivot mode by default", () => {
    const { root, core } = makeGrid(true);
    expect(mounted(root)).toBe(true);
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(mounted(root)).toBe(true);
  });

  it("mounts only while pivoted when availability is 'pivot'", () => {
    const { root, core } = makeGrid({ availability: "pivot" });
    expect(mounted(root)).toBe(false);

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(mounted(root)).toBe(true);

    core.dispatch({ type: "pivotModeSet", on: false });
    expect(mounted(root)).toBe(false);
    expect(isOpen(root)).toBe(false);
  });

  it("opens itself on entering pivot mode with nothing configured", () => {
    const { root, core } = makeGrid(true);
    expect(isOpen(root)).toBe(false);
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(isOpen(root)).toBe(true);
  });

  it("opens a 'pivot'-scoped panel the moment it becomes available", () => {
    const { root, core } = makeGrid({ availability: "pivot" });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(mounted(root)).toBe(true);
    expect(isOpen(root)).toBe(true);
  });

  it("leaves an already-configured pivot alone — no forced drawer", () => {
    const { root, core } = makeGrid(true);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(isOpen(root)).toBe(false);
  });

  it("does not reopen when the user clears the last role while pivoted", () => {
    const { root, core } = makeGrid(true);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(isOpen(root)).toBe(false);

    // Clearing the last role blanks the canvas, but the drawer stays as the user left it —
    // auto-open is a property of entering the mode, not of being unconfigured.
    core.dispatch({ type: "rowGroupSet", colIds: [] });
    expect(core.isPivotUnconfigured()).toBe(true);
    expect(isOpen(root)).toBe(false);
  });

  it("offers 'Manage columns…' from the menu trigger only while available", () => {
    const { core } = makeGrid({ availability: "pivot", trigger: "menu" });
    const service = new ColumnMenuService(core);
    const ctx = {
      targetColId: core.getColumnModel().getByColId("region")!.instanceID,
      colIds: [core.getColumnModel().getByColId("region")!.instanceID],
    } as any;
    const idsOutside = service.buildDefaultColumnMenu(ctx).map((i: any) => i.id);
    expect(idsOutside).not.toContain("manageColumns");

    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const auto = core.getColumnModel().getAutoGroupColumns()[0];
    const pivotCtx = { targetColId: auto.instanceID, colIds: [auto.instanceID] } as any;
    expect(service.buildDefaultColumnMenu(pivotCtx).map((i: any) => i.id)).toContain("manageColumns");
  });
});
