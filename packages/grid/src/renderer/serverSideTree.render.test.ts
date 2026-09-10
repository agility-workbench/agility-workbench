// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";
import { initDomRenderer } from "./dom";

// Server-side tree data, painted end to end: a lazy parent shows the chevron that fetches its
// children (its `children` array never materializes, so the chevron can only come from
// `expandable: true`), a leaf shows the alignment spacer, the row carries the hierarchy state for
// AT, and an expanded parent docks in the sticky overlay while its children scroll under it.

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

const ROW_HEIGHT = 40;
const VIEW_HEIGHT = 400;

type Node = { id: string; name: string; kind: string; parent: string | null };

// Two folders of 20 files each plus a root-level file — a ragged root, and enough rows for the
// sticky stack to have something to dock over.
const TREE: Node[] = [
  { id: "alpha", name: "alpha", kind: "folder", parent: null },
  { id: "beta", name: "beta", kind: "folder", parent: null },
  { id: "loose", name: "loose.txt", kind: "file", parent: null },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `a${i}`, name: `a${i}.txt`, kind: "file", parent: "alpha",
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `b${i}`, name: `b${i}.txt`, kind: "file", parent: "beta",
  })),
];

function makeDataSource() {
  const requests: IServerSideRequest[] = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      const parentId = request.treeParent?.id ?? null;
      const rows = TREE.filter(n => n.parent === parentId);
      const start = request.startRow ?? 0;
      const end = request.endRow ?? rows.length;
      success({ rows: rows.slice(start, end).map(r => ({ ...r })), totalRows: rows.length });
    },
  };
  return { source, requests };
}

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** Drain chained block fetches AND the frames the renderer paints them on. */
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await raf();
  }
};

function mountGrid(options: object = {}) {
  const ds = makeDataSource();
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowHeight: ROW_HEIGHT,
    rowModelType: "serverSide",
    treeData: { mode: "server", hasChildren: (row: any) => row.kind === "folder", getLabel: (row: any) => row.name },
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "kind", key: "kind", label: "Kind", type: ColumnType.STRING },
  ]);
  core.setServerSideDataSource(ds.source);
  // happy-dom does no layout, so the height the scroll math reads has to be declared.
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  return { container, core, api, ds, body };
}

const bodyRow = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`.pte-viewport > .pte-row[row-id="${id}"]`)!;

function scrollBody(body: HTMLElement, scrollTop: number) {
  body.scrollTop = scrollTop;
  body.dispatchEvent(new Event("scroll"));
}

describe("server-side tree data in the DOM", () => {
  it("gives a lazy parent a chevron and a leaf a spacer, with hierarchy state on the row", async () => {
    const { container, core } = mountGrid();
    await settle();

    expect(core.getRowModel().getRowCount()).toBe(3);
    const parent = bodyRow(container, "alpha");
    const leaf = bodyRow(container, "loose");

    // The chevron is the fetch trigger, and it exists before any child block does.
    const toggle = parent.querySelector<HTMLElement>(".pte-group-toggle")!;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("data-group-id")).toBe("alpha");
    expect(toggle.querySelector(".icon-group-collapsed")).toBeTruthy();
    expect(parent.querySelector(".pte-group-label")?.textContent).toBe("alpha");
    // Hierarchy state lives on the ARIA row; a level-0 row reports level 1.
    expect(parent.getAttribute("aria-expanded")).toBe("false");
    expect(parent.getAttribute("aria-level")).toBe("1");

    // A leaf gets the alignment spacer and, with nothing to open, no aria-expanded at all.
    expect(leaf.querySelector(".pte-tree-toggle-spacer")).toBeTruthy();
    expect(leaf.querySelector(".pte-group-toggle")).toBeNull();
    expect(leaf.getAttribute("aria-expanded")).toBeNull();
    expect(leaf.querySelector(".pte-group-label")?.textContent).toBe("loose.txt");

    container.remove();
  });

  it("fetches and paints children when the chevron is clicked", async () => {
    const { container, core, ds } = mountGrid();
    await settle();
    const before = ds.requests.length;

    bodyRow(container, "alpha")
      .querySelector<HTMLElement>(".pte-group-toggle")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await settle();

    const fresh = ds.requests.slice(before);
    expect(fresh.some(r => r.treeParent?.id === "alpha")).toBe(true);
    expect(core.getRowModel().getRowCount()).toBe(23);
    const parent = bodyRow(container, "alpha");
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    expect(parent.querySelector(".icon-group-expanded")).toBeTruthy();
    // A fetched child is a leaf one level down: spacer, no chevron, level 2 for AT.
    const child = bodyRow(container, "a0");
    expect(child.getAttribute("aria-level")).toBe("2");
    expect(child.getAttribute("aria-expanded")).toBeNull();
    expect(child.querySelector(".pte-tree-toggle-spacer")).toBeTruthy();
    expect(child.querySelector(".pte-group-label")?.textContent).toBe("a0.txt");

    container.remove();
  });

  it("docks an expanded tree parent in the sticky overlay", async () => {
    const { container, core, body } = mountGrid({ groupRowsSticky: true, groupDefaultExpanded: -1 });
    await settle();
    // alpha + 20, beta + 20, loose.
    expect(core.getRowModel().getRowCount()).toBe(43);

    const overlay = container.querySelector<HTMLElement>(".pte-body-frame .pte-sticky-rows")!;
    const dockedIds = () => Array.from(
      overlay.querySelectorAll<HTMLElement>(".pte-pinned-rows-center .pte-pinned-row"),
    ).map(el => el.dataset.rowId);

    scrollBody(body, 5 * ROW_HEIGHT);
    await settle();
    expect(overlay.style.display).toBe("flex");
    expect(dockedIds()).toEqual(["alpha"]);

    // Deep inside beta's block: the parent that docks is the one whose subtree the edge row is in.
    scrollBody(body, 30 * ROW_HEIGHT);
    await settle();
    expect(dockedIds()).toEqual(["beta"]);

    container.remove();
  });

  it("exports the rows the store holds — the loaded roots, not lazy descendants", async () => {
    // Pinning down what a server tree export actually is, because the docs state it: the exporter
    // walks materialized `children`, and a server tree keeps its descendants in lazy per-parent
    // listings rather than on the nodes.
    const { container, core, api } = mountGrid();
    await settle();
    core.dispatch({ type: "groupToggleExpand", groupId: "alpha" });
    await settle();

    // "Hierarchy,Kind\nalpha,folder\nbeta,folder\nloose.txt,file" — the roots, flat.
    const csv = api.getDataAsCsv();
    expect(csv.split("\n")).toEqual(["Hierarchy,Kind", "alpha,folder", "beta,folder", "loose.txt,file"]);

    container.remove();
  });
});
