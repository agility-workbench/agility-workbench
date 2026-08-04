import { useMemo, useState } from "react";

import { Grid, ColumnType, type ReactColDef } from "@react-grid";

type Row = {
  id: string;
  team: string;
  owner: string;
  pipeline: number;
  closed: number;
};

const ROWS: Row[] = Array.from({ length: 80 }, (_, index) => ({
  id: `deal-${index + 1}`,
  team: ["Enterprise", "Commercial", "Growth"][index % 3],
  owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][index % 5],
  pipeline: 25_000 + ((index * 7_919) % 180_000),
  closed: 8_000 + ((index * 3_571) % 95_000),
}));

export function PinnedRowsDemo() {
  const [showTarget, setShowTarget] = useState(true);
  const [showTotals, setShowTotals] = useState(true);
  const [forecast, setForecast] = useState(8_500_000);

  const columns = useMemo<ReactColDef[]>(() => [
    { colId: "team", key: "team", label: "Team", width: 150, pinned: "left" },
    { colId: "owner", key: "owner", label: "Owner", width: 140, editable: true },
    {
      colId: "pipeline",
      key: "pipeline",
      label: "Pipeline",
      width: 160,
      type: ColumnType.CURRENCY,
    },
    {
      colId: "closed",
      key: "closed",
      label: "Closed",
      width: 160,
      type: ColumnType.CURRENCY,
    },
  ], []);

  const totalPipeline = ROWS.reduce((sum, row) => sum + row.pipeline, 0);
  const totalClosed = ROWS.reduce((sum, row) => sum + row.closed, 0);
  const topRows: Row[] = showTarget ? [{
    id: "forecast",
    team: "FY forecast",
    owner: "All teams",
    pipeline: forecast,
    closed: 6_400_000,
  }] : [];
  const bottomRows: Row[] = showTotals ? [{
    id: "totals",
    team: "Visible dataset",
    owner: `${ROWS.length} deals`,
    pipeline: totalPipeline,
    closed: totalClosed,
  }] : [];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={() => setShowTarget(value => !value)}>
          {showTarget ? "Hide" : "Show"} top forecast
        </button>
        <button className="btn" type="button" onClick={() => setShowTotals(value => !value)}>
          {showTotals ? "Hide" : "Show"} bottom totals
        </button>
        <button className="btn" type="button" onClick={() => setForecast(value => value + 250_000)}>
          Raise forecast
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Pinned rows stay outside sort, filter, pagination, and the virtualized row count.
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          rowData={ROWS}
          columnDefs={columns}
          rowIdKey="id"
          pinnedRowsEditable
          pinnedTopRowData={topRows}
          pinnedBottomRowData={bottomRows}
          quickFilter={{ mode: "always", debounceMs: 0 }}
          toolbar={{ sorting: true }}
          getRowClass={({ node }) => node.rowPinned ? `demo-pinned-${node.rowPinned}` : undefined}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default PinnedRowsDemo;
