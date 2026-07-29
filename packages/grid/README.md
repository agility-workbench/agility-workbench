# @agility-workbench/grid

A high-performance, framework-agnostic TypeScript data grid for building modern data
workspaces.

- **Framework-agnostic core** — the grid engine (`GridCore` + `GridRenderer`) is plain
  TypeScript with no framework dependency.
- **React binding** — using React? Install [`@agility-workbench/react-grid`](https://www.npmjs.com/package/@agility-workbench/react-grid),
  a thin `<Grid />` adapter built on this core.
- **Virtualized** rendering, client-side and server-side row models, row grouping,
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
    export: true,
  },
});
```

All four sections default to `false`. `toolbar.quickFilter` hosts the existing quick-filter UI in
the toolbar; the separate `quickFilter` option still configures matching, case sensitivity, and
debouncing, while floating-only placement and close behavior do not apply there. If `quickFilter`
is omitted, enabling the toolbar section uses its defaults. The React binding applies section
changes live without remounting the grid. A column panel configured with `trigger: "toolbar"` also
keeps the toolbar visible for its Columns button, independently of these section flags.

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
