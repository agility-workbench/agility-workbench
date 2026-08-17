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

`createGrid` uses the grid's built-in column and body menus. To add or replace menu
items — the seam the React and Angular bindings use to render framework-owned items —
assemble the parts yourself and pass an `IMenuAdapter` (and optionally an
`IBodyMenuAdapter`) to `initDomRenderer`:

```ts
import {
  CanvasMeasurer,
  GridCore,
  initDomRenderer,
  type IMenuAdapter,
} from "@agility-workbench/grid";

const menus: IMenuAdapter = {
  resolveMenuItems: (context, defaults) => ({
    items: [
      ...defaults,
      { id: "audit", label: "Audit column", onClick: () => audit(context.targetColId) },
    ],
    cleanup: () => undefined,
  }),
};

const core = new GridCore(new CanvasMeasurer(), { rowIdKey: "id" });
const { renderer, api } = initDomRenderer(core, menus);

renderer.attach(document.querySelector("#grid")!);
core.dispatch({ type: "init" });
```

Both adapters are optional. Note that this path owns its own teardown —
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
