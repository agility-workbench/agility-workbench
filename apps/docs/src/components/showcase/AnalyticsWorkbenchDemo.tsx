import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AggregateType,
  ColumnType,
  Grid,
  type GridSheet,
  type GridViewState,
  type IGridAPI,
  type IRowNode,
  type ReactColDef,
  type SavedGridView,
} from "@agility-workbench/react-grid";
import { brandTheme } from "../gridTheme";
import { ShowcaseFrame, showcaseButtonClass } from "./ShowcaseFrame";

type Sale = {
  id: string;
  region: string;
  country: string;
  channel: string;
  category: string;
  quarter: string;
  rep: string;
  revenue: number;
  units: number;
  margin: number;
  discount: number;
};

const GEOGRAPHY: [string, string[]][] = [
  ["Americas", ["United States", "Canada", "Brazil"]],
  ["EMEA", ["United Kingdom", "Germany", "France"]],
  ["APAC", ["Japan", "Singapore", "Australia"]],
];
const CHANNELS = ["Direct", "Partner", "Self-serve", "Marketplace"];
const CATEGORIES = ["Platform", "Analytics", "Support", "Training"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const REPS = ["Ava Chen", "Noah Williams", "Maya Patel", "Leo Martin", "Ines Duarte", "Tom Okafor"];

const sales: Sale[] = Array.from({ length: 288 }, (_, index) => {
  const [region, countries] = GEOGRAPHY[index % GEOGRAPHY.length];
  const revenue = 12_000 + ((index * 7_919) % 148_000);
  const discount = ((index * 13) % 22) / 100;
  return {
    id: `sale-${index + 1}`,
    region,
    country: countries[(index >> 1) % countries.length],
    channel: CHANNELS[index % CHANNELS.length],
    category: CATEGORIES[(index >> 2) % CATEGORIES.length],
    quarter: QUARTERS[(index >> 3) % QUARTERS.length],
    rep: REPS[index % REPS.length],
    revenue,
    units: 20 + ((index * 17) % 240),
    margin: Math.round(revenue * (0.19 + (index % 6) * 0.021)),
    discount,
  };
});

const percent1 = ({ value }: { value: unknown }) =>
  typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "";

const columnDefs: ReactColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 120, pinned: "left", groupable: true, pivotable: true, filter: "set" },
  { colId: "country", key: "country", label: "Country", width: 140, groupable: true, pivotable: true, filter: "set" },
  { colId: "channel", key: "channel", label: "Channel", width: 130, groupable: true, pivotable: true, filter: "set" },
  { colId: "category", key: "category", label: "Category", width: 130, groupable: true, pivotable: true, filter: "set" },
  { colId: "quarter", key: "quarter", label: "Quarter", width: 100, groupable: true, pivotable: true, filter: "set" },
  { colId: "rep", key: "rep", label: "Rep", width: 145, groupable: true, filter: true },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY, aggregatable: true, filter: true },
  { colId: "margin", key: "margin", label: "Margin", width: 130, type: ColumnType.CURRENCY, aggregatable: true, filter: true },
  { colId: "units", key: "units", label: "Units", width: 100, type: ColumnType.NUMBER, aggregatable: true, filter: true },
  { colId: "discount", key: "discount", label: "Discount", width: 110, valueFormatter: percent1, aggregatable: true },
];

const VIEWS_KEY = "awb-docs-showcase-analytics-views";

const readViews = (): SavedGridView[] => {
  try {
    return JSON.parse(window.localStorage.getItem(VIEWS_KEY) ?? "[]") as SavedGridView[];
  } catch {
    return [];
  }
};

const usd = (value: number) =>
  `$${(value / 1_000_000).toFixed(2)}M`;

export function AnalyticsWorkbenchDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const [views, setViews] = useState<SavedGridView[]>(readViews);
  // Sheets are application-owned: the list and the active tab are React state reaching the grid as
  // a prop, so a sheet seeded in `onGridReady` has to go through setState, not updateGridOptions.
  const [sheets, setSheets] = useState<GridSheet[]>([{ id: "data", name: "Data" }]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>("data");
  const [totals, setTotals] = useState({ rows: sales.length, revenue: 0, margin: 0 });

  /** Roll up whatever survives the current filter — the same nodes the grid is about to display. */
  const recomputeTotals = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    let rows = 0;
    let revenue = 0;
    let margin = 0;
    api.forEachNodeAfterFilter((node: IRowNode) => {
      const sale = node.data as Sale;
      rows++;
      revenue += sale.revenue;
      margin += sale.margin;
    });
    setTotals({ rows, revenue, margin });
  }, []);

  const onGridReady = useCallback((api: IGridAPI) => {
    api.setAggregates([
      { colId: "revenue", type: AggregateType.SUM },
      { colId: "margin", type: AggregateType.SUM },
      { colId: "units", type: AggregateType.SUM },
      { colId: "discount", type: AggregateType.AVG },
    ]);
    api.setRowGroupColumns(["region"]);
    recomputeTotals();

    // A ready-made pivot sheet next to the data sheet. Its captured state carries the pivot roles,
    // and `prePivotState` is what turning pivot mode off on that sheet falls back to.
    setSheets((current) => {
      if (current.some((sheet) => sheet.id === "by-channel")) return current;
      const dataState = api.captureViewState();
      const state: GridViewState = {
        ...dataState,
        pivotMode: true,
        pivotColumns: ["channel"],
        rowGroupColumns: ["region", "category"],
        aggregateModel: [{ colId: "revenue", type: AggregateType.SUM }],
        groupExpansion: [],
        prePivotState: {
          rowGroupColumns: dataState.rowGroupColumns,
          aggregateModel: dataState.aggregateModel ?? [],
          pivotColumns: dataState.pivotColumns ?? [],
        },
      };
      return [...current, { id: "by-channel", name: "Revenue × Channel", state }];
    });
  }, [recomputeTotals]);

  return (
    <ShowcaseFrame
      kicker="Grouping · pivot · sheets · views"
      title="Revenue analytics workbench"
      hint="One dataset, four ways to interrogate it: group and aggregate, pivot into a matrix, park each arrangement on its own sheet, and save the ones worth keeping as named views."
      stats={[
        { label: "rows in view", value: totals.rows.toLocaleString() },
        { label: "revenue", value: usd(totals.revenue) },
        { label: "margin", value: usd(totals.margin) },
      ]}
      controls={
        <>
          <button
            className={showcaseButtonClass}
            type="button"
            onClick={() => apiRef.current?.setRowGroupColumns(["region", "channel"])}
          >
            Group region → channel
          </button>
          <button
            className={showcaseButtonClass}
            type="button"
            onClick={() => apiRef.current?.setAllGroupsExpanded(true)}
          >
            Expand all
          </button>
          <button
            className={showcaseButtonClass}
            type="button"
            onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "revenue.csv" })}
          >
            Export CSV
          </button>
          <code>setRowGroupColumns · setPivotColumns · captureViewState</code>
        </>
      }
      note="The Columns panel edits pivot roles directly; the + tab derives a new pivot sheet; saved views persist to this browser's localStorage."
    >
      <Grid
        apiRef={apiRef}
        rowData={sales}
        columnDefs={columnDefs}
        rowIdKey="id"
        theme={brandTheme}
        defaultColDef={{ sortable: true, resizable: true, movable: true }}
        onGridReady={onGridReady}
        onFilterChanged={recomputeTotals}
        toolbar={{ grouping: true, sorting: true, quickFilter: true, pivot: true, views: true, export: true }}
        columnPanel={{ trigger: "toolbar" }}
        groupDefaultExpanded={1}
        groupRowsSticky
        rowNumbers
        rangeSelection
        highlightActiveCell
        allowExportAsCSV
        allowExportAsExcel
        ariaLabel="Revenue analytics"
        sheets={{
          sheets,
          activeSheetId,
          onChange: setSheets,
          onActiveSheetChange: setActiveSheetId,
        }}
        savedViews={{
          views,
          onChange: (next) => {
            setViews([...next]);
            try {
              window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
            } catch {
              // Storage may be unavailable; the in-memory list still works for this session.
            }
          },
        }}
        style={{ width: "100%", height: "100%" }}
      />
    </ShowcaseFrame>
  );
}
