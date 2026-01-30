export type GridOptions<Row extends object> = {
  getRowId?: (row: Row) => string;
  rowIdKey?: keyof Row & string;
};

export function createRowIdFactory<Row extends object>(opts: GridOptions<Row>): (row: Row) => string {
  const wm = new WeakMap<object, string>();
  let seq = 1;

  return (row: Row): string => {
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
