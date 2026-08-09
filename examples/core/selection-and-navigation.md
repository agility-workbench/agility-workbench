# Selection and navigation

## Cell and range selection

```ts
const options = {
  cellSelection: true,
  rangeSelection: true,
  highlightActiveCell: true,
  clearSelectionOnBodyClick: true,
} satisfies GridOptions;
```

Click selects a cell, drag or Shift+click extends a range, and Ctrl/Cmd+A selects
the grid. Set `cellSelection: "text"` for native browser text selection, or
`false` to make cells inert.

## Row selection

```ts
const options = {
  rowNumbers: true,
  rowSelection: true,
  selectAllRowsOnHeaderClick: true,
} satisfies GridOptions;
```

Click row numbers to select. Ctrl/Cmd+click toggles and Shift+click extends.

```ts
api.selectRow(3, "replace");
api.selectAllRows();
console.log(api.getSelectedRows());
api.deselectAllRows();
```

## Column selection

```ts
const options = { columnSelection: true } satisfies GridOptions;

api.selectColumn("revenue", "replace");
api.selectColumn("cost", "toggle");
```

## Programmatic range

```ts
api.selectRange(2, 1);   // row index 2, column index 1
api.extendRangeTo(8, 3);
console.log(api.getSelection());
api.clearSelection("range");
```

## Keyboard-style navigation

```ts
api.setFocusedCell(0, 0);
api.navigate("down");
api.navigate("right", { extend: true });
api.navigate("down", { jump: "block" });
api.navigate("down", { jump: "page", pageRows: 20 });
api.navigateToCorner("bottomRight");
```

The rendered grid maps arrows, Home/End, Page Up/Down, Ctrl/Cmd+Arrow, and
Ctrl/Cmd+Home/End to these operations and scrolls the active cell into view.
Ranges are clamped to the current view and cleared when pagination changes.
