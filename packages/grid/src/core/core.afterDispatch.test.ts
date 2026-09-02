/**
 * `core.afterDispatch(fn)` — end-of-dispatch work, for a listener whose response to a change is
 * expensive and idempotent (the column panel's full-list rebuild). One mutation emits several
 * events; this collapses the response into one run once the state has settled, WITHOUT deferring it
 * past the mutation: the run happens inside the `dispatch` call, so a caller reading state (or DOM)
 * right after the call sees the settled result.
 */
import { describe, it, expect, vi } from "vitest";
import { GridCore } from "./core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", region: "West", quarter: "Q1", revenue: 10 },
    { id: "2", region: "East", quarter: "Q2", revenue: 20 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  return core;
}

describe("core.afterDispatch", () => {
  it("runs once at the end of the dispatch, however many times it was asked for", () => {
    const core = makeGrid();
    const work = vi.fn();
    // Three events of one mutation, the shape the column panel sees.
    core.on("columnsChanged", () => core.afterDispatch(work));
    core.on("aggregateChanged", () => core.afterDispatch(work));
    core.on("pivotChanged", () => core.afterDispatch(work));
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    work.mockClear();

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("has already run by the time dispatch returns", () => {
    const core = makeGrid();
    const seen: boolean[] = [];
    core.on("pivotChanged", () => core.afterDispatch(() => seen.push(core.getPivotMode())));

    core.dispatch({ type: "pivotModeSet", on: true });
    // Not a microtask later: synchronously, and reading the settled state, not the state at the
    // moment the event fired.
    expect(seen).toEqual([true]);
  });

  it("runs immediately when there is no dispatch in progress", () => {
    const core = makeGrid();
    const order: string[] = [];
    core.afterDispatch(() => order.push("work"));
    order.push("after the call");
    expect(order).toEqual(["work", "after the call"]);
  });

  it("waits for the OUTERMOST dispatch when actions nest", () => {
    const core = makeGrid();
    const work = vi.fn();
    let nested = false;
    core.on("columnsChanged", () => {
      core.afterDispatch(work);
      if (nested) return;
      nested = true;
      // A listener dispatching from inside a dispatch: the inner call must not flush the queue —
      // the outer mutation is still only half applied.
      core.dispatch({ type: "quickFilterSet", text: "w" });
      expect(work).not.toHaveBeenCalled();
    });

    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("drains work that its own callbacks queue, without re-entering the drain", () => {
    const core = makeGrid();
    const order: string[] = [];
    const second = () => order.push("second");
    const first = () => {
      order.push("first");
      // A dispatch from inside the drain: its own end-of-dispatch work joins the drain in progress
      // rather than starting a second one, and still runs before the outer dispatch returns.
      core.on("filterChanged", () => core.afterDispatch(second));
      core.dispatch({ type: "quickFilterSet", text: "w" });
    };
    core.on("pivotChanged", () => core.afterDispatch(first));

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(order).toEqual(["first", "second"]);
  });
});
