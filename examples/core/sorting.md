# Sorting

## Enable sorting and choose the cycle

```ts
const options = {
  multiSortKey: "shift",
  showSortPriority: "always",
  defaultColDef: {
    sortable: true,
    sortingOrder: ["asc", "desc", null],
    sortIconVisibility: "hover",
  },
} satisfies GridOptions;
```

A column can override the `defaultColDef` sorting cycle and icon visibility.
Users add another sort with the configured modifier key; the toolbar can expose
ordered sort chips with `toolbar: { sorting: true }`.

## Initial multi-column sort

```ts
const options = {
  initialSort: [
    { colId: "region", dir: "asc" },
    { colId: "revenue", dir: "desc" },
  ],
} satisfies GridOptions;
```

Or place the initial state directly on columns:

```ts
const columnDefs: ColDef[] = [
  { colId: "region", key: "region", label: "Region", sort: "asc", sortIndex: 0 },
  { colId: "revenue", key: "revenue", label: "Revenue", sort: "desc", sortIndex: 1 },
];
```

## Custom comparator

```ts
const priorityOrder = ["critical", "high", "normal", "low"];

const column = {
  key: "priority",
  label: "Priority",
  sortable: true,
  comparator: (a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b),
} satisfies ColDef;
```

Without a comparator, the grid derives type-aware string, number, date, boolean,
or currency comparison automatically.

## Set or toggle sorting through the API

```ts
const model = api.getColumnModel();
const region = model.getByColId("region")!;
const revenue = model.getByColId("revenue")!;

api.dispatch({
  type: "sortModelSet",
  sortItems: [
    { key: region.instanceID, dir: "asc" },
    { key: revenue.instanceID, dir: "desc" },
  ],
});

api.dispatch({
  type: "headerAction",
  colId: "revenue",
  action: "toggleSort",
  additive: false,
});
```
