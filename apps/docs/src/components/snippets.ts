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
  | "tree-data"
  | "pinned-rows"
  | "rendering"
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
  columnPanel={{ trigger: "toolbar" }}
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
  [columnPanel]="{ trigger: 'toolbar' }"
/>`,
    core: String.raw`const core = new GridCore(new CanvasMeasurer(), {
  columnDefs: [
    { key: "orderNo", label: "Order", pinned: "left" },
    { key: "customer", label: "Customer", width: 180 },
    { key: "revenue", label: "Revenue", type: ColumnType.CURRENCY },
  ],
  columnPanel: { trigger: "toolbar" },
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
  pagination
  pageSize={25}
  pageSizes={[10, 25, 50]}
  onGridReady={(api) => {
    api.applyTransaction({ add: [newOrder], addIndex: 2 });
  }}
/>`,
    angular: String.raw`<awb-grid
  rowIdKey="id"
  [rowData]="rows"
  [columnDefs]="columns"
  [pagination]="true"
  [pageSize]="25"
  [pageSizes]="[10, 25, 50]"
  (gridReady)="api = $event"
/>

// Later
this.api.applyTransaction({ add: [newOrder], addIndex: 2 });`,
    core: String.raw`const core = new GridCore(measurer, {
  rowIdKey: "id",
  columnDefs,
  pagination: true,
  pageSize: 25,
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

<Grid rowModelType="serverSide" serverSideDataSource={dataSource} />`,
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
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  rowModelType: "serverSide",
  serverSideBlockSize: 100,
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
  toolbar={{ quickFilter: true }}
  quickFilter={{ matchMode: "multiTerm" }}
  onFilterChanged={(ev) => recomputeSummary(ev.source, ev.changedColIds)}
/>`,
    angular: String.raw`columns: NgColDef[] = [
  { key: "customer", label: "Customer", filter: "text" },
  { key: "status", label: "Status", filter: "set" },
  { key: "revenue", label: "Revenue", filter: "number" },
];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [toolbar]="{ quickFilter: true }"
  (filterChanged)="recomputeSummary($event)"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs: [
    { key: "customer", label: "Customer", filter: "text" },
    { key: "status", label: "Status", filter: "set" },
    { key: "revenue", label: "Revenue", filter: "number" },
  ],
  quickFilter: { matchMode: "multiTerm" },
});

api.setQuickFilter("EMEA on track");
// One canonical signal for column filters AND quick filter:
api.on("filterChanged", (ev) => recomputeSummary(ev.source, ev.changedColIds));`,
  },
  sorting: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  initialSort={[
    { colId: "region", dir: "asc" },
    { colId: "revenue", dir: "desc" },
  ]}
  showSortPriority="always"
  toolbar={{ sorting: true }}
/>`,
    angular: String.raw`initialSort = [
  { colId: "region", dir: "asc" as const },
  { colId: "revenue", dir: "desc" as const },
];

<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [initialSort]="initialSort"
  showSortPriority="always"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  initialSort: [
    { colId: "region", dir: "asc" },
    { colId: "revenue", dir: "desc" },
  ],
  showSortPriority: "always",
});`,
  },
  selection: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  rowNumbers
  rowSelection
  selectAllRowsOnHeaderClick
  rangeSelection
  highlightActiveCell
  onSelectionChanged={({ snapshot }) => console.log(snapshot)}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [rowNumbers]="true"
  [rowSelection]="true"
  [rangeSelection]="true"
  [highlightActiveCell]="true"
  (selectionChanged)="selection = $event.snapshot"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  rowNumbers: true,
  rowSelection: true,
  rangeSelection: true,
  highlightActiveCell: true,
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
  undoLimit={50}
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
  [undoLimit]="50"
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
  undoLimit: 50,
});

api.startEditingCell({ rowId: "order-1", colId: "status" });`,
  },
  grouping: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  groupDefaultExpanded={1}
  groupRowsSticky
  toolbar={{ grouping: true }}
  onGridReady={(api) => {
    api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
  }}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [groupDefaultExpanded]="1"
  [groupRowsSticky]="true"
  [toolbar]="{ grouping: true }"
  (gridReady)="group($event)"
/>

group(api: IGridAPI) {
  api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
}`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  groupDisplayType: "singleColumn",
  groupDefaultExpanded: 1,
  groupRowsSticky: true,
});

api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
api.setAllGroupsExpanded(true);`,
  },
  pivot: {
    react: String.raw`<Grid
  rowData={rows}
  columnDefs={columns}
  toolbar={{ pivot: true }}
  onGridReady={(api) => {
    const revenue = api.getColumnModel().getByColId("revenue")!;
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
    });
    api.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    api.setPivotColumns(["status"]);
    api.setPivotMode(true);
  }}
/>`,
    angular: String.raw`<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  [toolbar]="{ pivot: true }"
  (gridReady)="pivot($event)"
/>

pivot(api: IGridAPI) {
  const revenue = api.getColumnModel().getByColId("revenue")!;
  api.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
  });
  api.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  api.setPivotColumns(["status"]);
  api.setPivotMode(true);
}`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  // Or seed at construction: pivotMode: true, pivotColumns: ["status"]
  toolbar: { pivot: true },
});

const revenue = api.getColumnModel().getByColId("revenue")!;
api.dispatch({
  type: "aggregateModelSet",
  aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
});
api.dispatch({ type: "rowGroupSet", colIds: ["region"] });
api.setPivotColumns(["status"]);
api.setPivotMode(true);`,
  },
  "tree-data": {
    react: String.raw`<Grid
  rowIdKey="id"
  rowData={rows}
  columnDefs={columns}
  groupDefaultExpanded={2}
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
  [treeData]="treeData"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  rowIdKey: "id",
  columnDefs,
  groupDefaultExpanded: 2,
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
  allowExportAsCSV
  allowExportAsExcel
  toolbar={{ export: true }}
  onGridReady={(api) => {
    // api.exportDataAsExcel({ scope: "selection" });
  }}
/>`,
    angular: String.raw`<awb-grid
  #grid="awbGrid"
  [rowData]="rows"
  [columnDefs]="columns"
  [allowExportAsCSV]="true"
  [allowExportAsExcel]="true"
  [toolbar]="{ export: true }"
/>

<button (click)="grid.api?.exportDataAsExcel({ scope: 'selection' })">
  Export selection
</button>`,
    core: String.raw`const core = new GridCore(measurer, {
  columnDefs,
  allowExportAsCSV: true,
  allowExportAsExcel: true,
  toolbar: { export: true },
});

api.exportDataAsCsv({ scope: "all" });
api.exportDataAsExcel({ scope: "selection", groupMode: "tree" });`,
  },
  "pinned-rows": {
    react: String.raw`<Grid
  rowIdKey="id"
  rowData={rows}
  columnDefs={columns}
  pinnedTopRowData={[{ id: "target", label: "Target", amount: 1_000_000 }]}
  pinnedBottomRowData={[{ id: "total", label: "Total", amount: 842_000 }]}
  rowPinningMenu
  groupRowsSticky
/>`,
    angular: String.raw`pinnedTop = [{ id: "target", label: "Target", amount: 1_000_000 }];
pinnedBottom = [{ id: "total", label: "Total", amount: 842_000 }];

<awb-grid
  rowIdKey="id"
  [rowData]="rows"
  [columnDefs]="columns"
  [pinnedTopRowData]="pinnedTop"
  [pinnedBottomRowData]="pinnedBottom"
  [rowPinningMenu]="true"
/>`,
    core: String.raw`const core = new GridCore(measurer, {
  rowIdKey: "id",
  columnDefs,
  pinnedTopRowData: [{ id: "target", label: "Target", amount: 1_000_000 }],
  pinnedBottomRowData: [{ id: "total", label: "Total", amount: 842_000 }],
  rowPinningMenu: true,
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

<Grid rowData={rows} columnDefs={columns} zebraRows columnHover />`,
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

<awb-grid [rowData]="rows" [columnDefs]="columns" [zebraRows]="true" />`,
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
  zebraRows: true,
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
  tooltip={{ showDelay: 150, mode: "anchored", placement: "auto" }}
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
  [tooltip]="{ showDelay: 150, mode: 'anchored', placement: 'auto' }"
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
  tooltip: { showDelay: 150, hideDelay: 75, mode: "anchored", placement: "auto" },
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

<Grid rowData={rows} columnDefs={columns} theme={theme} />`,
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
/>`,
    core: String.raw`const theme = themeDark.withParams({
  accentColor: "#2fd2e2",
  backgroundColor: "#0a172b",
  headerBackgroundColor: "#0f2140",
  rowHeight: 40,
  spacing: 10,
});

const core = new GridCore(measurer, { columnDefs, theme });`,
  },
};
