import { useMemo, useState } from "react";

import {
  ColumnType,
  Grid,
  type ReactColDef,
  type SavedGridView,
} from "@react-grid";

type Row = {
  id: number;
  region: string;
  country: string;
  product: string;
  owner: string;
  revenue: number;
};

const STORAGE_KEY = "pte-saved-views-demo";

function loadViews(): SavedGridView[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export function SavedViewsDemo() {
  const [views, setViews] = useState<SavedGridView[]>(loadViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    region: ["Americas", "EMEA", "APAC"][index % 3],
    country: ["USA", "Germany", "India", "Japan", "Brazil", "France"][(index * 5) % 6],
    product: ["Analytics", "Cloud", "Security", "Support"][(index * 3) % 4],
    owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][(index * 2) % 5],
    revenue: 15_000 + ((index * 8_719) % 110_000),
  })), []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "product", key: "product", label: "Product", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 120 },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 140,
      type: ColumnType.CURRENCY,
    },
  ], []);

  const persistViews = (next: SavedGridView[]) => {
    setViews(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 560px", fontSize: 12, lineHeight: 1.55, color: "#4b5563" }}>
          Configure columns, grouping, sorting, column filters, quick filter, and group expansion.
          Then use <strong>Views → Save current view…</strong>. Switching views restores the complete
          presentation state through the public grid APIs.
        </div>
        <button
          className="btn"
          type="button"
          disabled={views.length === 0}
          onClick={() => {
            persistViews([]);
            setActiveViewId(null);
          }}
        >
          Clear demo storage
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Grid
            rowData={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            toolbar={{
              views: true,
              grouping: true,
              sorting: true,
              quickFilter: true,
              export: true,
            }}
            savedViews={{
              views,
              activeViewId,
              onChange: persistViews,
              onActiveViewChange: setActiveViewId,
            }}
            quickFilter={{ debounceMs: 0, showOptions: true }}
            columnPanel={{ trigger: "toolbar" }}
            allowExportAsCSV
            allowExportAsExcel
            groupDefaultExpanded={1}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <aside
          style={{
            width: 280,
            flex: "0 0 280px",
            overflow: "auto",
            padding: 12,
            boxSizing: "border-box",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        >
          <strong style={{ fontSize: 13 }}>Application-owned views</strong>
          <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
            Persisted by this page in local storage.
          </div>
          {views.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>No saved views yet.</p>
          ) : (
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }}>
              {views.map(view => (
                <li key={view.id}>
                  <strong>{view.name}</strong>
                  {view.id === activeViewId ? " — active" : ""}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

export default SavedViewsDemo;
