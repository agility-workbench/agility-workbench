# Changelog

All three packages (`@agility-workbench/grid`, `@agility-workbench/react-grid`,
`@agility-workbench/angular-grid`) are versioned and released together.

## Unreleased

### Set filter tree layout

- **`filter: "tree"` lays a set filter's values out as a collapsible tree.** A date column groups
  its values by year and month with the day as the leaf, on its own; any other column groups along
  the path `filterParams.treePathGetter` returns for each value (`["Hardware", "Laptops", "Pro
  14"]` lists the laptop under Hardware › Laptops), with `treePathFormatter` naming each segment.
  Checking a group checks every leaf beneath it and a partly checked group shows as mixed, with
  value counts summed per group. The mini filter matches a row by its own label or an ancestor's,
  so typing a year keeps the whole year, and holds every matching group open for as long as it is
  typed. `treeDefaultExpanded` sets how many levels start open (0, the default, none; -1 all).
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
