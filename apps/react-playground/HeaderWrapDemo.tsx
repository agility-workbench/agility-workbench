import { useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

type DealRow = {
  id: number;
  customer: string;
  region: string;
  units: number;
  revenue: number;
  status: string;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Open", "Won", "Lost"];

function buildRows(): DealRow[] {
  return Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
    status: STATUSES[index % STATUSES.length],
  }));
}

/** Leaf ids the width slider resizes (the locked edge columns keep their width). */
const DATA_COLUMNS = ["customer", "region", "units", "revenue"];
const INITIAL_WIDTH = 140;

const controls = { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const, fontSize: 13 };
const check = { display: "flex", alignItems: "center", gap: 6 };

export function HeaderWrapDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const [wrap, setWrap] = useState(true);
  const [autoHeight, setAutoHeight] = useState(true);
  const [width, setWidth] = useState(INITIAL_WIDTH);
  const [order, setOrder] = useState("");

  // Width lives outside the defs: the slider resizes through the API, and the header re-measures.
  const columnDefs = useMemo<ReactColDef[]>(() => {
    const header = { wrapHeaderText: wrap, autoHeaderHeight: autoHeight };
    return [
      { colId: "id", key: "id", label: "Order #", width: 90, type: ColumnType.NUMBER, lockPosition: "left", ...header },
      {
        colId: "account", label: "Customer details for the quarterly account review", ...header,
        children: [
          { colId: "customer", key: "customer", label: "Customer account name (legal entity)", width: INITIAL_WIDTH, ...header },
          { colId: "region", key: "region", label: "Primary region of operation", width: INITIAL_WIDTH, ...header },
        ],
      },
      {
        colId: "performance", label: "Commercial performance this fiscal year", ...header,
        children: [
          { colId: "units", key: "units", label: "Units shipped to date across all warehouses", width: INITIAL_WIDTH, type: ColumnType.NUMBER, ...header },
          { colId: "revenue", key: "revenue", label: "Recognised revenue in reporting currency", width: INITIAL_WIDTH, type: ColumnType.CURRENCY, ...header },
        ],
      },
      { colId: "status", key: "status", label: "Deal status", width: 110, lockPosition: "right", ...header },
    ];
  }, [wrap, autoHeight]);

  const updateOrder = () => setOrder(apiRef.current?.getColumnState().map(s => s.colId).join(", ") ?? "");

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    // New defs reset widths to the defs' own; re-apply the slider's.
    api.setColumnWidths(DATA_COLUMNS.map(colId => ({ colId, widthPx: width })));
    updateOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnDefs]);

  const onWidth = (next: number) => {
    setWidth(next);
    apiRef.current?.setColumnWidths(DATA_COLUMNS.map(colId => ({ colId, widthPx: next })));
  };

  const api = () => apiRef.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={controls}>
        <label style={check}>
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
          Wrap header text
        </label>
        <label style={check}>
          <input type="checkbox" checked={autoHeight} onChange={(e) => setAutoHeight(e.target.checked)} />
          Auto header height
        </label>
        <label style={check}>
          Column width
          <input type="range" min={70} max={320} step={10} value={width} onChange={(e) => onWidth(Number(e.target.value))} />
          <span style={{ minWidth: 48 }}>{width}px</span>
        </label>
      </div>

      <div style={controls}>
        <button type="button" className="btn" onClick={() => api()?.setColumnPinned("region", "left")}>Pin region left</button>
        <button type="button" className="btn" onClick={() => api()?.setColumnPinned(DATA_COLUMNS, null)}>Unpin all</button>
        <button type="button" className="btn" onClick={() => api()?.setColumnVisible("units", false)}>Hide units</button>
        <button type="button" className="btn" onClick={() => api()?.setColumnsVisible(DATA_COLUMNS, true)}>Show all</button>
        <button type="button" className="btn" onClick={() => api()?.moveColumn("revenue", 0)}>Move revenue to index 0</button>
        <button type="button" className="btn" onClick={() => api()?.moveColumn("id", 99)}>Move Order # to the end (locked: no-op)</button>
        <span style={{ color: "#6b7280" }}>Order: {order}</span>
      </div>

      <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        The labels wrap with <code>wrapHeaderText</code> and the header grows to fit them with
        <code> autoHeaderHeight</code> (group level and leaf level independently; pinned sections stay
        level). Turn auto height off and wrapped labels are clipped at the configured height.
        <code> Order #</code> is <code>lockPosition: "left"</code> and <code>Deal status</code> is
        <code> "right"</code>: try dragging them, or dropping another column before Order #.
      </p>

      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Grid
          apiRef={apiRef}
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          columnPanel={{ trigger: "rail" }}
          onGridReady={(ready) => setOrder(ready.getColumnState().map(s => s.colId).join(", "))}
          onColumnsChanged={() => updateOrder()}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default HeaderWrapDemo;
