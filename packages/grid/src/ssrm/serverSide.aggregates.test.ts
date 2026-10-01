import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideAggregationParams, IServerSideDataSource, IServerSideGetRowsParams } from "../interfaces/serverSide";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Forty rows, amount 1..40: the first page (10 rows) sums to 55, the whole dataset to 820, so a
// footer total says at a glance which scope produced it and where it came from.
const ROWS = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, amount: i + 1 }));
const WHOLE_DATASET_SUM = 820;
const FIRST_PAGE_SUM = 55;

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function getRows({ request, success }: IServerSideGetRowsParams): void {
  const start = request.startRow ?? 0;
  const end = request.endRow ?? ROWS.length;
  success({ rows: ROWS.slice(start, end).map(row => ({ ...row })), totalRows: ROWS.length });
}

/** A server aggregation source that logs who was asked, with what scope. */
function aggregatesFrom(label: string, log: string[]) {
  return ({ request, success }: IServerSideAggregationParams) => {
    log.push(`${label}:${request.aggregateScope}`);
    success({ values: { amount: WHOLE_DATASET_SUM } });
  };
}

function makeCore(source: IServerSideDataSource, options: object = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    pagination: true,
    pageSize: 10,
    serverSideBlockSize: 10,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "amount", key: "amount", label: "Amount", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource(source);
  const amountId = core.getColumnModel().getByColId("amount")!.instanceID;
  const total = () => core.getRowModel().getAggregateValues().get(amountId);
  return { core, total };
}

describe("server-side whole-dataset aggregation", () => {
  it("a data source's own getAggregates makes the entire-dataset scope available", async () => {
    const log: string[] = [];
    const { core, total } = makeCore({ getRows, getAggregates: aggregatesFrom("dataSource", log) });
    await flush();

    expect(core.isAggregateScopeLockedToPage()).toBe(false);

    // Assigning the first aggregate turns the footer on at page scope, summed in the browser.
    core.setAggregateModel([{ key: "amount", type: AggregateType.SUM }]);
    await flush();
    expect(core.getAggregateScope()).toBe("page");
    expect(total()).toBe(FIRST_PAGE_SUM);
    expect(log).toEqual([]);

    // Entire dataset: the server is asked, once, and its number is the footer's.
    core.setAggregateScope("all");
    await flush();
    expect(core.getAggregateScope()).toBe("all");
    expect(log).toEqual(["dataSource:all"]);
    expect(total()).toBe(WHOLE_DATASET_SUM);
  });

  it("an explicit serverSideAggregationSource wins over the data source's method", async () => {
    const log: string[] = [];
    const { core, total } = makeCore(
      { getRows, getAggregates: aggregatesFrom("dataSource", log) },
      { serverSideAggregationSource: aggregatesFrom("option", log) },
    );
    await flush();
    core.setAggregateModel([{ key: "amount", type: AggregateType.SUM }]);
    core.setAggregateScope("all");
    await flush();

    expect(log).toEqual(["option:all"]);
    expect(total()).toBe(WHOLE_DATASET_SUM);
  });

  it("clearing the option falls back to the data source's method and keeps the scope", async () => {
    const log: string[] = [];
    const { core, total } = makeCore(
      { getRows, getAggregates: aggregatesFrom("dataSource", log) },
      { serverSideAggregationSource: aggregatesFrom("option", log) },
    );
    await flush();
    core.setAggregateModel([{ key: "amount", type: AggregateType.SUM }]);
    core.setAggregateScope("all");
    await flush();
    log.length = 0;

    core.setServerSideAggregationSource(null);
    await flush();

    expect(core.isAggregateScopeLockedToPage()).toBe(false);
    expect(core.getAggregateScope()).toBe("all");
    expect(log).toEqual(["dataSource:all"]);
    expect(total()).toBe(WHOLE_DATASET_SUM);
  });

  it("without any source the scope is locked to the page, and swapping data sources moves the lock", async () => {
    const log: string[] = [];
    const { core, total } = makeCore({ getRows });
    await flush();
    core.setAggregateModel([{ key: "amount", type: AggregateType.SUM }]);
    await flush();

    expect(core.isAggregateScopeLockedToPage()).toBe(true);
    // A requested "all" is kept at "page": the browser cannot sum rows it never holds, and no
    // server is ever asked.
    core.setAggregateScope("all");
    await flush();
    expect(core.getAggregateScope()).toBe("page");
    expect(total()).toBe(FIRST_PAGE_SUM);
    expect(log).toEqual([]);

    // A data source that can answer unlocks the scope.
    core.setServerSideDataSource({ getRows, getAggregates: aggregatesFrom("dataSource", log) });
    await flush();
    expect(core.isAggregateScopeLockedToPage()).toBe(false);
    core.setAggregateScope("all");
    await flush();
    expect(core.getAggregateScope()).toBe("all");
    expect(total()).toBe(WHOLE_DATASET_SUM);

    // And one that cannot locks it again, dropping the live scope back to the page.
    core.setServerSideDataSource({ getRows });
    await flush();
    expect(core.isAggregateScopeLockedToPage()).toBe(true);
    expect(core.getAggregateScope()).toBe("page");
    expect(total()).toBe(FIRST_PAGE_SUM);
  });

  it("calls a class-based data source's getAggregates as a method of that object", async () => {
    class OrdersSource implements IServerSideDataSource {
      private readonly grandTotal = WHOLE_DATASET_SUM;
      getRows(params: IServerSideGetRowsParams): void {
        getRows(params);
      }
      getAggregates({ success }: IServerSideAggregationParams): void {
        // Throws if invoked detached from the instance.
        success({ values: { amount: this.grandTotal } });
      }
    }
    const { core, total } = makeCore(new OrdersSource());
    await flush();
    core.setAggregateModel([{ key: "amount", type: AggregateType.SUM }]);
    core.setAggregateScope("all");
    await flush();

    expect(core.getAggregateScope()).toBe("all");
    expect(total()).toBe(WHOLE_DATASET_SUM);
  });
});
