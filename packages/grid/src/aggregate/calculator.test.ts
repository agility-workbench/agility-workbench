import { describe, expect, it, vi } from "vitest";
import {
  AggregateCalculator,
  aggregateTypeByKey,
  defaultAggregateType,
  isKnownAggregateType,
} from "./calculator";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";

const numberCol = new Column({ colId: "amount", key: "amount", label: "Amount", type: ColumnType.NUMBER });
const textCol = new Column({ colId: "name", key: "name", label: "Name", type: ColumnType.STRING });
const calc = new AggregateCalculator();

describe("AggregateCalculator — groups with nothing to aggregate", () => {
  const blankRows = [{ amount: null }, { amount: undefined }, { amount: "" }, {}];

  it.each([
    AggregateType.SUM, AggregateType.AVG, AggregateType.MEDIAN, AggregateType.MIN, AggregateType.MAX,
  ])("%s of an empty group and of an all-blank group is null, not 0", (type) => {
    expect(calc.calculateAggregate(numberCol, type, [])).toBeNull();
    expect(calc.calculateAggregate(numberCol, type, blankRows)).toBeNull();
  });

  it.each([AggregateType.MIN, AggregateType.MAX])("%s of an all-blank text column is null", (type) => {
    expect(calc.calculateAggregate(textCol, type, [{ name: null }, { name: "" }])).toBeNull();
  });

  it("sum/avg/median/min/max of a number column with no numeric values are null", () => {
    const rows = [{ amount: "n/a" }, { amount: "tbd" }];
    for (const type of [AggregateType.SUM, AggregateType.AVG, AggregateType.MEDIAN, AggregateType.MIN, AggregateType.MAX]) {
      expect(calc.calculateAggregate(numberCol, type, rows)).toBeNull();
    }
  });

  it("count and distinct count are 0 for an empty or all-blank group", () => {
    for (const rows of [[], blankRows]) {
      expect(calc.calculateAggregate(numberCol, AggregateType.COUNT, rows)).toBe(0);
      expect(calc.calculateAggregate(numberCol, AggregateType.DISTINCT_COUNT, rows)).toBe(0);
    }
  });

  it("count counts non-blank values (what the Excel export's COUNTA counts), not rows", () => {
    const rows = [{ amount: 1 }, { amount: null }, { amount: 0 }, { amount: "" }, { amount: 1 }];
    expect(calc.calculateAggregate(numberCol, AggregateType.COUNT, rows)).toBe(3);
    expect(calc.calculateAggregate(numberCol, AggregateType.DISTINCT_COUNT, rows)).toBe(2);
  });

  it("blanks do not drag sum/avg/min down to 0 when real numbers exist", () => {
    const rows = [{ amount: 4 }, { amount: "" }, { amount: null }, { amount: 8 }];
    expect(calc.calculateAggregate(numberCol, AggregateType.SUM, rows)).toBe(12);
    expect(calc.calculateAggregate(numberCol, AggregateType.AVG, rows)).toBe(6);
    expect(calc.calculateAggregate(numberCol, AggregateType.MIN, rows)).toBe(4);
    expect(calc.calculateAggregate(numberCol, AggregateType.MEDIAN, rows)).toBe(6);
  });
});

describe("aggregateTypeByKey", () => {
  it("keeps the last type registered for a column", () => {
    const map = aggregateTypeByKey([
      { key: "a", type: AggregateType.SUM },
      { key: "b", type: AggregateType.COUNT },
      { key: "a", type: AggregateType.MAX },
    ]);
    expect(map.get("a")).toBe(AggregateType.MAX);
    expect(map.get("b")).toBe(AggregateType.COUNT);
  });
});

describe("AggregateCalculator — first / last", () => {
  it("pick the first / last NON-blank value in the order the rows come in", () => {
    const rows = [{ name: null }, { name: "" }, { name: "b" }, { name: "a" }, { name: undefined }];
    expect(calc.calculateAggregate(textCol, AggregateType.FIRST, rows)).toBe("b");
    expect(calc.calculateAggregate(textCol, AggregateType.LAST, rows)).toBe("a");
  });

  it("keep the source value as is (no numeric coercion, 0 is not blank)", () => {
    const rows = [{ amount: 0 }, { amount: "7" }];
    expect(calc.calculateAggregate(numberCol, AggregateType.FIRST, rows)).toBe(0);
    expect(calc.calculateAggregate(numberCol, AggregateType.LAST, rows)).toBe("7");
  });

  it("are null for an empty or all-blank group", () => {
    for (const type of [AggregateType.FIRST, AggregateType.LAST]) {
      expect(calc.calculateAggregate(textCol, type, [])).toBeNull();
      expect(calc.calculateAggregate(textCol, type, [{ name: null }, { name: "" }])).toBeNull();
    }
  });
});

describe("AggregateCalculator — custom functions", () => {
  it("receive the raw values with blanks INCLUDED, the row nodes and the colId", () => {
    const fn = vi.fn((_params: any) => "ok");
    const custom = new AggregateCalculator({ probe: fn });
    const nodes = [{ data: { amount: 1 } }, { data: { amount: null } }, { data: { amount: "" } }];
    expect(custom.calculateAggregate(numberCol, "probe", nodes)).toBe("ok");
    const params = fn.mock.calls[0][0];
    expect(params.values).toEqual([1, null, ""]);
    expect(params.rows).toEqual(nodes);
    expect(params.colId).toBe("amount");
  });

  it("wrap bare data rows (exports) in minimal nodes", () => {
    const fn = vi.fn((params: any) => params.rows.map((r: any) => r.data.amount).join("+"));
    const custom = new AggregateCalculator({ joined: fn });
    expect(custom.calculateAggregate(numberCol, "joined", [{ amount: 1 }, { amount: 2 }])).toBe("1+2");
  });

  it("an undefined result is null (an empty cell); an unregistered name computes null", () => {
    const custom = new AggregateCalculator({ nothing: () => undefined });
    expect(custom.calculateAggregate(numberCol, "nothing", [{ amount: 1 }])).toBeNull();
    expect(custom.calculateAggregate(numberCol, "missing", [{ amount: 1 }])).toBeNull();
  });

  it("a throwing function yields null and logs instead of breaking the caller", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const custom = new AggregateCalculator({ boom: () => { throw new Error("nope"); } });
    expect(custom.calculateAggregate(numberCol, "boom", [{ amount: 1 }])).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("fill the footer map for columns whose model entry or default names them", () => {
    const weighted = new Column({
      colId: "w", key: "amount", label: "W", type: ColumnType.NUMBER, aggFunc: "double",
    });
    const custom = new AggregateCalculator({ double: ({ values }) => (values as number[]).reduce((a, v) => a + v * 2, 0) });
    const values = custom.calculateAggregates([weighted], [], [{ amount: 1 }, { amount: 2 }]);
    expect(values.get(weighted.instanceID)).toBe(6);
  });
});

describe("defaultAggregateType — the one default rule", () => {
  const registry = { mine: () => 1 };

  it("is ColDef.aggFunc when it names a built-in or a registered function", () => {
    expect(defaultAggregateType({ isComputableType: () => true, aggFunc: AggregateType.LAST }, registry))
      .toBe(AggregateType.LAST);
    expect(defaultAggregateType({ isComputableType: () => false, aggFunc: "mine" }, registry)).toBe("mine");
  });

  it("falls back to sum (numeric) / count (otherwise) for no, unknown or opted-out aggFunc", () => {
    expect(defaultAggregateType({ isComputableType: () => true }, registry)).toBe(AggregateType.SUM);
    expect(defaultAggregateType({ isComputableType: () => false }, registry)).toBe(AggregateType.COUNT);
    expect(defaultAggregateType({ isComputableType: () => true, aggFunc: "nope" }, registry))
      .toBe(AggregateType.SUM);
    expect(defaultAggregateType({ isComputableType: () => true, aggFunc: "mine", aggregatable: false }, registry))
      .toBe(AggregateType.SUM);
  });

  it("without a registry (server-side) trusts any non-empty name", () => {
    expect(isKnownAggregateType("p95", undefined)).toBe(true);
    expect(isKnownAggregateType("p95", {})).toBe(false);
    expect(isKnownAggregateType(AggregateType.FIRST, {})).toBe(true);
  });
});
