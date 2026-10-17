import { createGrid, ColumnType, type ColDef, type IGridAPI } from "@grid";

import { checkbox, code, demoRoot, field, gridHost, h, note, select, toolbarRow } from "../dom";

const ROWS = 10_000;
const METRICS = 197; // + id, name (pinned left) and total (pinned right) = 200 columns
const OVERSCAN = [0, 1, 2, 4, 8, 16];

type Row = Record<string, number | string>;

function buildRows(): Row[] {
  const rows: Row[] = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    const row: Row = { id: r + 1, name: `Account ${String(r + 1).padStart(5, "0")}` };
    let total = 0;
    for (let c = 0; c < METRICS; c++) {
      const value = (r * 31 + c * 17) % 1_000;
      row[`m${c}`] = value;
      total += value;
    }
    row.total = total;
    rows[r] = row;
  }
  return rows;
}

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "ID", width: 80, pinned: "left", type: ColumnType.NUMBER },
  { colId: "name", key: "name", label: "Account", width: 150, pinned: "left", editable: true },
  ...Array.from({ length: METRICS }, (_, c): ColDef => ({
    colId: `m${c}`, key: `m${c}`, label: `Metric ${c + 1}`, width: 110, type: ColumnType.NUMBER, editable: true,
  })),
  { colId: "total", key: "total", label: "Total", width: 120, pinned: "right", type: ColumnType.NUMBER },
];

/**
 * Large data set: 10,000 rows × 200 columns. Rows are virtualized as always; with
 * `columnVirtualization` (the default) the centre section also renders only the columns near the
 * viewport, so the DOM holds pool rows × visible columns instead of pool rows × 200. Both options
 * are creation-only, so changing one rebuilds the grid.
 */
export function mountLargeDataDemo(container: HTMLElement): () => void {
  const rows = buildRows();
  const host = gridHost();
  const counter = h("span", { style: { fontFamily: "monospace", fontSize: "13px" } });
  let virtualize = true;
  let overscan = 2;
  let api: IGridAPI | null = null;
  let offs: Array<() => void> = [];
  let frame = 0;

  const count = () => {
    cancelAnimationFrame(frame);
    // After the grid's own frame-batched window update.
    frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const body = host.querySelector(".pte-body");
      const cells = body?.querySelectorAll(".pte-cell:not(.pte-full-width-cell)").length ?? 0;
      const centreRow = body?.querySelector<HTMLElement>(".pte-viewport .pte-row[data-view-idx]");
      const perRow = centreRow?.querySelectorAll(":scope > .pte-cell:not(.pte-full-width-cell)").length ?? 0;
      counter.textContent = `${cells.toLocaleString()} rendered .pte-cell elements in the body`
        + ` (${perRow} centre cells per row of ${METRICS})`;
    }));
  };

  const build = () => {
    offs.forEach(off => off());
    api?.destroy();
    api = createGrid(host, {
      rowData: rows,
      columnDefs: COLUMNS,
      rowIdKey: "id",
      rowSelection: { checkboxes: true, mode: "multiple" },
      columnVirtualization: virtualize,
      overscanColumnCount: overscan,
    });
    offs = [
      api.on("bodyScroll", count),
      api.on("columnWidthsChanged", count),
      api.on("columnsChanged", count),
      api.on("firstDataRendered", count),
    ];
    count();
  };

  const onResize = () => count();
  window.addEventListener("resize", onResize);

  container.appendChild(demoRoot(
    toolbarRow(
      field("Column virtualization", checkbox(virtualize, (value) => {
        virtualize = value;
        build();
      })),
      field("overscanColumnCount", select(OVERSCAN, overscan, (value) => {
        overscan = Number(value);
        build();
      })),
      counter,
    ),
    note(
      `${ROWS.toLocaleString()} rows × 200 columns (two pinned left, one pinned right). Scroll sideways`
      + " and watch the count: with column virtualization on, each row renders the visible centre"
      + " columns plus ",
      code("overscanColumnCount"),
      " on each side; pinned columns, the header and the aggregate row are always fully rendered."
      + " Both options are creation-only, so changing one rebuilds the grid.",
    ),
    host,
  ));
  build();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", onResize);
    offs.forEach(off => off());
    api?.destroy();
  };
}
