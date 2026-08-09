# React binding examples

Install `@agility-workbench/react-grid`, `react`, and `react-dom`. Every core
option in [`../core`](../core/) is also a `<Grid />` prop; this page focuses on
React-specific component and lifecycle adaptation.

## Minimal mount

```tsx
import { Grid, type ReactColDef } from "@agility-workbench/react-grid";

const columns: ReactColDef[] = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
];

export function Example() {
  return (
    <div style={{ height: 360 }}>
      <Grid rowIdKey="id" rowData={rows} columnDefs={columns} />
    </div>
  );
}
```

The grid fills its host, so its parent needs a height. Mounting and cleanup are
safe under `React.StrictMode` effect replay.

## React cell renderer

```tsx
function StatusBadge({ value }: CellRendererParams) {
  return <span className={`badge badge-${value}`}>{String(value)}</span>;
}

const column: ReactColDef = {
  key: "status",
  label: "Status",
  cellRenderer: StatusBadge,
};
```

## React tooltip and ActionFrame

```tsx
function OwnerTooltip({ data }: TooltipComponentParams) {
  return <strong>{data.owner} · {data.ownerEmail}</strong>;
}

function CommentFrame({ value, close, api, rowIndex }: ActionFrameComponentParams) {
  return (
    <button
      onClick={() => {
        saveComment(rowIndex, String(value ?? ""));
        close();
      }}
    >
      Save comment
    </button>
  );
}

const columns: ReactColDef[] = [
  { key: "owner", label: "Owner", tooltipComponent: OwnerTooltip },
  {
    key: "comment",
    label: "Comment",
    actionFrameTrigger: "click",
    actionFrameComponent: CommentFrame,
  },
];
```

React components also work in `defaultColDef` for cell renderers, editors,
tooltips, header tooltips, and ActionFrames. Custom header content uses the
core DOM component contract.

## React cell editor

```tsx
const UppercaseEditor = forwardRef<ReactCellEditorHandle, ICellEditorParams>(
  function UppercaseEditor({ value }, ref) {
    const [draft, setDraft] = useState(String(value ?? ""));
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      getValue: () => draft.toUpperCase(),
      focus: () => inputRef.current?.focus(),
    }), [draft]);

    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  },
);

const column: ReactColDef = {
  key: "code",
  label: "Code",
  editable: true,
  cellEditor: UppercaseEditor,
};
```

## API ref and ready callback

```tsx
const apiRef = useRef<IGridAPI | null>(null);

<Grid
  ref={apiRef}
  onGridReady={(api) => api.setQuickFilter("open")}
  rowData={rows}
  columnDefs={columns}
/>
```

The separate `apiRef={apiRef}` prop is also supported. Refs are cleared when a
live setup is cleaned up.

## Event callback props

```tsx
<Grid
  onCellClicked={(event) => console.log(event.rowId, event.colId)}
  onRowClicked={(event) => console.log(event.rowId)}
  onCellValueChanged={(event) => saveChange(event)}
  onSelectionChanged={(event) => console.log(event.snapshot)}
  onSortChanged={(event) => console.log(event.changedColIds)}
/>
```

For other events, subscribe with `api.on(eventName, handler)`.

## React-aware menu items and icons

```tsx
<Grid
  icons={{ export: "/icons/download.svg" }}
  getColumnMenuItems={({ items }) => [
    ...items,
    { isSeparator: true },
    { id: "help", label: "Help", left: <HelpIcon />, onClick: openHelp },
  ]}
  bodyContextMenu={({ items }) => [
    ...items,
    { id: "inspect", label: "Inspect", right: <kbd>I</kbd>, onClick: inspect },
  ]}
/>
```

React nodes are accepted in menu `left` and `right` slots.
