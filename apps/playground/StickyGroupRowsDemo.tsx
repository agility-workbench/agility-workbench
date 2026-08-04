import { useMemo, useRef, useState } from "react";

import {
  AggregateType,
  ColumnType,
  Grid,
  type GroupDisplayType,
  type IGridAPI,
  type ReactColDef,
} from "@react-grid";

type Row = {
  id: number;
  region: string;
  country: string;
  account: string;
  revenue: number;
};

const REGIONS: Record<string, string[]> = {
  Americas: ["USA", "Canada", "Brazil"],
  EMEA: ["UK", "France", "Germany"],
  APAC: ["India", "Japan", "Australia"],
};

const ROWS: Row[] = Array.from({ length: 240 }, (_, index) => {
  const region = Object.keys(REGIONS)[index % 3];
  const countries = REGIONS[region];
  return {
    id: index + 1,
    region,
    country: countries[Math.floor(index / 3) % countries.length],
    account: `Account ${String(index + 1).padStart(3, "0")}`,
    revenue: 5_000 + ((index * 12_731) % 220_000),
  };
});

export function StickyGroupRowsDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const manuallyPinnedId = useRef<string | null>(null);
  const [sticky, setSticky] = useState(true);
  const [displayType, setDisplayType] = useState<GroupDisplayType>("singleColumn");
  const [manualLabel, setManualLabel] = useState("No explicit group pin");

  const columns = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 140 },
    { colId: "country", key: "country", label: "Country", width: 140 },
    { colId: "account", key: "account", label: "Account", width: 190 },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 160,
      type: ColumnType.CURRENCY,
    },
  ], []);

  const onReady = (api: IGridAPI) => {
    apiRef.current = api;
    api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const revenue = api.getColumnModel().getByColId("revenue");
    if (revenue) {
      api.dispatch({
        type: "aggregateModelSet",
        aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
      });
    }
  };

  const pinEmea = () => {
    const api = apiRef.current;
    if (!api) return;
    if (manuallyPinnedId.current) api.setRowPinned(manuallyPinnedId.current, null);
    const emea = api.getCore().getRowModel().getGroupNodes()
      .find(node => node.level === 0 && node.groupKey === "EMEA");
    if (!emea) return;
    api.setRowPinned(emea.id, "bottom");
    manuallyPinnedId.current = emea.id;
    setManualLabel("EMEA explicitly pinned at bottom");
  };

  const clearManualPin = () => {
    if (manuallyPinnedId.current) {
      apiRef.current?.setRowPinned(manuallyPinnedId.current, null);
      manuallyPinnedId.current = null;
    }
    setManualLabel("No explicit group pin");
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={() => setSticky(value => !value)}>
          Sticky ancestors: {sticky ? "on" : "off"}
        </button>
        <label style={{ fontSize: 12 }}>
          Group display{" "}
          <select
            value={displayType}
            onChange={event => setDisplayType(event.target.value as GroupDisplayType)}
          >
            <option value="singleColumn">Single column</option>
            <option value="multipleColumns">Multiple columns</option>
            <option value="groupRows">Full-width group rows</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={pinEmea}>Pin EMEA bottom</button>
        <button className="btn" type="button" onClick={clearManualPin}>Clear explicit pin</button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{manualLabel}</span>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Scroll through the expanded Region → Country hierarchy. Active ancestors stack above the
        body; every mirrored chevron controls the original live group.
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          apiRef={apiRef}
          onGridReady={onReady}
          rowData={ROWS}
          columnDefs={columns}
          rowIdKey="id"
          groupDefaultExpanded={-1}
          groupRowsSticky={sticky}
          groupDisplayType={displayType}
          groupRowsSelectable
          quickFilter
          toolbar={{ grouping: true, sorting: true }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default StickyGroupRowsDemo;
