export type DemoFeature =
  | "columns"
  | "column-groups"
  | "client-side-data"
  | "server-side-data"
  | "filtering"
  | "sorting"
  | "selection"
  | "editing"
  | "grouping"
  | "pivot"
  | "sheets"
  | "tree-data"
  | "pinned-rows"
  | "rendering"
  | "sparklines"
  | "tooltips"
  | "action-frames"
  | "menus"
  | "toolbar-and-views"
  | "export"
  | "theming";

type FrameworkSnippets = Record<"react" | "angular" | "core", string>;

export const snippets: Record<DemoFeature, FrameworkSnippets> = {
  columns: {
    react: String.raw`const columns: ReactColDef[] = [
  { key: "orderNo", label: "Order", pinned: "left" },
  { key: "customer", label: "Customer", width: 180 },
  { key: "revenue", label: "Revenue", type: ColumnType.CURRENCY },
];

<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
/>`,
    angular: String.raw`columns: NgColDef[] = [
  { key: "orderNo", label: "Order", pinned: "left" },
  { key: "customer", label: "Customer", width: 180 },
  { key: "revenue", label: "Revenue", type: ColumnType.CURRENCY },
];

// template
<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
/>`,
    core: String.raw`const core = new GridCore(new CanvasMeasurer(), {
  columnDefs: [
    { key: "orderNo", label: "Order", pinned: "left" },
    { key: "customer", label: "Customer", width: 180 },
    { key: "revenue", label: "Revenue", type: ColumnType.CURRENCY },
  ],
  {{options}}
});`,
  },
  "column-groups": {
    react: String.raw`const columns: ReactColDef[] = [{
  label: "Revenue",
  openByDefault: true,
  children: [
    { key: "revenue", label: "Gross" },
    { key: "margin", label: "Margin", columnGroupShow: "open" },
  ],
}];

<Grid rowData={rows} columnDefs={columns} />`,
    angular: String.raw`columns: NgColDef[] = [{
  label: "Revenue",
  openByDefault: true,
  children: [
    { key: "revenue", label: "Gross" },
    { key: "margin", label: "Margin", columnGroupShow: "open" },
  ],
}];

<awb-grid [rowData]="rows" [columnDefs]="columns" />`,
    core: String.raw`const options: GridOptions = {
  columnDefs: [{
    label: "Revenue",
    openByDefault: true,
    children: [
      { key: "revenue", label: "Gross" },
      { key: "margin", label: "Margin", columnGroupShow: "open" },
    ],
  }],
};`,
  },
  "client-side-data": {
    react: String.raw`<Grid
  rowIdKey="id"
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onGridReady={(api) => {
    api.applyTransaction({ add: [newOrder], addIndex: 2 });
  }}
/>`,
    angular: String.raw`<awb-grid
  rowIdKey="id"
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  (gridReady)="api = $event"
/>

// Later
this.api.applyTransaction({ add: [newOrder], addIndex: 2 });`,
    core: String.raw`const core = new GridCore(measurer, {
  rowIdKey: "id",
  columnDefs,
  {{options}}
});

api.setRowData(rows);
api.applyTransaction({
  add: [newOrder],
  addIndex: 2,
  update: [{ rowId: "order-1", row: changedOrder }],
  remove: ["order-2"],
});`,
  },
  "server-side-data": {
    react: String.raw`const dataSource: IServerSideDataSource = {
  async getRows({ request }) {
    const response = await fetch("/api/orders", {
      method: "POST",
      body: JSON.stringify(request),
    });
    return response.json(); // { rows, totalRows }
  },
};

<Grid
  rowModelType="serverSide"
  serverSideDataSource={dataSource}
  {{options}}
/>`,
    angular: String.raw`dataSource: IServerSideDataSource = {
  getRows: async ({ request }) => {
    const response = await fetch("/api/orders", {
      method: "POST",
      body: JSON.stringify(request),
    });
    return response.json();
  },
};

<awb-grid
  rowModelType="serverSide"
  [serverSideDataSource]="dataSource"
  {{options}}
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  rowModelType: "serverSide",
  {{options}}
  serverSideDataSource: {
    async getRows({ request }) {
      return fetchOrders(request); // { rows, totalRows }
    },
  },
});

await api.refreshServerSideData({ purge: false });`,
  },
  filtering: {
    react: String.raw`const columns: ReactColDef[] = [
  { key: "customer", label: "Customer", filter: "text" },
  { key: "status", label: "Status", filter: "set" },
  { key: "revenue", label: "Revenue", filter: "number" },
];

<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onFilterChanged={(ev) => recomputeSummary(ev.source, ev.changedColIds)}
  onQuickFilterFindChanged={(ev) => setMatches(ev.activeIndex, ev.matchCount)}
/>`,
    angular: String.raw`columns: NgColDef[] = [
  { key: "customer", label: "Customer", filter: "text" },
  { key: "status", label: "Status", filter: "set" },
  { key: "revenue", label: "Revenue", filter: "number" },
];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  (filterChanged)="recomputeSummary($event)"
  (quickFilterFindChanged)="onFind($event)"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs: [
    { key: "customer", label: "Customer", filter: "text" },
    { key: "status", label: "Status", filter: "set" },
    { key: "revenue", label: "Revenue", filter: "number" },
  ],
  {{options}}
});

api.setQuickFilter("EMEA on track");
// One canonical signal for column filters AND quick filter:
api.on("filterChanged", (ev) => recomputeSummary(ev.source, ev.changedColIds));

// Or search without filtering: every row stays, matching cells are highlighted.
api.setQuickFilter("EMEA", { behavior: "find" });
api.findNext();  // steps and reveals the match; the box moves aside if it covers it
api.on("quickFilterFindChanged", (ev) => setMatches(ev.activeIndex, ev.matchCount));`,
  },
  sorting: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  initialSort={[
    { colId: "region", dir: "asc" },
    { colId: "revenue", dir: "desc" },
  ]}
  {{options}}
/>`,
    angular: String.raw`initialSort = [
  { colId: "region", dir: "asc" as const },
  { colId: "revenue", dir: "desc" as const },
];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [initialSort]="initialSort"
  {{options}}
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  initialSort: [
    { colId: "region", dir: "asc" },
    { colId: "revenue", dir: "desc" },
  ],
  {{options}}
});`,
  },
  selection: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onSelectionChanged={({ snapshot }) => console.log(snapshot)}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  (selectionChanged)="selection = $event.snapshot"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  {{options}}
});

api.selectRange(2, 1);
api.extendRangeTo(8, 3);
console.log(api.getSelection());`,
  },
  editing: {
    react: String.raw`const columns: ReactColDef[] = [{
  key: "status",
  label: "Status",
  editable: true,
  cellEditor: "select",
  cellEditorParams: { values: ["On track", "At risk", "Blocked"] },
}];

<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onCellValueChanged={saveChange}
/>`,
    angular: String.raw`columns: NgColDef[] = [{
  key: "status",
  label: "Status",
  editable: true,
  cellEditor: "select",
  cellEditorParams: { values: ["On track", "At risk", "Blocked"] },
}];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  (cellValueChanged)="saveChange($event)"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs: [{
    key: "status",
    label: "Status",
    editable: true,
    cellEditor: "select",
    cellEditorParams: { values: ["On track", "At risk", "Blocked"] },
  }],
  {{options}}
});

api.startEditingCell({ rowId: "order-1", colId: "status" });`,
  },
  grouping: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onGridReady={(api) => {
    api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
  }}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  (gridReady)="group($event)"
/>

group(api: IGridAPI) {
  api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
}`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  {{options}}
});

api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
api.setAllGroupsExpanded(true);`,
  },
  pivot: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onGridReady={(api) => {
    api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
    api.setRowGroupColumns(["region"]);
    api.setPivotColumns(["status"]);
    api.setPivotMode(true);
  }}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  (gridReady)="pivot($event)"
/>

pivot(api: IGridAPI) {
  api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
  api.setRowGroupColumns(["region"]);
  api.setPivotColumns(["status"]);
  api.setPivotMode(true);
}`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  // Or seed at construction: pivotMode: true, pivotColumns: ["status"]
  // Pivoted, the column panel becomes the pivot setup.
  {{options}}
});

api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
api.setRowGroupColumns(["region"]);
api.setPivotColumns(["status"]);
api.setPivotMode(true);`,
  },
  sheets: {
    react: String.raw`const [sheets, setSheets] = useState<GridSheet[]>([{ id: "data", name: "Data" }]);
const [activeSheetId, setActiveSheetId] = useState<string | null>("data");

<Grid
  rowData={rows}
  columnDefs={columns}
  pagination
  toolbar={{ pivot: true }}
  sheets={{
    sheets,
    activeSheetId,
    onChange: setSheets,               // persist anywhere — the app owns the list
    onActiveSheetChange: setActiveSheetId,
  }}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [pagination]="true"
  [toolbar]="{ pivot: true }"
  [sheets]="sheetsOptions()"
/>

readonly sheets = signal<GridSheet[]>([{ id: "data", name: "Data" }]);
readonly sheetsOptions = computed<SheetsOptions>(() => ({
  sheets: this.sheets(),
  onChange: (next) => this.sheets.set(next), // persist anywhere — the app owns the list
}));`,
    core: String.raw`const api = createGrid(host, {
  rowData,
  columnDefs,
  pagination: true,
  toolbar: { pivot: true },
  // Supplying the option mounts the footer tab strip. A sheet is a live view
  // state: switching tabs captures the sheet you leave and applies the next.
  sheets: {
    sheets: [{ id: "data", name: "Data" }],
    onChange: (next) => save(next), // persist anywhere — the app owns the list
  },
});`,
  },
  "tree-data": {
    react: String.raw`<Grid
  rowIdKey="id"
  rowData={rows}
  columnDefs={columns}
  {{options}}
  treeData={{
    mode: "parent",
    getParentId: (row) => row.parentId,
    getLabel: (row) => row.name,
    columnDef: { label: "Workspace", width: 260 },
  }}
/>`,
    angular: String.raw`treeData = {
  mode: "parent" as const,
  getParentId: (row: Item) => row.parentId,
  getLabel: (row: Item) => row.name,
  columnDef: { label: "Workspace", width: 260 },
};

<awb-grid
  rowIdKey="id"
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
  [treeData]="treeData"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  rowIdKey: "id",
  columnDefs,
  {{options}}
  treeData: {
    mode: "parent",
    getParentId: (row) => row.parentId,
    getLabel: (row) => row.name,
    columnDef: { label: "Workspace", width: 260 },
  },
});`,
  },
  export: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
  onGridReady={(api) => {
    // api.exportDataAsExcel({ scope: "selection" });
  }}
/>`,
    angular: String.raw`<awb-grid
  #grid="awbGrid"
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
/>

<button (click)="grid.api?.exportDataAsExcel({ scope: 'selection' })">
  Export selection
</button>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  {{options}}
});

api.exportDataAsCsv({ scope: "all" });
api.exportDataAsExcel({ scope: "selection", groupMode: "tree" });`,
  },
  "pinned-rows": {
    react: String.raw`const pinnedTop = [{ id: "target", label: "Target", amount: 1_000_000 }];
const pinnedBottom = [{ id: "total", label: "Total", amount: 842_000 }];

<Grid
  rowIdKey="id"
  rowData={rows}
  columnDefs={columns}
  {{options}}
/>`,
    angular: String.raw`pinnedTop = [{ id: "target", label: "Target", amount: 1_000_000 }];
pinnedBottom = [{ id: "total", label: "Total", amount: 842_000 }];

<awb-grid
  rowIdKey="id"
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
/>`,
    core: String.raw`const pinnedTop = [{ id: "target", label: "Target", amount: 1_000_000 }];
const pinnedBottom = [{ id: "total", label: "Total", amount: 842_000 }];

const core = new GridCore(measurer, {
  rowIdKey: "id",
  columnDefs,
  {{options}}
});

api.setPinnedTopRowData(nextTargets);   // replace a band at runtime
api.setRowPinned(groupNodeId, "bottom"); // pin a generated row
api.setRowPinned(groupNodeId, null);`,
  },
  rendering: {
    react: String.raw`function StatusBadge({ value }: CellRendererParams) {
  return <span className={"status status-" + String(value).toLowerCase()}>{String(value)}</span>;
}

const columns: ReactColDef[] = [
  { key: "status", label: "Status", cellRenderer: StatusBadge },
  {
    colId: "trend",
    label: "Trend",
    valueGetter: (row) => row.monthlyRevenue,
    cellRenderer: SparklineRenderer,
    cellRendererParams: { type: "area", showPoints: true },
  },
];

<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
/>`,
    angular: String.raw`// Any Angular component works in a cell slot; params arrive as an input.
columns: NgColDef[] = [
  { key: "status", label: "Status", cellRenderer: StatusBadgeComponent },
  {
    colId: "trend",
    label: "Trend",
    valueGetter: (row: Order) => row.monthlyRevenue,
    cellRenderer: SparklineRenderer,
    cellRendererParams: { type: "area", showPoints: true },
  },
];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs: [
    {
      key: "status",
      label: "Status",
      cellRenderer: ({ value }) => {
        const badge = document.createElement("span");
        badge.className = "status status-" + String(value).toLowerCase();
        badge.textContent = String(value);
        return badge;
      },
    },
    {
      colId: "trend",
      label: "Trend",
      valueGetter: (row) => row.monthlyRevenue,
      cellRenderer: SparklineRenderer,
      cellRendererParams: { type: "area", showPoints: true },
    },
  ],
  {{options}}
});`,
  },
  sparklines: {
    react: String.raw`const columns: ReactColDef[] = [
  // A plain number[]: the array index becomes the X value.
  {
    colId: "orderVolume",
    label: "Weekly orders",
    valueGetter: (node) => node.data.orders,
    cellRenderer: SparklineRenderer,
    cellRendererParams: {
      type: "bar",
      tooltipValueFormatter: ({ xValue, yValue }) => "Week " + (Number(xValue) + 1) + ": " + yValue,
    },
  },
  // An [x, y] tuple series: each point carries its own label.
  {
    colId: "annualTrend",
    label: "Annual trend",
    pinned: "right",
    sortable: false,
    filter: false,
    valueGetter: (node) => MONTHS.map((m, i) => [m, node.data.monthly[i]] as const),
    cellRenderer: SparklineRenderer,
    cellRendererParams: {
      type: "area",
      showPoints: true,
      tooltipValueFormatter: ({ xValue, yValue }) => xValue + ": $" + yValue.toLocaleString(),
    },
  },
];

<Grid rowData={accounts} columnDefs={columns} columnSelection theme={theme} />`,
    angular: String.raw`columns: NgColDef[] = [
  {
    colId: "orderVolume",
    label: "Weekly orders",
    valueGetter: (node: IRowNode) => node.data.orders,
    cellRenderer: SparklineRenderer,
    cellRendererParams: { type: "bar" } satisfies SparklineParams,
  },
  {
    colId: "annualTrend",
    label: "Annual trend",
    pinned: "right",
    sortable: false,
    valueGetter: (node: IRowNode) =>
      this.months.map((m, i) => [m, node.data.monthly[i]] as const),
    cellRenderer: SparklineRenderer,
    cellRendererParams: { type: "area", showPoints: true } satisfies SparklineParams,
  },
];

// template
<awb-grid
  [rowData]="accounts"
  [columnDefs]="columns"
  [columnSelection]="true"
  [theme]="theme"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  rowIdKey: "id",
  // Ctrl/Cmd+click two or more numeric headers to unlock "Show Sparklines".
  columnSelection: true,
  theme: themeDark.withParams({
    sparklineStrokeColor: "#2fd2e2",
    sparklineBarColor: "#7c9cff",
  }),
  columnDefs: [
    {
      colId: "annualTrend",
      label: "Annual trend",
      pinned: "right",
      sortable: false,
      valueGetter: (node) => MONTHS.map((m, i) => [m, node.data.monthly[i]]),
      cellRenderer: SparklineRenderer,
      cellRendererParams: {
        type: "area",
        showPoints: true,
        tooltipValueFormatter: ({ xValue, yValue }) => xValue + ": $" + yValue,
      },
    },
  ],
});

// The same column the "Show Sparklines" menu item builds, dispatched directly.
api.dispatch({
  type: "addSparklineColumn",
  targetColId: "jan",
  colIds: ["jan", "feb", "mar", "apr", "may", "jun"],
  sparklineType: "line",
});`,
  },
  tooltips: {
    react: String.raw`const columns: ReactColDef[] = [
  { key: "owner", label: "Owner", tooltipField: "ownerEmail" },
  {
    key: "revenue",
    label: "Revenue",
    tooltipValueGetter: ({ value, data }) => data.customer + ": $" + value,
  },
  { key: "margin", label: "Margin", headerTooltip: "Revenue minus direct cost" },
];

<Grid
  rowData={rows}
  columnDefs={columns}
  {{options}}
/>`,
    angular: String.raw`columns: NgColDef[] = [
  { key: "owner", label: "Owner", tooltipField: "ownerEmail" },
  {
    key: "revenue",
    label: "Revenue",
    tooltipValueGetter: ({ value, data }) => data.customer + ": $" + value,
  },
  { key: "margin", label: "Margin", headerTooltip: "Revenue minus direct cost" },
];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  {{options}}
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs: [
    { key: "owner", label: "Owner", tooltipField: "ownerEmail" },
    {
      key: "revenue",
      label: "Revenue",
      tooltipValueGetter: ({ value, data }) => data.customer + ": $" + value,
    },
    { key: "margin", label: "Margin", headerTooltip: "Revenue minus direct cost" },
  ],
  {{options}}
});

api.showTooltip({ rowId: "order-1", colId: "owner" });
api.on("tooltipShow", (event) => console.log(event));`,
  },
  "action-frames": {
    react: String.raw`function CommentFrame({ value, rowId, colDef, api, close }: ActionFrameComponentParams) {
  const [draft, setDraft] = useState(String(value ?? ""));
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      api.setCellValue({ rowId, colId: colDef.colId }, draft);
      close();
    }}>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
}

const columns: ReactColDef[] = [{
  key: "comment",
  label: "Comment",
  actionFrameTrigger: "click",
  actionFrameComponent: CommentFrame,
  actionFrameIndicator: "comment",
  actionFrameOptions: { placement: "right", offset: 10 },
}];`,
    angular: String.raw`// CommentFrameComponent receives ActionFrameComponentParams as an input
columns: NgColDef[] = [{
  key: "comment",
  label: "Comment",
  actionFrameTrigger: "click",
  actionFrameComponent: CommentFrameComponent,
  actionFrameIndicator: "comment",
  actionFrameOptions: { placement: "right", offset: 10 },
}];

<awb-grid [rowData]="rows" [columnDefs]="columns" />`,
    core: String.raw`const commentForm = (params: ActionFrameComponentParams) => {
  const form = document.createElement("form");
  const input = document.createElement("textarea");
  input.value = String(params.value ?? "");
  form.append(input);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    params.api.setCellValue(
      { rowId: params.rowId, colId: params.colDef.colId },
      input.value,
    );
    params.close();
  });
  return form;
};

const options: GridOptions = {
  columnDefs: [{
    key: "comment",
    label: "Comment",
    actionFrameTrigger: "click",
    actionFrameComponent: commentForm,
    actionFrameIndicator: "comment",
  }],
};

api.openActionFrame({ rowId: "task-4", colId: "comment" });`,
  },
  menus: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  rowNumbers
  rowPinningMenu
  getColumnMenuItems={({ ctx, items }) => [
    ...items,
    { isSeparator: true },
    {
      id: "inspect-column",
      label: "Inspect " + ctx.targetColId,
      onClick: () => inspectColumn(ctx.targetColId),
    },
  ]}
  bodyContextMenu={({ ctx, items }) => [
    ...items,
    { isSeparator: true },
    { id: "open-record", label: "Open record", onClick: () => openRecord(ctx.rowId) },
  ]}
  rowInsertionMenu={{
    createRow: ({ data, position }) => ({ ...data, id: nextId(), name: "Inserted " + position }),
  }}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [rowNumbers]="true"
  [rowPinningMenu]="true"
  [getColumnMenuItems]="columnMenu"
  [bodyContextMenu]="bodyMenu"
  [rowInsertionMenu]="insertionMenu"
/>

columnMenu = ({ ctx, items }: ColumnMenuContext) => [
  ...items,
  { isSeparator: true },
  { id: "inspect-column", label: "Inspect " + ctx.targetColId, onClick: () => this.inspect(ctx) },
];`,
    core: String.raw`const options: GridOptions = {
  rowNumbers: true,
  rowPinningMenu: true,
  bodyContextMenu: ({ ctx, items }) => [
    ...items,
    { isSeparator: true },
    { id: "open-record", label: "Open record", onClick: () => openRecord(ctx.rowId) },
  ],
  rowInsertionMenu: {
    createRow: ({ data, position }) => ({ ...data, id: nextId(), name: "Inserted " + position }),
    canInsert: ({ data }) => data.locked !== true,
  },
};`,
  },
  "toolbar-and-views": {
    react: String.raw`const [views, setViews] = useState<SavedGridView[]>(loadViews);

<Grid
  rowData={rows}
  columnDefs={columns}
  columnPanel={{ trigger: "toolbar" }}
  toolbar={{ grouping: true, sorting: true, quickFilter: true, views: true, export: true }}
  savedViews={{
    views,
    onChange: (next) => {
      setViews(next);
      localStorage.setItem("grid-views", JSON.stringify(next));
    },
  }}
/>`,
    angular: String.raw`views: SavedGridView[] = loadViews();

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [columnPanel]="{ trigger: 'toolbar' }"
  [toolbar]="{ grouping: true, sorting: true, quickFilter: true, views: true, export: true }"
  [savedViews]="{ views, onChange: persistViews }"
/>

persistViews = (next: SavedGridView[]) => {
  this.views = next;
  localStorage.setItem("grid-views", JSON.stringify(next));
};`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  columnPanel: { trigger: "toolbar", width: 320 },
  toolbar: { grouping: true, sorting: true, quickFilter: true, views: true, export: true },
  savedViews: {
    views: loadViews(),
    onChange: (next) => localStorage.setItem("grid-views", JSON.stringify(next)),
  },
});

// Or capture/apply view state directly:
const state = api.captureViewState();
api.applyViewState(state, { columns: "merge" });`,
  },
  theming: {
    react: String.raw`const theme = themeDark.withParams({
  accentColor: "#2fd2e2",
  backgroundColor: "#0a172b",
  headerBackgroundColor: "#0f2140",
  rowHeight: 40,
  spacing: 10,
});

<Grid
  rowData={rows}
  columnDefs={columns}
  theme={theme}
  {{options}}
/>`,
    angular: String.raw`theme = themeDark.withParams({
  accentColor: "#2fd2e2",
  backgroundColor: "#0a172b",
  headerBackgroundColor: "#0f2140",
  rowHeight: 40,
  spacing: 10,
});

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [theme]="theme"
  {{options}}
/>`,
    core: String.raw`const theme = themeDark.withParams({
  accentColor: "#2fd2e2",
  backgroundColor: "#0a172b",
  headerBackgroundColor: "#0f2140",
  rowHeight: 40,
  spacing: 10,
});

const core = new GridCore(measurer, {
  columnDefs,
  theme,
  {{options}}
});`,
  },
};
