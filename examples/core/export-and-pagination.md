# Export and pagination

## Enable export commands

```ts
const options = {
  allowExportAsCSV: true,
  allowExportAsExcel: true,
  toolbar: { export: true },
} satisfies GridOptions;
```

Export is also available from column and body context menus.

## Download CSV or Excel

```ts
api.exportDataAsCsv({ fileName: "orders.csv" });
api.exportDataAsExcel({ fileName: "orders.xlsx" });
```

## Export a range or selected columns

```ts
api.exportDataAsCsv({ scope: "selection" });

api.exportDataAsExcel({
  scope: "selectedColumns",
  columnIds: ["orderNo", "customer", "total"],
  includeHeaders: true,
});
```

## Grouped export

```ts
api.exportDataAsExcel({ groupMode: "tree" });   // group headers + subtotals
api.exportDataAsExcel({ groupMode: "leaves" }); // flat leaves with group paths
```

Excel output preserves hierarchical headers, supported formats, pinned panes,
cell/full-width merges, group outline levels, and aggregate formulas. CSV and
Excel include application-pinned top and bottom rows around the body.

## Get bytes without downloading

```ts
const csv = api.getDataAsCsv({ scope: "all" });
await fetch("/exports/orders.csv", { method: "PUT", body: csv });

const bytes = await api.getDataAsExcel();
const workbook = new Blob([bytes], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
```

## Client-side pagination

```ts
const options = {
  pagination: true,
  pageSize: 25,
  pageSizes: [10, 25, 50, 100],
} satisfies GridOptions;
```

The footer renders page navigation, page size, row count, and aggregate scope.

## Change page programmatically

```ts
api.dispatch({
  type: "paginationSet",
  enabled: true,
  pageIndex: 2,
  pageSize: 25,
});
```

## Server-side pagination with provisional totals

```ts
const options = {
  rowModelType: "serverSide",
  pagination: true,
  pageSize: 50,
  paginationUnknownTotalTooltip: "The server is still discovering the total",
  serverSideDataSource: {
    getRows: ({ request }) => loadRowsWithoutAnExpensiveCount(request),
  },
} satisfies GridOptions;
```

If a response omits `totalRows`, the page count carries `+` until a short block
establishes the end.
