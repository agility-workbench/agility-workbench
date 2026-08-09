# Row models

## Client-side rows and stable IDs

```ts
const options = {
  rowIdKey: "id",
  rowModelType: "clientSide",
} satisfies GridOptions;

api.setRowData([
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
]);
```

Use `getRowId: row => String(row.account.id)` instead of `rowIdKey` when IDs
are derived or nested.

## Incremental client-side transactions

```ts
api.applyTransaction({
  add: [{ id: "c", name: "Gamma" }],
  update: [{ rowId: "a", row: { id: "a", name: "Alpha updated" } }],
  remove: ["b"],
});
```

Transactions preserve unaffected row nodes and edit history. They are a
client-side feature.

## Server-side blocks

```ts
import type { IServerSideDataSource } from "@agility-workbench/grid";

const serverSideDataSource: IServerSideDataSource = {
  async getRows({ request }) {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json(); // { rows, totalRows }
  },
};

const options = {
  rowModelType: "serverSide",
  serverSideBlockSize: 100,
  serverSideDataSource,
} satisfies GridOptions;
```

`request` carries the visible range plus active filters, sorts, grouping
columns, group keys, and aggregate requests. Blocks load lazily as needed.

## Server-provided schema

```ts
const serverSideDataSource: IServerSideDataSource = {
  async getRows({ request }) {
    return {
      rows: await loadRows(request),
      totalRows: 500,
      schemaVersion: "orders-v2",
      columns: [
        { key: "orderNo", label: "Order" },
        { key: "total", label: "Total", type: ColumnType.CURRENCY },
      ],
    };
  },
};
```

Root responses may supply `columns`. Repeated responses with the same schema
are deduplicated automatically.

## Open-ended server listings

```ts
return {
  rows, // omit totalRows when counting is too expensive
};
```

The grid probes subsequent blocks until it receives a short block. Pagination
shows a provisional `+` total while the end remains unknown.

## Refresh server data

```ts
await api.refreshServerSideData();
await api.refreshServerSideData({ purge: true });
await api.refreshServerSideData({ groupKeys: ["EMEA"], purge: false });
```

The default soft refresh keeps current rows visible. `purge: true` immediately
drops the affected cache.
