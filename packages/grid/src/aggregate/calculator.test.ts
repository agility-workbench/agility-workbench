import { describe, expect, it } from "vitest";
import { AggregateCalculator, aggregateTypeByKey } from "./calculator";
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
