import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridAPI } from "../api/api";
import { FilterType } from "../interfaces/filter";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

type Row = { id: string; name: string; qty: number };

function makeGrid(options: Partial<GridOptions> = {}, rows: Row[] = [
  { id: "1", name: "alice", qty: 3 },
  { id: "2", name: "bob", qty: 7 },
]): GridCore {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
  ]);
  core.setRowData(rows);
  return core;
}

describe("GridCore async row transactions", () => {
  const cores: GridCore[] = [];

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const core of cores) core.destroy();
    cores.length = 0;
    vi.useRealTimers();
  });

  const grid = (options?: Partial<GridOptions>, rows?: Row[]) => {
    const core = makeGrid(options, rows);
    cores.push(core);
    return core;
  };

  it("mutates immediately but derives and notifies the view once after 16 ms", async () => {
    const core = grid();
    const rowsChanged = vi.fn();
    const paginationChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);
    core.on("paginationChanged", paginationChanged);

    let resolved = false;
    const result = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 99 } }],
    }).then(value => {
      resolved = true;
      return value;
    });

    expect(core.getCellValue("1", "qty")).toBe(99);
    expect(rowsChanged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(result).resolves.toEqual({ added: 0, updated: 1, removed: 0 });
    expect(rowsChanged).toHaveBeenCalledTimes(1);
    expect(rowsChanged).toHaveBeenCalledWith(expect.objectContaining({ reason: "transaction" }));
    expect(paginationChanged).toHaveBeenCalledTimes(1);
  });

  it("uses a fixed window from the first call rather than debouncing indefinitely", async () => {
    const core = grid();
    const rowsChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);

    const first = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
    });
    vi.advanceTimersByTime(10);
    const second = core.applyTransactionAsync({
      update: [{ rowId: "2", row: { id: "2", name: "bob", qty: 20 } }],
    });
    vi.advanceTimersByTime(6);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { added: 0, updated: 1, removed: 0 },
      { added: 0, updated: 1, removed: 0 },
    ]);
    expect(rowsChanged).toHaveBeenCalledTimes(1);
  });

  it("honors a configured batch window and normalizes invalid values", async () => {
    const core = grid({ asyncTransactionWaitMs: 5 });
    const rowsChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);
    const pending = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
    });

    vi.advanceTimersByTime(4);
    expect(rowsChanged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await pending;
    expect(rowsChanged).toHaveBeenCalledTimes(1);

    expect(grid({ asyncTransactionWaitMs: -1 }).getOptions().asyncTransactionWaitMs).toBe(16);
    expect(grid({ asyncTransactionWaitMs: Number.NaN }).getOptions().asyncTransactionWaitMs).toBe(16);
    expect(grid({ asyncTransactionWaitMs: 0 }).getOptions().asyncTransactionWaitMs).toBe(0);
  });

  it("resolves comparators before the first asynchronously-added rows are sorted", async () => {
    const core = grid({ initialSort: [{ colId: "qty", dir: "asc" }] }, []);
    const high = core.applyTransactionAsync({ add: [{ id: "2", name: "high", qty: 20 }] });
    const low = core.applyTransactionAsync({ add: [{ id: "1", name: "low", qty: 10 }] });
    core.flushAsyncTransactions();
    await Promise.all([high, low]);

    expect(core.getRowIdAtViewIndex(0)).toBe("1");
    expect(core.getRowIdAtViewIndex(1)).toBe("2");
  });

  it("preserves sequential add/remove semantics and per-call results", async () => {
    const core = grid();
    const rowsChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);

    const add = core.applyTransactionAsync({ add: [{ id: "3", name: "carol", qty: 5 }] });
    const remove = core.applyTransactionAsync({ remove: ["3"] });
    core.flushAsyncTransactions();

    await expect(add).resolves.toEqual({ added: 1, updated: 0, removed: 0 });
    await expect(remove).resolves.toEqual({ added: 0, updated: 0, removed: 1 });
    expect(core.getRowModel().getRowNode("3")).toBeUndefined();
    expect(rowsChanged).toHaveBeenCalledTimes(1);
  });

  it("deduplicates repaint rows for an update-only batch when reevaluation is disabled", async () => {
    const core = grid({ reevaluateOnEdit: false });
    const cellsChanged = vi.fn();
    const rowsChanged = vi.fn();
    core.on("cellsChanged", cellsChanged);
    core.on("rowsChanged", rowsChanged);

    const first = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
    });
    const second = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 11 } }],
    });
    core.flushAsyncTransactions();
    await Promise.all([first, second]);

    expect(rowsChanged).not.toHaveBeenCalled();
    expect(cellsChanged).toHaveBeenCalledTimes(1);
    expect(cellsChanged.mock.calls[0][0].rowIds).toEqual(["1"]);
    expect(core.getCellValue("1", "qty")).toBe(11);
  });

  it("lets a synchronous transaction absorb and finalize an earlier async batch", async () => {
    const core = grid();
    const rowsChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);
    const pending = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
    });

    expect(core.applyTransaction({ add: [{ id: "3", name: "carol", qty: 5 }] }))
      .toEqual({ added: 1, updated: 0, removed: 0 });
    await expect(pending).resolves.toEqual({ added: 0, updated: 1, removed: 0 });
    expect(rowsChanged).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(rowsChanged).toHaveBeenCalledTimes(1);
  });

  it.each(["auto", "reset"] as const)(
    "lets rowDataMode %s subsume a pending transaction refresh",
    async (rowDataMode) => {
      const core = grid({ rowDataMode });
      const reasons: string[] = [];
      core.on("rowsChanged", event => reasons.push(event.reason));
      const pending = core.applyTransactionAsync({
        update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
      });

      core.setRowData([
        { id: "1", name: "alice", qty: 30 },
        { id: "2", name: "bob", qty: 7 },
      ]);

      await expect(pending).resolves.toEqual({ added: 0, updated: 1, removed: 0 });
      expect(core.getCellValue("1", "qty")).toBe(30);
      expect(reasons).toEqual(["refresh"]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("flushes pending work before a columnDefs change drops an active filter", async () => {
    const core = grid();
    const api = new GridAPI(core);
    api.setFilterModel([
      { colId: "qty", filters: [{ type: FilterType.GT, values: [5] }] },
    ]);
    const rowReasons: string[] = [];
    const filterChanged = vi.fn();
    core.on("rowsChanged", event => rowReasons.push(event.reason));
    core.on("filterChanged", filterChanged);
    const pending = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
    });

    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    ]);

    await expect(pending).resolves.toEqual({ added: 0, updated: 1, removed: 0 });
    expect(rowReasons).toEqual(["transaction", "filter"]);
    expect(filterChanged).toHaveBeenCalledTimes(1);
    expect(filterChanged).toHaveBeenCalledWith(expect.objectContaining({
      source: "columns",
      changedColIds: ["qty"],
    }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not schedule work for a no-op transaction", async () => {
    const core = grid();
    const rowsChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);
    await expect(core.applyTransactionAsync({ remove: ["missing"] }))
      .resolves.toEqual({ added: 0, updated: 0, removed: 0 });
    expect(vi.getTimerCount()).toBe(0);
    expect(rowsChanged).not.toHaveBeenCalled();
  });

  it("settles pending callers without delayed events when destroyed", async () => {
    const core = grid();
    const rowsChanged = vi.fn();
    core.on("rowsChanged", rowsChanged);
    const pending = core.applyTransactionAsync({
      update: [{ rowId: "1", row: { id: "1", name: "alice", qty: 10 } }],
    });

    core.destroy();
    await expect(pending).resolves.toEqual({ added: 0, updated: 1, removed: 0 });
    expect(rowsChanged).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is an immediate all-zero no-op on the server-side row model", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = grid({ rowModelType: "serverSide" });

    await expect(core.applyTransactionAsync({ add: [{ id: "3", name: "carol", qty: 5 }] }))
      .resolves.toEqual({ added: 0, updated: 0, removed: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clientSide"));
    expect(vi.getTimerCount()).toBe(0);
    warn.mockRestore();
  });
});
