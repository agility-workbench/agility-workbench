// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource } from "../interfaces/serverSide";
import { ClipboardRenderer } from "./clipboard/clipboardRenderer";
import { initDomRenderer } from "./dom";
import { ExportRenderer } from "./exportRenderer";

/**
 * The checkbox column under a server-side select-all: each row's checkbox and selected paint
 * follow `selectAll XOR excluded` — rows that load after the select-all paint selected too — and
 * the header tri-state reads all (select-all, nothing excluded), some (exclusions, or explicit
 * rows), none. Exports and copies use the loaded selected rows, with one console warning each.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};
const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await raf();
  }
};

const BLOCK = 10;
const ROWS = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));

async function mountGrid(options: Record<string, unknown> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => success({
      rows: ROWS.slice(request.startRow ?? 0, request.endRow ?? ROWS.length).map(r => ({ ...r })),
      totalRows: ROWS.length,
    }),
  };
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideBlockSize: BLOCK,
    pagination: true,
    pageSize: BLOCK,
    rowSelection: { checkboxes: true },
    ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);
  core.setServerSideDataSource(source);
  await settle();
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { core, api, root };
}

function checkboxCell(root: HTMLElement, rowId: string): HTMLElement {
  return [...root.querySelectorAll<HTMLElement>(`.pte-row[row-id="${rowId}"]`)]
    .find(r => r.querySelector(".pte-checkbox-cell"))!
    .querySelector<HTMLElement>(".pte-checkbox-cell")!;
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function headerState(root: HTMLElement): "all" | "some" | "none" {
  const box = root.querySelector<HTMLElement>(".pte-hcell-checkbox .pte-select-all-checkbox")!;
  if (box.classList.contains("selected")) return "all";
  return box.classList.contains("pte-checkbox-indeterminate") ? "some" : "none";
}

const isChecked = (root: HTMLElement, rowId: string) =>
  checkboxCell(root, rowId).classList.contains("selected");
// The row's data cell carries the row-selected paint (and aria-selected).
const rowSelected = (root: HTMLElement, rowId: string) =>
  [...root.querySelectorAll<HTMLElement>(`.pte-row[row-id="${rowId}"] .pte-cell`)]
    .filter(cell => !cell.classList.contains("pte-checkbox-cell")
      && !cell.classList.contains("pte-full-width-cell"))
    .every(cell => cell.classList.contains("selected") && cell.getAttribute("aria-selected") === "true");

describe("checkbox column under a server-side select-all", () => {
  it("header click selects all as a state, and rows on a later page paint selected", async () => {
    const { core, api, root } = await mountGrid();
    expect(headerState(root)).toBe("none");

    click(root.querySelector<HTMLElement>(".pte-hcell-checkbox")!);
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: [] });
    expect(headerState(root)).toBe("all");
    expect(isChecked(root, "r0")).toBe(true);
    expect(rowSelected(root, "r0")).toBe(true);

    // Page 3 has never been loaded: its rows arrive after the select-all and paint selected.
    expect(core.getRowModel().getRowNode("r25")).toBeUndefined();
    api.goToPage(2);
    await settle();
    expect(isChecked(root, "r25")).toBe(true);
    expect(rowSelected(root, "r25")).toBe(true);
    expect(headerState(root)).toBe("all");
  });

  it("a row checkbox adds an exclusion (header: some); un-checking the header clears", async () => {
    const { api, root } = await mountGrid();
    api.selectAllRows();
    click(checkboxCell(root, "r3"));
    expect(api.getRowSelectionState()).toEqual({ selectAll: true, toggledRowIds: ["r3"] });
    expect(isChecked(root, "r3")).toBe(false);
    expect(isChecked(root, "r4")).toBe(true);
    expect(headerState(root)).toBe("some");

    // From "some" the header selects all again, then un-checks to an empty explicit selection.
    click(root.querySelector<HTMLElement>(".pte-hcell-checkbox")!);
    expect(headerState(root)).toBe("all");
    expect(isChecked(root, "r3")).toBe(true);
    click(root.querySelector<HTMLElement>(".pte-hcell-checkbox")!);
    expect(api.getRowSelectionState()).toEqual({ selectAll: false, toggledRowIds: [] });
    expect(headerState(root)).toBe("none");
    expect(isChecked(root, "r4")).toBe(false);
  });

  it("an explicit selection reads \"some\" in the header", async () => {
    const { root } = await mountGrid();
    click(checkboxCell(root, "r1"));
    expect(headerState(root)).toBe("some");
    expect(isChecked(root, "r1")).toBe(true);
  });

  it("isRowSelectable rows stay unchecked under select-all", async () => {
    const { api, root } = await mountGrid({ isRowSelectable: (node: any) => node.id !== "r2" });
    api.selectAllRows();
    expect(isChecked(root, "r2")).toBe(false);
    expect(isChecked(root, "r1")).toBe(true);
    expect(headerState(root)).toBe("all");
  });

  it("exports and copies the loaded selected rows, warning once per surface", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { core, api } = await mountGrid();
    api.selectAllRows();
    api.selectRowsById(["r1"], "remove");
    const exporter = new ExportRenderer({
      core,
      leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
      columnWidths: () => new Map(),
      selectionRange: () => core.getSelectionRange(),
      selectedColumnIDs: () => core.getSelectedColumnIds(),
    });
    const csv = exporter.getDataAsCsv({ scope: "selection" })!;
    const lines = csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1 + 9);
    expect(csv).toContain("Row 0");
    expect(csv).not.toContain("Row 1\n");
    exporter.getDataAsCsv({ scope: "selection" });
    const exportWarnings = warn.mock.calls.filter(c => String(c[0]).includes("export uses the loaded"));
    expect(exportWarnings).toHaveLength(1);

    const clip = new ClipboardRenderer({ core, writeText: async () => undefined, readText: async () => "" } as any);
    const text = clip.buildCopyText();
    expect(text.split("\n")).toHaveLength(9);
    clip.buildCopyText();
    const copyWarnings = warn.mock.calls.filter(c => String(c[0]).includes("copy uses the loaded"));
    expect(copyWarnings).toHaveLength(1);
    warn.mockRestore();
  });

  it("does not warn for an explicit server-side selection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { core, api } = await mountGrid();
    api.selectRowsById(["r1", "r2"]);
    const clip = new ClipboardRenderer({ core, writeText: async () => undefined, readText: async () => "" } as any);
    expect(clip.buildCopyText().split("\n")).toHaveLength(2);
    expect(warn.mock.calls.filter(c => String(c[0]).includes("Server-side select-all"))).toHaveLength(0);
    warn.mockRestore();
  });
});
