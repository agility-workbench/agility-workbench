import { GridOptions } from "./gridOptions";

type RowId = string;

export interface IRowNode<Row = any> {
  id: RowId;
  data: Row;

  // current position in the "view" (optional, can compute on fly)
  viewIndex: number;

  // state
  selected: boolean;

  // future: group/tree
  type: "leaf" | "group";
  level: number;
  isGroup: boolean;
  isExpanded: boolean;
  children?: IRowNode<Row>[];
  childCount?: number;
  groupKey?: string;
  groupValue?: any;
  aggregateValues?: { [key: string]: any };
  /** Stable parent group id while row grouping is active. Used by sticky group-row rendering. */
  parentId?: string;
  /** Set only on rows rendered in the frozen top/bottom bands. */
  rowPinned?: "top" | "bottom";
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
