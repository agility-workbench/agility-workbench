// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ReactColDef } from "./cellRenderer";

/**
 * End-to-end ARIA contract through the React wrapper (accessibility plan 6 PR 6).
 *
 * The per-phase suites in `packages/grid` test each renderer in isolation; this one mounts a
 * real grid through `<Grid>` and asserts the whole shipped contract from the outside, the way
 * an AT would read it. Its job is to catch a wrapper (or a renderer refactor) silently dropping
 * ARIA that the unit tests still pass on — the wrapper needed zero ARIA-specific code, and this
 * suite is what keeps that true.
 *
 * All four column sections are populated (row-number leading, pinned left, center, pinned
 * right) because the owns-ordered topology (plan 2.1) only exists when a row is split.
 */

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one so the real renderer can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; region: string; product: string; sales: number; note: string };

const ROWS: Row[] = [
  { id: "1", region: "AMER", product: "Widget", sales: 10, note: "a" },
  { id: "2", region: "AMER", product: "Gadget", sales: 20, note: "b" },
  { id: "3", region: "EMEA", product: "Widget", sales: 30, note: "c" },
  { id: "4", region: "EMEA", product: "Doohickey", sales: 40, note: "d" },
];

const COLUMNS: ReactColDef[] = [
  { colId: "region", key: "region", label: "Region", pinned: "left" },
  { colId: "product", key: "product", label: "Product" },
  { colId: "sales", key: "sales", label: "Sales" },
  { colId: "note", key: "note", label: "Note", pinned: "right" },
];

async function mountGrid(props: Record<string, unknown> = {}, columnDefs: ReactColDef[] = COLUMNS) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={ROWS}
        columnDefs={columnDefs}
        rowIdKey="id"
        rowNumbers
        rowSelection
        {...props}
      />,
    );
  });
  const api = apiRef.current!;
  /** Re-render with different props, for the options that must survive an update. */
  const rerender = async (nextProps: Record<string, unknown>) => {
    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          data={ROWS}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowNumbers
          rowSelection
          {...nextProps}
        />,
      );
    });
  };
  return {
    container,
    api,
    core: api.getCore(),
    root,
    rerender,
    gridRoot: container.querySelector<HTMLElement>(".pte-root")!,
  };
}

/** Every element named by `aria-owns`, in the declared order. */
function ownedElements(el: HTMLElement): HTMLElement[] {
  const owns = el.getAttribute("aria-owns");
  expect(owns, `${el.className} has no aria-owns`).toBeTruthy();
  return owns!.split(" ").map(id => {
    // ids are instanceIDs/uuids — getElementById avoids CSS-escaping them into a selector.
    const owned = document.getElementById(id);
    expect(owned, `aria-owns names "${id}" but no such element exists`).not.toBeNull();
    return owned!;
  });
}

/**
 * The owned cells AT actually reads. Stitching happens once at creation, so the list also names
 * cells that are `display: none` in the current layout — the full-width host on a normal row, and
 * cells shadowed by a colSpan neighbour. Those drop out of the accessibility tree on their own.
 */
const visibleOwnedCells = (rowEl: HTMLElement) =>
  ownedElements(rowEl).filter(c => c.style.display !== "none");

const colIndexOf = (el: HTMLElement) => Number(el.getAttribute("aria-colindex"));

/**
 * The populated ARIA rows. The pool is sized to the viewport, so with a short dataset most slots
 * sit empty — `display: none` and stripped of their identity by `clearSlotIdentity`, which is what
 * `[aria-rowindex]` selects on.
 */
const centerBodyRows = (gridRoot: HTMLElement) =>
  [...gridRoot.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row[aria-rowindex]")];

const hcellFor = (gridRoot: HTMLElement, api: IGridAPI, colId: string) =>
  document.getElementById(api.getColumnModel().getByColId(colId)!.instanceID)!;

describe("ARIA contract through the React wrapper", () => {
  it("exposes the root as a grid with row/column counts and multiselectable", async () => {
    const { gridRoot, root } = await mountGrid();

    expect(gridRoot.getAttribute("role")).toBe("grid");
    // rowcount counts the header row; colcount counts leaves including the row-number gutter.
    expect(gridRoot.getAttribute("aria-rowcount")).toBe(String(ROWS.length + 1));
    expect(gridRoot.getAttribute("aria-colcount")).toBe(String(COLUMNS.length + 1));
    expect(gridRoot.getAttribute("aria-multiselectable")).toBe("true");
    // The root is the grid's single focusable element (the focus model is activedescendant-based).
    expect(gridRoot.tabIndex).toBeGreaterThanOrEqual(0);

    await unmountTestRoot(root);
  });

  it("reports aria-multiselectable=false when nothing can be multi-selected", async () => {
    const { gridRoot, root } = await mountGrid({
      rowSelection: false, cellSelection: "text", columnSelection: false,
    });
    expect(gridRoot.getAttribute("aria-multiselectable")).toBe("false");
    await unmountTestRoot(root);
  });

  it("passes the grid's accessible name through, and updates it on a prop change", async () => {
    const { gridRoot, root, rerender } = await mountGrid({ ariaLabel: "Open invoices" });
    expect(gridRoot.getAttribute("aria-label")).toBe("Open invoices");

    // The label is a runtime option, so a changed prop has to reach the root — the wrapper plumbing
    // this suite exists to guard.
    await rerender({ ariaLabel: "Closed invoices" });
    expect(gridRoot.getAttribute("aria-label")).toBe("Closed invoices");

    await rerender({ ariaLabelledBy: "some-heading" });
    expect(gridRoot.getAttribute("aria-labelledby")).toBe("some-heading");
    expect(gridRoot.hasAttribute("aria-label")).toBe(false);

    await unmountTestRoot(root);
  });

  it("exposes one header row owning every leaf columnheader in visual order", async () => {
    const { gridRoot, root } = await mountGrid();

    const headerRows = [...gridRoot.querySelectorAll<HTMLElement>('[role="row"]')]
      .filter(r => r.querySelector('[role="columnheader"]'));
    expect(headerRows).toHaveLength(1);
    expect(headerRows[0].classList.contains("pte-header")).toBe(true);

    const owned = ownedElements(headerRows[0]);
    expect(owned.every(el => el.getAttribute("role") === "columnheader")).toBe(true);
    // Visual order: row-number gutter, pinned left, center, pinned right — i.e. colindex 1..N.
    expect(owned.map(colIndexOf)).toEqual([1, 2, 3, 4, 5]);
    expect(owned.map(el => el.textContent?.trim())).toEqual(
      expect.arrayContaining(["Region", "Product", "Sales", "Note"]),
    );
    // The row-number gutter renders a blank label by design, so it needs a name of its own or AT
    // reads an anonymous column (axe: empty-table-header).
    expect(owned[0].classList.contains("pte-hcell-row-number")).toBe(true);
    expect(owned[0].getAttribute("aria-label")).toBe("Row number");

    await unmountTestRoot(root);
  });

  it("exposes exactly one ARIA row per logical row, owning all four sections' cells in order", async () => {
    const { gridRoot, root } = await mountGrid();

    const rows = centerBodyRows(gridRoot);
    expect(rows.length).toBe(ROWS.length);
    // The other three section fragments must NOT be rows — that is the whole point of
    // owns-ordered: AT sees one row per logical row, not up to four partial ones.
    for (const sel of [".pte-viewport-leading", ".pte-viewport-left", ".pte-viewport-right"]) {
      const section = gridRoot.querySelector<HTMLElement>(sel)!;
      const fragments = [...section.querySelectorAll<HTMLElement>(".pte-row")];
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments.some(f => f.getAttribute("role") === "row")).toBe(false);
    }

    rows.forEach((rowEl, i) => {
      expect(rowEl.getAttribute("role")).toBe("row");
      // 1-based and offset by the header row.
      expect(rowEl.getAttribute("aria-rowindex")).toBe(String(i + 2));
      const cells = visibleOwnedCells(rowEl);
      expect(cells.every(c => c.getAttribute("role") === "gridcell")).toBe(true);
      expect(cells.map(colIndexOf)).toEqual([1, 2, 3, 4, 5]);
    });

    // Unused pool slots must claim nothing: they are hidden AND stripped of their row identity,
    // so aria-rowcount stays truthful for a dataset shorter than the pool.
    const emptySlots = [...gridRoot.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row")]
      .filter(r => !r.hasAttribute("aria-rowindex"));
    expect(emptySlots.length).toBeGreaterThan(0);
    expect(emptySlots.every(r => r.style.display === "none")).toBe(true);
    expect(emptySlots.every(r => !r.hasAttribute("row-id"))).toBe(true);

    await unmountTestRoot(root);
  });

  it("names the active cell on the root via aria-activedescendant, across sections", async () => {
    const { gridRoot, core, root } = await mountGrid();

    // Center section.
    await act(async () => {
      core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 2, reason: "api" } as any);
    });
    const centerId = gridRoot.getAttribute("aria-activedescendant");
    expect(centerId).toBeTruthy();
    const centerCell = document.getElementById(centerId!)!;
    expect(centerCell.getAttribute("role")).toBe("gridcell");
    expect(colIndexOf(centerCell)).toBe(3);
    expect(centerCell.closest(".pte-viewport")).not.toBeNull();

    // Pinned-left section: the named cell reaches its row only through aria-owns.
    await act(async () => {
      core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 1, reason: "api" } as any);
    });
    const pinnedId = gridRoot.getAttribute("aria-activedescendant");
    expect(pinnedId).not.toBe(centerId);
    const pinnedCell = document.getElementById(pinnedId!)!;
    expect(pinnedCell.closest(".pte-viewport-left")).not.toBeNull();
    // It is still owned by exactly one ARIA row, which carries the right index.
    const owningRow = centerBodyRows(gridRoot).find(r =>
      r.getAttribute("aria-owns")!.split(" ").includes(pinnedId!));
    expect(owningRow?.getAttribute("aria-rowindex")).toBe("3");

    await unmountTestRoot(root);
  });

  it("tracks focus with aria-activedescendant even when highlightActiveCell is off", async () => {
    // The cosmetic outline defaults off; AT focus tracking must not be gated on it.
    const { gridRoot, core, root } = await mountGrid({ highlightActiveCell: false });
    await act(async () => {
      core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2, reason: "api" } as any);
    });
    expect(gridRoot.getAttribute("aria-activedescendant")).toBeTruthy();
    expect(gridRoot.querySelector(".pte-active-cell")).toBeNull();
    await unmountTestRoot(root);
  });

  it("puts aria-sort on the sorted columnheader and 'none' on the other sortable ones", async () => {
    const { gridRoot, api, core, root } = await mountGrid();

    const sales = hcellFor(gridRoot, api, "sales");
    const product = hcellFor(gridRoot, api, "product");
    expect(sales.getAttribute("aria-sort")).toBe("none");

    await act(async () => {
      core.dispatch({
        type: "sortModelSet",
        sortItems: [{ key: api.getColumnModel().getByColId("sales")!.instanceID, dir: "asc" }],
      } as any);
    });
    expect(sales.getAttribute("aria-sort")).toBe("ascending");
    expect(product.getAttribute("aria-sort")).toBe("none");

    // sortModelSet is additive — a column is unsorted by naming it with dir: null.
    await act(async () => {
      core.dispatch({
        type: "sortModelSet",
        sortItems: [{ key: api.getColumnModel().getByColId("sales")!.instanceID, dir: null }],
      } as any);
    });
    expect(sales.getAttribute("aria-sort")).toBe("none");

    await unmountTestRoot(root);
  });

  it("mirrors row selection onto the ARIA row and its cells across sections", async () => {
    const { gridRoot, core, root } = await mountGrid();

    await act(async () => {
      core.dispatch({ type: "rowSelectSet", viewIdx: 2, mode: "toggle" } as any);
    });

    const rows = centerBodyRows(gridRoot);
    expect(rows[2].getAttribute("aria-selected")).toBe("true");
    // Absent, not "false", on the unselected ones (plan 4.2 — no write per recycled cell).
    expect(rows[0].hasAttribute("aria-selected")).toBe(false);
    // Every cell of that row is selected, including the ones living in other sections.
    const cells = visibleOwnedCells(rows[2]);
    expect(cells).toHaveLength(5);
    expect(cells.every(c => c.getAttribute("aria-selected") === "true")).toBe(true);
    expect(cells.some(c => c.closest(".pte-viewport-left"))).toBe(true);
    expect(cells.some(c => c.closest(".pte-viewport-right"))).toBe(true);

    await act(async () => {
      core.dispatch({ type: "rowSelectSet", viewIdx: 2, mode: "toggle" } as any);
    });
    expect(rows[2].hasAttribute("aria-selected")).toBe(false);
    expect(visibleOwnedCells(rows[2]).every(c => !c.hasAttribute("aria-selected"))).toBe(true);

    await unmountTestRoot(root);
  });

  it("exposes group rows as expandable with a level, and updates on expand", async () => {
    const { gridRoot, api, core, root } = await mountGrid();

    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    });

    const collapsed = centerBodyRows(gridRoot);
    expect(collapsed).toHaveLength(2); // AMER, EMEA
    expect(collapsed.map(r => r.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(collapsed.map(r => r.getAttribute("aria-level"))).toEqual(["1", "1"]);

    await act(async () => {
      api.setAllGroupsExpanded(true);
    });

    const expanded = centerBodyRows(gridRoot);
    expect(expanded.length).toBe(2 + ROWS.length);
    const groups = expanded.filter(r => r.hasAttribute("aria-expanded"));
    expect(groups).toHaveLength(2);
    expect(groups.every(r => r.getAttribute("aria-expanded") === "true")).toBe(true);
    // Leaf rows are not expandable and (plan 4.2) carry no misleading level.
    const leaves = expanded.filter(r => !r.hasAttribute("aria-expanded"));
    expect(leaves).toHaveLength(ROWS.length);
    expect(leaves.every(r => !r.hasAttribute("aria-level"))).toBe(true);

    await unmountTestRoot(root);
  });

  it("carries one sr-only polite live region that announces state changes", async () => {
    vi.useFakeTimers();
    try {
      const { gridRoot, core, root } = await mountGrid();
      const announcer = gridRoot.querySelector<HTMLElement>(".pte-grid-sr-announcer")!;
      expect(announcer.getAttribute("role")).toBe("status");
      expect(announcer.getAttribute("aria-live")).toBe("polite");
      expect(announcer.getAttribute("aria-atomic")).toBe("true");
      // Exactly one — the visible nav-mode toast is a separate region AT never sees.
      expect(gridRoot.querySelectorAll(".pte-grid-sr-announcer")).toHaveLength(1);

      await act(async () => {
        core.dispatch({ type: "rowSelectSet", viewIdx: 0, mode: "toggle" } as any);
        core.dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "toggle" } as any);
      });
      // Announcements coalesce, so nothing is written until the window closes.
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(announcer.textContent).toBe("2 rows selected");

      await act(async () => {
        core.dispatch({
          type: "sortModelSet",
          sortItems: [{ key: core.getColumnModel().getByColId("sales")!.instanceID, dir: "desc" }],
        } as any);
      });
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(announcer.textContent).toBe("Sorted by Sales descending");

      await unmountTestRoot(root);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the grid busy while the loading overlay is up", async () => {
    const { gridRoot, core, root } = await mountGrid();
    expect(gridRoot.hasAttribute("aria-busy")).toBe(false);

    await act(async () => {
      core.dispatch({ type: "overlayShow", overlayType: "loading" } as any);
    });
    expect(gridRoot.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      core.dispatch({ type: "overlayShow", overlayType: "none" } as any);
    });
    expect(gridRoot.hasAttribute("aria-busy")).toBe(false);

    await unmountTestRoot(root);
  });

  it("exposes the column menu as a menu of menuitems", async () => {
    const { gridRoot, api, root } = await mountGrid();

    const menuBtn = hcellFor(gridRoot, api, "product").querySelector<HTMLElement>(".pte-hcell-menu-menuBtn")!;
    await act(async () => {
      menuBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const overlay = document.querySelector<HTMLElement>(".pte-menu")!;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute("role")).toBe("menu");
    expect(overlay.getAttribute("aria-label")).toBeTruthy();
    const items = [...overlay.querySelectorAll<HTMLElement>(".pte-menu-item")];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.getAttribute("role") === "menuitem")).toBe(true);
    // Focus is inside the menu, so the arrow-key pattern the roles promise actually works.
    expect(overlay.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".pte-menu")).toBeNull();

    await unmountTestRoot(root);
  });

  it("prefixes cell ids per grid instance so two grids on a page never collide", async () => {
    const first = await mountGrid();
    const second = await mountGrid();

    await act(async () => {
      first.core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2, reason: "api" } as any);
      second.core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2, reason: "api" } as any);
    });

    const firstId = first.gridRoot.getAttribute("aria-activedescendant")!;
    const secondId = second.gridRoot.getAttribute("aria-activedescendant")!;
    expect(firstId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    // Each root points into its OWN grid, which is the failure this prefixing prevents.
    expect(first.gridRoot.contains(document.getElementById(firstId))).toBe(true);
    expect(second.gridRoot.contains(document.getElementById(secondId))).toBe(true);
    // And ids are unique document-wide.
    const allIds = [...document.querySelectorAll<HTMLElement>("[id]")].map(el => el.id);
    expect(new Set(allIds).size).toBe(allIds.length);

    await unmountTestRoot(first.root);
    await unmountTestRoot(second.root);
  });

  it("declares aria-colspan on a spanning cell and drops the cell it shadows", async () => {
    // "Widget" rows span Product across Sales; the others don't.
    const { gridRoot, root } = await mountGrid({}, [
      { colId: "region", key: "region", label: "Region", pinned: "left" },
      { colId: "product", key: "product", label: "Product", colSpan: (p: any) => (p.value === "Widget" ? 2 : 1) },
      { colId: "sales", key: "sales", label: "Sales" },
      { colId: "note", key: "note", label: "Note", pinned: "right" },
    ]);

    const rows = centerBodyRows(gridRoot);
    const spanned = rows[0].querySelector<HTMLElement>('.pte-cell[aria-colspan="2"]');
    expect(spanned).not.toBeNull();
    expect(colIndexOf(spanned!)).toBe(3); // row-number, Region, Product → Product is the 3rd column
    // Row 0 reads as 4 cells, not 5: the shadowed Sales cell is display:none and leaves the tree.
    expect(visibleOwnedCells(rows[0]).map(colIndexOf)).toEqual([1, 2, 3, 5]);
    // Row 1 ("Gadget") is unspanned and complete — the attribute is per-row, not per-column.
    expect(rows[1].querySelector('.pte-cell[aria-colspan="2"]')).toBeNull();
    expect(visibleOwnedCells(rows[1]).map(colIndexOf)).toEqual([1, 2, 3, 4, 5]);

    await unmountTestRoot(root);
  });
});
