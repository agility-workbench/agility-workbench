# Changelog

All three packages (`@agility-workbench/grid`, `@agility-workbench/react-grid`,
`@agility-workbench/angular-grid`) are versioned and released together.

## 1.1.1 — 2026-09-05

Patch release. No API changes; a CSS-only fix in the core, with the two bindings
republished in lockstep as the release process requires.

### Fixes

- The column header, the aggregate row and the section spacers no longer show
  scrollbars of their own. These scrollers mirror the body's `scrollLeft` and are meant
  to be invisible, but they were hidden with `scrollbar-width: none` alone — a property
  Safari only shipped in 18.2 and Android WebView has never shipped at any version. On
  those engines the grid's legacy `::-webkit-scrollbar` rules painted each mirror a full
  themed bar, so the header carried its own horizontal and vertical scrollbars over the
  body's. Reported on Safari and on DuckDuckGo for Android. Each mirror now also hides
  the legacy way, outside the `scrollbar-color` `@supports` guard — Safari shipped
  `scrollbar-color` four majors after `scrollbar-width` (26.2 vs 18.2), so that guard
  cannot answer for hiding.
- The header sections pin `overflow-y: hidden` rather than letting it compute from
  `visible`, which the horizontal `auto` was promoting to `auto` — the source of the
  vertical scrollbar on a row that never scrolls vertically. Matches what the spacer and
  aggregate sections already did.

## 1.1.0 — 2026-09-04

Client-side pivot mode and spreadsheet-style sheets. No breaking API changes; view
states saved by 1.0.0 apply unchanged.

### Pivot (client-side row model)

- **Pivot mode** — a display transformation over the grouped row model: row groups ×
  pivot columns × value aggregates, with the header *generated* from data (one nested
  column group per distinct pivot value, one sortable read-only leaf per aggregate).
  New options `pivotMode`, `pivotColumns`, `pivotResultColumnDef`, `maxPivotColumns`,
  `pivotNoValuesMessage`, and per-column `pivotable` / `pivotComparator`.
- **Programmatic API** — `setPivotMode` / `setPivotColumns` / `getPivotResultColumns` /
  `setPivotColumnOrder`, plus colId-addressed role APIs usable outside pivot too:
  `setRowGroupColumns` / `getRowGroupColumns` and `setAggregates` / `getAggregates`
  (new `ColumnAggregate` type). New events `pivotChanged` and `pivotColumnLimitReached`
  (latched: reports the start, the change, and the end of truncation via `limited`).
- **Pivot UI** — column-menu pivot items, a toolbar `pivot` section, and the column
  panel as the pivot setup: while pivoted it shows exactly three ordered field wells —
  Row groups / Column labels / Values — with per-well drag reorder, and clicking a
  Values entry picks that measure's aggregate function in place. Outside pivot mode,
  panel rows wear removable role chips that read the recipe back.
- **Column drag of generated columns** — two modes via `pivotColumnMoveMode`
  (runtime-updatable): `"measures"` (default) reorders the value measures consistently
  across every group; `"free"` arranges leaves and whole generated groups, and the
  arrangement survives data-driven rediscovery and pivot off/on.
- **Pivot mode is a state layer** — turning it off restores the exact pre-pivot
  grouping/aggregates; turning it back on reinstates the last pivot session.
- **Blank pivot canvas** — pivot mode with no row group, no pivot column and no value
  displays nothing at all (previously a lone auto-group column over a "Total" row that
  could not be acted on), showing the new `pivotEmptyMessage` instead; new
  `isPivotUnconfigured()` reports the state.
- **Pivot-scoped column panel** — entering pivot mode with nothing configured opens the
  column panel, and the new `columnPanel.availability: "pivot"` mounts that panel only
  while pivoted: the pivot customizer without the column management drawer.
- **Pivot export** — CSV and Excel export the generated nested headers with all group
  rows; aggregate cells export as real numbers.
- Filters and the quick filter keep running on **source rows**; cell edits re-derive
  the pivot live. Client-side row model only (server-side pivot is planned); the mode
  refuses unsupported models rather than failing.

### Sheets

- **Sheet tabs** — the new `sheets` option (`GridSheet` + `SheetsOptions`, mirroring
  `savedViews`) renders a spreadsheet-style tab strip in the footer, now laid out in
  three zones (tabs · aggregation · pagination). One grid, one row model; each sheet is
  a live view state, switched via capture/apply. **+** adds a pivot sheet; rename
  inline (double-click / F2), duplicate, delete, Ctrl+PageDown/PageUp, full ARIA
  tablist semantics.
- **Tab colors** — `GridSheet.color` plus a "Change color" tab menu: built-in palette,
  replaceable per sheet through `SheetsOptions.colors`, with an optional platform
  color picker via `SheetsOptions.customColor`. Colors render as a tint, so any CSS
  color stays legible in both themes.
- `GridViewState` gained optional pivot/aggregate/pivot-layer fields (still
  `version: 1` — absent fields mean "untouched", so old captures round-trip).

### Aggregates

- Column-menu aggregate items are now **per-type toggles**: on the client-side row
  model a column can carry several aggregates at once (distinct pivot measures). Other
  row models keep single-choice semantics, and the server-side request serializes one
  aggregate per column.
- Behavior note: when duplicate aggregates target one column, the footer aggregate row
  resolves **last-wins** (previously first-won via dedup).

### Responsive toolbar and footer

- **Neither bar overlaps its own controls at a narrow width any more.** Space in the toolbar
  and the footer used to be handed out by flex/grid *shrink*, which has no floor: a control
  squeezed past its min-content width did not compress, it overflowed its box and painted over
  its neighbour. Grouping chips lost their labels entirely by 900px; by 480px `Sort by` printed
  on top of its own clear button; the footer's page controls printed over the aggregation ones.

  Both bars now share one rule — nothing is clipped, overlapped, or compressed. Every control
  is laid out at its natural size in one of its presentation stages, or it moves into that
  bar's overflow menu (`⋮`), and a bar out of stages scrolls rather than clipping. New:
  `+N` chip folds, `Grouped by 3` / `Sort by 2` summary buttons opening the full chip editor
  as a popover (and still taking column drops), one overflow menu per bar with a dot when the
  state it hides is active, and a footer `⋮` holding rows-per-page, the aggregate scope, and
  the sheet strip's `+`. A control keeps its place while it holds focus or carries a live
  query, and focus follows a displaced control to the button that now holds it.
- `toolbar.responsive` and `paginationControls.responsive` (`"collapse"` by default,
  `"scroll"`, or `false`) choose how a bar copes with a width its controls do not fit. The
  toolbar's old fixed 760px/520px breakpoints are gone — a bar now measures what it actually
  holds, so a toolbar with two controls no longer goes icon-only at 759px.
- The quick filter's search-options button no longer wears the same `⋮` glyph as the bars'
  overflow menus, which read as one control duplicated when both were on screen.
- **A settled bar no longer sits with a hole in it.** The rung a bar stops on usually frees
  more room than it needed, and that leftover collected as blank space between the controls
  and the overflow area — visible at every width, and sitting there while the controls beside
  it were collapsed. One control now takes it: the search field stretches into it (to a cap),
  or with no quick filter the last chip section widens its drop zone. Growth cannot hide a
  bar's overflow from its own measurement the way shrink would, so the ladder stays honest.
- The toolbar now narrows the search field **before** folding a chip into `+N`: at 900px a
  single sorted column no longer collapses to `+1` while the bar still has room to spare.
- A bar no longer ends a fit pass overflowing by the width of the overflow button it just
  revealed. The `⋮` is shown only while it holds something, so it entered the layout after the
  pass had decided — leaving the toolbar 13px over its box at 480px with no scroll fallback.
- The footer's overflow menu opens **above** the footer instead of across it: menus anchored
  `top-*` were placed with their top edge at the anchor, because the height they are offset by
  was read from an overlay that was still `display: none`. The aggregate footer cell's function
  menu was misplaced the same way.
- Sheet tabs now scroll with a plain mouse wheel. The strip showed its overflow fades while the
  tabs behind them stayed unreachable: a wheel only reports `deltaY`, which the browser sends to
  the nearest *vertical* scroller.
- The narrow footer keeps its trailing padding once it scrolls, so the last page button no longer
  sits flush against the grid's edge, and the compact page picker sizes to its own longest option
  instead of a floor set for four-digit page counts.
- At its narrowest stage the search icon's expanded field renders in the bar again, and stays open
  while it is in use: it was laid out at its content width and hung off the side of the grid, and
  every fit pass — including the one focus itself provokes — closed it.

### Fixes

- Copying group rows now writes the group label and its aggregate values instead of
  blank cells, and the label matches the screen: custom tree labels copy as shown, and
  an unknown child count no longer copies or exports as `(0)`.
- A sort on the auto-group column now survives view save/restore and sheet switches,
  and retires with the column instead of lingering in the sort model.
- React: `onGridReady` now fires after the `columnDefs` / `rowData` effects, so
  colId-addressed calls in a ready handler are no longer dropped.

Both wrappers expose everything above — pivot props/inputs are live-synced, and
`sheets` passes through — with smoke tests on each binding.

## 1.0.0 — 2026-08-24

First stable release.

- **`@agility-workbench/grid`** — framework-agnostic TypeScript data grid: virtualized
  rendering with pinned column sections, client-side and lazy server-side row models,
  sorting, filtering (column, set, and quick filter), grouping with aggregation, tree
  data, cell/row/column/range selection, editing with undo/redo and async transactions,
  pinned and sticky rows, saved views, toolbars and column management, menus, tooltips,
  ActionFrames, themes (light/dark presets + builder), CSV/Excel export, and a
  keyboard-navigation and accessibility model. Zero runtime dependencies.
- **`@agility-workbench/react-grid`** — React binding (`<Grid />`): declarative props,
  callback events, refs to the imperative API, StrictMode-safe lifecycle, and React
  components in renderer/editor/tooltip/ActionFrame/menu slots. React 18 and 19.
- **`@agility-workbench/angular-grid`** — standalone Angular binding (`<awb-grid>`):
  signal inputs, outputs for common events, `exportAs` API access, zone-isolated core
  (zone-based and zoneless apps), and Angular components in the same extension slots.
  Angular 20.3 through 22, partial-Ivy APF artifact.

Every release artifact is validated by CI: declaration/runtime export parity (ESM +
CJS), exact packed-content allowlists, and standalone consumer builds that install the
packed tarballs on React 18/19 and Angular 20/21/22.
