// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { GridProps } from "./interface";
import { CREATION_ONLY_PROPS } from "./creationOnlyProps";
import { CREATION_ONLY_OPTION_KEYS, UPDATABLE_OPTION_KEYS } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const ROWS = [{ id: "1", name: "a" }, { id: "2", name: "b" }];
const COLS = [{ colId: "name", key: "name", label: "Name" }];

function creationOnlyWarnings(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((args: unknown[]) => String(args[0]))
    .filter((msg: string) => msg.includes("read only at creation"));
}

async function mountWith(props: Partial<GridProps>) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  const renderGrid = (next: Partial<GridProps>) =>
    act(async () => {
      root.render(<Grid rowIdKey="id" rowData={ROWS} columnDefs={COLS} {...next} />);
    });
  await renderGrid(props);
  return { root, renderGrid };
}

describe("<Grid> creation-only props", () => {
  it("derives its watch list from core's key lists (live and bridged props are excluded)", () => {
    for (const key of CREATION_ONLY_PROPS) {
      expect(CREATION_ONLY_OPTION_KEYS).toContain(key);
      expect(UPDATABLE_OPTION_KEYS as readonly string[]).not.toContain(key);
    }
    expect(CREATION_ONLY_PROPS).toContain("rowHeight");
    expect(CREATION_ONLY_PROPS).not.toContain("pivotMode");
    expect(CREATION_ONLY_PROPS).not.toContain("onCellClicked");
    expect(CREATION_ONLY_PROPS).not.toContain("zebraRows");
  });

  it("warns once, naming the prop, when a creation-only prop changes after mount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, renderGrid } = await mountWith({ rowHeight: 30 });
    expect(creationOnlyWarnings(warn)).toEqual([]);

    await renderGrid({ rowHeight: 40 });
    await renderGrid({ rowHeight: 50 });

    const warnings = creationOnlyWarnings(warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('<Grid> prop "rowHeight" changed after the grid was created');
    expect(warnings[0]).toContain("React key");

    await unmountTestRoot(root);
  });

  it("does not warn when a live prop changes, or when inline values are re-created unchanged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, renderGrid } = await mountWith({
      zebraRows: false,
      getRowId: (row: any) => String(row.id),
      initialSort: [{ colId: "name", dir: "asc" }],
      treeData: undefined,
    });

    await renderGrid({
      zebraRows: true,
      rowHover: false,
      // Fresh identities, same contents: not a change.
      getRowId: (row: any) => String(row.id),
      initialSort: [{ colId: "name", dir: "asc" }],
      onCellClicked: () => undefined,
    });

    expect(creationOnlyWarnings(warn)).toEqual([]);
    await unmountTestRoot(root);
  });
});
