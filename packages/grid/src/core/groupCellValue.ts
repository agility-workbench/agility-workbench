import type { Column } from "../column/column";
import type { IRowNode } from "../interfaces/iRowNode";
import type { GroupValueGetterParams } from "../interfaces/column";

/** What a group row's cell holds: the raw value and the text a surface writes for it. */
export type GroupCellValue = { value: unknown; formatted: string };

const EMPTY: GroupCellValue = { value: undefined, formatted: "" };

/**
 * What the rule needs from the grid that a pure helper cannot compute: the group's label (which
 * carries the `groupChildCount` policy) and the params a column's `groupValueGetter` receives
 * (whose `data` and colId-keyed `aggregates` depend on the row model and column model).
 */
export type GroupCellValueResolvers = {
  /** Whether `col` is the column that holds `node`'s label. Defaults to the auto-group / tree
   * column and the level's own column; the core widens it for footers under "groupRows". */
  isLabelColumn?: (col: Column, node: IRowNode) => boolean;
  groupLabel: (node: IRowNode) => string;
  groupValueParams: (node: IRowNode) => GroupValueGetterParams;
};

/**
 * The value convention for a group row's cell. A group row has no underlying data row, so a value
 * column reads the aggregate stamped on the node and the group's label column reads the label the
 * grid resolves. A column with a `groupValueGetter` holds what it returns; every other column is
 * empty. Kept free of the core so the clipboard serializer can share the rule with
 * `GridCore.getGroupCellValue` without a core reference; the two must never diverge.
 *
 * Precondition: `node.isGroup`. A leaf gets the empty result rather than a throw, since callers
 * read rows they did not classify themselves.
 */
export function groupCellValue(
  col: Column,
  node: IRowNode,
  resolvers: GroupCellValueResolvers,
): GroupCellValue {
  if (!node.isGroup) return { ...EMPTY };
  const isLabelColumn = resolvers.isLabelColumn
    ? resolvers.isLabelColumn(col, node)
    : col.isAutoGroupColumn() || col.isTreeColumn() || col.groupLevel === node.level;
  // A footer's label column always shows the label: under "groupRows" that column is an ordinary
  // data column which may carry an aggregate, and a footer row with no "Total …" reads as a group.
  if (node.footer && isLabelColumn) {
    const label = resolvers.groupLabel(node);
    return { value: label, formatted: label };
  }
  const agg = node.aggregateValues?.[col.instanceID];
  if (agg != null && agg !== "") return { value: agg, formatted: col.formatValue(agg, node) };
  if (isLabelColumn) {
    const label = resolvers.groupLabel(node);
    return { value: label, formatted: label };
  }
  if (col.groupValueGetter) {
    const value = col.groupValueGetter(resolvers.groupValueParams(node));
    return { value, formatted: col.formatValue(value, node) };
  }
  return { ...EMPTY };
}
