import { Column } from "../column/column";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";
import { isBlankValue } from "../misc";

/**
 * The one aggregate type each column shows outside pivot, keyed by column instance id. The model
 * may hold several types for a column (`setAggregates` accepts them; pivot turns each into its own
 * generated column), but a group row cell and the footer cell have room for one: the LAST type
 * registered for the column wins, on group rows and in the footer alike, so the two always agree.
 */
export function aggregateTypeByKey(aggregates: readonly AggregateModel[]): Map<string, AggregateType> {
  return new Map(aggregates.map(a => [a.key, a.type]));
}

export class AggregateCalculator {
  calculateAggregates(columns: Column[], aggregates: AggregateModel[], rows: any[]): Map<string, any> {
    const values = new Map<string, any>();
    const aggregateMap = aggregateTypeByKey(aggregates);

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
    if (isBlankValue(value)) return null;
    const num = value instanceof Date ? value.getTime() : Number(value);
    return Number.isFinite(num) ? num : null;
  }

  /**
   * One aggregate over `rows`. Blank cells (null, undefined, "") take no part: `count` counts the
   * non-blank values (what the Excel export's COUNTA formula counts), `distinct_count` the distinct
   * non-blank ones, and with nothing to aggregate — an empty group, or one whose cells are all
   * blank or non-numeric — sum, avg, median, min, and max are `null`, which every surface renders
   * as an empty cell rather than a misleading `0`.
   */
  calculateAggregate(col: Column, aggType: AggregateType, rows: any[]): any {
    const rawValues = rows.map(row => this.getRawCellValue(row, col)).filter(v => !isBlankValue(v));
    if (aggType === AggregateType.COUNT) {
      return rawValues.length;
    }
    if (aggType === AggregateType.DISTINCT_COUNT) {
      return new Set(rawValues.map(v => String(v))).size;
    }
    if (rawValues.length === 0) return null;

    const collator = col.getCollator();
    const isNumeric = col.isComputableType();
    const numbers = () => rawValues
      .map(v => this.valueToNumber(v))
      .filter((v): v is number => v != null);

    // A numeric column's min/max compares numbers, so with none there is nothing to pick.
    if (isNumeric && (aggType === AggregateType.MIN || aggType === AggregateType.MAX) && numbers().length === 0) {
      return null;
    }

    switch (aggType) {
      case AggregateType.SUM: {
        const nums = numbers();
        if (nums.length === 0) return null;
        return nums.reduce((sum, v) => sum + v, 0);
      }
      case AggregateType.AVG: {
        const nums = numbers();
        if (nums.length === 0) return null;
        const sum = nums.reduce((acc, v) => acc + v, 0);
        return sum / nums.length;
      }
      case AggregateType.MEDIAN: {
        const nums = numbers().sort((a, b) => a - b);
        if (nums.length === 0) return null;
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
        return best;
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
        return best;
      }
      default:
        return null;
    }
  }

  getRawCellValue(row: any, col: Column): any {
    if (row && typeof row === "object" && "data" in row) {
      return col.getValue(row);
    }
    return col.getValue({ data: row } as any);
  }
}
