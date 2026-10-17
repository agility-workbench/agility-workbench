import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { IGridAPI, ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";

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

/**
 * Large data set: 10,000 rows × 200 columns. Same page as the vanilla playground's
 * large-data-demo.ts. Both virtualization options are creation-only, so the grid is remounted
 * (a new `key`) when one changes.
 */
export function LargeDataDemo() {
  const rows = useMemo(() => buildRows(), []);
  const [virtualize, setVirtualize] = useState(true);
  const [overscan, setOverscan] = useState(2);
  const [count, setCount] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const offs = useRef<Array<() => void>>([]);
  const frame = useRef(0);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "ID", width: 80, pinned: "left", type: ColumnType.NUMBER },
    { colId: "name", key: "name", label: "Account", width: 150, pinned: "left", editable: true },
    ...Array.from({ length: METRICS }, (_, c): ReactColDef => ({
      colId: `m${c}`, key: `m${c}`, label: `Metric ${c + 1}`, width: 110, type: ColumnType.NUMBER, editable: true,
    })),
    { colId: "total", key: "total", label: "Total", width: 120, pinned: "right", type: ColumnType.NUMBER },
  ], []);

  const recount = useCallback(() => {
    cancelAnimationFrame(frame.current);
    // After the grid's own frame-batched window update.
    frame.current = requestAnimationFrame(() => requestAnimationFrame(() => {
      const body = hostRef.current?.querySelector(".pte-body");
      const cells = body?.querySelectorAll(".pte-cell:not(.pte-full-width-cell)").length ?? 0;
      const centreRow = body?.querySelector<HTMLElement>(".pte-viewport .pte-row[data-view-idx]");
      const perRow = centreRow?.querySelectorAll(":scope > .pte-cell:not(.pte-full-width-cell)").length ?? 0;
      setCount(`${cells.toLocaleString()} rendered .pte-cell elements in the body (${perRow} centre cells per row of ${METRICS})`);
    }));
  }, []);

  const onGridReady = useCallback((api: IGridAPI) => {
    offs.current.forEach(off => off());
    offs.current = [
      api.on("bodyScroll", recount),
      api.on("columnWidthsChanged", recount),
      api.on("columnsChanged", recount),
      api.on("firstDataRendered", recount),
    ];
    recount();
  }, [recount]);

  useEffect(() => {
    window.addEventListener("resize", recount);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("resize", recount);
      offs.current.forEach(off => off());
      offs.current = [];
    };
  }, [recount]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={virtualize} onChange={(e) => setVirtualize(e.target.checked)} />
          Column virtualization
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          overscanColumnCount
          <select value={overscan} onChange={(e) => setOverscan(Number(e.target.value))}>
            {OVERSCAN.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span style={{ fontFamily: "monospace", fontSize: 13 }}>{count}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        {ROWS.toLocaleString()} rows × 200 columns (two pinned left, one pinned right). Scroll sideways
        and watch the count: with column virtualization on, each row renders the visible centre columns
        plus <code>overscanColumnCount</code> on each side; pinned columns, the header and the aggregate
        row are always fully rendered. Both options are creation-only, so changing one rebuilds the grid.
      </p>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Grid
          key={`${virtualize}-${overscan}`}
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowSelection={{ mode: "multiple", checkboxes: true }}
          columnVirtualization={virtualize}
          overscanColumnCount={overscan}
          onGridReady={onGridReady}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default LargeDataDemo;
