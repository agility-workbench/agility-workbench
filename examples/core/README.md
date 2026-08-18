# Core setup and events

The files in this directory are intentionally fragments. This is the one small
example that shows the framework-neutral lifecycle around them.

## Create, attach, and destroy

```ts
import { ColumnType, createGrid } from "@agility-workbench/grid";

const api = createGrid(document.querySelector("#grid")!, {
  rowIdKey: "id",
  columnDefs: [
    { key: "name", label: "Name" },
    { key: "amount", label: "Amount", type: ColumnType.NUMBER },
  ],
  rowData: [{ id: "1", name: "Alpha", amount: 12 }],
});

// When the host view is removed — this tears down renderer and core too:
api.destroy();
```

The host element must have an explicit height. The renderer supplies its base
stylesheet automatically unless `suppressStyleInjection` is enabled.

## Menu items

Column menu items are per-column configuration — no adapter needed. `columnMenu`
receives the grid's own items and returns what to show; `false` removes the menu
entirely (no ⋮ button, no header right-click). Put it on `defaultColDef` to cover every
column.

```ts
const api = createGrid(document.querySelector("#grid")!, {
  columnDefs: [
    {
      key: "amount",
      label: "Amount",
      columnMenu: ({ column, items }) => [
        ...items,
        { isSeparator: true },
        { label: "Audit", left: "my-icon-class", onClick: () => audit(column.colId) },
      ],
    },
    { key: "actions", label: "", columnMenu: false },
  ],
  bodyContextMenu: ({ items }) => [...items, { label: "Copy link", onClick: share }],
});
```

Identify the column with `column.colId` — `ctx.targetColId` is the grid's internal
instance id. The getter runs only for single-column menus; with several columns selected
the grid-level `multiColumnMenu` governs the menu instead:

```ts
createGrid(host, {
  columnDefs,
  // `columns` is what the menu acts on, target first. `false` disables multi-column menus.
  multiColumnMenu: ({ columns, items }) => [
    ...items,
    { label: `Export ${columns.length} columns`, onClick: () => exportCols(columns) },
  ],
});
```

The `IMenuAdapter` / `IBodyMenuAdapter` seam remains for the one case these getters
cannot cover: mounting framework components into items and unmounting them on close.
That path uses `initDomRenderer` directly and owns its own teardown —
`renderer.detach()`, `renderer.destroy()`, `core.destroy()` — because `api.destroy()`
performs full teardown only for a grid created by `createGrid`.

## Callback options

```ts
const options = {
  onCellClicked: ({ rowId, colId, value }) => console.log(rowId, colId, value),
  onRowClicked: ({ rowId, data }) => console.log(rowId, data),
  onCellValueChanged: ({ rowId, colId, value }) => save(rowId, colId, value),
  onSelectionChanged: ({ snapshot }) => console.log(snapshot),
  onSortChanged: ({ changedColIds }) => console.log(changedColIds),
  onFilterChanged: ({ source, changedColIds }) => console.log(source, changedColIds),
} satisfies GridOptions;
```

## Event bus

```ts
const stopListening = api.on("paginationChanged", (event) => {
  console.log(event.pageIndex, event.totalPages, event.totalRowCountKnown);
});

stopListening();
```

The event bus also reports model, row, column, cell, aggregate, selection,
focus, editing, overlay, tooltip, ActionFrame, viewport, and error changes.

## Dispatch actions

```ts
api.dispatch({ type: "columnVisibility", colIds: ["internal"], hidden: true });
api.dispatch({ type: "rowHeightSet", rowHeightPx: 44 });
api.dispatch({ type: "overscanSet", overscanRowCount: 10 });
```

Prefer the named API method when one exists; `dispatch` exposes the same typed
action pipeline used by the built-in renderer.
