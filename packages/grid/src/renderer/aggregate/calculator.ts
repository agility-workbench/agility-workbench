import { Column } from "../../column/column";
import { AggregateCalculator as CoreAggregateCalculator } from "../../aggregate/calculator";
import { IRowNode } from "../../interfaces/iRowNode";

export class AggregateCalculator extends CoreAggregateCalculator {
  formatAggregateDisplay(col: Column, value: any): string {
    if (value == null) return "";
    try {
      return col.formatValue(value, { data: null } as IRowNode);
    } catch {
      return String(value);
    }
  }

}
