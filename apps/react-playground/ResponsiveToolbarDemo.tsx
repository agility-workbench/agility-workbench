import { useEffect, useMemo, useRef, useState } from "react";

import {
  ColumnType,
  Grid,
  type IGridAPI,
  type ReactColDef,
} from "@react-grid";

type Row = {
  id: number;
  region: string;
  product: string;
  owner: string;
  status: string;
  revenue: number;
};

const WIDTH_PRESETS = [900, 700, 480, 360] as const;

export function ResponsiveToolbarDemo() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);

  const rows = useMemo<Row[]>(() => Array.from({ length: 80 }, (_, index) => ({
    id: index + 1,
    region: ["Americas", "EMEA", "APAC"][index % 3],
    product: ["Analytics", "Cloud", "Security", "Support"][(index * 3) % 4],
    owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][(index * 2) % 5],
    status: ["Qualified", "Negotiating", "Won"][index % 3],
    revenue: 12_000 + ((index * 7_913) % 85_000),
  })), []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "product", key: "product", label: "Product", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 120 },
    { colId: "status", key: "status", label: "Status", width: 130 },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 140,
      type: ColumnType.CURRENCY,
    },
  ], []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // Read the border-box width so feeding the observed value back into a border-box `width`
      // does not repeatedly subtract this demo frame's padding and border.
      const next = Math.round(host.getBoundingClientRect().width);
      if (next > 0) setWidth(current => current === next ? current : next);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const handleReady = (api: IGridAPI) => {
    const model = api.getColumnModel();
    const region = model.getByColId("region");
    const revenue = model.getByColId("revenue");
    if (region) api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
    if (revenue) {
      api.dispatch({
        type: "sortModelSet",
        sortItems: [{ key: revenue.instanceID, dir: "desc" }],
      });
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>Resizable toolbar</strong>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Drag the container’s bottom-right resize handle, or choose a preset:
        </span>
        {WIDTH_PRESETS.map(preset => (
          <button
            key={preset}
            className="btn"
            type="button"
            onClick={() => setWidth(preset)}
          >
            {preset}px
          </button>
        ))}
        <code style={{ marginLeft: "auto", fontSize: 12 }}>{width}px</code>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        Full labels become icon-only controls as space tightens. At the narrowest width, Export and
        Columns move into the More menu while grouping, sorting, and quick filter remain available.
      </p>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div
          ref={hostRef}
          style={{
            width,
            maxWidth: "100%",
            minWidth: 340,
            height: "100%",
            minHeight: 440,
            boxSizing: "border-box",
            resize: "horizontal",
            overflow: "hidden",
            padding: 8,
            border: "2px dashed #9ca3af",
            borderRadius: 10,
          }}
        >
          <Grid
            rowData={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            toolbar={{ grouping: true, sorting: true, quickFilter: true, export: true }}
            quickFilter={{ debounceMs: 0, showOptions: true }}
            columnPanel={{ trigger: "toolbar" }}
            allowExportAsCSV
            allowExportAsExcel
            groupDefaultExpanded={1}
            style={{ width: "100%", height: "100%" }}
            onGridReady={handleReady}
          />
        </div>
      </div>
    </div>
  );
}

export default ResponsiveToolbarDemo;
