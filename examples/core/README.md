# Core setup and events

The files in this directory are intentionally fragments. This is the one small
example that shows the framework-neutral lifecycle around them.

## Create, attach, and destroy

```ts
import {
  CanvasMeasurer,
  ColumnType,
  GridCore,
  initDomRenderer,
  type IMenuAdapter,
} from "@agility-workbench/grid";

const core = new GridCore(new CanvasMeasurer(), {
  rowIdKey: "id",
  columnDefs: [
    { key: "name", label: "Name" },
    { key: "amount", label: "Amount", type: ColumnType.NUMBER },
  ],
});

const menus: IMenuAdapter = {
  resolveMenuItems: (_context, defaults) => ({
    items: defaults,
    cleanup: () => undefined,
  }),
};

const { renderer, api } = initDomRenderer(core, menus);
renderer.attach({ current: document.querySelector("#grid")! });
core.dispatch({ type: "init" });
api.setRowData([{ id: "1", name: "Alpha", amount: 12 }]);

// When the host view is removed:
api.destroy();
```

The host element must have an explicit height. The renderer supplies its base
stylesheet automatically unless `suppressStyleInjection` is enabled.

## Callback options

```ts
const options = {
  onCellClicked: ({ rowId, colId, value }) => console.log(rowId, colId, value),
  onRowClicked: ({ rowId, data }) => console.log(rowId, data),
  onCellValueChanged: ({ rowId, colId, value }) => save(rowId, colId, value),
  onSelectionChanged: ({ snapshot }) => console.log(snapshot),
  onSortChanged: ({ changedColIds }) => console.log(changedColIds),
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
