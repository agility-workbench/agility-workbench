export enum AggregateType {
  COUNT = "count",
  SUM = "sum",
  AVG = "avg",
  MIN = "min",
  MAX = "max",
  MEDIAN = "median",
}

export function allAggregateTypes(): AggregateType[] {
  return [
    AggregateType.COUNT,
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
