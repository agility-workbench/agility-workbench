export enum AggregateType {
  COUNT = "count",
  DISTINCT_COUNT = "distinct_count",
  SUM = "sum",
  AVG = "avg",
  MIN = "min",
  MAX = "max",
  MEDIAN = "median",
}

export function allAggregateTypes(): AggregateType[] {
  return [
    AggregateType.COUNT,
    AggregateType.DISTINCT_COUNT,
    AggregateType.SUM,
    AggregateType.AVG,
    AggregateType.MIN,
    AggregateType.MAX,
    AggregateType.MEDIAN,
  ];
}

export type AggregateScope = "none" | "page" | "all";

export interface AggregateModel {
  key: string;
  type: AggregateType;
}

/**
 * One aggregate assignment addressed by public colId — the shape `IGridAPI.setAggregates` /
 * `getAggregates` speak. (The internal `AggregateModel` keys entries by column instanceID.)
 * A column may appear several times with different types; each is a distinct measure.
 */
export interface ColumnAggregate {
  colId: string;
  type: AggregateType;
}
