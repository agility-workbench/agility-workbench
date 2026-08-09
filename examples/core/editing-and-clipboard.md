# Editing and clipboard

## Built-in editors

```ts
const columnDefs: ColDef[] = [
  { key: "name", label: "Name", editable: true, cellEditor: "text" },
  { key: "quantity", label: "Quantity", editable: true, cellEditor: "number" },
  { key: "due", label: "Due", editable: true, cellEditor: "date" },
  { key: "active", label: "Active", editable: true, cellEditor: "boolean" },
  {
    key: "status",
    label: "Status",
    editable: true,
    cellEditor: "select",
    cellEditorParams: { values: ["Open", "Pending", "Closed"] },
  },
  { key: "notes", label: "Notes", editable: true, cellEditor: "textarea" },
];
```

## Parsing committed values

```ts
const column = {
  key: "percent",
  label: "Percent",
  editable: true,
  valueParser: ({ value }) => Number(value.replace("%", "")) / 100,
  valueFormatter: ({ value }) => `${Math.round(value * 100)}%`,
} satisfies ColDef;
```

## Edit behavior

```ts
const options = {
  editTrigger: "singleClick",
  suppressTypeToEdit: true,
  moveAfterEdit: true,
  commitOnBlur: true,
  reevaluateOnEdit: true,
  undoLimit: 50,
} satisfies GridOptions;
```

Use `editTrigger: "none"` with `suppressKeyboardEdit: true` for API-only
editing. By default, double-click, F2, Enter, or typing begins an edit.

## Editing API

```ts
const cell = { rowId: "order-1", colId: "quantity" };

api.startEditingCell(cell);
api.stopEditing("42");
api.cancelEditing();
api.setCellValue(cell, "43");
```

## Minimal custom editor

```ts
const uppercaseEditor = (params: ICellEditorParams) => {
  const input = document.createElement("input");
  input.value = String(params.value ?? "").toUpperCase();
  return {
    init: () => {},
    getGui: () => input,
    getValue: () => input.value.toUpperCase(),
    focus: () => input.focus(),
  };
};

const column = {
  key: "code",
  label: "Code",
  editable: true,
  cellEditor: uppercaseEditor,
} satisfies ColDef;
```

## Undo and redo

```ts
api.undo();
api.redo();
console.log(api.canUndo(), api.canRedo());
api.clearHistory();
```

One edit, paste, cut, or batch clear is one history step.

## Clipboard

```ts
api.copySelection(); // TSV
api.cutSelection();  // copy, then clear editable cells
await api.paste();    // parses TSV into the active range
```

The rendered grid also supports the normal copy/cut/paste shortcuts and
Delete/Backspace. Multi-cell paste tiles a block when it divides evenly into the
selected range, and each destination column's `valueParser` is applied.
