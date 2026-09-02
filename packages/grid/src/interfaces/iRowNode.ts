import { GridOptions } from "./gridOptions";

type RowId = string;

export interface IRowNode<Row = any> {
  id: RowId;
  data: Row;

  // current position in the "view" (optional, can compute on fly)
  viewIndex: number;

  // state
  selected: boolean;

  // Row-group nodes are synthetic. Tree-data nodes may be either synthetic ancestors (`isGroup`)
  // or ordinary data-bearing rows (`isTreeData`) that also own children.
  type: "leaf" | "group";
  level: number;
  isGroup: boolean;
  isExpanded: boolean;
  /**
   * False for group nodes that can never open (pivot mode's deepest level, the synthesized pivot
   * grand-total row): no chevron, expand actions no-op. Absent/true = normal expandable group.
   */
  expandable?: boolean;
  children?: IRowNode<Row>[];
  childCount?: number;
  groupKey?: string;
  groupValue?: any;
  /** True for nodes participating in a tree-data hierarchy, including ordinary data rows. */
  isTreeData?: boolean;
  /** Display label for this node in the generated tree column. */
  treeKey?: string;
  aggregateValues?: { [key: string]: any };
  /** Stable parent group id while row grouping is active. Used by sticky group-row rendering. */
  parentId?: string;
  /** Set only on rows rendered in the frozen top/bottom bands. */
  rowPinned?: "top" | "bottom";
}

/**
 * The label a group (or tree) row shows: its key, followed by the child count when one is known.
 *
 * One owner for the format, because every surface that writes a group row — the cell renderer,
 * the clipboard, both exporters — has to agree with what the user is looking at. In particular an
 * unknown count is written as nothing at all, never `(0)`: a server-side group whose data source
 * does not supply a child count has no count, and claiming it has zero children states something
 * false about the data on screen.
 *
 * `childCount` overrides the node's own for a caller that computed the count itself (the grouped
 * Excel export walks the leaves it is about to write).
 */
export function groupRowLabel(node: IRowNode, childCount = node.childCount): string {
  const text = node.treeKey
    ?? (node.groupValue == null || node.groupValue === "" ? node.groupKey ?? "" : String(node.groupValue));
  return childCount != null ? `${text} (${childCount})` : text;
}

export function createRowIdFactory(opts: GridOptions): (row: object) => string {
  const wm = new WeakMap<object, string>();
  let seq = 1;

  return (row: object): string => {
    if (opts.getRowId) return String(opts.getRowId(row));
    if (opts.rowIdKey) {
      const v = (row as any)[opts.rowIdKey];
      if (v != null) return String(v);
    }
    const existing = wm.get(row);
    if (existing) return existing;
    const id = `r_${seq++}`;
    wm.set(row, id);
    return id;
  };
}
