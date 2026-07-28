import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { AggregateType } from "@grid/interfaces/aggregate";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

type OrderRow = {
  id: number;
  customer: string;
  region: string;
  units: number;
  revenue: number;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East", "West"];

function buildRows(): OrderRow[] {
  return Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
  }));
}

export function FooterVisibilityDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const [pagination, setPagination] = useState(false);
  const [aggregateRevenue, setAggregateRevenue] = useState(false);
  const [allowAggregation, setAllowAggregation] = useState(true);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "Order", width: 100, type: ColumnType.NUMBER, aggregatable: false },
    { colId: "customer", key: "customer", label: "Customer", width: 180, aggregatable: false },
    { colId: "region", key: "region", label: "Region", width: 140, aggregatable: false },
    {
      colId: "units",
      key: "units",
      label: "Units",
      width: 120,
      type: ColumnType.NUMBER,
      aggregatable: allowAggregation,
    },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 160,
      type: ColumnType.CURRENCY,
      aggregatable: allowAggregation,
    },
  ], [allowAggregation]);

  const setRevenueAggregate = (enabled: boolean) => {
    setAggregateRevenue(enabled);
    const api = apiRef.current;
    if (!api) return;
    const revenueColumn = api.getColumnModel().getByColId("revenue");
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: enabled && revenueColumn
        ? [{ key: revenueColumn.instanceID, type: AggregateType.SUM }]
        : [],
    });
  };

  const setAggregationCapability = (enabled: boolean) => {
    if (!enabled && aggregateRevenue) {
      setRevenueAggregate(false);
    }
    setAllowAggregation(enabled);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={pagination}
            onChange={(event) => setPagination(event.target.checked)}
          />
          Pagination
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={aggregateRevenue}
            onChange={(event) => setRevenueAggregate(event.target.checked)}
          />
          Sum Revenue
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={allowAggregation}
            onChange={(event) => setAggregationCapability(event.target.checked)}
          />
          Columns aggregatable
        </label>

        <span style={{ fontSize: 13, color: "#6b7280" }}>
          Shared footer expected: <strong>{pagination || aggregateRevenue ? "visible" : "hidden"}</strong>
        </span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          Aggregate controls expected: <strong>{allowAggregation ? "available" : "omitted"}</strong>
        </span>
      </div>

      <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        With both controls off, the aggregate/pagination footer should take up no space. Enable either
        pagination or the Revenue aggregate to reveal it; turn both off to hide it again. Disable
        <code> aggregatable</code> for every column to remove aggregation from the column menus and
        omit the aggregate controls from the shared footer.
      </p>

      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Grid
          apiRef={apiRef}
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          pagination={pagination}
          pageSize={8}
          pageSizes={[8, 16, 24]}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default FooterVisibilityDemo;
