# Pinned and sticky rows

## Application-owned top and bottom rows

```ts
const options = {
  pinnedTopRowData: [{ id: "target", label: "Target", amount: 1_000_000 }],
  pinnedBottomRowData: [{ id: "total", label: "Total", amount: 842_000 }],
} satisfies GridOptions;
```

These rows sit outside sorting, filtering, grouping, pagination, and row count.
They retain normal formatting and cell renderers.

## Replace bands at runtime

```ts
api.setPinnedTopRowData(nextTargets);
api.setPinnedBottomRowData(nextTotals);
```

Each application band caps at 30% of grid height and gets an independent
vertical scrollbar when needed.

## Editable application rows

```ts
const options = {
  pinnedTopRowData: [{ id: "forecast", amount: 100 }],
  pinnedRowsEditable: true,
  columnDefs: [{ key: "amount", label: "Amount", editable: true }],
} satisfies GridOptions;
```

Edits update the supplied object and participate in undo/redo.

## Pin generated rows

```ts
const options = {
  isRowPinned: ({ node }) => node.isGroup && node.groupKey === "EMEA" ? "top" : null,
} satisfies GridOptions;

api.setRowPinned(groupNodeId, "bottom");
api.setRowPinned(groupNodeId, null);
```

Runtime-pinned hierarchy rows keep live expansion and aggregates. Their ancestor
chain is pinned with them, and unpinning the chain releases descendants.

## Sticky group ancestors

```ts
const options = {
  groupRowsSticky: true,
  groupDefaultExpanded: -1,
} satisfies GridOptions;
```

Expanded ancestors stack below the header while scrolling in client- or
server-side grouping. This works with all group display modes.

## Selection, navigation, and export across bands

No extra option is required. Arrow navigation crosses top → body → bottom;
range selection and Ctrl/Cmd+A span the unified sequence; copy and full export
preserve that order. Cut and paste remain body-only. Use `rowPinningMenu: true`
to expose runtime pin/unpin commands in the body menu.
