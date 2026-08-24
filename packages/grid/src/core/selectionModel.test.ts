import { describe, expect, it } from "vitest";
import { SelectionModel } from "./selectionModel";

/**
 * Lightweight fake grid for exercising SelectionModel in isolation.
 *
 * `grid` is a 2-D array of cell values in view-index space: grid[row][col]. A `null` row
 * represents an unloaded server-side row (getRowNodeAtViewIndex → undefined). `leadingCols`
 * is the number of non-selectable leading columns (row-number etc.) at colIdx 0..n-1.
 *
 * Returns a mutable `state` (grid / pageStart) so tests can simulate view changes (filter,
 * pagination) after a selection is made, plus the `model` under test.
 */
function makeHarness(
  grid: (unknown[] | null)[],
  opts: {
    leadingCols?: number;
    pageStart?: number;
    pinnedTopCount?: number;
    pinnedBottomCount?: number;
    rowNumberNavigable?: boolean;
    isRowCheckable?: (viewIdx: number) => boolean;
  } = {},
) {
  const leadingCols = opts.leadingCols ?? 1;
  const state = { grid, pageStart: opts.pageStart ?? 0 };
  const dataColCount = grid.find((r) => r !== null)?.length ?? 0;
  const totalCols = leadingCols + dataColCount;

  // Flat leaf columns: leading columns first, then data columns. Each reads its own value out
  // of a row node's `data` array. Leading columns are "internal" (not selectable).
  const leaves = Array.from({ length: totalCols }, (_, colIdx) => ({
    instanceID: `col${colIdx}`,
    colId: `c${colIdx}`,
    hidden: false,
    children: [] as unknown[],
    isInternal: () => colIdx < leadingCols,
    getVisibleLeaves(): unknown[] { return [this]; },
    getValue: (node: { data: unknown[] }) =>
      colIdx < leadingCols ? colIdx + 1 : node.data[colIdx - leadingCols],
  }));
  const leafById = new Map(leaves.map((l) => [l.instanceID, l]));

  const rowModel = {
    getViewCount: () => state.grid.length,
    getRowNodeAtViewIndex: (i: number) => {
      const row = state.grid[i];
      return row == null ? undefined : { id: `r${i}`, data: row };
    },
  };
  const columnModel = {
    getLeaves: () => leaves,
    getLeadingLeaves: () => leaves.slice(0, leadingCols),
    getColumns: () => leaves,
    getById: (id: string) => leafById.get(id),
    resolve: (id: string) => leafById.get(id) ?? leaves.find(l => l.colId === id),
    getAncestors: (id: string) => (leafById.has(id) ? [leafById.get(id)] : []),
  };

  const model = new SelectionModel({
    getRowModel: () => rowModel as any,
    getColumnModel: () => columnModel as any,
    getRowIdAtViewIndex: (i: number) => (state.grid[i] == null ? null : `r${i}`),
    getPageStartIdx: () => state.pageStart,
    // No group rows in these tests — every row is selectable.
    isRowSelectable: () => true,
    isRowCheckable: opts.isRowCheckable,
    isRowNumberNavigable: () => opts.rowNumberNavigable ?? false,
    getPinnedRowCount: position =>
      position === "top" ? opts.pinnedTopCount ?? 0 : opts.pinnedBottomCount ?? 0,
  });

  return { model, state };
}

const makeModel = (grid: (unknown[] | null)[], opts?: { leadingCols?: number }) =>
  makeHarness(grid, opts).model;

// "" marks an empty cell; values are otherwise treated as filled (0 / false are filled).
const E = "";

describe("SelectionModel — Excel-style Ctrl+Arrow block jump", () => {
  // Single data column (colIdx 1; colIdx 0 is the leading column).
  // rows: A B C · · D E · · ·
  const column = [["A"], ["B"], ["C"], [E], [E], ["D"], ["E"], [E], [E], [E]];
  const COL = 1;

  const down = (m: SelectionModel) => m.navigate("down", { extend: false, jump: "block" });

  it("run: filled cell with a filled neighbor jumps to the end of the run", () => {
    const m = makeModel(column);
    m.selectSingleCell(0, COL); // on "A"
    expect(down(m)).toEqual({ row: 2, colIdx: COL }); // end of A-B-C
  });

  it("gap: filled cell with an empty neighbor skips the gap to the next filled cell", () => {
    const m = makeModel(column);
    m.selectSingleCell(2, COL); // on "C", below is empty
    expect(down(m)).toEqual({ row: 5, colIdx: COL }); // "D"
  });

  it("all-empty ahead: falls through to the grid edge", () => {
    const m = makeModel(column);
    m.selectSingleCell(6, COL); // on "E", nothing filled below
    expect(down(m)).toEqual({ row: 9, colIdx: COL }); // last row
  });

  it("start on empty: jumps to the first filled cell ahead", () => {
    const m = makeModel(column);
    m.selectSingleCell(3, COL); // empty
    expect(down(m)).toEqual({ row: 5, colIdx: COL }); // "D"
  });

  it("already at the edge: stays put", () => {
    const m = makeModel(column);
    m.selectSingleCell(9, COL);
    expect(down(m)).toEqual({ row: 9, colIdx: COL });
  });

  it("up is symmetric: run jumps to the start of the block", () => {
    const m = makeModel(column);
    m.selectSingleCell(2, COL); // on "C"
    expect(m.navigate("up", { extend: false, jump: "block" })).toEqual({ row: 0, colIdx: COL });
  });

  it("0 and false are real values, not empty", () => {
    const m = makeModel([[0], [false], [E], ["x"]]);
    m.selectSingleCell(0, COL); // on 0, neighbor false → both filled → run
    expect(down(m)).toEqual({ row: 1, colIdx: COL }); // stops at false (end of run)
  });

  it("server-side: an unloaded row is a hard boundary (stops at last loaded row)", () => {
    const m = makeModel([["A"], ["B"], ["C"], null, ["D"], ["E"]]);
    m.selectSingleCell(0, COL); // contiguous filled run to row 2, then unloaded
    expect(down(m)).toEqual({ row: 2, colIdx: COL });
  });
});

describe("SelectionModel — Ctrl+Arrow horizontal block jump", () => {
  const model = () => makeModel([["X", "Y", E, "Z", E]]); // data cols → colIdx 1..5
  const right = (m: SelectionModel) => m.navigate("right", { extend: false, jump: "block" });

  it("run then gap then edge across columns", () => {
    const m = model();
    m.selectSingleCell(0, 1); // "X", neighbor "Y" filled → run
    expect(right(m)).toEqual({ row: 0, colIdx: 2 }); // end of X-Y run

    m.selectSingleCell(0, 2); // "Y", neighbor empty → gap
    expect(right(m)).toEqual({ row: 0, colIdx: 4 }); // "Z"

    m.selectSingleCell(0, 4); // "Z", nothing filled to the right
    expect(right(m)).toEqual({ row: 0, colIdx: 5 }); // last column (edge)
  });

  it("does not cross into the leading column on the left", () => {
    const m = model();
    m.selectSingleCell(0, 1); // leftmost selectable, on "X"
    expect(m.navigate("left", { extend: false, jump: "block" })).toEqual({ row: 0, colIdx: 1 });
  });
});

describe('SelectionModel — jump: "edge" (Home/End) ignores cell contents', () => {
  // Row with a gap: X Y · Z · — a block jump would stop at the gap, an edge jump must not.
  const grid = [["X", "Y", E, "Z", E]]; // data cols → colIdx 1..5

  it('End (jump "edge") goes to the last column regardless of blanks', () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1); // on "X"
    expect(m.navigate("right", { extend: false, jump: "edge" })).toEqual({ row: 0, colIdx: 5 });
  });

  it('Home (jump "edge") goes to the first column', () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 4); // on "Z"
    expect(m.navigate("left", { extend: false, jump: "edge" })).toEqual({ row: 0, colIdx: 1 });
  });

  it('"edge" and "block" differ when a gap is present', () => {
    const edge = makeModel(grid);
    edge.selectSingleCell(0, 1);
    const byEdge = edge.navigate("right", { extend: false, jump: "edge" });

    const block = makeModel(grid);
    block.selectSingleCell(0, 1);
    const byBlock = block.navigate("right", { extend: false, jump: "block" });

    expect(byEdge).toEqual({ row: 0, colIdx: 5 }); // hard last column
    expect(byBlock).toEqual({ row: 0, colIdx: 2 }); // end of the X-Y run
    expect(byEdge).not.toEqual(byBlock);
  });

  it('vertical "edge" goes to the top/bottom row ignoring blanks', () => {
    const col = makeModel([["A"], [E], ["B"], [E], ["C"]]);
    col.selectSingleCell(0, 1);
    expect(col.navigate("down", { extend: false, jump: "edge" })).toEqual({ row: 4, colIdx: 1 });
  });
});

describe('SelectionModel — jump: "page" (PageUp/PageDown)', () => {
  const grid = Array.from({ length: 20 }, (_, i) => [`r${i}`]); // 20 rows, one data col (colIdx 1)

  it("moves down by pageRows and clamps at the last row", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    expect(m.navigate("down", { extend: false, jump: "page", pageRows: 8 })).toEqual({ row: 8, colIdx: 1 });
    expect(m.navigate("down", { extend: false, jump: "page", pageRows: 8 })).toEqual({ row: 16, colIdx: 1 });
    expect(m.navigate("down", { extend: false, jump: "page", pageRows: 8 })).toEqual({ row: 19, colIdx: 1 }); // clamp
  });

  it("moves up by pageRows and clamps at the first row", () => {
    const m = makeModel(grid);
    m.selectSingleCell(10, 1);
    expect(m.navigate("up", { extend: false, jump: "page", pageRows: 8 })).toEqual({ row: 2, colIdx: 1 });
    expect(m.navigate("up", { extend: false, jump: "page", pageRows: 8 })).toEqual({ row: 0, colIdx: 1 }); // clamp
  });

  it("keeps the column and extends the range with shift", () => {
    const m = makeModel(grid);
    m.selectSingleCell(2, 1);
    m.navigate("down", { extend: true, jump: "page", pageRows: 5 });
    expect(m.getSelectionRange()).toMatchObject({ rowStart: 2, rowEnd: 7, colStart: 1, colEnd: 1 });
    expect(m.getActiveCell()).toEqual({ row: 7, colIdx: 1 });
  });

  it("defaults to a single-row step when pageRows is missing", () => {
    const m = makeModel(grid);
    m.selectSingleCell(4, 1);
    expect(m.navigate("down", { extend: false, jump: "page" })).toEqual({ row: 5, colIdx: 1 });
  });
});

describe("SelectionModel — plain arrow navigation", () => {
  const grid = [["a", "b"], ["c", "d"], ["e", "f"]]; // 3 rows, data cols 1..2

  it("with no selection, the first arrow selects the first data cell", () => {
    const m = makeModel(grid);
    expect(m.navigate("down", { extend: false })).toEqual({ row: 0, colIdx: 1 });
  });

  it("moves one cell and clamps at bounds", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    expect(m.navigate("down", { extend: false })).toEqual({ row: 1, colIdx: 1 });
    expect(m.navigate("up", { extend: false })).toEqual({ row: 0, colIdx: 1 });
    expect(m.navigate("up", { extend: false })).toEqual({ row: 0, colIdx: 1 }); // clamp
    expect(m.navigate("left", { extend: false })).toEqual({ row: 0, colIdx: 1 }); // clamp at first col
  });

  it("shift+arrow extends the range from the anchor", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    m.navigate("down", { extend: true });
    expect(m.getSelectionRange()).toMatchObject({ rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 1 });
    expect(m.getActiveCell()).toEqual({ row: 1, colIdx: 1 });
    expect(m.getAnchor()).toEqual({ row: 0, colIdx: 1 });
  });
});

describe("SelectionModel — pinned row sections", () => {
  it("hands navigation over to the bands only at the body's content edges", () => {
    const m = makeHarness(
      [["a", "b"], ["c", "d"]],
      { pinnedTopCount: 2, pinnedBottomCount: 1 },
    ).model;

    // Initial navigation lands in the body, not a band.
    expect(m.navigate("down", { extend: false })).toEqual({ row: 0, colIdx: 1 });
    // At the first body row, Up crosses into the top band's bottom-most row and walks up.
    expect(m.navigate("up", { extend: false })).toEqual({ row: 1, colIdx: 1, rowPinned: "top" });
    expect(m.navigate("right", { extend: false })).toEqual({ row: 1, colIdx: 2, rowPinned: "top" });
    expect(m.navigate("up", { extend: false })).toEqual({ row: 0, colIdx: 2, rowPinned: "top" });
    expect(m.navigate("up", { extend: false })).toEqual({ row: 0, colIdx: 2, rowPinned: "top" }); // clamp
    // Down walks back through the band and re-enters the body at its first row.
    expect(m.navigate("down", { extend: false })).toEqual({ row: 1, colIdx: 2, rowPinned: "top" });
    expect(m.navigate("down", { extend: false })).toEqual({ row: 0, colIdx: 2 });
    expect(m.navigate("down", { extend: false })).toEqual({ row: 1, colIdx: 2 });
    // At the last body row, Down crosses into the bottom band and clamps at its end.
    expect(m.navigate("down", { extend: false })).toEqual({ row: 0, colIdx: 2, rowPinned: "bottom" });
    expect(m.navigate("down", { extend: false })).toEqual({ row: 0, colIdx: 2, rowPinned: "bottom" }); // clamp
    expect(m.navigate("up", { extend: false })).toEqual({ row: 1, colIdx: 2 });
  });

  it("corners land on the body edges; bands take one more plain arrow", () => {
    const m = makeHarness(
      [["a", "b"]],
      { pinnedTopCount: 1, pinnedBottomCount: 2 },
    ).model;
    expect(m.navigateToCorner("topLeft", false)).toEqual({ row: 0, colIdx: 1 });
    expect(m.navigate("up", { extend: false })).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });
    expect(m.navigateToCorner("bottomRight", false)).toEqual({ row: 0, colIdx: 2 });
    expect(m.navigate("down", { extend: false })).toEqual({ row: 0, colIdx: 2, rowPinned: "bottom" });
    expect(m.navigate("down", { extend: false })).toEqual({ row: 1, colIdx: 2, rowPinned: "bottom" });
  });

  it("shift-extension crosses region edges and builds a unified range", () => {
    const m = makeHarness(
      [["a", "b"], ["c", "d"]],
      { pinnedTopCount: 1, pinnedBottomCount: 1 },
    ).model;
    m.selectSingleCell(1, 1);
    m.navigate("up", { extend: true });
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1 });
    expect(m.getSelectionRange()).toMatchObject({ rowStart: 0, rowEnd: 1 });
    expect(m.getSelectionRange()?.pinnedTop).toBeUndefined();

    m.navigate("up", { extend: true }); // cross into the top band
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });
    expect(m.getSelectionRange()).toMatchObject({
      rowStart: 0, rowEnd: 1, pinnedTop: { start: 0, end: 0 },
    });
    m.navigate("up", { extend: true }); // clamp at the band's first row
    expect(m.getSelectionRange()).toMatchObject({
      rowStart: 0, rowEnd: 1, pinnedTop: { start: 0, end: 0 },
    });

    m.navigate("down", { extend: true }); // shrink back out of the band
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1 });
    expect(m.getSelectionRange()).toMatchObject({ rowStart: 0, rowEnd: 1 });
    expect(m.getSelectionRange()?.pinnedTop).toBeUndefined();

    m.navigate("down", { extend: true });
    m.navigate("down", { extend: true }); // cross into the bottom band
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "bottom" });
    expect(m.getSelectionRange()).toMatchObject({
      rowStart: 1, rowEnd: 1, pinnedBottom: { start: 0, end: 0 },
    });
  });

  it("selectAll spans the pinned bands and the body as one unified range", () => {
    const m = makeHarness(
      [["a", "b"], ["c", "d"]],
      { pinnedTopCount: 2, pinnedBottomCount: 1 },
    ).model;
    const active = m.selectAll();
    expect(active).toEqual({ row: 0, colIdx: 2, rowPinned: "bottom" });
    expect(m.getAnchor()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });
    expect(m.getSelectionRange()).toMatchObject({
      rowStart: 0,
      rowEnd: 1,
      colStart: 1,
      colEnd: 2,
      pinnedTop: { start: 0, end: 1 },
      pinnedBottom: { start: 0, end: 0 },
    });
  });

  it("a range can live entirely inside a band and snapshots resolve pinned cells", () => {
    const harness = makeHarness(
      [["a", "b"]],
      { pinnedTopCount: 2 },
    );
    const m = harness.model;
    m.selectSingleCell(0, 1, "top");
    expect(m.getSelectionRange()).toMatchObject({
      rowStart: 0, rowEnd: -1, pinnedTop: { start: 0, end: 0 },
    });
    m.updateRange(1, 2, "top");
    expect(m.getSelectionRange()).toMatchObject({
      rowStart: 0, rowEnd: -1, colStart: 1, colEnd: 2, pinnedTop: { start: 0, end: 1 },
    });
  });

  it("block and edge jumps stay region-locked", () => {
    const m = makeHarness(
      [["a", "b"], ["c", "d"], ["e", "f"]],
      { pinnedTopCount: 2, pinnedBottomCount: 1 },
    ).model;
    m.selectSingleCell(2, 1);
    m.navigate("up", { extend: false, jump: "block" });
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1 }); // stops at the body edge
    m.navigate("up", { extend: false, jump: "edge" });
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1 });
    m.navigate("up", { extend: false }); // plain arrow enters the band
    expect(m.getActiveCell()).toEqual({ row: 1, colIdx: 1, rowPinned: "top" });
    m.navigate("up", { extend: false, jump: "edge" }); // edge jump inside the band stays inside
    expect(m.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });
    m.navigate("down", { extend: false, jump: "edge" });
    expect(m.getActiveCell()).toEqual({ row: 1, colIdx: 1, rowPinned: "top" });
    m.navigate("down", { extend: false, jump: "page", pageRows: 10 }); // page jump stays region-locked
    expect(m.getActiveCell()).toEqual({ row: 1, colIdx: 1, rowPinned: "top" });
  });
});

describe("SelectionModel — corners and select all", () => {
  const grid = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]]; // data cols 1..3

  it("navigateToCorner jumps to top-left / bottom-right", () => {
    const m = makeModel(grid);
    m.selectSingleCell(1, 2);
    expect(m.navigateToCorner("topLeft", false)).toEqual({ row: 0, colIdx: 1 });
    expect(m.navigateToCorner("bottomRight", false)).toEqual({ row: 2, colIdx: 3 });
  });

  it("navigateToCorner with extend grows the range to the corner", () => {
    const m = makeModel(grid);
    m.selectSingleCell(1, 2);
    m.navigateToCorner("bottomRight", true);
    expect(m.getSelectionRange()).toMatchObject({ rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3 });
  });

  it("selectAll covers the whole grid excluding the leading column", () => {
    const m = makeModel(grid);
    m.selectAll();
    expect(m.getSelectionRange()).toMatchObject({ rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 3 });
    expect(m.getSnapshot().kind).toBe("range");
  });

  it("returns null on an empty grid", () => {
    const m = makeModel([]);
    expect(m.selectAll()).toBeNull();
    expect(m.navigateToCorner("topLeft", false)).toBeNull();
    expect(m.navigate("down", { extend: false })).toBeNull();
  });
});

describe("SelectionModel — row selection", () => {
  const grid = [["a"], ["b"], ["c"], ["d"]];

  it("replace selects a single row and toggling the same row again clears it", () => {
    const m = makeModel(grid);
    m.toggleRow(1, "replace");
    expect([...m.getSelectedRowIds()]).toEqual(["r1"]);
    m.toggleRow(1, "replace"); // was the only selected row → clears
    expect([...m.getSelectedRowIds()]).toEqual([]);
  });

  it("toggle adds and removes rows without clearing others", () => {
    const m = makeModel(grid);
    m.toggleRow(0, "toggle");
    m.toggleRow(2, "toggle");
    expect([...m.getSelectedRowIds()].sort()).toEqual(["r0", "r2"]);
    m.toggleRow(0, "toggle");
    expect([...m.getSelectedRowIds()]).toEqual(["r2"]);
  });

  it("range selects the contiguous span from the anchor", () => {
    const m = makeModel(grid);
    m.toggleRow(1, "replace"); // anchor at row 1
    m.toggleRow(3, "range");
    expect([...m.getSelectedRowIds()].sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("range with no prior anchor falls back to replace", () => {
    const m = makeModel(grid);
    m.toggleRow(2, "range");
    expect([...m.getSelectedRowIds()]).toEqual(["r2"]);
  });

  it("ignores unloaded rows", () => {
    const m = makeModel([["a"], null, ["c"]]);
    m.toggleRow(1, "replace");
    expect([...m.getSelectedRowIds()]).toEqual([]);
  });
});

describe("SelectionModel — select all rows", () => {
  const grid = [["a"], ["b"], ["c"], ["d"]];

  it("selectAllRows selects every loaded row and areAllRowsSelected reports true", () => {
    const m = makeModel(grid);
    expect(m.areAllRowsSelected()).toBe(false);
    m.selectAllRows();
    expect([...m.getSelectedRowIds()].sort()).toEqual(["r0", "r1", "r2", "r3"]);
    expect(m.areAllRowsSelected()).toBe(true);
  });

  it("areAllRowsSelected is false when only some rows are selected", () => {
    const m = makeModel(grid);
    m.toggleRow(0, "toggle");
    m.toggleRow(1, "toggle");
    expect(m.areAllRowsSelected()).toBe(false);
  });

  it("selectAllRows clears any prior cell-range selection", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    m.selectAllRows();
    expect(m.getSelectionRange()).toBeNull();
    expect(m.getSnapshot().kind).toBe("row");
  });

  it("areAllRowsSelected is false when there are no selectable rows", () => {
    const m = makeModel([]);
    expect(m.areAllRowsSelected()).toBe(false);
  });

  it("skips non-selectable (group) rows", () => {
    // Rows 1 and 3 are group rows (not selectable). selectAllRows should pick only r0 and r2, and
    // areAllRowsSelected should still be true because every *selectable* row is selected.
    const notSelectable = new Set([1, 3]);
    const model = new SelectionModel({
      getRowModel: () => ({
        getViewCount: () => 4,
        getRowNodeAtViewIndex: (i: number) => ({ id: `r${i}`, data: [i] }),
      }) as any,
      getColumnModel: () => ({
        getLeaves: () => [],
        getLeadingLeaves: () => [],
        getColumns: () => [],
        getById: () => undefined,
        resolve: () => undefined,
        getAncestors: () => [],
      }) as any,
      getRowIdAtViewIndex: (i: number) => `r${i}`,
      getPageStartIdx: () => 0,
      isRowSelectable: (i: number) => !notSelectable.has(i),
    });
    model.selectAllRows();
    expect([...model.getSelectedRowIds()].sort()).toEqual(["r0", "r2"]);
    expect(model.areAllRowsSelected()).toBe(true);
  });
});

describe("SelectionModel — column selection", () => {
  const grid = [["a", "b", "c"]]; // data cols 1..3

  it("replace selects a column; replacing the same column again clears it", () => {
    const m = makeModel(grid);
    m.toggleColumn("col1", "replace");
    expect([...m.getSelectedColumnIds()]).toEqual(["col1"]);
    m.toggleColumn("col1", "replace"); // all-selected + same set → clears
    expect([...m.getSelectedColumnIds()]).toEqual([]);
  });

  it("toggle adds/removes columns", () => {
    const m = makeModel(grid);
    m.toggleColumn("col1", "toggle");
    m.toggleColumn("col2", "toggle");
    expect([...m.getSelectedColumnIds()].sort()).toEqual(["col1", "col2"]);
    m.toggleColumn("col1", "toggle");
    expect([...m.getSelectedColumnIds()]).toEqual(["col2"]);
  });

  it("ignores internal (leading) columns", () => {
    const m = makeModel(grid);
    m.toggleColumn("col0", "replace"); // leading column
    expect([...m.getSelectedColumnIds()]).toEqual([]);
  });

  it("pruneColumns drops ids no longer present", () => {
    const m = makeModel(grid);
    m.toggleColumn("col1", "toggle");
    m.toggleColumn("col2", "toggle");
    // col2 is a real leaf, "ghost" is not → pruning keeps only existing leaves.
    m.getSelectedColumnIds().add("ghost");
    m.pruneColumns();
    expect([...m.getSelectedColumnIds()].sort()).toEqual(["col1", "col2"]);
  });
});

describe("SelectionModel — kinds are mutually exclusive", () => {
  const grid = [["a", "b"], ["c", "d"]];

  it("starting a cell selection clears rows and columns", () => {
    const m = makeModel(grid);
    m.toggleRow(0, "toggle");
    m.toggleColumn("col1", "toggle"); // (clears the row internally too)
    m.selectSingleCell(1, 1);
    expect([...m.getSelectedRowIds()]).toEqual([]);
    expect([...m.getSelectedColumnIds()]).toEqual([]);
    expect(m.getSnapshot().kind).toBe("cell");
  });

  it("selecting a row clears an active range", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    m.navigate("down", { extend: true }); // a range exists
    m.toggleRow(0, "toggle");
    expect(m.getSelectionRange()).toBeNull();
    expect(m.getSnapshot().kind).toBe("row");
  });

  it("selecting a column clears an active range and rows", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    m.toggleColumn("col1", "toggle");
    expect(m.getSelectionRange()).toBeNull();
    expect(m.getSnapshot().kind).toBe("column");
  });

  it("clearAll empties everything", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    m.clearAll();
    const snap = m.getSnapshot();
    expect(snap.kind).toBe("none");
    expect(snap.range).toBeNull();
  });
});

describe("SelectionModel — snapshot", () => {
  const grid = [["a", "b"], ["c", "d"], ["e", "f"]]; // data cols 1..2

  it("reports the active kind: none / cell / range", () => {
    const m = makeModel(grid);
    expect(m.getSnapshot().kind).toBe("none");
    m.selectSingleCell(0, 1);
    expect(m.getSnapshot().kind).toBe("cell"); // 1x1
    m.navigate("right", { extend: true });
    expect(m.getSnapshot().kind).toBe("range"); // multi-cell
  });

  it("resolveIds flattens the range to row-major CellRefs", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    m.updateRange(1, 2); // rows 0-1 × cols 1-2
    const snap = m.getSnapshot(true);
    expect(snap.rangeCells).toEqual([
      { rowId: "r0", colId: "c1", colInstanceId: "col1" },
      { rowId: "r0", colId: "c2", colInstanceId: "col2" },
      { rowId: "r1", colId: "c1", colInstanceId: "col1" },
      { rowId: "r1", colId: "c2", colInstanceId: "col2" },
    ]);
  });

  it("resolveIds omits unloaded rows", () => {
    const m = makeModel([["a", "b"], null, ["e", "f"]]);
    m.selectSingleCell(0, 1);
    m.updateRange(2, 2); // rows 0-2, but row 1 is unloaded
    const rowIds = new Set(m.getSnapshot(true).rangeCells!.map((c) => c.rowId));
    expect([...rowIds].sort()).toEqual(["r0", "r2"]);
  });

  it("does not populate rangeCells unless requested", () => {
    const m = makeModel(grid);
    m.selectSingleCell(0, 1);
    expect(m.getSnapshot().rangeCells).toBeUndefined();
  });
});

describe("SelectionModel — page/view invalidation", () => {
  it("getSelectionRange returns null once the page changes", () => {
    const { model, state } = makeHarness([["a"], ["b"], ["c"]], { pageStart: 0 });
    model.selectSingleCell(0, 1);
    expect(model.getSelectionRange()).not.toBeNull();
    state.pageStart = 3; // navigated to another page
    expect(model.getSelectionRange()).toBeNull();
  });

  it("isCellInActiveSelection respects the page guard", () => {
    const { model, state } = makeHarness([["a"], ["b"]], { pageStart: 0 });
    model.selectSingleCell(0, 1);
    expect(model.isCellInActiveSelection(0, 1, "r0", "col1")).toBe(true);
    state.pageStart = 2;
    expect(model.isCellInActiveSelection(0, 1, "r0", "col1")).toBe(false);
  });

  it("treats the row number as selected only when an enabled range covers every data column", () => {
    const m = makeHarness([["a", "b"], ["c", "d"]], { rowNumberNavigable: true }).model;
    m.selectSingleCell(0, 1);
    expect(m.isCellInActiveSelection(0, 0, "r0", "col0")).toBe(false);

    m.updateRange(0, 2);
    expect(m.isCellInActiveSelection(0, 0, "r0", "col0")).toBe(true);
    expect(m.isCellInActiveSelection(1, 0, "r1", "col0")).toBe(false);
  });

  it("clampToView shrinks a range to the current bounds", () => {
    const { model, state } = makeHarness([["a"], ["b"], ["c"], ["d"], ["e"]]);
    model.selectAll(); // rows 0-4
    state.grid = state.grid.slice(0, 2); // view shrinks to 2 rows (e.g. after filter)
    model.clampToView();
    expect(model.getSelectionRange()).toMatchObject({ rowStart: 0, rowEnd: 1 });
    expect(model.getActiveCell()).toEqual({ row: 1, colIdx: 1 });
  });
});

describe("SelectionModel — row checkability (isRowCheckable)", () => {
  // 5 data rows; rows 1 and 3 are app-disabled (GridOptions.isRowSelectable → false). The dep is
  // deliberately separate from isRowSelectable: disabled rows refuse row selection but remain
  // cell-navigation targets.
  const GRID = [["a"], ["b"], ["c"], ["d"], ["e"]];
  const checkable = (i: number) => i !== 1 && i !== 3;

  it("refuses toggle/replace on a non-checkable row", () => {
    const m = makeHarness(GRID, { isRowCheckable: checkable }).model;
    m.toggleRow(1, "toggle");
    m.toggleRow(3, "replace");
    expect(m.getSelectedRowIds().size).toBe(0);
    m.toggleRow(2, "toggle");
    expect([...m.getSelectedRowIds()]).toEqual(["r2"]);
  });

  it("skips non-checkable rows inside a range fill", () => {
    const m = makeHarness(GRID, { isRowCheckable: checkable }).model;
    m.toggleRow(0, "toggle"); // anchor
    m.toggleRow(4, "rangeAdd");
    expect([...m.getSelectedRowIds()].sort()).toEqual(["r0", "r2", "r4"]);
  });

  it("selectAllRows and areAllRowsSelected cover only checkable rows", () => {
    const m = makeHarness(GRID, { isRowCheckable: checkable }).model;
    m.selectAllRows();
    expect([...m.getSelectedRowIds()].sort()).toEqual(["r0", "r2", "r4"]);
    expect(m.areAllRowsSelected()).toBe(true);
  });

  it("falls back to isRowSelectable when the dep is absent", () => {
    const m = makeHarness(GRID).model; // isRowSelectable: () => true, no isRowCheckable
    m.selectAllRows();
    expect(m.getSelectedRowIds().size).toBe(5);
  });

  it("keeps non-checkable rows as keyboard navigation stops", () => {
    const m = makeHarness(GRID, { isRowCheckable: checkable }).model;
    m.selectSingleCell(0, 1);
    m.navigate("down", { extend: false });
    // Row 1 is not checkable but IS navigable — the cursor must land on it, not skip to row 2.
    expect(m.getActiveCell()).toEqual({ row: 1, colIdx: 1 });
  });
});
