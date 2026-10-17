# Changelog

All three packages (`@agility-workbench/grid`, `@agility-workbench/react-grid`,
`@agility-workbench/angular-grid`) are versioned and released together.

## Unreleased

### Features

- **Wide grids render only the columns on screen.** The centre section of the body now creates
  cells only for the columns in and near its horizontal viewport, plus `overscanColumnCount`
  columns on each side (default 2), instead of a cell for every column in every row. A spacer
  stands in for the columns before them, cells that stay are never re-rendered, and an open editor
  keeps its column rendered while the grid scrolls away from it. Pinned and leading columns, the
  header, the aggregate row and the pinned and sticky rows stay fully rendered, and every column
  is rendered while a centre column defines `colSpan` or the grid has no measured width.
  `columnVirtualization: false` turns it off; both options are creation-only. Code that counted
  one `.pte-cell` per column in a body row must now look cells up by `data-col-id`.
- **The grid lays out right-to-left with `enableRtl`, or by following an RTL page.**
  `enableRtl: true` writes `dir="rtl"` on the grid root, `false` forces left-to-right inside an
  RTL page, and leaving it unset follows the direction the root inherits when it is attached; the
  root always carries the resolved `dir`, and the direction is fixed at creation. `pinned: "left"`
  is the inline start, so pinned-left columns, row numbers and checkboxes sit at the right edge, the
  vertical scrollbar lane moves to the left, and horizontal scrolling starts from the right.
  ArrowLeft and ArrowRight move visually in the body, the header, the set-filter tree and the sheet
  tabs, with their Shift and Ctrl variants; Home, End and Tab stay logical. Menus open submenus
  towards the inline end with ArrowLeft. Column resize and drag, toolbar chip drops, the fill
  handle, tooltips, menus and the quick-filter widget work from the inline start, directional icons
  are mirrored, and popups portaled out of the root carry its direction. The stylesheet now uses
  logical properties throughout. `bodyScroll`'s `scrollLeftPx` and `api.scrollTo({ leftPx })` are
  measured from the start edge and never negative, and the quick filter's `anchor` names the
  inline start and end. Sparklines, charts and exported files are not mirrored.

### Tooling

- **`npm run probe:interactions` drives real grids with trusted mouse, wheel, keyboard and touch
  input, in both directions.** It shares the layout probe's headless Chrome, Vite server and
  harness, sends input through the DevTools protocol, and asserts each interaction's outcome plus
  the layout invariants after every step: wheel scrolling across about 200 virtualized columns
  (cells cover the visible centre, gap spacers match the unrendered columns, cells per row stay
  bounded), arrow-key navigation keeping the active cell rendered and visible, an editor that
  survives its column scrolling away, resize and column-move drags, range selection with the fill
  handle and Ctrl+D, body and column menus with keyboard submenus, pinned-row bands and sticky rows
  under horizontal scroll, and touch tap, long press and pan. Scenarios run in LTR and RTL where
  the direction matters, and scroll and mount timings are reported with virtualization on and off
  without being asserted. A new `Browser probes` CI job runs it and the layout probe against the
  runner's Chrome and uploads the JSON reports and failure screenshots when one fails.
## 1.13.0 — 2026-10-16

### Features

- **Every string the grid writes on its own can be translated, through a typed `localeText` map
  or a `getLocaleText` callback.** About 410 keys cover visible text, aria-labels, tooltips,
  placeholders, menus, filter operators, screen-reader announcements, shortcut labels and default
  column headers. Variables are `{name}` placeholders and counts use `…One` / `…Other` key pairs;
  the callback handles ICU messages, richer plural rules or a translation library, and wins over
  the map. `api.getLocaleText(key, values)` lets custom components reuse the grid's strings and
  `DEFAULT_LOCALE_TEXT` exports the English defaults, which are unchanged. Both options are
  creation-only, and `loadingMessage` / `noRowsMessage` and the other message options still win
  over their keys.
- **The overlays have typed API methods: `api.showLoadingOverlay()`, `api.showNoRowsOverlay()` and
  `api.hideOverlay()`.** They replace `dispatch({ type: "overlayShow" })`. `showNoRowsOverlay()`
  now really shows the empty state over existing rows until the next data change; before, the
  `"noRows"` action only recomputed the state. `hideOverlay()` keeps the empty overlay on a grid
  that has no rows.
- **Header labels can wrap, and the header can grow to fit them: `wrapHeaderText` and
  `autoHeaderHeight`.** `wrapHeaderText` breaks a long label onto several lines instead of cutting
  it off, with the sort icon, menu button and expander kept beside it. `autoHeaderHeight` grows the
  level that label sits on to the tallest such label, never below `headerHeight`,
  `leafHeaderHeight` or `parentHeaderHeight`; leaf and group levels grow independently and the
  pinned sections together. The header re-measures when widths settle, columns are shown, hidden,
  moved or pinned, labels or header heights change, the theme swaps or a web font loads. Both work
  in `defaultColDef`.
- **`lockPosition` keeps a column at the edge of its section.** `true` or `"left"` holds it at the
  left, `"right"` at the right. A locked column cannot be dragged, moved from the column panel or
  moved with `api.moveColumn`, columns dropped next to it never displace it, and
  `applyColumnState`, saved views and `setColumnDefs` put it back at its edge. Pinning still works:
  a locked column pinned left leads the left section. On a group child it locks within the group;
  on a group it locks the whole group.
- **Every grid event now has an `on*` option, a React prop and an Angular output.** Sixteen events
  that were reachable only through `api.on` — `columnWidthsChanged`, `editingChanged`,
  `focusChanged`, `headerFocusChanged`, `rowsChanged`, `cellsChanged`, `modelUpdated`,
  `viewportChanged`, `aggregateChanged`, `pivotChanged`, `pivotColumnLimitReached`, `overlayShow`,
  `tooltipShow`, `tooltipHide`, `actionFrameChanged` and `keyboardNavigationModeChanged` — gain a
  `GridOptions` callback (`onFocusChanged`, …), a `<Grid>` prop that stays live across re-renders
  and an `<awb-grid>` output of the event's name. The new outputs enter Angular's zone only while
  something is bound to them, so an unused high-frequency output costs no change detection.
- **New events: `rowGroupOpened`, `columnGroupOpened`, `firstDataRendered`, `rowDataUpdated` and
  `bodyScroll`.** `rowGroupOpened` fires once per chevron click, keyboard command or API call with
  only the groups whose state changed and a `"user"` / `"api"` source; `columnGroupOpened` does the
  same for column groups, once per direction. `firstDataRendered` fires once per grid after the
  first paint that shows a row. `rowDataUpdated` reports `setRowData`, transactions and server-side
  block loads through its `reason`. `bodyScroll` reports every body scroll tick with both offsets
  and which one moved. Each has an `on*` option, a React prop and an Angular output.
- **Read the grid back through typed methods: `getColumnDefs`, `getColumn` / `getColumns`,
  `getGridOption`, `getFocusedCell` and `isDestroyed`.** `getColumnDefs()` returns the definitions
  with the current widths, pinning, visibility, sort, aggregates and group state written in, so
  `setColumnDefs(getColumnDefs())` changes nothing; `getGridOption(key)` reads an option as last
  supplied; `getFocusedCell()` pairs with a new `setFocusedCell(cell)` overload that reaches pinned
  rows; `isDestroyed()` is true from the start of the teardown.
- **`api.scrollTo({ topPx, leftPx })` and `api.addSparklineColumn(...)` replace the last raw
  `dispatch` calls.** The `scrollSet` action was never handled by the core, so scrolling to an
  offset had no working door; `addSparklineColumn` returns the new column's colId. The
  renderer-internal actions stay untyped, and `dispatch`'s documentation says which they are.
- **Column definitions, grid options, the grid API and their callbacks take the row type:
  `ColDef<Trade>`, `GridOptions<Trade>`, `IGridAPI<Trade>`, `createGrid<Trade>`, `<Grid<Trade>>`
  and `NgColDef<Trade>` / `AwbGrid<Trade>`.** The parameter defaults to `any`, so existing code
  compiles unchanged. Once supplied it types `valueGetter` (which receives the row node,
  `IRowNode<Trade>`), the cell class, style, tooltip, ActionFrame, editor and renderer params, the
  row callbacks (`getRowId`, `getRowClass`, `isRowSelectable`, `isRowPinned`, …), the click events
  and the rows the API returns (`getSelectedRows(): Trade[]`). The type comes from an explicit
  argument or from typed `columnDefs`, never from `rowData`, so `rowData={[]}` cannot narrow a grid
  to `never`; the published types use `NoInfer` and need TypeScript 5.4 or later. A cell
  renderer's `data` stays `any`, because it is the row node on column cells.
- **Groups can be expanded or collapsed by id with `api.setGroupExpanded(groupIds, expanded)`.**
  One rebuild for the whole list, where `dispatch({ type: "groupToggleExpand" })` cost one per
  node; unknown ids are ignored and nothing happens when every named node is already in that
  state. The grouping guide no longer shows `dispatch`.
- **Pinning, hiding and moving columns have a typed API: `setColumnPinned`, `setColumnsVisible`,
  `setColumnVisible`, `moveColumn` and `moveColumns`.** No more `dispatch({ type: "columnPin" })`.
  Each call emits what the menu, panel or drag would, with `source: "api"`, and nothing when
  nothing changed. Hiding respects `hideable: false`. `moveColumns` places the columns as a block
  at an index of `getColumnState()` order, hidden columns counted, clamped to each column's own
  section, skipping `movable: false` and `lockPosition` columns.
- **Phones and tablets can select, edit, resize, reorder, fill and open menus.** A tap selects a
  cell, ticks a checkbox or toggles a group, a double tap edits, a long press opens the cell or
  column menu, and the resize handle, header cells and fill handle drag by touch; pen input behaves
  the same way. Swiping the body still scrolls natively, and the mouse events a browser fires after
  a tap are never handled twice. The stylesheet sets `touch-action` (`manipulation` on the grid,
  `pan-y` on header cells, `none` on the two handles) and gives handles, chevrons, checkboxes and
  the header menu button hit targets of at least 24 px under coarse pointers. Range drag across
  cells and hover tooltips stay mouse-only.
- **Link, image, progress and rating cells are one word away: `cellRenderer: "link" | "image" |
  "progress" | "rating"`.** Each built-in reads typed `cellRendererParams` (`LinkCellRendererParams`,
  `ImageCellRendererParams`, `ProgressCellRendererParams`, `RatingCellRendererParams`) and is also
  exported as a class. Links open in a new tab with `noopener noreferrer`, refuse `javascript:`
  hrefs and navigate without opening the editor; images load lazily, fit the row and show their alt
  text when broken; progress bars clamp, carry progressbar ARIA and take threshold colours through
  a `color` hook; ratings draw half stars and, on an editable cell, write the clicked star through
  `setCellValue` so commit hooks, undo and no-op suppression apply. Export, the clipboard and
  tooltips keep the formatted value, the quick-filter find skips columns that show no text, and
  five theme parameters (`linkColor`, `progressTrackColor`, `progressBarColor`, `ratingColor`,
  `ratingEmptyColor`) colour the new cells.

## 1.12.0 — 2026-10-16

### Features

- **Sorting has a typed API: `api.getSortModel()` and `api.setSortModel(items)`, by colId.** The
  sort model reads and writes as `{ colId, dir }` entries in priority order, with no more
  `dispatch({ type: "sortModelSet" })` and no instance ids. `setSortModel` replaces the model (`[]`
  clears), skips unknown and non-sortable columns, does nothing for an unchanged model and
  otherwise behaves exactly like a header-click sort. Column state carries sort too:
  `getColumnState()` reports `sort` and `sortIndex`, and `applyColumnState()` applies them (`null`
  clears one column, `defaultState: { sort: null }` clears the rest). `SortDir` and
  `SortModelItem` are exported.
- **Pagination can be driven from the API: `setPagination`, `goToPage`, `nextPage`,
  `previousPage`, `firstPage`, `lastPage` and `setPageSize`.** `setPagination({ enabled?,
  pageIndex?, pageSize? })` merges over the current state, clamps the page to the known range and
  accepts a page past a provisional server-side total (the grid snaps back once the count pins).
  A no-op change emits nothing; otherwise `paginationChanged` fires once.
- **Columns can be sized from the API: `autoSizeColumns`, `autoSizeAllColumns`,
  `setColumnWidth`, `setColumnWidths` and `sizeColumnsToFit`.** Each call is one
  `columnWidthsChanged` (`final: true`) for the whole batch. Set widths behave like a resize drag
  (clamped to the column's bounds, kept across autosizes), and `sizeColumnsToFit` scales the
  visible unpinned columns to fill the centre viewport exactly, leaving pinned, non-resizable and
  utility columns alone.
- **New row and repaint accessors: `forEachNode`, `forEachLeafNode`, `getDisplayedRowCount`,
  `getDisplayedRowAtIndex`, `getFirstDisplayedRowIndex`, `getLastDisplayedRowIndex`,
  `getRenderedNodes`, `refreshCells`, `redrawRows` and `flashCells`.** Indexes are page-relative,
  like `selectRow`. `refreshCells` re-runs getters, formatters, styles and renderers for rendered
  cells after outside state changes (`force` rebuilds the renderers), `redrawRows` rebuilds whole
  rows, and `flashCells` highlights cells with the change-flash renderer's existing classes and
  theme variables.
- **`onColumnsChanged` reports every column change and says whether the user or your code made
  it.** `columnsChanged`, `columnWidthsChanged` and `onSortChanged` now carry
  `source: "user" | "api"`: `"user"` for header clicks, drags, resizes and keyboard, column-menu,
  column-panel, filter-popup and toolbar gestures; `"api"` for API calls, view and column-state
  restores and `columnDefs` updates. Persist column state on `"user"` and a restore never echoes
  back into storage. React `onColumnsChanged` prop, Angular `(columnsChanged)` output;
  `ColumnChangeSource` is exported.
- **`onPaginationChanged` binds pagination UI without polling.** A declarative callback for the
  `paginationChanged` event, with `getPaginationInfo()` as its payload. It can fire with nothing
  changed after a re-sort or regroup, so compare with the previous payload. React
  `onPaginationChanged` prop, Angular `(paginationChanged)` output.
- **`onError` surfaces failed server-side requests.** A declarative callback for the `error` event
  (`code: "row_model_error"`, the failure in `details`). The grid's own handling is unchanged: the
  overlay comes down and the block is requested again when next needed. React `onError` prop;
  Angular `(gridError)` output, because an `(error)` binding would also catch DOM `error` events on
  the host element.
- **CSV export takes a separator, a line ending, a byte order mark, cell and header processors
  and extra content.** `ExportParams` gains the CSV-only `columnSeparator` (`";"`, `"\t"`),
  `lineEnding` (`"\r\n"` for RFC 4180), `includeBom` (so Excel reads UTF-8), `suppressQuotes`,
  `processCellForCsv` (the `processCellForExcel` params, returning replacement text),
  `processHeaderForCsv`, and `prependContent` / `appendContent` (a verbatim string or rows). A
  field holding the separator is quoted and the formula guard holds for any separator; the
  defaults write the same bytes as before.
- **Number columns format with `Intl.NumberFormat`: thousands grouping, fixed decimals, percent,
  units and compact notation.** New `formatterOptions` (`style: "decimal" | "percent" | "unit"`,
  `fractionDigits` / `minimumFractionDigits` / `maximumFractionDigits`, `useGrouping`, `unit`,
  `unitDisplay`, `notation`) drive a built-in NUMBER formatter. Percent follows Intl, so `0.125`
  shows `12.5%`. A column that sets none of them still shows `String(value)`;
  `{ style: "decimal" }` is the smallest opt-in. Currency columns accept the fraction-digit,
  grouping and notation options too, and an invalid currency code now warns instead of throwing.
  The built-in parser reads the same shape back in the column's locale (`"1.234,5"`, `"12.5%"`
  as `0.125`, `"12 kg"`, `"1.2K"`), so copy, paste and fill round-trip. Excel export carries the
  format across: a NUMBER column's static `formatterOptions` become the cell's number format
  (`#,##0.00`, `0`, `#,##0.0%`, `#,##0.0" kg"`) while the cell keeps its raw number, so the workbook
  shows what the grid shows and still sums; the decimal count follows the data when the column
  leaves it open (counts export as `#,##0`, prices as `#,##0.00`), compact notation and
  function-valued options stay General, and a column `format` still wins. `FormatterOptions` and
  `NumberFormatStyle` are exported.
- **Boolean columns show a checkbox.** A `ColumnType.BOOLEAN` column with no `cellRenderer` of its
  own now draws a ticked, empty or indeterminate (blank) box instead of "true"/"false". On an
  editable cell a click on the box toggles the value through the normal commit path
  (`onBeforeCellCommit`, `cellValueChanged`, undo) and never opens the editor, not even with
  `editTrigger: "singleClick"`; a click elsewhere in the cell still does, and Enter/F2 still open
  the boolean editor. The box carries `role="checkbox"` and `aria-checked`, export and the
  clipboard keep the formatted text, find skips the column, and `cellRenderer: "text"` keeps a
  column as text. `BooleanCellRenderer` is exported for use on other columns.
- **Aggregates take custom functions, first/last, and a per-column default.** `aggFuncs` registers
  functions by name, and a name works wherever a built-in type does: `ColDef.aggFunc`,
  `api.setAggregates`, the aggregate menus (listed after the built-ins), saved views, pivot
  measures, group rows and the footer at either scope. A function gets the raw values (blanks
  included) and the rows, its result renders through the column's formatter, and exports write it
  as a static value. The new `first` / `last` built-ins pick the first / last non-blank value in
  display order. `ColDef.aggFunc` sets the column's default function (instead of sum/count) and
  aggregates the column from the start, as if `setAggregates` had listed it. An unknown name warns
  once and falls back to the column's default; on the server-side row model names travel to the
  server unchanged. `AggregateKind`, `AggregateFunction` and `AggregateFunctionParams` are exported.
- **Selecting a group now selects its rows, with `groupSelectsChildren: true`.** A group row's
  checkbox stands for its subtree: a click (or Space/Enter on it) selects every selectable leaf
  under it, collapsed ones included, and clears them once all are selected; nested groups follow
  and a tree-data parent selects itself with its descendants. The checkbox shows the derived state
  (tick, dash with `aria-checked="mixed"`, or empty) while the selection itself still holds data
  rows only, so `getSelectedRows()`, select-all and the header tri-state are unchanged in shape.
  Filtered-out rows and rows `isRowSelectable` refuses never count; `mode: "single"` and pivot mode
  ignore the option; on the server-side model only loaded rows are affected. Live through
  `updateGridOptions`; React prop and Angular input of the same name.
- **The server-side block cache can be capped with `serverSideMaxBlocks`.** Past the limit, the
  least recently used blocks are evicted after each block arrives and fetched again when scrolled
  back to; row counts, the pager total, expansion and the selection are kept. Blocks in or one
  block either side of the viewport, blocks still loading, and blocks holding an expanded group
  row or tree parent are never evicted, so the cache can briefly hold more than the limit. Blocks the
  grid is still loading for the current window are never evicted either, so a limit smaller than the
  first page lets the cache go over the limit until that page has loaded, instead of evicting and
  refetching the same blocks forever. Unset (the default) keeps every block until a purge, as before.
- **Grouped grids can show a footer (subtotal) row per group and a grand-total row.**
  `groupTotalRow: "top" | "bottom"` repeats an expanded group's aggregates under a "Total <group>"
  label, directly under its header or after its last row; `grandTotalRow` adds one row of totals
  over every filtered row at the start or end of the list, and `groupTotalRowLabel` rewrites either
  label. Footers are ordinary rows of cells in every display type (under `groupRows` they are where
  the per-column totals become visible), count toward pagination and `aria-rowindex`, and carry
  `pte-row-footer` / `pte-row-grand-total`; they are never selected, edited, docked or exported.
  Client-side row grouping only; live through `updateGridOptions` and in both bindings.
- **Transactions now work on the server-side row model.** `applyTransaction` and
  `applyTransactionAsync` mirror a change the app has already made on the server into the loaded
  rows, with no refetch: updates replace data on the same node, removals close the gap and lower
  the count and pager total, and additions go into the listing a new `RowTransaction.route` names
  (group values, or tree parent ids) at `addIndex`. Unloaded rows are skipped and not counted, a
  block fetched before an add or remove is discarded and requested again, and undo history is kept.
  Group aggregates stay server-stamped and are not recomputed.
- **Select-all on the server-side row model now selects every row, not just the loaded ones.**
  `selectAllRows()` and the header checkbox store `{ selectAll: true, toggledRowIds: [] }`,
  un-checking rows adds them to `toggledRowIds`, and rows that load later paint selected. The new
  `api.getRowSelectionState()` / `api.setRowSelectionState()` hand that state to the server for
  bulk operations (`RowSelectionState` is exported). This changes behaviour for server-side grids
  in multiple mode with the default `selectAllScope: "filtered"`: `getSelectedRows()` and
  `getSelection().selectedRowIds` still return loaded rows but now include rows loaded after the
  select-all, `areAllRowsSelected()` stays true until a row is excluded, a filter or quick-filter
  change ends the select-all even under `selectionPersistence: "keep"`, exports with
  `scope: "selection"` and copying warn once that they use the loaded rows, and `selectRowsById`
  drops loaded rows that `isRowSelectable` refuses. `selectAllScope: "page"`, single mode and the
  client-side model are unchanged.

### Fixes

- **Typing formatted or invalid text into a number cell no longer clears it.** Without a
  `valueParser`, the number editor read its text with `Number()`, so `"1,234.5"`, `"12.5%"` or a
  typo committed `null`. It now reads the text with the column's built-in parser, as paste, fill
  and `setCellValue` already do: locale grouping, percent (stored as the fraction), units and
  currency marks commit as numbers, clamped to the editor's `min`/`max`. Text the column cannot
  hold is rejected (`editingChanged { state: "rejected" }`), and the cell keeps its value.
- **Autosizing one column by its colId no longer throws.** `dispatch({ type: "columnAutosize",
  colId })` resolved the column by its public id but looked its ancestors up by instance id, so
  the lookup came back empty and the width update dereferenced `undefined`. The ancestor lookup
  now uses the resolved column; `api.autoSizeColumns` is the typed way to do this.
- **A full-width group row keeps its checkbox under `groupSelectsChildren`.** With
  `groupDisplayType: "groupRows"` the pinned checkbox now stays beside the spanning label, in the
  body and on a docked sticky row, toggling the subtree and showing its mixed state.
- **A capped server-side cache keeps the rows on screen.** The body now reports its drawn window to
  the row model, so scrolling back over loaded rows while a far fetch is in flight no longer lets
  that fetch evict the visible block under `serverSideMaxBlocks`.

### Tooling

- **The layout probe survives a page reload and can no longer hang.** A Vite dependency
  re-optimisation (or a stylesheet regeneration) reloading a playground page under an in-flight
  check aborted the whole run with "Inspected target navigated or closed", and a retry on the
  session that died with a command in flight then waited forever, because protocol calls had no
  timeout. Every DevTools call now gives up after 30 seconds, navigation surfaces either leg
  failing, and both passes retry a failed case or page up to three times on a fresh page, reporting
  anything else as a `harness-error` for that entry instead of exiting.

## 1.11.0 — 2026-10-16

### Fixes

- **Ctrl+V / Cmd+V pastes through the browser's `paste` event, so paste works without clipboard
  permission.** Paste only ever read the clipboard through `navigator.clipboard.readText()`,
  which Firefox does not grant without a flag, insecure contexts never grant, and users can deny;
  when it failed the error was only logged and nothing happened. The keyboard shortcut now lets
  the browser deliver the `paste` event to the focused grid and reads `text/plain` from it, through
  the same pipeline `api.paste()` uses, so the selection, editors and read-only cells behave
  identically. The event is ignored while a cell editor or any input inside the grid has focus and
  when the target is outside the grid, and the default is prevented only when cells were written.
  `api.paste()` and the body menu's Paste still need `readText()`; when it is refused they warn
  once, naming the reason and the shortcut that works instead.
- **CSV and Excel exports write the local calendar day.** When a date column's formatted text
  equalled the raw value (date-only text like `2026-03-01`, or a formatter that returns the
  value unchanged) the CSV wrote `toISOString()`, which shifts the day in positive UTC offsets, and
  the Excel export read date-only text as UTC midnight, which lands a day early west of
  Greenwich. Both now read date-only and zone-less text as local time and write the local
  `YYYY-MM-DD`; a value with a time of day keeps it as zone-less local `YYYY-MM-DDTHH:mm:ss`; a
  column with a format still writes its formatted text.
- **Duplicate ids and paths in client-side tree data warn instead of throwing.** Tree data with
  a repeated row id or a repeated path took the whole grid down with an exception. The first row
  now keeps its id and the later ones are dropped (their own children, in nested-children mode,
  still land under the kept row); a repeated path keeps the first row as the owner and shows each
  later row as a childless leaf beside it, so no data disappears. One warning per data set names
  the ids or paths and counts, and it does not repeat on sort, filter or expand rebuilds. Parent
  cycles still throw, as they are not duplicates.
- **The quick filter works under the server-side row model.** It was silently destroyed there:
  the widget was not mounted, `setQuickFilter` was a no-op, nothing reached the server and
  nothing warned. The server-side rows request (and the whole-dataset aggregation request) now
  carries an optional `quickFilter: { text, mode, caseSensitive }`, omitted when the text is
  empty; a text or mode change purges the store and refetches once, exactly like a filter-model
  change; the widget mounts in both the toolbar and floating presentations. Find mode (match
  counting and next/previous) needs the rows, so under the server-side model it falls back to
  filtering with one warning and `getFindState().available` reports false. A match mode set
  through `setQuickFilter` or a restored view is no longer reverted by the next keystroke.
- **Saved views restore the aggregate scope, runtime row pins and the quick filter's match
  settings.** The view state carried only the quick-filter text, so a restored view lost the
  footer's None / Current page / Entire dataset choice, rows pinned at runtime through
  `setRowPinned` or the row-pinning menu, and the match mode, case sensitivity and behaviour.
  `GridViewState` gains optional `aggregateScope`, `rowPinning` and `quickFilterSettings`; views
  saved before this still apply and leave those three alone; applying then capturing yields the
  same object.
- **Sticky group rows dock correctly on pages after the first.** The client-side model stamps
  view indexes over the whole grouped list while the body and the sticky overlay work in
  page-relative slots, so on page 2 of a grouped, paginated view the ancestor headers compared as
  below the overlay and nothing docked. The overlay now resolves a header's position in the
  current page's space.
- **A docked (sticky) group row behaves like its body row.** The sticky overlay that keeps
  ancestor group rows in view received only wheel and context-menu events, so on a docked header
  a click-trigger ActionFrame did not open, double-click events did not fire, no tooltip showed,
  and clicking it scrolled the body back to the start of the group. The overlay now routes
  pointer gestures to the body row's handlers with the mirrored row's identity: click, double
  click, hover tooltips, the ActionFrame (which anchors to the mirror cell and keeps its border
  through repaints), the expander chevron and the context menu all work on the mirror, and the
  body no longer jumps. Keyboard behaviour is unchanged.
- **Pinned-row bands and the aggregate row have ARIA row positions.** Rows in the top and
  bottom bands and the aggregate row carried no `aria-rowindex` and were outside
  `aria-rowcount`, so a screen reader placed them nowhere. They now follow the last body row
  (top band, then bottom band, then the aggregate row while shown), a model row pinned into a
  band keeps its body index, `aria-rowcount` counts them all, and while the server-side total is
  unknown the count stays `-1`. The sticky overlay stays hidden from assistive technology.
- **React and Angular warn when a creation-only prop or input changes after mount.** Both
  bindings silently ignored later changes to options the grid reads only at creation (`rowHeight`,
  `defaultColDef`, `pageSize`, `getRowId`, `rowNumbers` and the rest), so a prop that "did
  nothing" gave no hint why. In development each binding now warns once per prop, naming it and
  the remount recipe (a new React `key`; an `@if` or keyed `@for` in Angular). The list is derived
  from core's option classification (new exports `CREATION_ONLY_OPTION_KEYS`,
  `MODEL_STATE_OPTION_KEYS`, `UPDATABLE_OPTION_KEYS`, `isCreationOnlyGridOption`), so it cannot
  drift, and the docs for each binding carry a live-versus-creation table.
- **Framework header components, and framework components inside `groupColumnDef` and
  `pivotResultColumnDef`.** The two partial column defs passed through the bindings unadapted, so
  a React or Angular `cellRenderer` or tooltip placed there broke; `headerComponent` and
  `headerCellComponent` could not be framework components at all although the README promised
  custom headers. Both bindings now adapt the partial defs field by field (new types
  `ReactPartialColDef`, `NgPartialColDef`) and accept framework header components at both levels,
  including through `defaultColDef`: React mounts one root per header cell and re-renders on
  refresh (`ReactHeaderComponent`); Angular mounts through its component factory with `awbInit` /
  `awbRefresh` (`IHeaderNgComp`); both unmount on header rebuild and on destroy. The core
  function and class forms keep working.
- **Tooltips, ActionFrame popovers and the column drag ghost keep the grid's theme when they leave
  the root.** Layers mounted with `escapeRootClip`, and the ghost that follows a column drag, were
  appended to `document.body`, outside the element that carries the grid's theme variables, so a
  dark grid showed light popups and a theme's `tooltip*` / `actionFramePopover*` params did not
  reach them; under a shadow-root mount they also left the stylesheet behind and rendered
  unstyled. Each portaled layer now carries a live copy of the root's theme variables (kept in
  sync through theme changes) and, when the grid lives in a shadow root, mounts inside that shadow
  root so the grid's stylesheet styles it. Menus and the column panel never left the root and are
  unchanged.
- **Numeric theme lengths get their unit.** `createTheme({ tooltipMaxWidth: 240 })` and the other
  length params that accept a number (`actionFramePopoverWidth`, `actionFramePopoverRadius`,
  `tooltipRadius`, the scrollbar sizes, `rowBorderSize`, `paginationFooterHeight`, the column
  panel widths) emitted a bare `240`, which is not a CSS length, so the browser ignored the
  variable. They now emit `240px`, as `rowHeight`, `fontSize` and the paddings already did;
  strings pass through untouched.
- **`themeDark.withParams({ … })` now applies the params.** The dark theme sets every value
  through raw `vars`, and raw vars won over semantic params, so the documented
  `themeDark.withParams({ accentColor })` left the dark values in place. A param given in
  `withParams` now replaces the variables it fans out to; `vars` passed in the same call still win,
  and partial overrides still keep the rest of the base.

## 1.10.1 — 2026-10-15

### Fixes

- **A host that hides an ancestor of the grid now hides the grid.** The grid root pinned
  `visibility: visible` as part of its inherited-property reset, and CSS lets a descendant that
  says `visible` paint itself through a hidden parent, so a grid inside a hidden tab panel, a
  collapsed container or a print stylesheet's hidden region stayed on screen, and nothing the host
  put on the ancestor could stop it (importance does not inherit). The root no longer declares
  `visibility`, and every reveal rule inside the grid (the announcer, the resting sort icon, the
  hover column buttons, an open menu, a tooltip or action frame) says `inherit` instead of
  `visible`, so no element shows through on its own. A host rule that targets `.pte-root`
  directly to work around this keeps working and is no longer needed.
- **Pinned columns now clamp in the header, aggregate row and horizontal scrollbar exactly as
  they do in the body.** When a grid with left and right pinned columns was narrowed, the body's
  pinned sections shrank to 35% of the grid but the header, aggregate row and scrollbar lanes kept
  their full width: the centre header started further right than the centre rows, the right header
  could overlap the left one, and a clamped pinned section could not be scrolled sideways in the
  header. The header sections carried an inline `min-width` (which beats the resize clamp's
  `max-width`) and could shrink in the centre header's favour. Every pinned box now has the same
  width-only sizing, `flex: 0 0 auto`, and the same live cap reapplied on every resize; the right
  header's cap allows for the vertical-scrollbar gutter, and the centre header and scrollbar lane
  take whatever space is left. Header, rows, aggregate row and scrollbar line up at every width
  and scroll together.

- **The grid now re-lays itself out when its body resizes, not only when its columns change.**
  The only resize path re-applied the pinned-column clamp and the vertical extent; everything
  else was computed once at creation or on a column change. A grid that grew taller kept the row
  pool it was created with and showed blank rows at the bottom once scrolled; a toolbar, sheet
  strip or pagination footer appearing inside a fixed-height host changed the body without any
  of this running. The root and the body are now both observed, and one pass runs in order: the
  clamp, the horizontal scrollbar strip and body budget, the vertical scrollbar compensation, the
  row pool size, full-width row widths, the pinned-row bands and the position of an open
  ActionFrame. The pass writes nothing when nothing changed, so it cannot feed back on itself.
- **The horizontal scrollbar strip appears exactly when columns overflow, and stays decided
  across resizes.** The strip's own lanes were measured to decide whether it was needed, and
  those measure 0 while the strip is hidden, so every column change flipped it: a header-height
  change left an empty strip under columns that fit, and a column-resize drag toggled it (and
  the body height with it) on every mouse move. Narrowing the grid never showed it, so columns
  that no longer fit could only be reached with a wheel. The decision now compares each
  section's columns with its body section, the only box that is always laid out, and runs on
  every resize.
- **Pinned columns stay level with full-width rows and group headings.** A full-width row (an
  `isFullWidthRow` row, or a group heading with `groupDisplayType: "groupRows"`) hid its pinned
  and row-number fragments with `display: none`, which took them out of the flow, so every pinned
  row below sat one row too high: the pinned cells beside a data row belonged to the row after
  it, and a group heading had its first child's pinned values beside it. The fragments now keep
  their place and height as blank rows (class `pte-full-width-fragment`, hidden from assistive
  technology), and a user full-width row's width follows the centre section through resizes
  instead of the width measured when the row was first painted.
- **Pinned-row bands keep their 30% cap when the grid changes height.** The cap was computed
  only when a band's rows changed, so a grid made shorter kept tall bands and squeezed the body
  out, a grid made taller kept small scrolling bands, and a grid created while hidden had no cap
  at all until a data or column event. The band heights are now laid out on every resize, and a
  band that changes height tells the body so the row pool follows.
- **The pinned-column clamp and the scrollbar strip measure the grid's content width.** Both
  used the root's `clientWidth`, which includes the padding the root carries for the column
  panel's rail (36px) or the open panel (304px); with the panel open, pinned sections could take
  over half of the visible body, and the bands clamped against a different width than the header
  and body. All of them now clamp against the root's content box.
- **Grids mounted inside a shadow root keep their header in sync.** Header cells were looked up
  with `document.getElementById`, which cannot see into a shadow tree, so inside one a column
  resize left the header at its old width over the resized body, the sort icon and `aria-sort`
  never updated, the header keyboard cursor was not painted, the filter-active indicator stayed
  off, the Alt+ArrowDown menu had no anchor, header tooltips found no target and column drags
  under a group header had no drop anchor. Every lookup is now scoped to the grid's own header.
- **The floating quick filter sits inside the scrollbar lane.** Its inset used the themed
  scrollbar thumb size (10px, a styling value) instead of the measured gutter, so it overlapped a
  15px scrollbar by 5px and sat 10px too far in when the body had no scrollbar or the platform
  overlays scrollbars. It now uses the live gutter the grid measures.
- **An open ActionFrame follows horizontal scrolling and resizes.** Its popover was repositioned
  only on vertical body scroll, so scrolling sideways or resizing the grid left it floating away
  from its cell.

### Tooling

- **A real-browser layout probe: `npm run probe:layout`.** The test suites run under happy-dom,
  which has no layout engine, so the two recent layout defects (header cells cut off by a fixed
  wrapper, pinned header sections not clamping with the body) could only be found by a person
  resizing a grid. The probe does that automatically: `scripts/layout-probe/run.mjs` drives
  headless Chrome over the DevTools protocol, mounts grids from a case matrix on the new vanilla
  harness page `apps/vanilla-playground/layout-matrix.html` (pins, column groups, row numbers,
  checkboxes, aggregates, pagination, pinned rows, grouping, sticky and full-width rows, themes,
  explicit heights, toolbar), walks each through a width and height ladder and runtime
  transitions (scroll, pin, hide, collapse, theme swap, header-height change, hidden mount, window
  resize), and asserts the invariants in `scripts/layout-probe/invariants.js` after every step
  (sections, cells and rows aligned across header, body, aggregate row, scrollbar lanes and pinned
  bands; scrollers in sync; scrollbar gutter reserved exactly where the body shows one; the
  horizontal strip shown exactly when something overflows; the 35% pinned clamp; contiguous
  vertical stack). It then smoke-checks every vanilla playground page at three widths. The
  harness page imports the same invariants, so a person can open it, pick a config, drag the
  frame's corner and read the violations live. See `docs/maintainers/repository.md`.

## 1.10.0 — 2026-10-14

Bug-fix round from the 2026-10-13 feature-set gap analysis (`docs/feature-gap-findings.md`,
section A): shipped, documented behaviour that did not work. Every fix carries a regression test.

### Filtering

- **Conditions joined with OR now keep rows that match either condition.** The client-side row
  model ignored a column filter's `join` and ANDed everything; the UI toggle and the docs already
  promised OR. Different columns are still ANDed, and the join survives view-state round trips.
- **Between and Not between hold two values.** Every value input wrote the first operand, so the
  upper bound overwrote the lower one; Not between also rendered one input and never excluded
  anything. Each input now writes its own bound and both operators take two.
- **Date column filters match.** Operands and cells (`yyyy-mm-dd` text, `Date`, epoch, ISO) are
  compared by local calendar day: Equal is the same day, Between runs from the start of the first
  day through the end of the second, Greater than starts after the end of the day. They were
  compared with `Number()`, which is `NaN` for the date input's text.
- **Boolean filters are a True / False / Any choice** with Equal and Not equal, matching `true`,
  `1`, "yes"-style values. They rendered a text box offering numeric or text operators.
  `filter: "dropdown"` now shows a select of its static `filterValues`.
- **Is blank and Is not blank are offered by default** on text, number, date and boolean filters,
  as the docs said. An explicit `filter` kind now decides the operators even when the column type
  differs (`filter: "date"` on a string column offered text operators).

### Columns and sorting

- **A column's declared `width` is kept.** Content autosize on data load replaced it; now only
  columns without a width are measured, a user resize always wins, and expanding or collapsing a
  column group keeps the revealed leaves' declared and resized widths. Content autosize respects
  `minResizeWidth`, `maxColumnWidth` and the column's own `minWidth`/`maxWidth`; header
  double-click and `columnAutosize` still fit to content.
- **`filter: false` no longer turns off sorting.** A loose comparison treated `false` as the empty
  string that once meant "no comparator", so those columns silently dropped their sort.
- **`columnWidthsChanged` carries `final`.** It is `false` for each move of a resize drag and
  `true` for the settling event (and for autosize and refits), so an app can persist column state
  once per resize instead of per pixel.

### Editing and clipboard

- **The date editor opens on the cell's own calendar date in every time zone** (it showed the day
  before east of UTC) and saving keeps the column's value type: `Date` columns stay `Date`s and
  epoch columns stay numbers instead of turning into ISO text.
- **Pasting what the grid copied works.** Currency columns parse their own formatted text
  ("$1,234.00", "-1.234,56 €", parentheses negatives), number columns with a
  `formatterOptions.locale` parse that locale's separators, and date columns parse their
  `formatterOptions.format` (e.g. "31/01/2026") as well as ISO. Copy wrote formatted text that the
  built-in parsers then rejected.
- **The body menu's Copy and Copy with Headers copy exactly what Ctrl/Cmd+C copies.** Both paths
  share one serializer. A selection made only of group rows now copies their labels and totals
  (from the menu or the keyboard) instead of nothing.

### Grouping, tree data and aggregation

- **Tree-data siblings sort by their own values at every level.** A parent's position no longer
  depends on its children (a parent "Z" with a child "A" sorted before "B").
- **Aggregates ignore blank cells.** Sum, average, median, min and max of a group with nothing
  numeric are empty instead of 0, and `count` counts non-blank values, as the Excel export's
  `COUNTA` already did.
- **Several aggregate types on one column: the last one registered shows** on group rows and in
  the footer. This was already the behaviour; it is now one documented, tested rule.

### Server-side row model

- **A block whose request failed is requested again the next time it is needed** (scrolling back
  over it, or a refresh) instead of staying blank until a refresh. The `error` event is unchanged
  and there is no automatic retry.
- **Undo history is cleared when loaded rows are discarded** (a purge refresh, or a sort, filter or
  grouping reload) with `historyChanged` reason `"clear"`, so an undo cannot write stale values
  into fresh server rows. A soft refresh keeps it.
- **A one-time warning when no row id strategy is set.** Without `rowIdKey` or `getRowId` a
  server-side grid's row ids change on every block refetch, which silently breaks id-keyed
  selection, refresh-in-place and history.

### Export

- **CSV cells cannot run as formulas.** Text starting with `=`, `+`, `-`, `@`, tab or carriage
  return is prefixed with a single quote; numbers are untouched. Header labels are now CSV-quoted
  too. Excel strings were already written as inline strings and are unaffected.

### Header heights

- **Header cells now line up with the header at any header height.** The header wrapper was
  sized from `headerHeight` while its cells were sized from the body `rowHeight`, so any custom
  value left either an empty band under the cells or clipped them. The header is now sized from
  `headerHeight`, `leafHeaderHeight` and `parentHeaderHeight` alone (one geometry helper,
  `core/headerGeometry.ts`): each parent level is `parentHeaderHeight` tall, the leaf level
  `leafHeaderHeight`, and both default to `headerHeight`. The two level options did nothing before.
  A group shallower than the header now fits too (its label takes the spare level).
- **All three header heights are updatable at runtime** through `updateGridOptions` and the React
  and Angular props/inputs; the header rebuilds and the body re-fits.
- **The theme's `headerHeight` param sets the default header height** when the grid is created,
  with the same precedence as the theme `rowHeight` param: an explicit grid option wins, then the
  theme, then 43, and changing the theme later resizes neither. It used to write the renderer's
  own `--pte-rendered-header-height` variable (and `themeDark` pinned it to 43px), so it never sized
  the header and a theme swap could shrink the column-panel trigger button on a multi-level header.
  The param now maps to `--pte-header-height`.
- `rowHeight` alone no longer changes header cells; before, it only grew them inside a header that
  then clipped them.

### Theming and overlays

- **The theme `rowHeight` param sets the row height.** It mapped to a CSS variable nothing read.
  It is resolved when the grid is created; an explicit `rowHeight` grid option wins.
- **`loadingMessage` and `noRowsMessage` are live** through `updateGridOptions` and the React and
  Angular props/inputs, including a no-rows overlay that is already showing.
- **The no-rows overlay returns when loading ends on an empty grid.** Turning the loading overlay
  on hid it, and nothing re-evaluated the empty state when loading was turned off.
- **The stylesheet no longer claims RTL support,** and an unused filter overlay that every grid
  attached to `document.body` with document-wide listeners is removed.

### Wrappers and API

- **`multiColumnMenu` reaches the grid from React and Angular.** React accepted the prop and
  dropped it; Angular had no input. Both forward it, call the latest function on each open, and
  accept framework slots in the items.
- **`ChangeFlashCellRenderer` keeps previous values per grid.** A static map shared by every grid
  on the page made grids with the same row ids flash against each other and never released
  memory; removed rows are pruned and a destroyed grid releases everything.
- **`api.getPaginationInfo()`** returns the current pagination state, the same object
  `paginationChanged` carries. The docs already referred to it; it was only on the core.
- `headerAction.action` is typed as a union instead of `string`; dead no-op branches are gone.

## 1.9.0 — 2026-10-12

### Rendering

- **Cell renderers paint group rows.** This is a behaviour change: in `singleColumn` and
  `multipleColumns` display a column's `cellRenderer` now runs on group rows too, where it used to
  be skipped for plain text. Its params carry `isGroup: true`, the group `node`, and the group cell
  value as `value` / `valueFormatted` (the column's aggregate, else its `groupValueGetter` result,
  else `undefined` and `""`); leaf params now carry `isGroup: false` and `node` as well, and so do
  full-width renderers. Label columns (the auto-group column, the tree column, and every
  level-tagged column of `multipleColumns`) never run a renderer on a group row and keep the
  chevron and label; `groupRows` display is unchanged. One pooled instance is refreshed as its slot
  moves between leaf and group rows; return `false` from `refresh` to have it rebuilt instead. A
  renderer written for leaves should check `params.isGroup`; one that prints `valueFormatted`
  shows what the cell showed before. The sparkline renderer draws nothing, without a warning, on a
  group row that has no value.

### Grouping

- **A column can say what it holds on a group row.** The new `ColDef.groupValueGetter` receives
  `{ node, data, aggregates }` — the group node, its aggregates by colId, and (server-side row
  model only) the group's raw data row — and returns the column's value on that group. It is the
  third step of the group cell value rule: the column's aggregate wins, then the group label on the
  group's label column, then the getter, else the cell is empty. It never runs on a leaf, a
  column's `valueGetter` still never runs on a group row, and it inherits through `defaultColDef`.
  The one rule feeds the group row's cell text (formatted by the column's `valueFormatter`), the
  clipboard, the click, double-click and ActionFrame payloads, and the Excel export's group header
  rows alike. A sparkline column built from the column menu uses it: on a group row its series is
  the selected columns' aggregates, so a sparkline over summed columns draws the group's sums on
  group rows.

### Saved views

- **Views remember column-group expanders.** `captureViewState()` records every column group's
  open/closed state as `columnGroupState` (by the group's `colId`, nested groups included, the
  user's own groups while pivoted), and `applyViewState()` restores it — before the column layout,
  so captured widths win over the autosize that opening a group triggers. A view saved before this
  field existed leaves every group as it is, as does a group the list does not name. Give groups
  an explicit `colId` for the state to survive a reload: a group without one is identified by its
  position in the definitions.
- **`api.getColumnGroupState()` / `api.setColumnGroupState(groups)`.** Read or set column-group
  expanders programmatically, by the group's `colId`: the setter is what the header expander does,
  for many groups in one rebuild and with the same follow-ups (revealed leaves sized to content,
  aggregates re-derived). Groups not named keep their state, unknown ids and leaves are skipped,
  and a call that changes nothing rebuilds nothing. Backed by a new `columnGroupStateSet` core
  action.

### API

- **`api.getCellValue(cell)`.** Reads the raw value a cell holds: on a leaf, the column's value
  (its `valueGetter`, else the data field); on a group row, the group cell value (aggregate, label,
  `groupValueGetter` result). The row resolves like `getRowNode`, application-pinned band rows
  included, and the column by colId, instance id or key, the auto-group column by its colId, with
  an emitted ref's instance id winning, so a click payload's cell ref reads back. A row or column
  the grid does not hold reads as `undefined`. The read-side counterpart of `setCellValue`.

### Fixes

- **"Add group" and "Add sort" no longer run into the section divider.** The toolbar's two add
  buttons had padding on the left only, so "Add group" ended flush against the sort section's
  border and a hovered "Add sort" showed a highlight cut off at its last letter. Both now carry the
  same 8px on each side as the bar's other controls.
- **The Views button fills the toolbar's height.** With saved views on, the button sat at its 34px
  minimum inside the 42px bar, so its divider and hover highlight stopped short of the bar's edges.
  It now stretches like the Export and Columns buttons beside it.
- **Full-width rows no longer keep hidden leaf renderers alive.** A slot showing a `groupRows`
  group row (or an `isFullWidthRow` row) tears down the per-column renderer instances it held for
  its previous leaf, and data or resize refreshes repaint the full-width host instead of the
  hidden cells beneath it.

## 1.8.0 — 2026-10-12


### ActionFrame

- **Group rows host ActionFrames.** A frame opens on a group row wherever the cell cursor can land
  on it — with `groupRowsSelectable`, or in pivot mode — by click trigger, Shift+F2 or
  `api.openActionFrame`; elsewhere a group row stays a no-op, as before. Manually pinned body rows
  are unaffected. In `groupDisplayType: "groupRows"` a group row has one full-width cell, which
  stands in for the nominal column (the first non-leading leaf): only that column's frame opens
  there, and any other column is a no-op.
- **Component params gain `node` and `isGroup`.** On a group row `value` / `valueFormatted` are the
  group cell's value — its aggregate, or the group label on the group's label column — the same
  rule a copy of the cell follows.
- **`actionFrameIndicator` marks group cells.** Group rows are evaluated like leaves; predicates
  receive `isGroup`, `node` and the group cell's value. The full-width group cell in `"groupRows"`
  mode carries the nominal column's indicator.
- **The frame follows a docked sticky group row.** With `groupRowsSticky`, a framed group row that
  docks keeps its border and popover on the sticky copy the user sees, instead of on the body row
  hidden underneath it.

### Body context menu

- **Group rows in `groupDisplayType: "groupRows"` open the grid's body menu.** Right-click on a
  full-width group row — in the body, or docked as a sticky group row — previously fell through to
  the browser's native menu; it now opens the grid menu (and runs a `bodyContextMenu` getter) as
  group cells in the other display modes already did. Its `colId` is the nominal column, the first
  column after the row-number and checkbox columns. `bodyContextMenu: false` still lets the native
  menu through.
- **The menu context tells group rows from leaves.** `BodyMenuContext` gains `node` (the clicked
  row; for an app-pinned band row, the displayed pinned node), `isGroup`, `isFullWidth` (the row is
  drawn as one spanning cell, so `colId` is the nominal column) and `groupDisplayType` (the current
  option value).
- **No edit items on a group-only selection.** Cut, Paste, Fill down / right and the fill redo
  items are withheld when the selection holds only group rows, even over editable columns: a group
  cell's label and aggregates are never a write target. Copy, Copy with Headers, Export and Pin row
  are unchanged.

### Events

- **Click payloads carry the row's node.** `cellClicked` / `onCellClicked` and `rowClicked` /
  `onRowClicked` now include `node` (absent only when the row is not loaded), and `cellClicked`
  gains `isGroup`. On a group row, `cellClicked`'s `value` is no longer `undefined`: it is the
  column's aggregate, or the group label on the group's label column — the same rule a copy of
  that cell follows.
- **Double-click is an event.** New `rowDoubleClicked` / `cellDoubleClicked` events, with
  `onRowDoubleClicked` / `onCellDoubleClicked` options, `onRowDoubleClicked` /
  `onCellDoubleClicked` React props and `(rowDoubleClicked)` / `(cellDoubleClicked)` Angular
  outputs. Payloads match the click pair (`GridEventRowDoubleClickedParams` /
  `GridEventCellDoubleClickedParams`), group rows included. Neither fires when the grid consumed
  the gesture — the double-click opened the editor, or ran the fill handle's fill-to-adjacent-block
  — otherwise both fire regardless of `cellSelection` / `editTrigger`, so read-only grids get them
  too. `cellDoubleClicked` skips the row-number and checkbox cells, as `cellClicked` does.

### API

- **`api.getRowNode(rowId)` returns a row's node.** A data row, a client-side group or tree node
  (the id `getGroupNodes()` and `rowGroupOpened` report), or an application-pinned band row;
  server-side, a loaded leaf or group row. `undefined` for an id the grid does not hold —
  including a group id from before a regroup, which mints new group nodes. The same node now
  rides in the click and double-click payloads and in the body-menu context.

## 1.7.0 — 2026-10-11


### Row grouping

- **`groupChildCount` decides what a group row shows after its label.** `true` (the default) is the
  row count as before, `false` shows no count on any group, and a function decides per group — a
  number, a string such as `12.5 FTE`, or `null` for no count — from the group node, the default
  count, the group's aggregates by colId, and (server-side row model) the raw group row. One
  resolver feeds the group cells, the sticky group rows, the clipboard, and the CSV and Excel
  exports, so they always agree; the groupRows-mode export no longer writes `(0)` for a group
  whose count is unknown. Live in both wrappers and through `updateGridOptions`. New types:
  `GroupChildCountParams`, `GroupChildCountGetter`.

## 1.6.0 — 2026-10-10


### Set filter

- **The tree layout's mini filter finds a leaf by its formatted value.** A leaf matches on the text
  the flat layout would have shown it with — a date as the column prints it, `2026-01-12` by
  default (`formatterOptions.format`, or `filterParams.valueFormatter` for the filter alone) —
  beside its own segment label and its ancestors' labels, so typing a date narrows the tree to the
  day although the row only reads "12". Because that text is not on screen, the box's default
  placeholder shows an example from the first value ("Type to filter values, e.g. 2026-01-12").
  `filterParams.miniFilterPlaceholder` replaces the placeholder, which is also the box's accessible
  name, in either layout.

## 1.5.0 — 2026-10-09


### Set filter tree layout

- **`filter: "tree"` lays a set filter's values out as a collapsible tree.** A date column groups
  its values by year and month with the day as the leaf, on its own; any other column groups along
  the path `filterParams.treePathGetter` returns for each value (`["Hardware", "Laptops", "Pro
  14"]` lists the laptop under Hardware › Laptops), with `treePathFormatter` naming each segment.
  Checking a group checks every leaf beneath it and a partly checked group shows as mixed, with
  value counts summed per group. The mini filter matches a row by its own label or an ancestor's,
  so typing a year keeps the whole year, and holds every matching group open for as long as it is
  typed. Siblings sort by segment or label when the values come from the rows; a static or async
  `filterValues` list keeps the order it was given, siblings in the order their values are listed,
  as in the flat layout. `treeDefaultExpanded` sets how many levels start open (0, the default,
  none; -1 all).
  Groups are never stored: the filter model holds leaf values exactly as before, so saved filter
  state, the Set Filter API, and a server-side data source see no change. The Select All row is
  the root: its chevron shows whether every group is open, none is, or only some are (a dash, like
  the indeterminate checkbox beside it), and opens every group when any is closed or closes them
  all once all are open. The dash is the new `group-mixed` icon, overridable like the others.
  Every row's checkbox state is computed in one pass per repaint, in both layouts, instead of one
  rescan of the list and the stored values per row. `filterParams.groupComponent` replaces a group
  row's label the way `valueComponent` does for a value (label, summed count, level, path, segment,
  and whether the group is open, refreshed on toggle), with React and Angular components accepted
  by the wrappers like the other set-filter components.
- **Groups by path from the API.** `api.getSetFilterTree(colId)` returns the value tree as the menu
  shows it — groups with children, leaves with their value, each with label, count, and checked
  state (`"mixed"` for a partly checked group) — and `api.checkSetFilterPath` /
  `api.uncheckSetFilterPath` show or hide every leaf under a group (or one leaf by its full path):
  `uncheckSetFilterPath("opened", [2024, 1])` hides January 2024. The filter model stays leaf-only,
  so saved state and the server-side contract are unchanged; off a tree column they warn and no-op.
- **`filterParams.comparator` orders a set filter's values.** It sees each side's raw value and
  label (and in the tree layout the segment, level, and path, ordering the siblings at every
  level), replaces the built-in label order for the universe read from the rows, never receives a
  blank, and is honoured by `getSetFilterValues`. Static and async value lists keep the order they
  were given.
- **The tree remembers what was opened.** A tree-layout filter reopens with the groups the user
  opened or closed last time, for as long as the grid lives and through filter changes; a group
  not seen before starts at `treeDefaultExpanded`. `treeRememberExpansion: false` reopens at the
  default depth every time. Keyboard: Right
  opens a group or steps into it, Left closes it or moves to its parent (on Select All, every
  group), Home and End jump to the first and last row (in the flat list too, where Left and Right
  keep doing that); the list is exposed as a tree of treeitems carrying level, expanded, and
  checked state.
- **The tree reads as a tree to assistive technology.** Select All is the root and every other row
  sits beneath it, each `treeitem` carrying its level, its position among the siblings in view
  (`aria-posinset` / `aria-setsize`), its checked state, and, for a group, whether it is open; the
  native checkbox inside a tree row is hidden from AT, since the row itself is the checkable item
  (exposed, its label was folded into the row's name — "Fruit Fruit 3" — and it read as a second
  checked control in every row). Left on a row at the top of the tree now moves to Select All, its
  parent. A value count in either layout reads as "3 rows" rather than a bare number.

### Set filter

- **A static `filterValues` list takes the values themselves.** `["Open", "Pending", "Closed"]`
  now lists those three values, as the rows and an async source's `success` already did; before,
  a static list had to wrap each entry as `{ value }`, and a list of bare values silently read as
  a single `(Blanks)` row. The wrapped form still works: a plain object literal with a `value` key
  is unwrapped, so a column whose cell objects have their own `value` field lists them wrapped.
- **The flat set filter focuses its checkboxes.** Keyboard focus in the value list now lands on
  each row's native checkbox — a named, checkable control — rather than on the label around it,
  which assistive technology read as nothing. The list is a labelled group, a value count is the
  checkbox's description ("3 rows"), and the arrow keys work right after a mouse click, which used
  to leave focus on the checkbox where the list's keys did not see it. Space toggles the checkbox
  natively; Enter still toggles the row.
- **Set filters match `Date` cells by instant and objects by content.** Without a `keyCreator`,
  the row filter compared raw cells by reference, so a column holding `Date` objects deduped them
  into one menu option but unchecking it hid only the rows holding that exact instance; the same
  applied to object values. The row side now keys values exactly as the menu's universe does: a
  Date by its instant, an object by its content, and a persisted `"5"` finds the numeric 5 the
  rows hold. Text still folds case unless `caseSensitive`, and blanks remain one bucket.

## 1.4.0 — 2026-10-04

### Fill handle

- **The cell selection grows a spreadsheet fill handle.** A small square on the bottom-right
  corner of the selection drags to copy the selected cells into the rows below or above, or the
  columns to the right or left — one direction per drag, the one the pointer travels further
  along. While dragging, the cells about to be written show a dashed outline; releasing writes
  them as one undoable step and extends the selection over the result, with the active cell
  still on a cell the user chose. Non-editable cells, group rows, and rows not yet loaded are
  skipped and keep their place in the pattern.
- **Series, not just copies.** Two or more numbers continue their linear trend (`10, 20` → `30,
  40`; `1, 2, 6` → `8, 10.5, 13`), a lone date steps a day and a run of dates keeps its
  interval (`YYYY-MM-DD` text too, staying text), text ending in a number counts up (`Item 1` →
  `Item 2`; `Item 1, Item 3` → `Item 5`, zero padding kept), weekday and month names cycle in
  order, long or short, in the casing typed (`Nov, Dec` → `Jan`; English names plus the browser
  language's), quarters wrap (`Q4` → `Q1`), application sequences given as `fillHandle: { lists:
  [["Low", "Medium", "High"]] }` cycle the same way (a spreadsheet's custom lists, tried before
  the built-in names and the counter; an entry spelled as listed takes the list's spellings), and
  everything else repeats. Holding Ctrl/Cmd when the drag ends flips the choice: a lone number
  counts up, a series repeats instead. `fillHandle: { mode: "copy" }` turns the series off;
  `direction: "y"` or `"x"` restricts the handle to rows or columns.
- **`Ctrl/Cmd+D` fills down and `Ctrl/Cmd+R` fills right**, copying the selection's first row
  or column across it (a single cell takes the value above or to its left), always as a copy
  and without moving the selection. The body menu offers the same two commands as "Fill down"
  and "Fill right" whenever they would write something, with the chords beside them.
  `api.fillDown()` / `api.fillRight()` run the same fills from outside the grid and return the
  number of cells written; `api.canFillDown()` / `api.canFillRight()` report whether they have
  anything to write, for a toolbar button's enabled state.
- **"Copy cells instead" / "Fill series instead" after a fill.** Right after a drag or
  double-click fill, the body menu on any cell the fill covered offers the other choice, as a
  spreadsheet's Auto Fill Options do: copies where the fill stepped a series, a series where a
  line that could step was copied. Each redo is its own undo step and keeps the selection; the
  offer lasts until another write, or any change to the rows or columns under the fill, retires
  it.
- **Double-click the handle to fill down to the end of the adjacent data.** The column to the
  left of the selection guides the fill (the one to its right when the left is blank in the row
  just below), which runs through the guide's unbroken run of non-blank rows; a group row or a
  row not yet loaded ends it. Copy or series is decided as for a drag, Ctrl/Cmd flipping it.
- **Values move as stored** when the target column shares the source column's `type` — always
  the case filling down or up — so parsers never see them; into a differently typed column the
  value's displayed text goes through that column's `valueParser`, as a paste would.
  `onBeforeCellCommit` runs for every cell, and `cellValueChanged` reports `source: "fill"`
  (`CellValueChangeSource` and `CellCommitSource` gain the member; the `cellsCommit` action
  gains `reason: "fill"`).
- **New option `fillOperation`** for series the grid cannot know. Called once per target cell on
  every fill path with the line's source values, the cell's position in the pattern, the grid's
  own value, the target node and column, and what triggered the fill; return `{ value }` to write
  a value as stored, `{ skipCell: true }` to leave the cell untouched in place, or nothing to keep
  the grid's value. Bridged by both bindings like `onBeforeCellCommit`. New exports
  `FillOperationParams`, `FillOperationResult`, `FillAxis`, `FillLineMode`, `FillTrigger`.
- **New option `fillHandle`** (default `true`, requires `cellSelection: true` and
  `rangeSelection`), live-reconciled in both bindings; new exports `FillHandleOptions`,
  `FillHandleMode`, `FillHandleDirection`. The handle only appears while the selection covers an
  editable column and never on a selection reaching into a pinned band. New theme variable
  `--pte-fill-preview-bg-color`.

### Typed columns parse text by type

- **A column without a `valueParser` now parses text by its `type`** instead of storing it
  verbatim: numbers and currency through `Number()`, dates from ISO 8601 text in the shape the
  cell already holds, booleans from `true`/`false`/`yes`/`no`/`1`/`0`, strings as before; blank
  is `null`. This applies to every write that carries text — an editor committing raw text, paste,
  the fill handle, Delete/Backspace, and a string given to `setCellValue` — so a number column
  can no longer end up holding `"abc"` after a paste, and the fill handle refuses a name dragged
  over numbers.
- **Refused text is a per-cell veto.** Text the type cannot hold is handled exactly like an
  `onBeforeCellCommit` rejection: the cell keeps its value, nothing enters undo history, no
  `cellValueChanged` fires. An editor commit reports `editingChanged` with `state: "rejected"`
  and the refused text as `value`; in a batch the cell is skipped and the rest keeps its
  alignment. A custom `valueParser` may return the exported `REJECT` to refuse the same way.
- **Behaviour changes to know about:** Delete/Backspace on a parser-less number, date, or
  boolean cell now stores `null` rather than `""`; `setCellValue(cell, "42")` on a parser-less
  number column now stores the number `42` rather than the string; and pasting text a column
  cannot parse now leaves the cell untouched instead of writing the text.

## 1.3.0 — 2026-10-01

### Server-side tree data

- **`treeData: { mode: "server" }` brings tree data to the server-side row model.** Each row
  declares whether it has children through `hasChildren`, and a parent's children are requested
  the first time it is expanded, so depth is unbounded and siblings are ragged — a folder and a
  file sit side by side. Rows stay ordinary data rows (selectable, editable, copyable, sortable)
  with the same chevrons, indentation, expansion state, sticky ancestors, and hierarchy keyboard
  mode as the client-side modes. The mode requires `rowModelType: "serverSide"`; a client mode
  under the server-side model, or `"server"` under the client-side one, is dropped with a console
  warning.
- **Requests carry `treeParent`.** A children request names its parent as `{ id, path, data }` —
  `path` the row-id chain from the root down to the parent, `data` the parent row exactly as the
  server returned it; the root listing carries none. `startRow`/`endRow` and `totalRows` are
  relative to that parent's children, with the same open-ended-listing rules per parent, and
  `groupBy`, `groupKeys`, and `aggregates` are empty in tree mode. A sort or filter on the
  hierarchy column arrives under its key: `__pte_tree__`, unless `treeData.columnDef.key` names the
  server field the labels come from.
- **`refreshServerSideData({ rowId })`** reloads one row's subtree — its children listing and
  everything below — soft or purged, beside the existing `groupKeys` scope; the two are mutually
  exclusive. Filtering is the server's, ancestor preservation included.
- **New exports**: `TreeDataServerOptions`, `IServerSideTreeParent`, and `isExpandableNode(node)`,
  the one rule for whether a row opens — a server parent opens through `expandable: true`, with no
  materialized `children` array. Row ids must be unique across the whole tree, not per parent.

### Duplicate row ids on a server tree

- **A children block that breaks the id rule is refused and reported, instead of overflowing the
  stack.** A row repeating one of its own ancestors' ids, one id listed twice in a single response,
  or an empty id rejects the block whole — before any of it enters the store — and reports it
  through the `error` event (`code: "row_model_error"`) with a `ServerSideDataError` as `details`:
  `reason` (`"empty_row_id" | "row_id_repeats_ancestor" | "row_id_repeats_sibling"`), `rowId`,
  `parentId`, `path`, and the offending `row`. `isServerSideDataError(ev.details)` tells it from a
  data source's own `error()`. The parent stays open over an unloaded slot until the server answers
  correctly, and each later fill retries the block, as after a network error. The same id under two
  different parents is accepted — a row that moved between parents mid-refresh looks exactly like
  that — and the store's walks are cycle-safe on their own.
- **New exports**: `ServerSideDataError`, `isServerSideDataError`, `ServerSideDataErrorReason`.

### Fixes

- **`createGrid` with a creation-time `serverSideDataSource` now loads its first block.** The
  core's init announces the viewport and asks the row model for nothing: a server-side grid gets its
  first request from having its data source set, which the bindings did after mount through
  `updateGridOptions` and `createGrid` never did, so a server-side grid built from options alone
  sat empty. `createGrid` now sets the source after the column definitions, and the React and
  Angular bindings skip re-applying a source the grid already bootstrapped from, so the first block
  is requested exactly once.

### Server-side whole-dataset totals

- **A data source's own `getAggregates` now serves the footer's "Entire dataset" scope.** The
  method was declared on `IServerSideDataSource` and shown in the docs, but only the separate
  `serverSideAggregationSource` option ever reached the grid. Both work now; the option wins
  when both exist, and clearing it falls back to the data source's method.
- **An unavailable "Entire dataset" says so.** Without a server aggregation source the
  server-side row model keeps the scope at "Current page". The choice is now greyed out with an
  explanatory tooltip, in the footer control and in its overflow menu alike, instead of a
  disabled control with no reason — and the other scopes stay reachable.
  `paginationControls.aggregateScope` chooses `whenUnavailable: "disabled" | "hidden"` and sets
  `unavailableMessage`.
- **Disabled menu items show their tooltip.** `MenuItem.title` on a disabled item — the documented
  way to say why it is disabled — never surfaced, because the stylesheet took disabled items out of
  hit-testing. Every menu benefits, the footer's overflow menu included.

### Server-side export

- **A grouped server-side grid exports again.** Every root was a group row without a `children`
  array, so the exporter found no leaves and silently produced nothing. The server-side row model
  now hands the exporter a snapshot of the displayed tree: the loaded group rows, an expanded group
  followed by the children the grid has fetched, a collapsed one alone — across every page.
- **A server tree export includes expanded descendants.** It wrote the loaded top-level rows only;
  it now writes an expanded parent's fetched children at their depth, and a collapsed parent alone.
- **Server-side aggregate cells are the grid's numbers.** Group subtotals are the server-stamped
  values (they cover rows never fetched), group counts the server's or none, and the footer the
  footer's current-page or whole-dataset total — all written as values rather than formulas, since
  a formula over the exported rows could not reproduce them. This changes the flat server-side
  export's footer too, which was a formula over the exported rows.

## 1.2.0 — 2026-09-07

### Quick-filter find (client-side row model)

- **`quickFilter.behavior: "find"`** turns the quick filter into Excel's Find: no rows
  are filtered, and every cell whose own text contains the search string is highlighted
  in place. The widget gains a match counter and previous/next steppers, with `Enter` /
  `Shift+Enter` walking the matches (wrapping at both ends) while focus stays in the
  search box — the cell cursor and the selection are left alone. `showBehaviorToggle`
  offers the choice to the end user in the options popover, where it is sticky for the
  session; `behavior` alone forces one of the two.
- Matching is scoped to one cell and compared against its *formatted* display value,
  honouring `caseSensitive` and `matchMode`. Matches are counted over the whole
  client-side view — all pages, and rows inside collapsed groups — and `findNext()`
  reveals its match by expanding ancestors and paging to it.

### Quick-filter find: the widget no longer hides its own matches

- **Stepping to a match now moves it out from under the floating widget.** In find mode the
  widget is a control surface the user keeps operating (next/previous, the counter) while
  reading the cells, so a match underneath it was unreachable — unlike a filter, it cannot be
  dismissed to look. The reveal scrolls the match clear where it can, and where no scroll can —
  the first row (already at `scrollTop: 0`), the last column (already at maximum `scrollLeft`),
  a pinned column, or a row docked in a frozen band — the widget flips to the opposite edge for
  as long as the search lasts.
- The flip never rewrites `position.anchor` or the end user's Anchor pick: closing the search,
  emptying the box, or choosing an anchor brings the widget home. It is also held back while the
  pointer is over the widget, so clicking next/previous repeatedly cannot move the button out
  from under the cursor, and it is skipped entirely for a widget hosted in the toolbar, which
  sits outside the data region.

### Quick-filter whole-cell matching

- **New `matchMode: "wholeCell"`** — a cell matches only when its entire text equals the
  search string, so `42` matches neither `142` nor `4.2`. Available in both behaviors: as
  a filter it is the exact lookup a global search otherwise lacks ("the row whose id is
  exactly 42", whichever column holds it), and as a find it highlights only exact cells.
  Both sides are trimmed. It compares the *formatted* value, so a column rendered
  `$1,200.00` must be typed that way — and it cannot express "empty cells", which stays a
  column filter's `isBlank`.
- `matchMode` now applies while finding too, and the widget keeps its Match control in
  both behaviors. `multiTerm` is the only value whose scope differs: filtering lets its
  words land in different cells of a row, finding requires them all in the one cell it
  highlights (so `john smith` finds `Smith, John`).
- Editing `matchMode` or `caseSensitive` while finding no longer re-derives the view,
  clamps the page, clears the selection or fires `filterChanged` — with nothing being
  filtered, the match settings cannot move a row, so they are a search edit.
- `performQuickFilter` now evaluates per cell instead of building one tab-joined string per
  row (equivalent for the existing modes, since whitespace-split terms can never contain
  the tab separator) and bails out of a row on its first hit.
- **Type change**: `QuickFilterMatchMode` gains a third member, which breaks an exhaustive
  `switch` over it.
- **New API**: `getFindState()`, `findNext()`, `findPrevious()`,
  `getQuickFilterBehavior()`, and a `behavior` option on `setQuickFilter`. New event
  `quickFilterFindChanged` (option callback `onQuickFilterFindChanged`, wrapper output
  `quickFilterFindChanged`) reports `{ behavior, available, text, matchCount,
  activeIndex, activeMatch, reason }`. A finding quick filter deliberately does not fire
  `filterChanged` — no rows moved.
- Group rows, the auto-group/tree columns and the utility columns are not find targets
  (their cells are labels, aggregates or controls, not column values). Finding is
  unavailable on the server-side row model and while the pivot layout is displayed;
  `getFindState().available` reports that, and the search falls back to filtering rather
  than going inert.
- New theme variables: `--pte-find-match-bg-color`,
  `--pte-find-match-active-bg-color`, `--pte-find-match-active-border-color`, plus a
  `findMatchColor` theme parameter that derives all three from one color (the match tint at
  35% alpha, the active match at 65%, its outline as given). It reads the color's channels,
  so it takes hex or `rgb()`/`rgba()`; any other form is ignored with a console warning
  instead of a guess, leaving the defaults in place.

### Quick-filter chrome

- The search box is now one box. Its border, focus ring and text cursor belong to the
  field that holds the icon, the input and the clear button, not to the input in the
  middle of it: keyboard focus drew a second, smaller rectangle inside the field's border
  (the generic control focus ring, applied to the input), and only the input's own strip
  answered a click. The field is a `<label>`, so clicking the icon or the padding puts the
  caret in the input.
- The find match counter moved inside that box, right-aligned over the end of the input
  the way a find bar does it (Sheets, Chrome), leaving the chrome beside the field to the
  steppers. It is terser to fit: `3/27` for the active match over the total, `0/27` before
  the first step, `0/0` for no matches — replacing "3 of 27" / "27 matches" / "No matches",
  which a screen reader still hears, from a visually-hidden half of the same live region.
  Narrow toolbar rungs shrink the room it reserves rather than dropping it.
- The field's focus ring is drawn on a pseudo-element rather than as the field's own inset
  shadow, so the counter's background — and the clear button's hover fill — can no longer
  notch a 1px hole in it. An element's inset shadow paints before its descendants.

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
