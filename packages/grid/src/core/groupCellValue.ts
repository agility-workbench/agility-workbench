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
  const agg = node.aggregateValues?.[col.instanceID];
  if (agg != null && agg !== "") return { value: agg, formatted: col.formatValue(agg, node) };
  if (col.isAutoGroupColumn() || col.isTreeColumn() || col.groupLevel === node.level) {
    const label = resolvers.groupLabel(node);
    return { value: label, formatted: label };
  }
  if (col.groupValueGetter) {
    const value = col.groupValueGetter(resolvers.groupValueParams(node));
    return { value, formatted: col.formatValue(value, node) };
  }
  return { ...EMPTY };
}
