# @agility-workbench/grid

A high-performance, framework-agnostic TypeScript data grid for building modern data
workspaces.

- **Framework-agnostic core** — the grid engine (`GridCore` + `GridRenderer`) is plain
  TypeScript with no framework dependency.
- **React binding** — using React? Install [`@agility-workbench/react-grid`](https://www.npmjs.com/package/@agility-workbench/react-grid),
  a thin `<Grid />` adapter built on this core.
- **Virtualized** rendering, client-side and server-side row models, row grouping, tree data,
  aggregation, quick filter, editing, and CSV / Excel export (zero-dependency `.xlsx` writer).
- **Themeable** via an AG-Grid-style theme object that resolves to CSS variables applied
  per grid instance.

## Installation

```bash
npm install @agility-workbench/grid
```

For React apps, install the binding instead (it depends on this package):

```bash
npm install @agility-workbench/react-grid react react-dom
```

## Quick start (core, no framework)

```ts
import { CanvasMeasurer, ColumnType, GridCore, initDomRenderer } from "@agility-workbench/grid";
import "@agility-workbench/grid/styles.css";

const core = new GridCore(new CanvasMeasurer(), {
  rowIdKey: "id",
  columnDefs: [
    { key: "name", label: "Name", type: ColumnType.STRING },
    { key: "price", label: "Price", type: ColumnType.NUMBER },
  ],
});
const { renderer } = initDomRenderer(core);
renderer.attach({ current: document.getElementById("app")! });
core.dispatch({ type: "init" });
core.dispatch({ type: "rowDataSet", rows: [{ id: 1, name: "Widget", price: 9.99 }] });
```

## Toolbar

Toolbar sections are individually opt-in. There is no separate visibility flag: the toolbar appears
when at least one section is enabled, and disappears when none are enabled.

```ts
const core = new GridCore(new CanvasMeasurer(), {
  columnDefs,
  toolbar: {
    grouping: true,
    sorting: true,
    quickFilter: true,
    views: true,
    export: true,
  },
});
```

All five sections default to `false`. `toolbar.quickFilter` hosts the existing quick-filter UI in
the toolbar; the separate `quickFilter` option still configures matching, case sensitivity, and
debouncing, while floating-only placement and close behavior do not apply there. If `quickFilter`
is omitted, enabling the toolbar section uses its defaults. The React binding applies section
changes live without remounting the grid. A column panel configured with `trigger: "toolbar"` also
keeps the toolbar visible for its Columns button, independently of these section flags.

The toolbar observes its own rendered width. At narrower widths the quick filter contracts and the
Export and Columns controls become icon-only; at the narrowest width those secondary actions move
into a More menu. The behavior therefore follows the grid's container rather than the browser
window.

### Saved views

Enable `toolbar.views` and provide an application-owned list plus persistence callbacks:

```ts
const options = {
  toolbar: { views: true },
  savedViews: {
    views,
    activeViewId,
    onChange: nextViews => persist(nextViews),
    onActiveViewChange: id => setActiveViewId(id),
  },
};
```

Views capture column layout, row grouping, multi-sort, column filters, quick-filter text, and group
expansion. `api.captureViewState()` and `api.applyViewState(state)` expose the same serializable
state workflow programmatically. Applying a view restores columns exactly by default; pass
`{ columns: "merge" }` to retain columns added after capture.

## Column panel

Enable the built-in right-side column panel to let users search, show/hide individually or in bulk,
pin, and reorder columns. Bulk visibility applies to the current search results and skips
non-hideable columns. Changes apply immediately; Reset restores the layout captured from the latest
column definitions. The footer marks a changed layout as **Modified** and enables Reset only while
drawer-managed visibility, pinning, or order differs from that baseline.

```ts
const core = new GridCore(new CanvasMeasurer(), {
  columnDefs,
  columnPanel: {
    trigger: "toolbar",
    defaultOpen: false,
    width: 320,
  },
});
```

Pass `columnPanel: true` for the default right rail. Every trigger opens the same right-hand drawer:

| Trigger | Entry point |
| --- | --- |
| `"rail"` | Full-height collapsed rail on the right (default) |
| `"header"` | Empty full-height right gutter, with the toggle in its header corner |
| `"menu"` | **Manage columns…** in the column button and header context menus |
| `"footer"` | Empty full-height right gutter, with the toggle in its footer corner |
| `"toolbar"` | Grid toolbar above the header, button at the extreme right |

Reordering works by drag-and-drop and through accessible Move up/down controls. Trigger and width
changes are applied live by the React binding without remounting the grid. Set
`suppressColumnPanel: true` on a column definition to keep that column in the grid and API while
omitting it from the drawer and its bulk operations. A polite live region announces visibility,
pinning, ordering, and reset results to assistive technology. Nested column definitions render as
collapsible groups; searching a group name reveals its descendants, and reordering stays within the
appropriate sibling group. Columns conditionally shown by `columnGroupShow` reflect their effective
visibility as the header group expands or collapses; group-hidden columns are excluded from bulk
visibility and their individual checkbox explains which parent currently controls them.

## Sparklines

`SparklineRenderer` plots the array returned as the cell value. Keep data selection in the
column's `valueGetter` and presentation options in `cellRendererParams`:

```ts
import {
  SparklineRenderer,
  type SparklineTooltipValueFormatterParams,
} from "@agility-workbench/grid";

const trendColumn = {
  colId: "trend",
  label: "Trend",
  valueGetter: (row) =>
    row.data.monthlyRevenue.map((value, index) => [`Month ${index + 1}`, value]),
  cellRenderer: SparklineRenderer,
  cellRendererParams: {
    type: "line",
    showPoints: true,
    tooltipValueFormatter: ({ xValue, yValue }: SparklineTooltipValueFormatterParams) =>
      `${xValue}: ${yValue.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })}`,
  },
};
```

The renderer accepts `number[]` (array indexes become X values) and `[x, number][]` data, plus
`line`, `area`, and `bar` types. Tuple X values are treated as ordered categories. Set
`showPoints: true` to draw visible markers on line and area charts. Individual points use the
grid's tooltip layer; each line/area point owns a full-height nearest-X hover band, so the pointer
does not need to hit the marker exactly. Grid-level tooltip options such as delays, positioning,
and disabling tooltips continue to apply.

## Pinned and sticky rows

Application-owned rows can be frozen above or below the virtualized body. They use the normal
columns, value formatters, cell renderers, and row/cell styling, but stay outside sorting,
filtering, grouping, pagination, selection, and the displayed row count:

```ts
const core = new GridCore(new CanvasMeasurer(), {
  columnDefs,
  pinnedTopRowData: [{ label: "Target", amount: 1_000_000 }],
  pinnedBottomRowData: [{ label: "Total", amount: 842_000 }],
});
```

Replace either band live with `api.setPinnedTopRowData(rows)` /
`api.setPinnedBottomRowData(rows)`.

Generated group nodes can move into either band without leaving a second body copy. They remain in
the row model, so their chevrons, hierarchy position, and aggregate values stay connected:

```ts
const options = {
  groupRowsSticky: true,
  isRowPinned: ({ node }) =>
    node.isGroup && node.groupKey === "EMEA" ? "bottom" : null,
};

api.setRowPinned(groupNode.id, "top");
api.setRowPinned(groupNode.id, null); // unpin
```

`groupRowsSticky` stacks the expanded ancestors of the first visible row at the top as the body
scrolls, with `position: sticky` semantics: the original rows never leave the body flow, ancestors
are mirrored into an overlay clipped to the top of the body, and an arriving sibling header pushes
the outgoing one up behind its parent instead of swapping in place. Because the overlay is
absolutely positioned, sticky transitions never resize or shift the body. The chain docks at rest
(scrollTop 0) directly over its pixel-identical rows, so the band never has to "appear" mid-scroll
even when the compositor presents scrolled frames ahead of the main thread; wheel gestures over
the band are forwarded to the grid scroller. It supports
`singleColumn`, `multipleColumns`, and full-width `groupRows` display. Application-pinned rows use
separate top/bottom bands outside the body; each band caps at 30% of the grid height and gets an
independent vertical scrollbar when its content exceeds that space, while the central body keeps
its own scrollbar. Pinned cells retain section-local row and global column coordinates, so arrows
navigate top → body → bottom exactly as horizontal navigation crosses left → center → right column
sections. The body always scrolls to its content edge first: only a plain arrow step from the
first/last body row hands the active cell over to a band, and Ctrl/Home/End/Page jumps are
region-locked. Range selection spans the bands: a range is one contiguous span of the unified
`pinned top → body → pinned bottom` row sequence (built by drag or Shift+Arrow across the edges),
each segment paints its own selection rectangle, and copy serializes the segments in that order.
Ctrl+A selects the entire sequence, bands included. Exports mirror the same order: pinned data
rows frame the body in CSV and Excel output (full exports and selection exports alike, honoring a
range's pinned segments), and the Excel export freezes the header together with the pinned top
rows so they stay pinned in the workbook; the aggregate footer keeps aggregating body rows only.
Cut, clear, and paste apply to the body segment only. Pinned rows are read-only by default; `pinnedRowsEditable: true` enables inline
editing of application-pinned data rows (writing into the provided data objects, with undo/redo)
and pinned tree-data parents — synthetic group headers are never editable. Scrolling a focused row
into view accounts for the sticky ancestor overlay, so the row lands below the docked chain rather
than hidden underneath it.

## Tree data

Client-side tree data supports three explicit relationship modes. All modes share expansion,
sibling sorting, ancestor-preserving filtering, selection, editing, saved-view expansion, sticky
ancestors, and export behavior. Tree data cannot be combined with column-value row grouping.

Use complete paths when rows arrive as a flat hierarchy. Missing prefixes become deterministic
synthetic ancestors:

```ts
const options = {
  rowIdKey: "id",
  treeData: {
    mode: "path",
    getPath: row => row.path, // ["World", "Europe", "France", "Paris"]
  },
};
```

Use parent references for database-shaped flat records. Input order is irrelevant; `null` or
`undefined` creates a root:

```ts
const options = {
  rowIdKey: "id",
  treeData: {
    mode: "parent",
    getParentId: row => row.parentId,
    getLabel: row => row.name,
    columnDef: {
      label: "Organization",
      width: 280,
    },
  },
};
```

Use nested children when `rowData` already contains root objects with nested arrays:

```ts
const options = {
  rowIdKey: "id",
  treeData: {
    mode: "children",
    getChildren: row => row.children,
    getLabel: row => row.name,
  },
};
```

Real rows remain data-bearing and editable even when they own children. Duplicate ids, duplicate
paths, and relationship cycles throw descriptive errors. A missing parent-id reference is rendered
as a root with a console diagnostic. In nested-children mode, transaction additions may add root
subtrees and removing a parent removes its subtree; use `setRowData` when changing the parent of an
existing nested row. Tree data uses one generated hierarchy column whose normal column definition
can be supplied through `treeData.columnDef`. It is unpinned by default and participates in ordinary
column movement, sorting, filtering, visibility, pinning, menus, and export. `groupDisplayType`
continues to apply only to column-value row grouping.

Tree data has two keyboard-navigation modes:

```ts
treeData: {
  mode: "parent",
  getParentId: row => row.parentId,
  keyboardNavigationMode: "hierarchy",
  enableKeyboardNavigationModeSwitch: true,
}
```

`"grid"` (the default) preserves the normal Ctrl/Cmd+Arrow data-block jumps. In `"hierarchy"`
mode, Ctrl/Cmd+Right expands, Ctrl/Cmd+Left collapses an expanded parent (or focuses the direct
parent from a leaf/already-collapsed parent), and Ctrl/Cmd+Up always focuses the direct parent when
the hierarchy column is active. Ctrl/Cmd+Shift+Arrow retains grid range/block navigation.
When enabled, the fixed Ctrl/Cmd+Shift+Space shortcut switches modes at runtime; applications can
also call `api.getKeyboardNavigationMode()` and `api.setKeyboardNavigationMode(mode)`.

### Planned keyboard-shortcut discovery

A future grid-owned shortcut reference must show the shortcuts that are valid for the current
context rather than a static global list. It should account for the active keyboard-navigation
mode, focused area/cell, hierarchy availability, selection and editing state, enabled features, and
platform-specific Ctrl/Cmd labels. It must be reachable from within the grid by keyboard and
pointer, expose the active navigation mode, and update immediately when runtime options or focus
change.

## Styling

The grid needs its stylesheet loaded once. Two options:

**1. Import the stylesheet** (recommended — cacheable, no runtime cost):

```ts
import "@agility-workbench/grid/styles.css";
```

**2. Inject it from JS** (zero-import, e.g. for environments where importing CSS is awkward):

```ts
import { injectGridStyles } from "@agility-workbench/grid";
injectGridStyles(); // no-op during SSR; deduped across calls
```

## Theming

Themes are immutable objects that resolve to CSS custom properties applied inline on each
grid instance — so two grids on the same page can look completely different, and there is no
global CSS to override.

Start from a preset and refine with `withParams`:

```ts
import { themeLight, themeDark } from "@agility-workbench/grid";

const myTheme = themeLight.withParams({
  accentColor: "#2563eb",       // fans out to selection, checkbox, spinner, filter-active…
  backgroundColor: "#ffffff",
  rowHeight: 44,
  spacing: 10,
  fontFamily: "Inter, sans-serif",
});
```

### Semantic params + escape hatch

High-level params (`accentColor`, `borderColor`, `spacing`, `rowHeight`, …) each fan out to
several low-level variables. For anything not covered, set any grid CSS variable directly via
`vars` — these are typed and autocompleted:

```ts
themeDark.withParams({
  accentColor: "#22d3ee",
  vars: {
    "--pte-scrollbar-thumb-color": "#475569",
    "--pte-selected-bg-color": "#0e7490",
  },
});
```

### Icons

Override any icon with a URL, data URI, or inline SVG string, via `options.icons` or the
theme's `icons`:

```ts
new GridCore(new CanvasMeasurer(), {
  columnDefs,
  icons: { filter: "<svg viewBox='0 0 24 24'>…</svg>" },
});
```

## Entry points

| Import | Contents |
| --- | --- |
| `@agility-workbench/grid` | Framework-agnostic core, public enums, event payload types, theming API |
| `@agility-workbench/grid/styles.css` | The base stylesheet (icons inlined) |

Public enums and event payload types are available from the package entry point:

```ts
import {
  AggregateType,
  ColumnType,
  FilterType,
  type GridEventEditingChangedParams,
} from "@agility-workbench/grid";
```

## License

[MIT](./LICENSE)
