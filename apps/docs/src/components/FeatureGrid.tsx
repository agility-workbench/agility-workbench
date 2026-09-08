import React, { useMemo, useRef, useState } from "react";
import {
  AggregateType,
  ColumnType,
  Grid,
  SparklineRenderer,
  type ActionFrameComponentParams,
  type CellRendererParams,
  type GridProps,
  type GridSheet,
  type GridViewState,
  type IGridAPI,
  type IRowNode,
  type IServerSideDataSource,
  type ReactColDef,
  type SavedGridView,
} from "@agility-workbench/react-grid";
import { DemoFrame } from "./DemoFrame";
import { KnobBar } from "./KnobBar";
import { brandTheme } from "./gridTheme";
import demoStyles from "./DemoFrame.module.css";
import { knobOptions, structuralKey, type KnobOptions } from "./knobs";
import { useKnobValues } from "./knobStore";
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

// A column's `valueGetter` is handed the row NODE, so the data object comes off `node.data`.
// Reading the fields straight off the node yields undefined and a sparkline with nothing to draw.
const rowOf = (node: IRowNode) => node.data as Order;

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

type AccountTrend = {
  id: string;
  account: string;
  segment: string;
  /** Twelve monthly revenue figures, one per column below. */
  monthly: number[];
  /** Eight weekly order counts. */
  orders: number[];
  /** Ten CSAT samples, 0-100. */
  satisfaction: number[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const segments = ["Enterprise", "Commercial", "Growth"];

/** Small deterministic PRNG, so the page renders the same series on the server and the client. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };
}

const trendRows: AccountTrend[] = Array.from({ length: 24 }, (_, index) => {
  const random = seeded(index * 7 + 13);
  let revenue = 40_000 + random() * 120_000;
  return {
    id: `account-${index + 1}`,
    account: `${customers[index % customers.length]} ${String.fromCharCode(65 + (index % 6))}`,
    segment: segments[index % segments.length],
    monthly: MONTHS.map(() => {
      revenue = Math.max(6_000, revenue * (0.86 + random() * 0.3));
      return Math.round(revenue);
    }),
    orders: Array.from({ length: 8 }, () => 12 + Math.round(random() * 70)),
    satisfaction: Array.from({ length: 10 }, () => 55 + Math.round(random() * 45)),
  };
});

const usd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

const sparklineColumns: ReactColDef[] = [
  { colId: "account", key: "account", label: "Account", width: 175, pinned: "left" },
  { colId: "segment", key: "segment", label: "Segment", width: 125 },
  {
    colId: "orderVolume",
    label: "Weekly orders",
    width: 145,
    // A bar sparkline over a plain number[]: the array index is the X value.
    valueGetter: (node: IRowNode) => (node.data as AccountTrend).orders,
    cellRenderer: SparklineRenderer,
    cellRendererParams: {
      type: "bar",
      tooltipValueFormatter: ({ xValue, yValue }) => `Week ${Number(xValue) + 1}: ${yValue} orders`,
    },
    sortable: false,
    filter: false,
    headerTooltip: "Bar sparkline over the last eight weeks of order volume.",
  },
  {
    colId: "csat",
    label: "CSAT",
    width: 140,
    valueGetter: (node: IRowNode) => (node.data as AccountTrend).satisfaction,
    cellRenderer: SparklineRenderer,
    cellRendererParams: { type: "line", showPoints: true },
    sortable: false,
    filter: false,
    headerTooltip: "Line sparkline with a marker at each of the last ten survey scores.",
  },
  ...MONTHS.map((month, monthIndex): ReactColDef => ({
    colId: month.toLowerCase(),
    label: month,
    width: 104,
    type: ColumnType.CURRENCY,
    valueGetter: (node: IRowNode) => (node.data as AccountTrend).monthly[monthIndex],
  })),
  {
    colId: "annualTrend",
    label: "Annual trend",
    width: 190,
    pinned: "right",
    // A tuple series carries its own X values, so the tooltip can name the month.
    valueGetter: (node: IRowNode) =>
      MONTHS.map((month, monthIndex) => [month, (node.data as AccountTrend).monthly[monthIndex]] as const),
    cellRenderer: SparklineRenderer,
    cellRendererParams: {
      type: "area",
      showPoints: true,
      tooltipValueFormatter: ({ xValue, yValue }) => `${String(xValue)}: ${usd(yValue)}`,
    },
    sortable: false,
    filter: false,
    groupable: false,
    aggregatable: false,
    headerTooltip: "Area sparkline over an [x, y] tuple series covering all twelve months.",
  },
];

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
  filtering: ["Filtering", "Search rows, switch the search to Find in its ⋯ options, or use a column filter"],
  sorting: ["Sorting", "Shift-click sort icons for an ordered multi-sort"],
  selection: ["Selection", "Drag a range or select rows from row numbers"],
  editing: ["Editing", "Double-click a writable cell; use Enter or Tab"],
  grouping: ["Grouping", "Expand regions and inspect live aggregate values"],
  pivot: ["Pivot", "Regions × Status revenue matrix — toggle Pivot in the toolbar, customize roles via Columns"],
  sheets: ["Sheets", "Data + pivot sheets as footer tabs — press + for a new pivot sheet"],
  "tree-data": ["Tree data", "Expand the organization hierarchy"],
  "pinned-rows": ["Pinned rows", "Target and Total stay put; right-click a row to pin it"],
  rendering: ["Rendering", "Status badges and Sparklines are custom cell renderers"],
  sparklines: ["Sparklines", "Hover any series; Ctrl/Cmd+click two month headers, then Show Sparklines in the column menu"],
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

/** Swap `$name` reference strings in knob options for the values they name. */
function resolveRefs(options: KnobOptions, refs: Record<string, unknown>): KnobOptions {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      typeof value === "string" && value.startsWith("$") ? refs[value.slice(1)] : value,
    ]),
  );
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
  // Sheets are application-owned: the list and the active tab live in React state and reach the
  // grid as a prop. Seeding them imperatively in onGridReady does not work — the wrapper's
  // option-sync effects run after the ready announcement, so a `sheets` prop left undefined
  // immediately unmounts the tab strip again.
  const [sheets, setSheets] = useState<GridSheet[]>([{ id: "data", name: "Data" }]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>("data");
  const [label, hint] = labels[feature];
  const { values: knobValues } = useKnobValues(feature);
  let columnDefs: ReactColDef[] = baseColumns;
  let rowData: unknown[] | undefined = rows;
  let featureProps: Partial<GridProps> = {};

  switch (feature) {
    case "columns":
      // Every option on this page is a knob (see knobs.ts).
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
      break;
    case "server-side-data":
      rowData = undefined;
      featureProps = { rowModelType: "serverSide", serverSideDataSource: source };
      break;
    case "filtering":
      columnDefs = baseColumns.map((column) => ({ ...column, filter: column.colId === "status" ? "set" : true }));
      // The search box is floating rather than toolbar-hosted here (the `quickFilter` knobs), so
      // the find behavior can be tried as documented: Ctrl/Cmd+F opens it, and stepping matches
      // moves the box off the ones it covers.
      break;
    case "sorting":
      featureProps = { initialSort: [{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "desc" }] };
      break;
    case "selection":
      break;
    case "editing":
      columnDefs = baseColumns.map((column) => ({ ...column, editable: ["status", "units", "revenue", "owner"].includes(column.colId ?? ""), cellEditor: column.colId === "status" ? "select" : undefined, cellEditorParams: column.colId === "status" ? { values: statuses } : undefined }));
      break;
    case "grouping":
      featureProps = {
        onGridReady: (api) => {
          api.setRowGroupColumns(["region"]);
          api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
        },
      };
      break;
    case "pivot":
      featureProps = {
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
        // A trimmed page nav, so all three footer zones fit this frame with their labels showing —
        // the tab strip is what this page is about, and the footer goes compact (labels hidden) once
        // the zones crowd it. The full control set is on the Client-side data page.
        paginationControls: { controls: ["previousPage", "pageSelector", "nextPage"] },
        groupDefaultExpanded: 1,
        toolbar: { pivot: true },
        sheets: {
          sheets,
          activeSheetId,
          onChange: (next) => setSheets(next),
          onActiveSheetChange: (id) => setActiveSheetId(id),
        },
        onGridReady: (api) => {
          // Seed a ready-made pivot sheet next to the Data sheet; the + tab derives blank ones.
          // The list is prop-driven, so this goes through React state rather than
          // updateGridOptions — the wrapper would otherwise overwrite it from the prop.
          setSheets((current) => {
            if (current.some((sheet) => sheet.id === "by-status")) return current;
            const dataState = api.captureViewState();
            const state: GridViewState = {
              ...dataState,
              pivotMode: true,
              pivotColumns: ["status"],
              rowGroupColumns: ["region"],
              aggregateModel: [{ colId: "revenue", type: AggregateType.SUM }],
              groupExpansion: [],
              // Turning pivot mode off on this sheet lands on the flat Data view it came from.
              prePivotState: {
                rowGroupColumns: dataState.rowGroupColumns,
                aggregateModel: dataState.aggregateModel ?? [],
                pivotColumns: dataState.pivotColumns ?? [],
              },
            };
            return [...current, { id: "by-status", name: "By Status", state }];
          });
        },
      };
      break;
    case "tree-data":
      rowData = treeRows;
      columnDefs = [{ key: "status", label: "Status", width: 130 }, { key: "owner", label: "Owner", width: 160 }, { key: "revenue", label: "Budget", type: ColumnType.CURRENCY, width: 150 }];
      featureProps = { treeData: { mode: "parent", getParentId: (row: Order) => row.parentId, getLabel: (row: Order) => row.customer, columnDef: { label: "Workspace", width: 260 } } };
      break;
    case "pinned-rows":
      // The bands come from the knobs, which name `pinnedTop` / `pinnedBottom` by reference.
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
          valueGetter: (node: IRowNode) => trendSeries(rowOf(node)),
          cellRenderer: SparklineRenderer,
          cellRendererParams: { type: "area", showPoints: true },
        },
        { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
        { colId: "owner", key: "owner", label: "Owner", width: 145 },
      ];
      break;
    case "sparklines":
      rowData = trendRows;
      columnDefs = sparklineColumns;
      // `columnSelection` is what unlocks the built-in generator: Ctrl/Cmd+click two or more
      // numeric headers and the column menu grows a "Show Sparklines" submenu.
      featureProps = {
        columnSelection: true,
        rowNumbers: true,
        tooltip: { showDelay: 100, hideDelay: 60 },
      };
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
    case "theming":
      break;
  }

  // Knob-driven options win over the case's fixed ones. Knobs describe options as plain data, so
  // the pinned-rows bands arrive as `$pinnedTop` / `$pinnedBottom` references and resolve here.
  const knobProps = resolveRefs(knobOptions(feature, knobValues), { pinnedTop, pinnedBottom }) as Partial<GridProps>;
  const defaultColDef = { sortable: true, resizable: true, movable: true, ...(knobProps.defaultColDef ?? {}) };
  const gridProps: Partial<GridProps> = { ...featureProps, ...knobProps, defaultColDef };

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
      controls={compact ? undefined : <KnobBar feature={feature} />}
      actions={feature === "client-side-data" ? (
        <button className={demoStyles.action} type="button" onClick={insertAtIndexTwo}>
          Insert at index 2
        </button>
      ) : undefined}
    >
      <Grid
        // Structural knobs (row numbers, block size, default expansion…) are fixed at construction,
        // so their values are part of the key: changing one mounts a fresh grid, as an app would.
        key={`${feature}|${structuralKey(feature, knobValues)}`}
        apiRef={apiRef}
        rowData={rowData}
        columnDefs={columnDefs}
        rowIdKey="id"
        theme={brandTheme}
        style={{ width: "100%", height: "100%" }}
        {...gridProps}
      />
    </DemoFrame>
  );
}
