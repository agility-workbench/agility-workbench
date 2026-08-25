import React, { useMemo, useRef, useState } from "react";
import {
  AggregateType,
  ColumnType,
  Grid,
  SparklineRenderer,
  themeDark,
  type ActionFrameComponentParams,
  type CellRendererParams,
  type GridProps,
  type IGridAPI,
  type IServerSideDataSource,
  type ReactColDef,
  type SavedGridView,
} from "@agility-workbench/react-grid";
import { DemoFrame } from "./DemoFrame";
import demoStyles from "./DemoFrame.module.css";
import type { DemoFeature } from "./snippets";

type Order = {
  id: string;
  orderNo: string;
  customer: string;
  region: string;
  country: string;
  status: string;
  units: number;
  revenue: number;
  margin: number;
  owner: string;
  comment?: string;
  parentId?: string | null;
};

const customers = ["Northstar Labs", "Aster & Co.", "Kinetic Works", "Juniper Studio", "Orbit Systems", "Meridian House"];
const regions = [["Americas", "United States"], ["EMEA", "United Kingdom"], ["APAC", "Singapore"]] as const;
const statuses = ["On track", "At risk", "Blocked"];
const owners = ["Ava Chen", "Noah Williams", "Maya Patel", "Leo Martin"];

const rows: Order[] = Array.from({ length: 42 }, (_, index) => {
  const [region, country] = regions[index % regions.length];
  const revenue = 18_000 + ((index * 7_913) % 92_000);
  return {
    id: `order-${index + 1}`,
    orderNo: `AW-${String(2401 + index).padStart(4, "0")}`,
    customer: customers[index % customers.length],
    region,
    country,
    status: statuses[index % statuses.length],
    units: 8 + ((index * 13) % 86),
    revenue,
    margin: Math.round(revenue * (.17 + (index % 5) * .025)),
    owner: owners[index % owners.length],
    comment: index % 7 === 0 ? "Escalated by the account team." : "",
  };
});

const ownerEmail = (owner: string) => `${owner.toLowerCase().replace(/\s+/g, ".")}@example.com`;

/** Deterministic per-row series for the Sparkline demo. */
const trendSeries = (row: Order) =>
  Array.from({ length: 10 }, (_, i) => 20 + ((row.units * (i + 3) * 17 + row.margin) % 80));

const statusColors: Record<string, string> = {
  "On track": "#1f9d63",
  "At risk": "#c98a1b",
  Blocked: "#d1495b",
};

function StatusBadge({ value }: CellRendererParams) {
  const color = statusColors[String(value)] ?? "#64748b";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "#fff",
        background: color,
      }}
    >
      {String(value)}
    </span>
  );
}

function CommentFrame({ value, rowId, colDef, api, close }: ActionFrameComponentParams) {
  const [draft, setDraft] = useState(String(value ?? ""));
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 4 }}
      onSubmit={(event) => {
        event.preventDefault();
        api.setCellValue({ rowId, colId: colDef.colId }, draft);
        close();
      }}
    >
      <textarea
        value={draft}
        rows={3}
        style={{ resize: "vertical", font: "inherit" }}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={close}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}

const treeRows: Order[] = [
  { ...rows[0], id: "company", customer: "Agility Workbench", parentId: null },
  { ...rows[1], id: "product", customer: "Product", parentId: "company" },
  { ...rows[2], id: "grid", customer: "Grid", parentId: "product" },
  { ...rows[3], id: "frameworks", customer: "Frameworks", parentId: "product" },
  { ...rows[4], id: "react", customer: "React", parentId: "frameworks" },
  { ...rows[5], id: "angular", customer: "Angular", parentId: "frameworks" },
  { ...rows[6], id: "docs", customer: "Documentation", parentId: "company" },
];

const brandTheme = themeDark.withParams({
  accentColor: "#2fd2e2",
  backgroundColor: "#0a172b",
  headerBackgroundColor: "#0f2140",
  borderColor: "#243b62",
  rowHoverColor: "#122b50",
  selectedBackgroundColor: "#123f63",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  rowHeight: 39,
});

const baseColumns: ReactColDef[] = [
  { colId: "orderNo", key: "orderNo", label: "Order", width: 115, pinned: "left" },
  { colId: "customer", key: "customer", label: "Customer", width: 180 },
  { colId: "region", key: "region", label: "Region", width: 120, groupable: true },
  { colId: "country", key: "country", label: "Country", width: 140, groupable: true },
  { colId: "status", key: "status", label: "Status", width: 120 },
  { colId: "units", key: "units", label: "Units", width: 100, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  { colId: "margin", key: "margin", label: "Margin", width: 130, type: ColumnType.CURRENCY },
  { colId: "owner", key: "owner", label: "Owner", width: 145 },
];

const labels: Record<DemoFeature, [string, string]> = {
  columns: ["Columns", "Drag headers, resize, pin, hide, and open Columns"],
  "column-groups": ["Column groups", "Expand Revenue and inspect nested headers"],
  "client-side-data": ["Client-side data", "Insert at source index 2, then sort or page local rows"],
  "server-side-data": ["Server-side data", "Scroll to request block-aligned slices"],
  filtering: ["Filtering", "Use the toolbar search or a column filter"],
  sorting: ["Sorting", "Shift-click sort icons for an ordered multi-sort"],
  selection: ["Selection", "Drag a range or select rows from row numbers"],
  editing: ["Editing", "Double-click a writable cell; use Enter or Tab"],
  grouping: ["Grouping", "Expand regions and inspect live aggregate values"],
  pivot: ["Pivot", "Regions × Status revenue matrix — toggle Pivot in the toolbar, customize roles via Columns"],
  sheets: ["Sheets", "Data + pivot sheets as footer tabs — press + for a new pivot sheet"],
  "tree-data": ["Tree data", "Expand the organization hierarchy"],
  "pinned-rows": ["Pinned rows", "Target and Total stay put; right-click a row to pin it"],
  rendering: ["Rendering", "Status badges and Sparklines are custom cell renderers"],
  tooltips: ["Tooltips", "Hover Owner or Revenue cells, or the Margin header"],
  "action-frames": ["ActionFrames", "Click a Comment cell to open its persistent form"],
  menus: ["Menus", "Right-click headers, cells, and row numbers for custom items"],
  "toolbar-and-views": ["Toolbar & views", "Shape the grid, then save the layout as a view"],
  export: ["Export", "Select cells, then use the toolbar export menu"],
  theming: ["Theming", "A per-instance theme built from semantic parameters"],
};

const VIEWS_KEY = "awb-docs-demo-views";

const grandTotals = rows.reduce(
  (acc, row) => ({ units: acc.units + row.units, revenue: acc.revenue + row.revenue, margin: acc.margin + row.margin }),
  { units: 0, revenue: 0, margin: 0 },
);

const pinnedTop: Order[] = [{
  id: "pinned-target", orderNo: "TARGET", customer: "Quarterly target", region: "All", country: "All",
  status: "On track", units: 1_800, revenue: 2_600_000, margin: 585_000, owner: "—",
}];

const pinnedBottom: Order[] = [{
  id: "pinned-total", orderNo: "TOTAL", customer: "All orders", region: "All", country: "All",
  status: "", units: grandTotals.units, revenue: grandTotals.revenue, margin: grandTotals.margin, owner: "—",
}];

function serverSource(): IServerSideDataSource {
  return {
    async getRows({ request }) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      const start = request.startRow ?? 0;
      const end = request.endRow ?? start + 20;
      return { rows: rows.slice(start, end), totalRows: rows.length };
    },
  };
}

export function FeatureGrid({ feature, compact = false }: { feature: DemoFeature; compact?: boolean }) {
  const source = useMemo(serverSource, []);
  const apiRef = useRef<IGridAPI | null>(null);
  const insertedRowCount = useRef(0);
  const [views, setViews] = useState<SavedGridView[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(VIEWS_KEY) ?? "[]") as SavedGridView[];
    } catch {
      return [];
    }
  });
  const [label, hint] = labels[feature];
  let columnDefs: ReactColDef[] = baseColumns;
  let rowData: unknown[] | undefined = rows;
  let featureProps: Partial<GridProps> = {};

  switch (feature) {
    case "columns":
      featureProps = { rowNumbers: true, columnPanel: { trigger: "toolbar" }, toolbar: { quickFilter: true } };
      break;
    case "column-groups":
      columnDefs = [
        { key: "orderNo", label: "Order", pinned: "left", width: 120 },
        { label: "Account", children: [{ key: "customer", label: "Customer", width: 180 }, { key: "owner", label: "Owner", width: 145 }] },
        { label: "Geography", children: [{ key: "region", label: "Region" }, { key: "country", label: "Country" }] },
        { label: "Revenue", openByDefault: true, children: [{ key: "revenue", label: "Gross", type: ColumnType.CURRENCY }, { key: "margin", label: "Margin", type: ColumnType.CURRENCY, columnGroupShow: "open" }] },
      ];
      break;
    case "client-side-data":
      featureProps = { pagination: true, pageSize: 10, pageSizes: [10, 20, 50], rowNumbers: true };
      break;
    case "server-side-data":
      rowData = undefined;
      featureProps = { rowModelType: "serverSide", serverSideBlockSize: 12, serverSideDataSource: source, pagination: true, pageSize: 12 };
      break;
    case "filtering":
      columnDefs = baseColumns.map((column) => ({ ...column, filter: column.colId === "status" ? "set" : true }));
      featureProps = { toolbar: { quickFilter: true }, quickFilter: { debounceMs: 0, showOptions: true } };
      break;
    case "sorting":
      featureProps = { toolbar: { sorting: true }, initialSort: [{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "desc" }], showSortPriority: "always" };
      break;
    case "selection":
      featureProps = { rowNumbers: true, rowSelection: true, selectAllRowsOnHeaderClick: true, rangeSelection: true, highlightActiveCell: true };
      break;
    case "editing":
      columnDefs = baseColumns.map((column) => ({ ...column, editable: ["status", "units", "revenue", "owner"].includes(column.colId ?? ""), cellEditor: column.colId === "status" ? "select" : undefined, cellEditorParams: column.colId === "status" ? { values: statuses } : undefined }));
      featureProps = { editTrigger: "doubleClick", undoLimit: 50, highlightActiveCell: true };
      break;
    case "grouping":
      featureProps = {
        toolbar: { grouping: true },
        groupDefaultExpanded: 1,
        groupRowsSticky: true,
        onGridReady: (api) => {
          api.setRowGroupColumns(["region"]);
          api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
        },
      };
      break;
    case "pivot":
      featureProps = {
        toolbar: { pivot: true },
        columnPanel: { trigger: "toolbar" },
        groupDefaultExpanded: 1,
        onGridReady: (api) => {
          api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
          api.setRowGroupColumns(["region"]);
          api.setPivotColumns(["status"]);
          api.setPivotMode(true);
        },
      };
      break;
    case "sheets":
      featureProps = {
        pagination: true,
        pageSize: 15,
        groupDefaultExpanded: 1,
        toolbar: { pivot: true },
        onGridReady: (api) => {
          // Seed a ready-made pivot sheet next to the Data sheet; the + tab derives blank ones.
          const state = {
            ...api.captureViewState(),
            pivotMode: true,
            pivotColumns: ["status"],
            rowGroupColumns: ["region"],
            aggregateModel: [{ colId: "revenue", type: "sum" }],
            groupExpansion: [],
          };
          api.updateGridOptions({
            sheets: {
              sheets: [
                { id: "data", name: "Data" },
                { id: "by-status", name: "By Status", state },
              ],
              activeSheetId: "data",
            },
          });
        },
      };
      break;
    case "tree-data":
      rowData = treeRows;
      columnDefs = [{ key: "status", label: "Status", width: 130 }, { key: "owner", label: "Owner", width: 160 }, { key: "revenue", label: "Budget", type: ColumnType.CURRENCY, width: 150 }];
      featureProps = { groupDefaultExpanded: 2, treeData: { mode: "parent", getParentId: (row: Order) => row.parentId, getLabel: (row: Order) => row.customer, columnDef: { label: "Workspace", width: 260 } } };
      break;
    case "pinned-rows":
      featureProps = { rowNumbers: true, rowPinningMenu: true, pinnedTopRowData: pinnedTop, pinnedBottomRowData: pinnedBottom };
      break;
    case "rendering":
      columnDefs = [
        { colId: "orderNo", key: "orderNo", label: "Order", width: 115, pinned: "left" },
        { colId: "customer", key: "customer", label: "Customer", width: 180 },
        { colId: "status", key: "status", label: "Status", width: 130, cellRenderer: StatusBadge },
        {
          colId: "trend",
          label: "Trend",
          width: 170,
          valueGetter: (row: Order) => trendSeries(row),
          cellRenderer: SparklineRenderer,
          cellRendererParams: { type: "area", showPoints: true },
        },
        { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
        { colId: "owner", key: "owner", label: "Owner", width: 145 },
      ];
      featureProps = { zebraRows: true, rowHover: true, columnHover: true };
      break;
    case "tooltips":
      columnDefs = baseColumns.map((column) => {
        if (column.colId === "owner") {
          return { ...column, tooltipValueGetter: ({ data }) => ownerEmail((data as Order).owner) };
        }
        if (column.colId === "revenue") {
          return { ...column, tooltipValueGetter: ({ value, data }) => `${(data as Order).customer}: $${value}` };
        }
        if (column.colId === "margin") {
          return { ...column, headerTooltip: "Revenue minus direct cost" };
        }
        return column;
      });
      featureProps = { tooltip: { showDelay: 150, hideDelay: 75, mode: "anchored", placement: "auto" } };
      break;
    case "action-frames":
      columnDefs = [
        { colId: "orderNo", key: "orderNo", label: "Order", width: 115, pinned: "left" },
        { colId: "customer", key: "customer", label: "Customer", width: 180 },
        { colId: "status", key: "status", label: "Status", width: 120 },
        {
          colId: "comment",
          key: "comment",
          label: "Comment",
          width: 230,
          actionFrameTrigger: "click",
          actionFrameComponent: CommentFrame,
          actionFrameIndicator: "comment",
          actionFrameOptions: { placement: "right", offset: 10 },
        },
        { colId: "owner", key: "owner", label: "Owner", width: 145 },
      ];
      featureProps = { highlightActiveCell: true };
      break;
    case "menus":
      featureProps = {
        rowNumbers: true,
        rowPinningMenu: true,
        getColumnMenuItems: ({ ctx, items }) => [
          ...items,
          { isSeparator: true },
          {
            id: "inspect-column",
            label: `Inspect ${ctx.targetColId}`,
            onClick: () => window.alert(`Inspecting column "${ctx.targetColId}"`),
          },
        ],
        bodyContextMenu: ({ ctx, items }) => [
          ...items,
          { isSeparator: true },
          {
            id: "open-record",
            label: "Open record",
            onClick: () => window.alert(`Opening record "${ctx.rowId}"`),
          },
        ],
        rowInsertionMenu: {
          createRow: ({ data, position }) => {
            const sequence = ++insertedRowCount.current;
            return {
              ...(data as Order),
              id: `menu-inserted-${sequence}`,
              orderNo: `NEW-${String(sequence).padStart(4, "0")}`,
              customer: `Inserted ${position}`,
            };
          },
        },
      };
      break;
    case "toolbar-and-views":
      featureProps = {
        columnPanel: { trigger: "toolbar" },
        toolbar: { grouping: true, sorting: true, quickFilter: true, views: true, export: true },
        allowExportAsCSV: true,
        allowExportAsExcel: true,
        savedViews: {
          views,
          onChange: (next) => {
            setViews([...next]);
            try {
              window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
            } catch {
              // Storage may be unavailable; the in-memory list still works.
            }
          },
        },
      };
      break;
    case "export":
      featureProps = { rowNumbers: true, allowExportAsCSV: true, allowExportAsExcel: true, toolbar: { export: true } };
      break;
    case "theming":
      featureProps = { zebraRows: true, columnHover: true, highlightActiveCell: true };
      break;
  }

  const insertAtIndexTwo = () => {
    const sequence = ++insertedRowCount.current;
    const template = rows[(sequence - 1) % rows.length];
    apiRef.current?.applyTransaction({
      add: [{
        ...template,
        id: `inserted-${sequence}`,
        orderNo: `NEW-${String(sequence).padStart(4, "0")}`,
        customer: `Inserted row ${sequence}`,
      }],
      addIndex: 2,
    });
  };

  return (
    <DemoFrame
      label={label}
      hint={hint}
      compact={compact}
      actions={feature === "client-side-data" ? (
        <button className={demoStyles.action} type="button" onClick={insertAtIndexTwo}>
          Insert at index 2
        </button>
      ) : undefined}
    >
      <Grid
        key={feature}
        apiRef={apiRef}
        rowData={rowData}
        columnDefs={columnDefs}
        rowIdKey="id"
        defaultColDef={{ sortable: true, resizable: true, movable: true }}
        theme={brandTheme}
        style={{ width: "100%", height: "100%" }}
        {...featureProps}
      />
    </DemoFrame>
  );
}
