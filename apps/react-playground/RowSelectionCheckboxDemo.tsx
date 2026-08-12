import { useMemo, useRef, useState } from "react";

import { ColumnType } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";
import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";

type OrderRow = {
  id: string;
  customer: string;
  region: string;
  status: string;
  owner: string;
  total: number;
};

type SelectionMode = "single" | "multiple";
type CheckboxPin = "left" | "right" | null;

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Wonka", "Hooli"];
const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Ready", "Review", "Blocked"];
const OWNERS = ["Ava", "Liam", "Mia", "Noah", "Emma", "Ethan"];

function buildRows(): OrderRow[] {
  return Array.from({ length: 64 }, (_, index) => ({
    id: `ORD-${String(index + 1).padStart(3, "0")}`,
    customer: `${CUSTOMERS[index % CUSTOMERS.length]} ${Math.floor(index / CUSTOMERS.length) + 1}`,
    region: REGIONS[(index * 3) % REGIONS.length],
    status: STATUSES[(index * 5) % STATUSES.length],
    owner: OWNERS[(index * 7) % OWNERS.length],
    total: 850 + ((index * 1379) % 18_000),
  }));
}

export function RowSelectionCheckboxDemo() {
  const rows = useMemo(buildRows, []);
  const apiRef = useRef<IGridAPI | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastReason, setLastReason] = useState("ready");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("multiple");
  const [checkboxPin, setCheckboxPin] = useState<CheckboxPin>("left");
  const [checkboxPinnable, setCheckboxPinnable] = useState(true);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "Order", width: 110 },
    { colId: "customer", key: "customer", label: "Customer", width: 180, filter: "text" },
    { colId: "region", key: "region", label: "Region", width: 120, filter: "set" },
    { colId: "status", key: "status", label: "Status", width: 120, filter: "set" },
    { colId: "owner", key: "owner", label: "Owner", width: 120, filter: "set" },
    { colId: "total", key: "total", label: "Total", width: 130, type: ColumnType.CURRENCY },
  ], []);

  const syncSelection = (api: IGridAPI, reason = "api") => {
    setSelectedIds(api.getSelection().selectedRowIds.map(String));
    setLastReason(reason);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 12 }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          padding: "12px 14px", border: "1px solid var(--pte-frame-border-color, #d1d5db)",
          borderRadius: 8, background: "var(--pte-header-bg-color, #fff)", flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Row selection checkboxes</h2>
          <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.75 }}>
            Toggle rows additively, Shift-click to add a range, or use the tri-state header checkbox.
            The checkbox column is independent of row numbers.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => apiRef.current?.selectAllRows()}>
            Select all rows
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => apiRef.current?.selectRowsById(["ORD-002", "ORD-017", "ORD-036"])}
          >
            Select sample IDs
          </button>
          <button className="btn" type="button" onClick={() => apiRef.current?.deselectAllRows()}>
            Clear
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "8px 12px",
          border: "1px solid var(--pte-frame-border-color, #d1d5db)", borderRadius: 8,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Selection mode
          <select
            value={selectionMode}
            onChange={(event) => setSelectionMode(event.target.value as SelectionMode)}
          >
            <option value="multiple">Multiple</option>
            <option value="single">Single</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Initial checkbox pin
          <select
            value={checkboxPin ?? "none"}
            onChange={(event) => setCheckboxPin(
              event.target.value === "none" ? null : event.target.value as Exclude<CheckboxPin, null>,
            )}
          >
            <option value="left">Left</option>
            <option value="none">No pin</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={checkboxPinnable}
            onChange={(event) => setCheckboxPinnable(event.target.checked)}
          />
          Can be repinned
        </label>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Grid
            key={`${selectionMode}-${checkboxPin ?? "none"}-${checkboxPinnable}`}
            rowData={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            rowSelection={{
              mode: selectionMode,
              checkboxes: true,
              checkboxColumnPinned: checkboxPin,
              checkboxColumnPinnable: checkboxPinnable,
            }}
            quickFilter
            pagination
            pageSize={15}
            pageSizes={[15, 30, 60]}
            style={{ width: "100%", height: "100%" }}
            onGridReady={(api) => {
              apiRef.current = api;
              syncSelection(api, "ready");
            }}
            onSelectionChanged={({ snapshot, reason }) => {
              setSelectedIds(snapshot.selectedRowIds.map(String));
              setLastReason(reason ?? "unknown");
            }}
          />
        </div>

        <aside
          style={{
            width: 260, flexShrink: 0, alignSelf: "stretch", overflow: "auto", padding: 12,
            border: "1px solid var(--pte-frame-border-color, #d1d5db)", borderRadius: 8,
            background: "var(--pte-header-bg-color, #fff)", boxSizing: "border-box",
          }}
        >
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Selected rows</h3>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedIds.length}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>last change: {lastReason}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {selectedIds.slice(0, 18).map((id) => (
              <code
                key={id}
                style={{ padding: "3px 6px", borderRadius: 4, background: "var(--pte-input-bg-color, #eef2f7)", fontSize: 11 }}
              >
                {id}
              </code>
            ))}
          </div>
          {selectedIds.length > 18 && (
            <p style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>+{selectedIds.length - 18} more</p>
          )}
          {selectedIds.length === 0 && (
            <p style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>Use a row or header checkbox to begin.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default RowSelectionCheckboxDemo;
