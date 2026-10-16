import { Column } from "../column/column";
import {
  AggregateFunction,
  AggregateKind,
  AggregateModel,
  AggregateType,
  isBuiltInAggregateType,
} from "../interfaces/aggregate";
import { IRowNode } from "../interfaces/iRowNode";
import { isBlankValue } from "../misc";

/** The custom aggregate functions a grid knows, by name (`GridOptions.aggFuncs`). */
export type AggregateRegistry = Readonly<Record<string, AggregateFunction>>;

/**
 * Whether an aggregate name can be used: a built-in, or a key of the registry. An absent registry
 * trusts every name — the server-side row model's server computes the aggregates, so the client
 * cannot know (or need) the functions behind them.
 */
export function isKnownAggregateType(type: AggregateKind, registry: AggregateRegistry | undefined): boolean {
  if (isBuiltInAggregateType(type)) return true;
  if (registry === undefined) return typeof type === "string" && type !== "";
  return Object.prototype.hasOwnProperty.call(registry, type) && typeof registry[type] === "function";
}

/** What {@link defaultAggregateType} reads off a column. */
export interface AggregateDefaultSource {
  isComputableType(): boolean;
  aggFunc?: AggregateKind;
  aggregatable?: boolean;
}

/**
 * THE rule for a column's default aggregate function — what the footer, the aggregate menu and a
 * typeless assignment use: `ColDef.aggFunc` when it names a usable function on an aggregatable
 * column, otherwise sum for numeric columns and count for the rest. Every surface resolves the
 * default through here, so the footer label, the menu's checkmark and the computed value agree.
 * (The core warns about an unusable `aggFunc` once, when the column definitions arrive; this
 * stays silent because it runs on every repaint.)
 */
export function defaultAggregateType(col: AggregateDefaultSource, registry?: AggregateRegistry): AggregateKind {
  const named = col.aggFunc;
  if (named != null && col.aggregatable !== false && isKnownAggregateType(named, registry)) return named;
  return col.isComputableType() ? AggregateType.SUM : AggregateType.COUNT;
}

/**
 * The one aggregate type each column shows outside pivot, keyed by column instance id. The model
 * may hold several types for a column (`setAggregates` accepts them; pivot turns each into its own
 * generated column), but a group row cell and the footer cell have room for one: the LAST type
 * registered for the column wins, on group rows and in the footer alike, so the two always agree.
 */
export function aggregateTypeByKey(aggregates: readonly AggregateModel[]): Map<string, AggregateKind> {
  return new Map(aggregates.map(a => [a.key, a.type]));
}

export class AggregateCalculator {
  /**
   * @param aggFuncs The grid's custom functions (`GridOptions.aggFuncs`). Omitted, a custom name
   * computes nothing (`null`) and every name counts as known — see {@link isKnownAggregateType}.
   */
  constructor(private readonly aggFuncs?: AggregateRegistry) {}

  calculateAggregates(columns: Column[], aggregates: AggregateModel[], rows: any[]): Map<string, any> {
    const values = new Map<string, any>();
    const aggregateMap = aggregateTypeByKey(aggregates);

    for (const col of columns) {
      if (col.hidden) continue;
      const op = aggregateMap.get(col.instanceID) ?? this.getDefaultType(col);
      values.set(col.instanceID, this.calculateAggregate(col, op, rows));
    }

    return values;
  }

  /** The column's default function under this calculator's registry ({@link defaultAggregateType}). */
  getDefaultType(col: AggregateDefaultSource): AggregateKind {
    return defaultAggregateType(col, this.aggFuncs);
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
   * as an empty cell rather than a misleading `0`. `first` / `last` pick the first / last non-blank
   * value in the order `rows` come in, which every caller passes as the display order (after sort).
   *
   * A custom function (a name from `GridOptions.aggFuncs`) sees every value, blanks included; an
   * unregistered name computes `null` (the core has already warned about it and swapped in the
   * column's default before the name could get here through the model).
   */
  calculateAggregate(col: Column, aggType: AggregateKind, rows: any[]): any {
    if (!isBuiltInAggregateType(aggType)) return this.calculateCustomAggregate(col, aggType, rows);
    const rawValues = rows.map(row => this.getRawCellValue(row, col)).filter(v => !isBlankValue(v));
    if (aggType === AggregateType.FIRST) return rawValues.length > 0 ? rawValues[0] : null;
    if (aggType === AggregateType.LAST) return rawValues.length > 0 ? rawValues[rawValues.length - 1] : null;
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

  private calculateCustomAggregate(col: Column, name: string, rows: any[]): any {
    const fn = this.aggFuncs?.[name];
    if (typeof fn !== "function") return null;
    const nodes = rows.map(row => toRowNode(row));
    try {
      const result = fn({ values: nodes.map(node => this.getRawCellValue(node, col)), rows: nodes, colId: col.colId });
      return result === undefined ? null : result;
    } catch (err) {
      // One throwing group must not take the whole repaint down: its cell stays empty.
      console.error(`Aggregate function "${name}" threw for column "${col.colId}"`, err);
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

// Rows reach the calculator as nodes (the row models) or as bare data objects (exports); a custom
// function is promised nodes, so bare data is wrapped in a minimal one.
function toRowNode(row: any): IRowNode {
  if (row && typeof row === "object" && "data" in row) return row as IRowNode;
  return { data: row } as IRowNode;
}
