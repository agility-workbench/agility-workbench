import { Column } from "../column/column";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";

export class AggregateCalculator {
  calculateAggregates(columns: Column[], aggregates: AggregateModel[], rows: any[]): Map<string, any> {
    const values = new Map<string, any>();
    const aggregateMap = new Map(aggregates.map(a => [a.key, a.type]));

    for (const col of columns) {
      if (col.hidden) continue;
      const op = aggregateMap.get(col.instanceID) ?? this.getDefaultAggregateOp(col);
      values.set(col.instanceID, this.calculateAggregate(col, op, rows));
    }

    return values;
  }

  getDefaultAggregateOp(col: { isComputableType(): boolean }): AggregateType {
    return col.isComputableType() ? AggregateType.SUM : AggregateType.COUNT;
  }

  valueToNumber(value: any): number | null {
    if (value == null) return null;
    const num = value instanceof Date ? value.getTime() : Number(value);
    return Number.isFinite(num) ? num : null;
  }

  calculateAggregate(col: Column, aggType: AggregateType, rows: any[]): any {
    if (aggType === AggregateType.COUNT) {
      return rows.length;
    }

    const rawValues = rows.map(row => this.getRawCellValue(row, col)).filter(v => v != null);
    if (aggType === AggregateType.DISTINCT_COUNT) {
      return new Set(rawValues.map(v => String(v))).size;
    }
    if (rawValues.length === 0) {
      if (aggType === AggregateType.SUM || aggType === AggregateType.AVG || aggType === AggregateType.MEDIAN) return 0;
      return "";
    }

    const collator = col.getCollator();
    const isNumeric = col.isComputableType();

    switch (aggType) {
      case AggregateType.SUM: {
        const nums = rawValues
          .map(v => this.valueToNumber(v))
          .filter((v): v is number => Number.isFinite(v));
        return nums.reduce((sum, v) => sum + v, 0);
      }
      case AggregateType.AVG: {
        const nums = rawValues
          .map(v => this.valueToNumber(v))
          .filter((v): v is number => Number.isFinite(v));
        if (nums.length === 0) return 0;
        const sum = nums.reduce((acc, v) => acc + v, 0);
        return sum / nums.length;
      }
      case AggregateType.MEDIAN: {
        const nums = rawValues
          .map(v => this.valueToNumber(v))
          .filter((v): v is number => Number.isFinite(v))
          .sort((a, b) => a - b);
        if (nums.length === 0) return 0;
        const mid = Math.floor(nums.length / 2);
        if (nums.length % 2 === 0) {
          return (nums[mid - 1] + nums[mid]) / 2;
        }
        return nums[mid];
      }
      case AggregateType.MIN: {
        let best: any = null;
        for (const v of rawValues) {
          if (best == null) {
            best = v;
            continue;
          }
          if (isNumeric) {
            const next = this.valueToNumber(v);
            const prev = this.valueToNumber(best);
            if (next == null) continue;
            if (prev == null || next < prev) {
              best = v;
            }
          } else {
            const cmp = collator.compare(String(v), String(best));
            if (cmp < 0) best = v;
          }
        }
        return best ?? "";
      }
      case AggregateType.MAX: {
        let best: any = null;
        for (const v of rawValues) {
          if (best == null) {
            best = v;
            continue;
          }
          if (isNumeric) {
            const next = this.valueToNumber(v);
            const prev = this.valueToNumber(best);
            if (next == null) continue;
            if (prev == null || next > prev) {
              best = v;
            }
          } else {
            const cmp = collator.compare(String(v), String(best));
            if (cmp > 0) best = v;
          }
        }
        return best ?? "";
      }
      default:
        return "";
    }
  }

  getRawCellValue(row: any, col: Column): any {
    if (row && typeof row === "object" && "data" in row) {
      return col.getValue(row);
    }
    return col.getValue({ data: row } as any);
  }
}
