# Grouping, tree data, and aggregation

## Multi-level row grouping

```ts
const options = {
  groupDisplayType: "singleColumn",
  groupDefaultExpanded: 1,
  groupSortMode: "local",
  columnDefs: [
    { colId: "region", key: "region", label: "Region", groupable: true },
    { colId: "country", key: "country", label: "Country", groupable: true },
    { key: "revenue", label: "Revenue", type: ColumnType.CURRENCY },
  ],
} satisfies GridOptions;

api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
api.setAllGroupsExpanded(true);
```

`groupDisplayType` also accepts `"multipleColumns"` and `"groupRows"`. Use
`groupRowsSelectable: true` when generated group rows should participate in
selection, navigation, and copying.

## Expand one group

```ts
api.dispatch({
  type: "groupToggleExpand",
  groupId: "the-stable-group-node-id",
  expanded: true,
});
```

Expansion state survives data refreshes when group values are unchanged.

## Aggregate grouped and flat data

```ts
const revenue = api.getColumnModel().getByColId("revenue")!;
const orders = api.getColumnModel().getByColId("orders")!;

api.dispatch({
  type: "aggregateModelSet",
  aggregateModels: [
    { key: revenue.instanceID, type: AggregateType.SUM },
    { key: orders.instanceID, type: AggregateType.COUNT },
  ],
});
```

The aggregate footer lets users choose `none`, `page`, or `all`. Available
functions are count, distinct count, sum, average, min, max, and median. Grouped
client-side rows also receive per-group aggregate values.

## Server-side aggregation

```ts
const dataSource: IServerSideDataSource = {
  getRows: ({ request }) => loadRows(request),
  getAggregates: async ({ request }) => ({
    values: await loadAggregateValues(request),
  }),
};

const options = {
  rowModelType: "serverSide",
  serverSideDataSource: dataSource,
} satisfies GridOptions;
```

## Server-side grouping

```ts
const dataSource: IServerSideDataSource = {
  async getRows({ request }) {
    // request.groupBy: ["region", "country"]
    // request.groupKeys: [{ key: "region", value: "EMEA" }, ...]
    return queryOneGroupingLevel(request);
  },
};

const options = {
  rowModelType: "serverSide",
  serverSideDataSource: dataSource,
  getGroupChildCount: (row) => row.childCount,
} satisfies GridOptions;
```

Each expanded group loads its own child listing lazily.

## Tree data from paths

```ts
const options = {
  rowIdKey: "id",
  treeData: {
    mode: "path",
    getPath: (row) => row.path,
  },
} satisfies GridOptions;

const rows = [
  { id: "paris", path: ["World", "Europe", "France", "Paris"] },
];
```

## Tree data from parent IDs

```ts
const options = {
  rowIdKey: "id",
  treeData: {
    mode: "parent",
    getParentId: (row) => row.parentId,
    getLabel: (row) => row.name,
    columnDef: { label: "Organization", width: 280 },
  },
} satisfies GridOptions;
```

## Tree data from nested children

```ts
const options = {
  rowIdKey: "id",
  treeData: {
    mode: "children",
    getChildren: (row) => row.children,
    getLabel: (row) => row.name,
  },
} satisfies GridOptions;
```

## Hierarchy keyboard navigation

```ts
const options = {
  treeData: {
    mode: "parent",
    getParentId: (row) => row.parentId,
    keyboardNavigationMode: "hierarchy",
    enableKeyboardNavigationModeSwitch: true,
  },
} satisfies GridOptions;

api.setKeyboardNavigationMode("grid");
```

Tree data is client-side and cannot be combined with column-value grouping.
