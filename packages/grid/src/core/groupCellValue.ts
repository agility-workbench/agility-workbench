import type { Column } from "../column/column";
import type { IRowNode } from "../interfaces/iRowNode";

/** What a group row's cell holds: the raw value and the text a surface writes for it. */
export type GroupCellValue = { value: unknown; formatted: string };

const EMPTY: GroupCellValue = { value: undefined, formatted: "" };

/**
 * The value convention for a group row's cell. A group row has no underlying data row, so a value
 * column reads the aggregate stamped on the node and the group's label column reads the label the
 * grid resolves (`groupLabel`, which carries the `groupChildCount` policy). Every other column is
 * empty. Kept free of the core so the clipboard serializer can share the rule with
 * `GridCore.getGroupCellValue` without a core reference; the two must never diverge.
 *
 * Precondition: `node.isGroup`. A leaf gets the empty result rather than a throw, since callers
 * read rows they did not classify themselves.
 */
export function groupCellValue(
  col: Column,
  node: IRowNode,
  groupLabel: (node: IRowNode) => string,
): GroupCellValue {
  if (!node.isGroup) return { ...EMPTY };
  const agg = node.aggregateValues?.[col.instanceID];
  if (agg != null && agg !== "") return { value: agg, formatted: col.formatValue(agg, node) };
  if (col.isAutoGroupColumn() || col.isTreeColumn() || col.groupLevel === node.level) {
    const label = groupLabel(node);
    return { value: label, formatted: label };
  }
  return { ...EMPTY };
}
