# @agility-workbench/grid

A high-performance, framework-agnostic TypeScript data grid for building modern data
workspaces.

- **Framework-agnostic core** — the grid engine (`GridCore` + `GridRenderer`) is plain
  TypeScript with no framework dependency.
- **React binding** — using React? Install [`@agility-workbench/react-grid`](https://www.npmjs.com/package/@agility-workbench/react-grid),
  a thin `<Grid />` adapter built on this core.
- **Angular binding** — using Angular 20.3+? Install [`@agility-workbench/angular-grid`](https://www.npmjs.com/package/@agility-workbench/angular-grid),
  which provides the standalone `<awb-grid>` component on top of this core.
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

For Angular 20.3+ apps, install the Angular binding instead (it also depends on
this package):

```bash
npm install @agility-workbench/angular-grid
```

## Quick start (core, no framework)

`createGrid` mounts a grid into an element and hands back its API. It owns the whole
assembly — text measurer, core, renderer, menus, and startup — so there is nothing else to
wire:

```ts
import { ColumnType, createGrid } from "@agility-workbench/grid";

const api = createGrid(document.getElementById("app")!, {
  rowIdKey: "id",
  columnDefs: [
    { key: "name", label: "Name", type: ColumnType.STRING },
    { key: "price", label: "Price", type: ColumnType.NUMBER },
  ],
  rowData: [{ id: 1, name: "Widget", price: 9.99 }],
});

// Later, when the host view goes away:
api.destroy();
```

The container must have an explicit height. Beyond `columnDefs` and `rowData`, the second
argument accepts every [`GridOptions`](#entry-points) field, and everything after creation
happens through the returned `api`.

## Customizing menus

Menu items are configuration, not plumbing — you do not need adapters or a manual lifecycle for
them.

**Column menu** — set `columnMenu` on a column, or on `defaultColDef` to cover every column. It
receives the items the grid built and returns the items to show, so you can extend, reorder,
filter, or replace them. Setting it to `false` removes the column's menu entirely: no ⋮ button and
no header right-click.

```ts
createGrid(host, {
  columnDefs: [
    {
      key: "price",
      label: "Price",
      columnMenu: ({ column, items }) => [
        ...items,
        { isSeparator: true },
        { label: "Audit", left: "my-icon-class", onClick: () => audit(column.colId) },
      ],
    },
    { key: "actions", label: "", columnMenu: false },
  ],
  // Every other column gets this one:
  defaultColDef: { columnMenu: ({ items }) => items.filter(i => i.command !== "column.hideMany") },
});
```

Items are plain objects: `label`, `left` (an icon CSS class or an element), `right`, `onClick`,
`subMenu`, `isSeparator`, `isLabel`, `disabled`, `title`. An `onClick` you supply takes precedence
over the built-in command an item would otherwise run, and returning an empty array opens no menu.

`isLabel` marks an item as static text rather than a command — a caption for the items around it.
It can appear anywhere in a menu (or a `subMenu`), as often as you like. It is not focusable and
not clickable, so keyboard navigation skips it and `onClick`/`command` are ignored; only `label`,
`left`, `right`, and `id` mean anything:

```ts
columnMenu: ({ items }) => [
  ...items,
  { isSeparator: true },
  { isLabel: true, label: "Danger zone" },
  { label: "Reset column", onClick: resetColumn },
]
```

The getter runs only when the menu targets that column alone. When several columns are selected
the built-in items act on the whole set, so no single column's configuration governs them — the
grid-level `multiColumnMenu` handles that case instead:

```ts
createGrid(host, {
  columnDefs,
  multiColumnMenu: ({ columns, items }) => [
    ...items,
    { label: `Export ${columns.length} columns`, onClick: () => exportCols(columns.map(c => c.colId)) },
  ],
});
```

Return `[]` for no menu.

A multi-column menu opens with a caption naming its scope — the column names while the list is
short, a count beyond that — so it can never be mistaken for a menu about the header it is anchored
to. The caption is an `isLabel` item with the id `selectionScope`, so a getter can relabel or drop
it like any other item:

```ts
multiColumnMenu: ({ columns, items }) =>
  items.map(i => (i.id === "selectionScope" ? { ...i, label: `Editing ${columns.length} fields` } : i)),
```

**Which menu you get.** Both entry points — the ⋮ button and a header right-click — settle on the
same scope: the menu acts on the current column selection when the column you clicked is part of
it, and on that column alone otherwise. Opening a menu from outside your selection therefore
replaces the selection rather than silently acting on columns you did not click. A group header's
menu always covers its leaves, by either gesture.

`multiColumnMenu: false` disables multi-column menus outright. Note what `false` cannot do here,
unlike `columnMenu: false`: whether a menu is multi-column is only known once it is opening, after
the grid has claimed the gesture — so opening one from inside a multi-selection shows no menu at
all rather than the browser's.

**Body context menu** — `bodyContextMenu` does the same for right-clicks in the grid body, and
takes `false` to let the browser's native menu through:

```ts
createGrid(host, {
  columnDefs,
  bodyContextMenu: ({ ctx, items }) => [...items, { label: "Copy report link", onClick: () => share(ctx) }],
});
```

<details>
<summary>Menu adapters (framework-rendered menu items)</summary>

The adapters below exist for one thing the getters above cannot do: mounting framework components
inside menu items and unmounting them when the menu closes (`cleanup`). That is how the React and
Angular bindings work; a plain host rarely needs it.

```ts
import { createGrid, type IMenuAdapter } from "@agility-workbench/grid";

const menus: IMenuAdapter = {
  resolveMenuItems: (ctx, defaults) => {
    // An item whose icon is a live component: mount it now, unmount it in cleanup.
    const badge = mountBadge(ctx.targetColId);
    return {
      items: [...defaults, { label: "Sync status", left: badge.el }],
      cleanup: () => badge.unmount(),
    };
  },
};

const api = createGrid(document.getElementById("app")!, {
  rowIdKey: "id",
  columnDefs: [{ key: "name", label: "Name", type: ColumnType.STRING }],
  rowData: [{ id: 1, name: "Widget" }],
  menuAdapter: menus,
  // bodyMenuAdapter: … the same for the body context menu
});
```

Both options are optional; omitting them yields the built-in menus. An adapter runs after the
getters above and receives their result as its `defaults`. When the adapter is not known at
creation time, `api.registerMenuAdapter(menus)` / `api.registerBodyMenuAdapter(menus)` install one
on a mounted grid (pass `null` to remove it); the change applies to the next menu open.

</details>

## Toolbar

Toolbar sections are individually opt-in. There is no separate visibility flag: the toolbar appears
when at least one section is enabled, and disappears when none are enabled.

```ts
const core = new GridCore(new CanvasMeasurer(), {
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

Column-value row grouping has the same escape hatch: the auto-generated group column shown in
`groupDisplayType: "singleColumn"` is an ordinary column — unpinned, movable, resizable, and
sortable by default — and `groupColumnDef` layers a normal column definition (label, width,
`pinned`, `movable`, `resizable`, `sortable`, …) over those defaults. Sorting it orders the group
buckets at every grouping level. Its identity and grouping-machinery fields (`colId`, `key`,
`children`, `groupable`, `aggregatable`, `filter`) are grid-owned and cannot be overridden.

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
When enabled, the fixed Ctrl/Cmd+Shift+Space shortcut switches modes at runtime **while the cursor
is on a body cell** — the header cursor claims that chord for "add this column to the selection", and
the innermost cursor wins. Applications can also call `api.getKeyboardNavigationMode()` and
`api.setKeyboardNavigationMode(mode)`, which work wherever the cursor is.

Both fields are reconfigurable on a mounted grid — they are the only part of `treeData` that is,
since the relationship mode and its accessors decide the row shape:

```ts
api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: true });
```

Only the fields you pass change. A mode set this way reports `source: "options"` on
`keyboardNavigationModeChanged`, distinguishing configuration from the imperative
`setKeyboardNavigationMode` (`"api"`) and the shortcut itself (`"shortcut"`).

## Keyboard bindings

Bindings live in a table rather than in nested `if`s, resolved by *scope*: an open cell editor and a
focused embedded control own their keyboard completely; otherwise the header cursor is consulted
before the body cursor, and whole-grid chords last. A chord may therefore mean different things
depending on where the cursor is, and modifiers are matched exactly — `Ctrl+C` is copy, while
`Ctrl+Shift+C` is left to the browser.

The header cursor (the header is row 0 of the grid — `ArrowUp` off the first row reaches it):

| Key | Action |
| --- | --- |
| `Arrow←` / `Arrow→` | previous / next column |
| `Ctrl/Cmd+Arrow←` / `Ctrl/Cmd+Arrow→`, `Home` / `End` | first / last column |
| `Arrow↓` | hand the cursor to the first row |
| `Ctrl/Cmd+Arrow↓` | hand the cursor to the last row |
| `Enter` / `Space` | sort, or toggle a group expander / select-all header |
| `Ctrl/Cmd+Space` | select the column (`+Shift` adds it to the selection) |
| `Alt+Arrow↓` / `Shift+Alt+Arrow↓` | open the column menu / the column filter |

The body cursor keeps the spreadsheet conventions: arrows move, `Ctrl/Cmd+Arrow` jumps a block,
`Shift` extends a range, `Home`/`End` reach the row edge (`+Ctrl/Cmd` a grid corner), `PageUp`/
`PageDown` move a viewport, `F2`/`Enter` edit, `Shift+F2` opens the cell's action frame, printable
characters start an edit, and `Ctrl/Cmd`+`A`/`C`/`X`/`V`/`Z`/`Y` do what they do everywhere.
`Alt+Arrow` is deliberately *not* claimed, so the browser keeps its back/forward gesture.

### Planned keyboard-shortcut discovery

A future grid-owned shortcut reference must show the shortcuts that are valid for the current
context rather than a static global list. It should account for the active keyboard-navigation
mode, focused area/cell, hierarchy availability, selection and editing state, enabled features, and
platform-specific Ctrl/Cmd labels. It must be reachable from within the grid by keyboard and
pointer, expose the active navigation mode, and update immediately when runtime options or focus
change. The binding table above is what makes that buildable: it already carries a `label` per
binding, so the panel can be a filtered view of it rather than a hand-maintained list.

## Styling

Nothing to do — the grid delivers its own stylesheet when it attaches, once per
document, and once per shadow root for grids inside one. There is no CSS import
to remember and no unstyled-grid failure mode.

Two cases need a little more:

**Strict Content Security Policy.** Injection into a document uses a `<style>`
element, which needs `style-src 'unsafe-inline'` or a nonce. If your CSP has
neither, pass one:

```ts
{ styleNonce: "per-request-random-value" }
```

Nonces are page-global, so give every grid on the page the same value. Grids
inside a shadow root need no nonce — those are styled via CSSOM, which CSP's
`style-src` does not cover.

**Loading the stylesheet yourself.** Opt out and import it instead:

```ts
import "@agility-workbench/grid/styles.css";
// and on every grid:
{ suppressStyleInjection: true }
```

Opting out matters if you do this: without it both copies apply, and the
injected one sorts later in the cascade, so it would start winning over
overrides you wrote against the imported sheet. This path also suits build-time
CSS tooling such as critical-CSS extraction, which cannot see injected styles.

`injectGridStyles(target?, { nonce })` remains exported if you want to place the
stylesheet yourself, ahead of the first grid mounting. It is idempotent and a
no-op during SSR.

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
  icons: { filter: "<svg viewBox='0 0 24 24'>…</svg>" },
});
```

## Entry points

| Import | Contents |
| --- | --- |
| `@agility-workbench/grid` | Framework-agnostic core, public enums, event payload types, theming API |
| `@agility-workbench/grid/styles.css` | The base stylesheet (icons inlined). Optional — the grid injects it automatically; see [Styling](#styling) |

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
