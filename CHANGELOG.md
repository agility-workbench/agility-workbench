# Changelog

All three packages (`@agility-workbench/grid`, `@agility-workbench/react-grid`,
`@agility-workbench/angular-grid`) are versioned and released together.

## 1.1.0 — 2026-09-02

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
  panel as the pivot customizer while pivoted: removable role chips, a role-editor
  menu, and ordered Row groups / Column labels / Values field wells.
- **Column drag of generated columns** — two modes via `pivotColumnMoveMode`
  (runtime-updatable): `"measures"` (default) reorders the value measures consistently
  across every group; `"free"` arranges leaves and whole generated groups, and the
  arrangement survives data-driven rediscovery and pivot off/on.
- **Pivot mode is a state layer** — turning it off restores the exact pre-pivot
  grouping/aggregates; turning it back on reinstates the last pivot session.
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
