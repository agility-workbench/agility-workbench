# Grid — Technical Architecture & Feature Reference

> **Doc status:** Refreshed 2026-07-28 against branch `mono-repo`. This is now an
> **npm-workspaces monorepo** publishing two packages — `@agility-workbench/grid` (core) and
> `@agility-workbench/react-grid` (React binding). For the repository/packaging/publishing story see
> [`../maintainers/repository.md`](../maintainers/repository.md); this document covers the grid's
> *feature* architecture. Since the previous refresh, a large batch of consumer-facing features
> landed (see §0): **tooltips**, **ActionFrame** (persistent cell frame + form popover), **custom
> header components**, **row/cell spanning** (`colSpan` → Excel merge), **full-width rows**, **sort
> ergonomics** (configurable cycle / multi-sort key / priority indicator / icon visibility / initial
> & column-level sort / custom comparator), **conditional row & cell styling**, **event-callback
> options**, **`defaultColDef`**, **edit-trigger / keyboard-edit controls**, **visual-state options**
> (row/column hover, zebra, active-cell highlight), **cell-selection modes**, **custom filter
> functions**, **quick-filter layout/anchoring options**, and a built-in **column panel**. The suite is now **508 tests across 66
> files**.

## 0. What's new since the last refresh (branch `mono-repo`)

Grouped by area; each maps to a §5 sub-table.

- **Monorepo split** — the single package became `packages/grid` + `packages/react-grid` under an
  npm-workspaces root (`@agility-workbench` scope). Public entry contracts unchanged in spirit; the
  React layer consumes the core only through its published entry. See `repository.md`.
- **Tooltips** (§5.14) — body + header tooltips with `anchored`/`follow` modes, interactive content,
  per-column overrides, custom tooltip components, and a built-in auto-truncation tooltip. On by
  default. Built on a shared `FloatingAnchor` primitive (`renderer/floating/`).
- **ActionFrame** (§5.15) — a persistent, Sheets-comment-style frame on a body cell with a
  client-owned form popover. Grid owns the frame/chrome/positioning/lifecycle; content is a custom
  component. Reuses `FloatingAnchor` in *sticky* mode (conceal-on-scroll-out, re-show on scroll-in).
- **Column panel** (§5.16) — opt-in docked column management with five trigger modes (rail, header,
  column/header menus, footer, toolbar), search, filtered bulk visibility, live visibility and pinning controls,
  grouped hierarchy that follows group-toggle visibility, hierarchy-aware drag/keyboard reordering,
  responsive column-state refresh, layout reset, toolbar exports for the current selection or
  entire table, removable/reorderable active row-group chips, and priority-ordered sort chips.
- **Custom header components** (§5.1) — two scopes: `headerComponent` (content only) and
  `headerCellComponent` (whole cell incl. filter/menu buttons), with a params contract mirroring the
  cell renderer.
- **Row/cell spanning → Excel merge** (§5.1 / §5.9) — `ColDef.colSpan` merges body cells within a
  section; the exporter reproduces the merge as a real Excel merge range.
- **Full-width rows** (§5.2 / §5.10) — `isFullWidthRow` + `fullWidthCellRenderer`; group rows in
  `groupRows` mode are full-width automatically.
- **Sort ergonomics** (§5.4) — configurable `sortingOrder` cycle, `multiSortKey`, `showSortPriority`,
  `sortIconVisibility`, grid-level `initialSort`, per-column `sort`/`sortIndex`, and a custom
  `comparator`.
- **Conditional styling** (§5.10) — `getRowClass`/`getRowStyle` and per-column `cellClass`/`cellStyle`,
  diffed against pooled DOM so recycled rows never leak stale classes.
- **Event-callback options** (§5.13) — `onCellClicked`, `onRowClicked`, `onCellValueChanged`,
  `onSelectionChanged`, `onSortChanged` convenience wrappers over the event bus.
- **`defaultColDef`** (§5.1) — grid-wide ColDef defaults merged under every column (identity fields
  excluded).
- **Edit controls** (§5.6) — `editTrigger` (`doubleClick`/`singleClick`/`none`),
  `suppressKeyboardEdit`, `suppressTypeToEdit`, `moveAfterEdit`, `commitOnBlur`.
- **Visual-state + interaction options** (§5.10 / §5.5) — `rowHover`, `columnHover`, `zebraRows`,
  `highlightActiveCell`, `cellSelection` (`true`/`false`/`"text"`), `rangeSelection`,
  `columnSelection`, `showColumnButtonsOnHover`, `bodyContextMenu` control.
- **Custom filter function** (§5.3) — `ColDef.filter` as a matcher `(val, node, filterValues,
  filterType) => boolean`, plus a clear button on filter inputs.

### Export (carried forward from the previous branch)

- **Hand-rolled `.xlsx` writer** (`src/export/xlsx/`): `zip.ts` (CRC-32 + STORE/DEFLATE via the
  platform `CompressionStream`), `xml.ts` (escaping, A1 refs, Excel date serials), `styleRegistry.ts`
  (index-deduped `styles.xml`), `writeXlsx.ts` (OOXML part assembler). No runtime dependency.
- **Aggregate footer as live formulas**: `SUM/AVERAGE/MEDIAN/MIN/MAX/COUNTA` over the data range,
  with the grid's own computed value cached; static fallback for text MIN/MAX and distinct-count.
- **Row grouping → Excel outline levels**: group-header + per-group `SUBTOTAL(code,…)` rows (codes
  1–11 so nested subtotals never double-count), collapsed groups exported hidden, `summaryBelow=0`.
- **`groupDisplayType`-aware headings**, **selection-aware grouped export**, **cell/col spanning →
  Excel merges**, and **column-header + body-menu export entry points**. See §5.9.

## 1. Overview

**Grid** is a high-performance, virtualized, headless data grid library written in TypeScript. It ships as a plain JS/TS **core** (`packages/grid/src/`) with a **React wrapper** (`packages/react-grid/src/`) for declarative use. The architecture cleanly separates **core state & logic** from **DOM rendering**, with a unidirectional action-dispatch pattern and an event-driven observer model.

- **Core package:** `@agility-workbench/grid` (framework-agnostic; zero runtime dependencies)
- **React binding:** `@agility-workbench/react-grid` (thin `<Grid />`; `react`/`react-dom` peers)
- **Build:** `tsup` (ESM + CJS + d.ts), dev server via `vite`
- **Testing:** `vitest` with `happy-dom` for DOM tests (508 tests / 66 files)
- **Exports:** CSV + Excel (`.xlsx`) via a hand-rolled, zero-dependency OOXML writer (`src/export/xlsx/`); exceljs is only a dev/test verifier

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│            React Layer (packages/react-grid/)        │
│  Grid component, ReactCellRenderer,                 │
│  ReactMenuAdapter, ReactBodyMenuAdapter             │
└───────────────┬─────────────────────────────────────┘
                │ uses
┌───────────────▼─────────────────────────────────────┐
│                   GridRenderer (renderer/)           │
│  DOM construction, scrolling sync, cell painting,   │
│  selection rendering, editing, column interaction,  │
│  overlays, pagination UI, aggregate row, menus      │
└───────────────┬─────────────────────────────────────┘
                │ reads state / dispatches actions
┌───────────────▼─────────────────────────────────────┐
│                    GridCore (core/)                  │
│  Central state, action dispatch, event emission     │
│  Owns: ColumnModel, RowModel, SortModel,            │
│  FilterModel, SelectionModel, HistoryModel          │
└──────┬──────────────────────┬───────────────────────┘
       │ owns                 │ owns
┌──────▼──────┐    ┌──────────▼──────────┐
│ ColumnModel │    │    IRowModel         │
│ (column/)   │    │  ┌────────────────┐ │
│ - Column    │    │  │ClientSideRow   │ │
│ - ColDef    │    │  │Model (csrm/)   │ │
│ - Hierarchy │    │  └────────────────┘ │
│ - Widths    │    │  ┌────────────────┐ │
│ - Pinning   │    │  │ServerSideRow   │ │
│ - Movement  │    │  │Model (ssrm/)   │ │
│ - Grouping  │    │  └────────────────┘ │
└─────────────┘    └─────────────────────┘
```

### Architectural Principles

1. **Headless core + pluggable renderer.** `GridCore` holds all state and logic. `GridRenderer` builds and manages the DOM. They communicate via `GridAction` dispatch (core → state mutation) and `GridEvent` emission (core → renderer notification).

2. **View-index space.** Selection, navigation, and rendering operate in **view-index coordinates** (row = position in filtered/sorted view, colIdx = global leaf-column index). Row identities are stable `GridId` strings; column identities are stable `instanceID` (UUID), `colId`, and `key`.

3. **Sectioned column layout.** Columns are partitioned into **leading** (row numbers), **left-pinned**, **center** (scrollable), and **right-pinned** sections. Each section has independent scroll sync.

4. **Virtual scrolling.** Only visible rows (+ overscan) are DOM-rendered via a row pool. Vertical and horizontal scrolling are synchronized across all sections.

5. **Server-side integration.** The `ServerSideRowModel` delegates filtering, sorting, pagination, and aggregation to a user-provided `IServerSideDataSource`. The grid manages request deduplication, stale-result rejection, and loading overlays.

---

## 3. Directory Structure & Module Map

> Paths below are relative to `packages/grid/src/` unless noted. The React wrapper lives in
> `packages/react-grid/src/` and the demo in `apps/playground/` (both shown at the end).

```
packages/grid/src/
├── index.ts                   Public API barrel export (the ONLY public entry)
├── misc.ts                    Boolean/null utilities (isTrue/isFalse)
│
├── aggregate/                 Aggregation calculation
│   └── calculator.ts          Aggregate functions (count, sum, avg, min, max, median, distinct_count)
│
├── api/                       Public API facade
│   ├── api.ts                 GridAPI class (wraps core.dispatch + clipboard/undo wrappers)
│   └── index.ts
│
├── cellRenderers/             Built-in cell renderers (ICellRenderer)
│   ├── changeFlashRenderer.ts  Flash up/down/neutral on value change (for trading UIs)
│   └── sparklineRenderer.ts   SVG in-cell sparkline (line/bar/area) over a set of source columns
│
├── column/                    Column definitions & model
│   ├── column.ts              Column class — wraps ColDef, runtime state, getValue/formatValue/parseValue, comparator, sortingOrder
│   ├── columnModel.ts         ColumnModel — hierarchy, pinning, visibility, widths, lookups, addColumnDef, getColumnState/applyColumnState, defaultColDef merge
│   ├── columnHierarchy.ts     ColumnHierarchy — builds/rewires parent-child column trees (grouped headers)
│   ├── columnMove.ts          Column reorder logic
│   └── formatters.ts          Type-based value formatters (number, currency, date, boolean)
│
├── core/                      Central state & logic
│   ├── core.ts                GridCore — owns all models, action dispatch, event emission
│   ├── historyModel.ts        Undo/redo stack for cell edits
│   └── selectionModel.ts      Cell range, row, and column selection with navigation
│
├── csrm/                      Client-Side Row Model
│   ├── clientSide.ts          In-memory filter + sort + paginate + group-tree build
│   ├── filter.ts              Client-side filter evaluator (FilterItem → row predicate)
│   └── rowGroup.ts            buildGroupTree / flattenGroupTree — multi-level value grouping (CSRM only)
│
├── events/                    Event system & action types
│   ├── action.ts              Discriminated union of all GridAction types
│   └── events.ts              GridEventMap, event parameter types, GridEventHandler
│
├── export/                    CSV & Excel export
│   ├── export.ts              exportCSV / exportExcel: ExportConfig → CSV text or a SheetModel; header
│   │                          layout, value bundling, aggregate footer, grouped body (outline +
│   │                          SUBTOTAL), flat leaf body, groupDisplayType heading placement
│   └── xlsx/                  Hand-rolled OOXML (.xlsx) writer — zero runtime deps
│       ├── zip.ts             ZIP container: CRC-32 + STORE/DEFLATE (CompressionStream) per entry
│       ├── xml.ts             XML escaping, A1 cell refs, JS Date → Excel serial (1899-12-30 epoch)
│       ├── styleRegistry.ts   Index-deduped numFmts/fonts/alignment → styles.xml
│       └── writeXlsx.ts       SheetModel → OOXML parts (sheetData, cols, merges, panes, outline) → bytes
│
├── filter/                    Filter UI & controller
│   ├── context.ts             Filter context (fromRows value resolution)
│   ├── filterMenuController.ts State machine for a single column's filter panel
│   ├── filterMenuCoordinator.ts Lifecycle: open/close, apply/cancel
│   ├── filterMenuService.ts   ColumnFilterMenuService — builds the per-column FilterPanelSpec from type/params
│   └── types.ts               FilterKind, FilterPanelSpec, SetFilterOption
│
├── interfaces/                Public type contracts
│   ├── aggregate.ts           AggregateType enum, AggregateScope, AggregateModel
│   ├── column.ts              ColDef + DefaultColDef, ColumnType enum, sort/span/tooltip/actionFrame/header/cellClass fields, NON_DEFAULTABLE_COLDEF_KEYS
│   ├── filter.ts              Filter, FilterItem, FilterDef, FilterType enum (17 ops), FilterParams, ComparatorFn
│   ├── gridOptions.ts         GridOptions (public) + InternalGridOptions; tooltip/actionFrame/quickFilter/sort option types + resolvers
│   ├── iBodyMenuAdapter.ts    Body context-menu adapter interface
│   ├── iColumnModel.ts        ColumnModel public interface
│   ├── iFilterRenderer.ts     Filter renderer interface
│   ├── iGridAPI.ts            Public API interface (selection, editing, clipboard, undo)
│   ├── iGridCore.ts           Core interface, GridId, ColId, RowData, GridSnapshot, ColumnState
│   ├── iMenuAdapter.ts        Column menu adapter interface
│   ├── iRowModel.ts           Row model interface, IRowModelRequestParams, RowDataChangeReason
│   ├── iRowModelListener.ts   Callbacks: onRows, onAggregates, onLoadingStart/End, onError
│   ├── iRowNode.ts            IRowNode shape, createRowIdFactory
│   ├── iTextMeasure.ts        Text measurement abstraction (Canvas 2D context)
│   ├── menuItem.ts            MenuItem type for context menus
│   ├── selection.ts           CellRef, CellPos, SelectionRange, SelectionSnapshot, SelectionKind
│   ├── serverSide.ts          IServerSideDataSource, IServerSideRequest/Result, Aggregation interfaces
│   └── sort.ts                SortModel, SortItem, SortDir
│
├── menu/                      Context menu system
│   ├── bodyContext.ts         Body context (right-click on cell/row)
│   ├── bodyMenuCoordinator.ts Coordinates body context menu open/close
│   ├── bodyMenuService.ts     Menu item definitions for body
│   ├── columnMenuService.ts   Menu item definitions for column header
│   ├── context.ts             Column menu context
│   ├── coordinator.ts         MenuCoordinator base class
│   └── index.ts
│
├── renderer/                  DOM rendering engine
│   ├── gridRenderer.ts        GridRenderer — top-level orchestrator (~1100 lines)
│   ├── renderer.ts            CellRenderer: ICellRenderer, CellRendererFn, createRendererRuntime
│   ├── index.ts               Exports: GridRenderer, CanvasMeasurer, initDomRenderer
│   ├── dom.ts                 initDomRenderer factory
│   ├── element.ts             DOM creation helpers (div, etc.)
│   ├── canvasMeasurer.ts      Canvas-based text measurement
│   ├── types.ts               RowPoolDef type
│   ├── rootAttachment.ts      Attach/detach root element to React ref
│   ├── coreEventBinder.ts     Binds GridCore events → renderer callbacks
│   ├── modelChangeHandler.ts  Handles model change events → DOM updates
│   ├── menuRenderer.ts        Menu popup DOM
│   ├── iconRenderer.ts        SVG icon injection via CSS vars
│   ├── columnMenuOpener.ts    Opens column context menu
│   ├── bodyMenuOpener.ts      Opens body context menu
│   ├── filterUpdateHandler.ts Routes filter changes → core → renderer refresh
│   ├── overlay.ts             Overlay base
│   ├── exportRenderer.ts      ExportRenderer — builds ExportConfig from current state; resolves scope,
│   │                          prunes the group tree to the selection, maps a range's column span
│   ├── toolbar/               Top toolbar — export menu, row-group chips, and multi-sort controls
│   ├── serverSideController.ts SSRM data source / aggregation wiring
│   │
│   ├── aggregate/             Aggregate row rendering
│   │   ├── calculator.ts      Format aggregate display values
│   │   ├── modelController.ts Aggregate model state, scope toggling, server request dispatch
│   │   ├── rowBuilder.ts      Build aggregate row DOM cells
│   │   └── wrapper.ts         AggregateRowRenderer — show/hide, cell rendering
│   │
│   ├── body/                  Body (data rows) rendering
│   │   ├── cellRenderer.ts    BodyCellRenderer — renders cell text or custom renderer into DOM
│   │   ├── colSpan.ts         Pure (DOM-free) colSpan resolver (normalizeSpan / resolveColSpan); never crosses a section
│   │   ├── columnHover.ts     Column-hover highlight (opt-in via columnHover); keys off data-col-idx
│   │   ├── dynamicStyle.ts    Apply/diff getRowClass·getRowStyle·cellClass·cellStyle on pooled DOM (no stale-class leak)
│   │   ├── groupCellRenderer.ts Group cell (chevron + indented label + child count)
│   │   ├── poolSizer.ts       Compute pool size based on viewport height + overscan
│   │   ├── rowHover.ts        Row hover CSS class management
│   │   ├── rowPool.ts         RowPoolRenderer — builds/rebuilds the DOM row pool
│   │   ├── viewport.ts        BodyViewportRenderer — viewport spacer sizing, scroll reset
│   │   ├── window.ts          BodyWindowRenderer — sliding window: positions rows, renders cells, colSpan/full-width
│   │   └── wrapper.ts         BodyWrapperElements — DOM skeleton for body sections
│   │
│   ├── floating/              Shared overlay geometry primitive
│   │   └── floatingAnchor.ts  FloatingAnchor — anchored/follow positioning, flip/clamp, sticky conceal-on-scroll (used by tooltip + ActionFrame)
│   │
│   ├── tooltip/               Tooltips (body + header)
│   │   ├── bodyTooltipRenderer.ts Hover/show lifecycle, precedence resolution, auto-truncation tooltip
│   │   └── tooltipComponent.ts   ITooltipComponent contract (fn/class) + isClassTooltipComponent
│   │
│   ├── actionFrame/           Persistent cell frame + form popover
│   │   ├── actionFrameRenderer.ts Open/close lifecycle, sticky anchoring, indicator, event emission
│   │   └── actionFrameComponent.ts IActionFrameComponent contract (fn/class) + isClassActionFrameComponent
│   │
│   ├── quickFilter/           Global search widget
│   │   └── quickFilterWidget.ts  Floating widget: Ctrl/Cmd+F, options popover, anchoring/placement
│   │
│   ├── columnPanel/           Docked column-management sidebar
│   │   └── columnPanelRenderer.ts Search, visibility, pinning, drag/keyboard order, layout reset
│   │
│   ├── clipboard/             Copy/cut/paste
│   │   ├── clipboardRenderer.ts Selection → TSV serialization, paste with tiling
│   │   └── tsv.ts             TSV parse/serialize utilities
│   │
│   ├── editing/               Cell editing
│   │   ├── cellEditRenderer.ts Mount/unmount editors, manage focus
│   │   ├── cellEditor.ts      ICellEditor interface, built-in aliases, SelectCellEditorParams
│   │   ├── resolveEditor.ts   Resolve CellEditor alias/class/fn → editor instance
│   │   └── editors/           Built-in editors: text, number, date, boolean, select, textarea
│   │
│   ├── filter/                Filter panel rendering
│   │   ├── filterRenderer.ts  Filter panel renderer (basic + set)
│   │   ├── basicFilterRenderer.ts Basic (text/number/date) filter UI
│   │   └── setFilterRenderer.ts  Set filter UI (checkboxes, search, select-all)
│   │
│   ├── header/                Column header rendering
│   │   ├── renderer.ts        HeaderRenderer — builds header DOM from ColumnModel; sort/filter indicators, custom-header mounting
│   │   ├── headerComponent.ts IHeaderComponent contract (fn/class), two-level (content vs whole-cell) + isClassHeaderComponent
│   │   ├── wrapper.ts         Header DOM skeleton
│   │   ├── columnInteraction.ts Resize handles, drag-to-reorder
│   │   └── interactionHandler.ts Click/context-menu on headers
│   │
│   ├── interaction/           Global event binding
│   │   └── eventBinder.ts     Mousedown/move/up, keydown, double-click → delegates to subsystems
│   │
│   ├── layout/                Column layout
│   │   ├── columnLayout.ts    Apply column widths to header/body/h-scroll sections
│   │   └── pinnedSectionLayout.ts Pin/unpin section visibility
│   │
│   ├── overlay/               Loading, no-rows & filter overlays
│   │   ├── filter.ts          Filter overlay (not yet used for full-screen)
│   │   ├── loading.ts         Loading overlay (spinner)
│   │   └── noRows.ts          No-rows / empty-state overlay (filter/search-aware message)
│   │
│   ├── pagination/            Pagination UI
│   │   ├── renderer.ts        PaginationRenderer — page controls, page size selector, aggregate scope
│   │   └── wrapper.ts         PaginationWrapperElements
│   │
│   ├── scroll/                Scroll synchronization
│   │   ├── horizontal.ts      Horizontal scroll bar (separate sections: left/center/right)
│   │   └── sync.ts            Scroll sync across all section scrollers, header, aggregate row
│   │
│   └── selection/             Selection visual rendering
│       └── selectionRenderer.ts  Cell/range/row/column selection CSS class application
│
├── ssrm/                      Server-Side Row Model
│   └── serverSide.ts          Async row loading, block management, server aggregation, schema inference
│
├── theme/                     Theme assets
│   ├── table.css              Core grid CSS (~2100 lines)
│   ├── theme.ts               GridTheme API — createTheme / themeLight / themeDark (CSS-var presets)
│   ├── inject.ts              injectGridStyles / areGridStylesInjected (zero-import stylesheet)
│   ├── icons.ts               Icon name union, getIconClassName, icon CSS variable injection
│   ├── *.generated.ts         styles.generated.ts (GRID_STYLES) + cssVars.generated.ts (PteVarName); build artifacts, gitignored
│   └── icons/                 29 SVG icon files (sort asc/desc letters+numbers, filter, aggregate, menu, chevrons, frame ±, etc.)
│
└── selection/                 (deprecated — merged into core/selectionModel.ts)
    └── columnSelection.ts     Column selection logic

packages/react-grid/src/                    React wrapper (@agility-workbench/react-grid)
├── index.ts                   `export * from grid` + Grid, GridProps, ReactCellRenderer/ColDef/TooltipComponent/ActionFrameComponent, ReactCellEditor
├── grid.tsx                   Grid component — lifecycle, prop→core bridging, StrictMode-safe
├── factory.ts                 createCore, createApi, getGridOptions helpers
├── interface.ts               GridProps (extends GridOptions; React-aware defaultColDef / fullWidthCellRenderer / bodyContextMenu)
├── cellRenderer.ts            React adapters: adaptCellRenderer/adaptTooltip/adaptActionFrame/adaptReactColDef; ReactColDef, ReactDefaultColDef
├── cellEditor.ts              ReactCellEditor, ReactCellEditorHandle types
├── menu.ts                    MenuItem type for React
├── BodyMenuAdapter.ts         Adapter: getBodyMenuItems → MenuAdapter interface
└── MenuAdapter.ts             Adapter: getColumnMenuItems → MenuAdapter interface

apps/playground/                          Demo app (Vite-based, not tests)
├── App.tsx                    Full demo: client-side + server-side, themes, trading grid
├── ActionFrameDemo.tsx  TooltipDemo.tsx  HeaderComponentDemo.tsx   feature demos
├── ColumnStateDemo.tsx  SelectionDemo.tsx  GroupingDemo.tsx
├── QuickFilterDemo.tsx  VisualStatesDemo.tsx  helpers.ts
├── index.html / main.tsx / style.css / roboto-font.css
└── dist-demo/

packages/*/dist/                          Build output (per package)
node_modules/
```

---

## 4. Core Data Flow

### 4.1 Action Dispatch Pipeline

```
User interaction (mouse/keyboard)
  → GridInteractionEventBinder captures event
    → Creates GridAction (e.g. { type: "rangeSelectSet", viewIdx, colIdx, mode: "start" })
      → GridCore.dispatch(action)
        → Mutation on SelectionModel / ColumnModel / RowModel
        → GridCore.emit("selectionChanged", { snapshot, reason })
          → GridRendererCoreEventBinder receives event
            → SelectionRenderer.onSelectionChanged() repaints
```

### 4.2 Row Data Refresh Pipeline

```
Core.setRowData(rows)  or  Core.dispatch({ type: "rowDataSet", rows })
  → RowModel.setRows(rows)
  → RowModel.applyRequest({ reason: "refresh", filters, sorts, paginate, range })
    → RowModel applies filters → applies sorts → paginates → rebuilds view
    → RowModel calls listener.onRows(id, { rows, rowCount, visibleStart, visibleEnd })
      → Core.onRows() → emit("rowsChanged", ...)
        → GridModelChangeHandler → BodyWindowRenderer.update()
          → positions row pool, repaints cells
    → RowModel calls listener.onAggregates(...)
      → Core.onAggregates() → emit("aggregateChanged", ...)
        → AggregateRowRenderer.renderCells()
    → RowModel calls listener.onLoadingEnd(id)
      → Core.onLoadingEnd() → emit("overlayShow", { overlayType: "none" })
```

### 4.3 Incremental Transaction Pipeline (streaming)

```
api.applyTransaction({ add?, update?, remove? })
  → dispatch({ type: "rowTransactionApply", add, update, remove })
  → GridCore.applyTransaction(tx)     (clientSide only; SSRM warns + no-ops)
    → RowModel.applyTransaction(tx) → { added, updated, removed }
        remove: delete nodes by id · update: replace node.data IN PLACE (identity preserved)
        add: append new nodes (id collision → treated as update)
    → structural change (add/remove)?  OR  reevaluateOnEdit set?
        YES → applyRequest({ reason: "transaction" }) re-derives filter→sort→view
              → emit("rowsChanged", { reason: "transaction" }) + paginationChanged
        NO  → emit("cellsChanged", { reason: "data", rowIds, colIds })   (repaint in place)
              → renderer refresh() diffs value → ChangeFlashCellRenderer flashes the delta
```

Unlike `setRowData` (which clears undo/redo history and does a full refresh), a transaction preserves
edit history — undo/redo entries reference rows by id and stay valid for rows that still exist.
Preserving node identity on `update` is what lets delta-aware renderers (change-flash, sparklines)
detect changes. Pure updates keep row positions unless `reevaluateOnEdit` is set; add/remove always
reflow the view. See `apps/playground/App.tsx` → `TradingGrid` for a live streaming example.

### 4.4 Server-Side Flow

```
User changes filter/sort/page
  → Core creates IRowModelRequestParams with loadRange (block-aligned)
  → ServerSideRowModel.requestRows(params)
    → listener.onLoadingStart(id) → loading overlay shown
    → serverDataSource.getRows({ request: { filters, sorts, startRow, endRow }, success, error })
    → On success: setRows(rows, totalRows, startRow)
    → listener.onRows(id, ...) → emit("rowsChanged")
    → listener.onAggregates(id, ...) (page-scoped, calculated locally or via server)
    → listener.onLoadingEnd(id) → loading overlay hidden
```

Request deduplication: each request gets a monotonic `requestGeneration`. When a newer request supersedes an older one, the old result is silently dropped (`if (requestGeneration !== this.requestGeneration) return false`).

---

## 5. Feature Inventory

### 5.1 Column Features

| Feature | Status | Location |
|---------|--------|----------|
| Column definitions (ColDef) | ✅ Complete | `interfaces/column.ts`, `column/column.ts` |
| Multi-level column groups (hierarchy) | ✅ Complete | `column/columnModel.ts`, `column/columnHierarchy.ts` |
| Column pinning (left/right/center) | ✅ Complete | `column/columnModel.ts` → `setPinned/setPinneds` |
| Column visibility toggle (hide/show) | ✅ Complete | `column/columnModel.ts` → `toggleVisibility` |
| Column reorder (drag-to-move) | ✅ Complete | `column/columnMove.ts`, `renderer/header/columnInteraction.ts` |
| Column resize (drag handle) | ✅ Complete | `renderer/header/columnInteraction.ts` |
| Auto-size columns (fit to content) | ✅ Complete | `column/columnModel.ts` → `computeColumnWidths`, `autosizeColumn` |
| Column group expand/collapse | ✅ Complete | `column/columnModel.ts` → `toggleGroupExpansion` |
| Row number column (optional, leading) | ✅ Complete | Built-in via `rowNumbers` option |
| Column type system (string/number/date/boolean/currency) | ✅ Complete | `interfaces/column.ts` → `ColumnType` enum |
| Value getter/formatter/parser | ✅ Complete | `column/formatters.ts`, `column/column.ts` |
| Add transient column at runtime (`addColumnDef`) | ✅ Complete | `column/columnModel.ts` → `addColumnDef` (used for on-demand sparkline columns) |
| Read column state (`getColumnState`) | ✅ Complete | `column/columnModel.ts` → `getColumnState` (includes hidden columns) |
| Restore column state (`applyColumnState`) | ✅ Complete | `column/columnModel.ts` → `applyColumnState`; merge by default, `{ defaultState }` for exact restore; order-field-driven repositioning |
| Grid-wide column defaults (`defaultColDef`) | ✅ Complete | `interfaces/gridOptions.ts` → `DefaultColDef`; `column/columnModel.ts` shallow merge under each column (precedence: column › defaultColDef › built-in; `NON_DEFAULTABLE_COLDEF_KEYS` excluded) |
| Custom header component (`headerComponent`, content-only) | ✅ Complete | `renderer/header/headerComponent.ts` (level 1); grid keeps resize handle + filter/menu row |
| Custom header cell component (`headerCellComponent`, whole cell) | ✅ Complete | `renderer/header/headerComponent.ts` (level 2, takes precedence); grid keeps only the resize handle |
| Cell spanning (`colSpan`) | ✅ Complete | `renderer/body/colSpan.ts` + `renderer/body/window.ts`; clamped to the column's own section (never crosses a pinned boundary) |
| Conditional cell class / style (`cellClass` / `cellStyle`) | ✅ Complete | `interfaces/column.ts` → `CellClass`/`CellStyle`; applied/diffed via `renderer/body/dynamicStyle.ts` |

### 5.2 Row Model Features

| Feature | Status | Location |
|---------|--------|----------|
| Client-side row model (CSRM) | ✅ Complete | `csrm/clientSide.ts` |
| Server-side row model (SSRM) | ✅ Complete | `ssrm/serverSide.ts` |
| Client-side filtering | ✅ Complete | `csrm/filter.ts` |
| Client-side sorting (multi-column) | ✅ Complete | `csrm/clientSide.ts` → `setSorts` |
| Client-side pagination | ✅ Complete | `csrm/clientSide.ts` → `setPagination` |
| Server-side filtering/sorting/pagination | ✅ Complete | Delegated to `serverDataSource.getRows()` |
| Server-side block loading | ✅ Complete | `ssrm/serverSide.ts` → block-aligned `loadRange` |
| Server-side schema inference | ✅ Complete | Columns returned in `IServerSideResult.columns` auto-applied |
| Schema signature dedup | ✅ Complete | `GridCore.createSchemaSignature()` — avoids redundant column rebuilds |
| Row ID factory (getRowId / rowIdKey / WeakMap fallback) | ✅ Complete | `interfaces/iRowNode.ts` |
| Incremental transactions (add / update / remove) | ✅ Complete | `GridCore.applyTransaction()` → `csrm/clientSide.ts` → `applyTransaction` (CSRM only; SSRM no-op) |
| Row grouping (multi-level, value buckets) | ✅ Complete (CSRM only) | `csrm/rowGroup.ts` → `buildGroupTree` / `flattenGroupTree`; `renderer/body/groupCellRenderer.ts` |
| Group display types (singleColumn / multipleColumns / groupRows) | ✅ Complete | `groupDisplayType` option; `column/columnModel.ts` group-column synthesis |
| Per-group aggregation | ✅ Complete | `csrm/clientSide.ts` computes over each group's leaf descendants via `AggregateCalculator` |
| Group default-expanded depth + stable expansion across refresh | ✅ Complete | `groupDefaultExpanded` option; content-based `groupNodeId` |
| Full-width rows (span all sections, pinned left of viewport) | ✅ Complete (CSRM) | `isFullWidthRow` + `fullWidthCellRenderer` options; `renderer/body/window.ts`; `groupRows` group rows are auto full-width |
| **Tree data (parent-child hierarchy from data)** | ❌ Missing | Distinct from value grouping — see §10 |
| **Server-side grouping** | ❌ Missing | SSRM `getGroupNodes` returns `[]` — see §10 |

### 5.3 Filter Features

| Feature | Status | Location |
|---------|--------|----------|
| Filter model (per-column, multi-condition) | ✅ Complete | `interfaces/filter.ts` → `FilterModel`, `FilterItem`, `FilterDef` |
| Filter types: contains, notContains, eq, neq, lt, gt, etc. | ✅ Complete | `FilterType` enum (17 operators) |
| Text/number/date filter UI | ✅ Complete | `renderer/filter/basicFilterRenderer.ts` |
| Set filter (checkbox list) | ✅ Complete | `renderer/filter/setFilterRenderer.ts` |
| Set filter value sources: static, fromRows, async | ✅ Complete | `filter/types.ts` → `FilterValueSource` |
| AND/OR join between conditions | ✅ Complete | `FilterItem.join` |
| Filter panel (column menu integration) | ✅ Complete | `filter/filterMenuController.ts`, `filter/filterMenuCoordinator.ts` |
| Filter indicators on headers | ✅ Complete | `renderer/header/renderer.ts` → `setFilterIndicators` |
| debounceMs, maxFilterItems, button customization | ✅ Complete | `FilterParams`; grid-wide default via `filterDebounceMs` option |
| Custom filter function (`ColDef.filter` as matcher) | ✅ Complete | `(val, node, filterValues, filterType) => boolean` bypasses the operator switch; `csrm/customFilter.test.ts` |
| Clear button on filter inputs | ✅ Complete | `renderer/filter/basicFilterRenderer.ts` |

### 5.4 Sort Features

| Feature | Status | Location |
|---------|--------|----------|
| Multi-column sort | ✅ Complete | `interfaces/sort.ts` → `SortModel` |
| Toolbar sort management | ✅ Complete | ordered chips with trailing-area picker/header drop, direction toggle, removal, right-edge clear-all, keyboard/drag priority reordering; `renderer/toolbar/` |
| Configurable sort cycle (`sortingOrder`) | ✅ Complete | `interfaces/sort.ts` → `nextSortDir` / `DEFAULT_SORTING_ORDER`; grid-level + per-column + `defaultColDef` |
| Toggle sort (advances the configured cycle) | ✅ Complete | `GridCore.toggleSort()` / `progressSort` |
| Multi-sort modifier key (`multiSortKey`: ctrl/shift) | ✅ Complete | additive sort on modified icon click; default "ctrl" |
| Sort priority indicator (`showSortPriority`: multi/always/never) | ✅ Complete | number badge on the sort icon; `renderer/header/renderer.ts` |
| Sort icon visibility (`sortIconVisibility`: hover/always/never) | ✅ Complete | grid-level + per-column; "never" keeps the column sortable via menu/Shift+click/API |
| Grid-level initial sort (`initialSort`) | ✅ Complete | ordered `{colId,dir}`; per-column `sort`/`sortIndex` take precedence; CSRM |
| Per-column initial sort (`sort` + `sortIndex`) | ✅ Complete | `interfaces/column.ts`; applied once at column setup |
| Sort indicators on headers | ✅ Complete | `renderer/header/renderer.ts` |
| Type-aware comparator auto-detection | ✅ Complete | `column/columnModel.ts` → `identifyComparator` |
| Numeric vs. string comparators with Intl.Collator | ✅ Complete | `column/column.ts` → `getCollator`, `setComparator` |
| Custom column comparator (`ColDef.comparator`) | ✅ Complete | `(a, b, nodeA, nodeB) => number`; `column/column.ts` |

### 5.5 Selection & Navigation Features

| Feature | Status | Location |
|---------|--------|----------|
| Cell range selection (click + drag, Shift+click) | ✅ Complete | `core/selectionModel.ts` |
| Row selection (click on row number / Ctrl+click / Shift+range) | ✅ Complete | `core/selectionModel.ts` → `toggleRow`; opt-in via `rowSelection` (default false) |
| Select-all rows on row-number header click | ✅ Complete | `core/selectionModel.ts` → `selectAllRows` / `areAllRowsSelected`; opt-in via `selectAllRowsOnHeaderClick` (default false) |
| Row selection API (`getSelectedRows` / `getSelectedNodes` / `selectAllRows` / `deselectAllRows`) | ✅ Complete | `api/api.ts`, `core/core.ts` |
| Column selection (click on header) | ✅ Complete | `core/selectionModel.ts` → `toggleColumn` |
| Keyboard navigation (arrows, Home/End, PageUp/Down) | ✅ Complete | `core/selectionModel.ts` → `navigate` |
| Ctrl+Arrow block jump (Excel-style data region) | ✅ Complete | `core/selectionModel.ts` → `blockJump` |
| Ctrl+Home/End corner jump | ✅ Complete | `core/selectionModel.ts` → `navigateToCorner` |
| Ctrl+A select all | ✅ Complete | `core/selectionModel.ts` → `selectAll` |
| Shift+click extend range | ✅ Complete | `core/selectionModel.ts` → `updateRange` |
| Selection clamp to view bounds | ✅ Complete | `clampToView()` |
| Selection invalidated on page change | ✅ Complete | Range stores `pageStartIdx`; getter checks it |
| Selection visual rendering | ✅ Complete | `renderer/selection/selectionRenderer.ts` |
| Scroll-into-view for focused cell | ✅ Complete | `GridRenderer._ensureCellVisible()` |
| Cell-selection mode (`cellSelection`: true / false / "text") | ✅ Complete | `"text"` reverts to native browser text selection; `false` makes cells inert |
| Range selection toggle (`rangeSelection`) | ✅ Complete | when false, selection stays a single cell (drag / Shift-extend ignored) |
| Column-selection toggle (`columnSelection`) | ✅ Complete | when false, header clicks no longer select (sort/menu/filter unaffected) |
| Clear selection on body click (`clearSelectionOnBodyClick`) | ✅ Complete | default true |
| Active-cell highlight (`highlightActiveCell`) | ✅ Complete | distinct outline on the focused cell within a range |

### 5.6 Editing Features

| Feature | Status | Location |
|---------|--------|----------|
| Inline cell editing (double-click / F2 / Enter) | ✅ Complete | `renderer/editing/cellEditRenderer.ts` |
| Built-in editors: text, number, date, boolean, select, textarea | ✅ Complete | `renderer/editing/editors/` |
| Custom cell editor (class or factory function) | ✅ Complete | `renderer/editing/cellEditor.ts` → `CellEditorClass`, `ICellEditorFn` |
| Edit-on-typing (printable char opens editor) | ✅ Complete | `charPress` in `editStart` action |
| Edit trigger control (`editTrigger`: doubleClick / singleClick / none) | ✅ Complete | mouse gesture that opens the editor |
| Keyboard-edit suppression (`suppressKeyboardEdit` / `suppressTypeToEdit`) | ✅ Complete | disable F2·Enter and/or type-to-edit |
| Move after edit (`moveAfterEdit`) | ✅ Complete | Enter/Tab commit-and-navigate; default true (textarea keeps Enter) |
| Commit on blur (`commitOnBlur`) | ✅ Complete | default true; false keeps the editor open until explicit commit/cancel |
| Undo limit (`undoLimit`) | ✅ Complete | default 100; 0 disables undo/redo |
| Undo/redo (per-cell and batch paste/cut/clear) | ✅ Complete | `core/historyModel.ts` |
| Re-evaluate sort/filter after edit | ✅ Complete | `GridCore.reevaluateAfterEdit()` (gated by `reevaluateOnEdit` option) |
| Multi-cell paste/clear | ✅ Complete | `renderer/clipboard/clipboardRenderer.ts` |
| Paste tiling (fill selection when block divides evenly) | ✅ Complete | `clipboardRenderer.paste()` |
| Value parser on commit | ✅ Complete | `column/column.ts` → `parseValue` |

### 5.7 Clipboard Features

| Feature | Status | Location |
|---------|--------|----------|
| Copy selection as TSV | ✅ Complete | `renderer/clipboard/clipboardRenderer.ts` |
| Cut (copy + clear) | ✅ Complete | `renderer/clipboard/clipboardRenderer.ts` |
| Paste (TSV → cells with tiling) | ✅ Complete | `renderer/clipboard/clipboardRenderer.ts` |
| Delete/Backspace clear contents | ✅ Complete | `renderer/clipboard/clipboardRenderer.ts` → `clearContents` |
| TSV parse/serialize | ✅ Complete | `renderer/clipboard/tsv.ts` |

### 5.8 Aggregation Features

| Feature | Status | Location |
|---------|--------|----------|
| Aggregate functions: count, distinct_count, sum, avg, min, max, median | ✅ Complete | `aggregate/calculator.ts` |
| Aggregate scope: none / page / all | ✅ Complete | `interfaces/aggregate.ts` |
| Aggregate row (bottom of grid) | ✅ Complete | `renderer/aggregate/wrapper.ts`, `rowBuilder.ts`; function icons open the shared type-aware aggregation menu |
| Column menu aggregate selection | ✅ Complete | `renderer/aggregate/modelController.ts` |
| Server-side aggregation (delegated to data source) | ✅ Complete | `ssrm/serverSide.ts` → `requestServerAggregates` |
| Client-side aggregation fallback | ✅ Complete | `aggregate/calculator.ts` + `csrm/clientSide.ts` |

### 5.9 Export Features

| Feature | Status | Location |
|---------|--------|----------|
| CSV export (scope: all/selection/selectedColumns) | ✅ Complete | `export/export.ts` → `exportCSV` |
| Excel export — hand-rolled OOXML, **zero runtime deps** | ✅ Complete | `export/export.ts` → `exportExcel` + `export/xlsx/` |
| DEFLATE compression (CompressionStream, STORE fallback) | ✅ Complete | `export/xlsx/zip.ts` |
| Hierarchical merged headers in export | ✅ Complete | `buildHeaderLayout` / `buildHeaderMatrix` |
| Cell spanning → Excel merge ranges | ✅ Complete | `export/export.ts` resolves each body row's `colSpan` (via `resolveColSpan`) into `MergeRange`s |
| Full-width rows → single merged cell | ✅ Complete | `export/export.ts`; a full-width row exports as one value merged across the first columns |
| Frozen panes in Excel (pinned cols + header) | ✅ Complete | `writeXlsx.ts` → `<pane>` xSplit/ySplit |
| Currency/date/number formatting in Excel | ✅ Complete | `resolveNumberFormat`, `toCellValue`, `styleRegistry` |
| Aggregate footer as **live formulas** (SUM/AVG/MEDIAN/MIN/MAX/COUNTA) | ✅ Complete | `export.ts` → `buildAggregateFooter` / `aggregateCell` |
| Row grouping → **Excel outline levels + per-group SUBTOTAL** | ✅ Complete | `export.ts` → `buildGroupedBody`; `writeXlsx.ts` `RowMeta`/`<outlinePr>` |
| SUBTOTAL codes 1–11 (nested subtotals don't double-count) | ✅ Complete | `export.ts` → `subtotalCode` |
| `groupDisplayType`-aware heading placement | ✅ Complete | `export.ts` → `buildGroupedBody` label column per mode |
| Selection-aware grouped export (prune tree by row/range selection) | ✅ Complete | `renderer/exportRenderer.ts` → `buildGroupedExportConfig` / `pruneGroupTree` |
| Flat "leaf rows" grouped export (with full group path) | ✅ Complete | `export.ts` → `buildFlatLeafBody`; `groupMode: "leaves"` |
| Range column-span honored in grouped export | ✅ Complete | `exportRenderer.ts` → `resolveGroupedSelection` |
| Body context-menu export (single item, or grouped submenu) | ✅ Complete | `menu/bodyMenuService.ts` → `buildExcelExportItem` |
| Column-header menu export (CSV/Excel) | ✅ Complete | `menu/columnMenuService.ts` + `MenuCoordinator.setExportTarget` |

**Notes.** The Excel path is Excel-valid OOXML verified by round-tripping through exceljs in tests
(`src/export/export.excel.test.ts`, `src/renderer/exportRenderer.grouped.test.ts`,
`exportRenderer.range.test.ts`, `menu/bodyMenuService.grouped.test.ts`,
`menu/columnMenuService.export.test.ts`). Ops without an Excel-function equivalent (text MIN/MAX,
distinct-count, MEDIAN in a SUBTOTAL context) fall back to the grid's precomputed static value.
A grouped grid always drives export from the group tree; a plain cell-range export slices rows +
columns once, in `resolveRows`/`resolveColumns`.

### 5.10 Rendering Features

| Feature | Status | Location |
|---------|--------|----------|
| Virtual scrolling (row pool + sliding window) | ✅ Complete | `renderer/body/window.ts`, `rowPool.ts` |
| Overscan rows | ✅ Complete | `poolSizer.ts` |
| Sectioned layout (leading/left/center/right) | ✅ Complete | `renderer/layout/columnLayout.ts` |
| Synchronized multi-section scrolling | ✅ Complete | `renderer/scroll/sync.ts` |
| Custom cell renderers (function or class) | ✅ Complete | `renderer/renderer.ts` → `CellRendererFn`, `ICellRenderer` |
| React cell renderers (JSX elements) | ✅ Complete | `packages/react-grid/src/cellRenderer.ts` |
| Change flash cell renderer | ✅ Complete | `cellRenderers/changeFlashRenderer.ts` |
| Sparkline cell renderer (line/bar/area, SVG) | ✅ Complete | `cellRenderers/sparklineRenderer.ts` |
| Group cell renderer (chevron + indented label + child count) | ✅ Complete | `renderer/body/groupCellRenderer.ts` |
| Full-width row rendering | ✅ Complete | `renderer/body/window.ts` (spans all sections, pinned left of viewport) |
| Conditional row class / style (`getRowClass` / `getRowStyle`) | ✅ Complete | `renderer/body/dynamicStyle.ts` (diffed against pooled DOM) |
| Row hover highlighting (`rowHover`) | ✅ Complete | `renderer/body/rowHover.ts`; default on |
| Column hover highlighting (`columnHover`) | ✅ Complete | `renderer/body/columnHover.ts`; opt-in |
| Zebra striping (`zebraRows`) | ✅ Complete | `--pte-row-alt-bg-color`; opt-in |
| Loading overlay | ✅ Complete | `renderer/overlay/loading.ts` |
| No-rows / empty-state overlay | ✅ Complete | `renderer/overlay/noRows.ts`; filter/search-aware message |
| Theme system (CSS custom properties + icon overrides) | ✅ Complete | `theme/table.css`, `theme/theme.ts` (`createTheme`/`themeLight`/`themeDark`), `theme/icons.ts` |
| Zero-import stylesheet injection | ✅ Complete | `theme/inject.ts` → `injectGridStyles()` |
| Canvas-based text measurement for auto-sizing | ✅ Complete | `renderer/canvasMeasurer.ts` |

### 5.11 Pagination Features

| Feature | Status | Location |
|---------|--------|----------|
| Client-side pagination | ✅ Complete | `csrm/clientSide.ts` |
| Server-side pagination | ✅ Complete | `ssrm/serverSide.ts` |
| Pagination controls UI | ✅ Complete | `renderer/pagination/renderer.ts` |
| Configurable page sizes | ✅ Complete | `pageSizes` option |
| Page index, total pages, row count display | ✅ Complete | `GridEventPaginationChangedParams` |

### 5.12 Menu Features

| Feature | Status | Location |
|---------|--------|----------|
| Column header context menu | ✅ Complete | `menu/columnMenuService.ts`, `renderer/columnMenuOpener.ts` |
| Body context menu (right-click on cell/row) | ✅ Complete | `menu/bodyMenuService.ts`, `renderer/bodyMenuOpener.ts` |
| React-customizable menu items | ✅ Complete | `packages/react-grid/src/MenuAdapter.ts`, `BodyMenuAdapter.ts` |
| Filter menu (per-column filter panel) | ✅ Complete | `filter/filterMenuCoordinator.ts` |

### 5.13 React Wrapper Features

| Feature | Status | Location |
|---------|--------|----------|
| Grid component (forwardRef to API) | ✅ Complete | `packages/react-grid/src/grid.tsx` |
| Declarative props (data, columnDefs, loading, pagination, etc.) | ✅ Complete | `packages/react-grid/src/interface.ts` |
| React cell renderers | ✅ Complete | `packages/react-grid/src/cellRenderer.ts` → `adaptCellRenderer` |
| React tooltip / ActionFrame / header components | ✅ Complete | `cellRenderer.ts` → `adaptTooltip` / `adaptActionFrame`; `ReactColDef` accepts React components |
| React cell editors | ✅ Complete | `packages/react-grid/src/cellEditor.ts` |
| React-aware `defaultColDef` | ✅ Complete | `interface.ts` → `ReactDefaultColDef`; `cellRenderer.ts` → `adaptReactDefaultColDef` |
| onGridReady callback | ✅ Complete | `packages/react-grid/src/grid.tsx` |
| Event-callback props (`onCellClicked` / `onRowClicked` / `onCellValueChanged` / `onSelectionChanged` / `onSortChanged`) | ✅ Complete | `interfaces/gridOptions.ts` (convenience wrappers over the event bus) |
| Menu customization hooks | ✅ Complete | `getColumnMenuItems`, `getBodyMenuItems` |
| StrictMode-safe mount/unmount | ✅ Complete | `packages/react-grid/src/grid.tsx` (`lifecycle.strictmode.test.tsx`) |
| Icon overrides | ✅ Complete | `icons` prop |

### 5.14 Tooltip Features

| Feature | Status | Location |
|---------|--------|----------|
| Body cell tooltips | ✅ Complete | `renderer/tooltip/bodyTooltipRenderer.ts`; on by default (`tooltip` option) |
| Header cell tooltips (`headerTooltip`) | ✅ Complete | string or custom component; `renderer/header/renderer.ts` + tooltip renderer |
| Content precedence: component → valueGetter → field → auto-truncation | ✅ Complete | `tooltipComponent` › `tooltipValueGetter` › `tooltipField` › built-in clipped-value tooltip |
| Positioning modes: `anchored` / `follow` | ✅ Complete | `interfaces/gridOptions.ts` → `TooltipMode`; `renderer/floating/floatingAnchor.ts` |
| Interactive tooltips (pointer enters content) | ✅ Complete | forces `anchored`; `TooltipOptions.interactive` |
| Placement (`top`/`bottom`/`left`/`right`/`auto`) + delays | ✅ Complete | `showDelay`/`hideDelay`; `escapeRootClip` mounts in `document.body` |
| Per-column tooltip overrides (`tooltipOptions`) | ✅ Complete | `resolveColumnTooltipOptions` layers over grid-level config |
| Custom tooltip component (fn or class) | ✅ Complete | `renderer/tooltip/tooltipComponent.ts` → `ITooltipComponent` |
| Auto-truncation opt-out (`suppressAutoTooltip`) | ✅ Complete | grid-level and per-column |
| API (`showTooltip` / `hideTooltip`) + events (`tooltipShow` / `tooltipHide`) | ✅ Complete | `api/api.ts`, `events/events.ts` |

### 5.15 ActionFrame Features

A persistent, Google-Sheets-comment-style frame drawn on a body cell, with a client-owned form
rendered in a popover. The grid owns the frame border, popover chrome, positioning, and open/close
lifecycle; the content is a custom component.

| Feature | Status | Location |
|---------|--------|----------|
| Persistent cell frame + form popover | ✅ Complete | `renderer/actionFrame/actionFrameRenderer.ts` |
| Custom form component (`actionFrameComponent`, fn or class) | ✅ Complete | `renderer/actionFrame/actionFrameComponent.ts` → `IActionFrameComponent` |
| Built-in trigger (`actionFrameTrigger`: click / none) | ✅ Complete | `interfaces/column.ts` |
| Placement / offset / `escapeRootClip` (grid + per-column) | ✅ Complete | `resolveActionFrameOptions`; `renderer/floating/floatingAnchor.ts` |
| Sticky anchoring (conceal on scroll-out, re-show on scroll-in) | ✅ Complete | `FloatingAnchor` sticky mode |
| Content indicator (`actionFrameIndicator`) | ✅ Complete | opt-in corner marker on cells whose frame has content |
| Single-frame invariant (closes editor / prior frame) | ✅ Complete | `actionFrameRenderer.ts` |
| API (`openActionFrame` / `closeActionFrame` / `getActionFrameCell`) + event (`actionFrameChanged`) | ✅ Complete | `api/api.ts`, `events/events.ts` |

### 5.16 Column Panel Features

| Feature | Status | Location |
|---------|--------|----------|
| Shared right-hand management drawer | ✅ Complete | `columnPanel: true` or `ColumnPanelOptions`; `renderer/columnPanel/columnPanelRenderer.ts` |
| Trigger: full-height right rail (default) | ✅ Complete | `trigger: "rail"` |
| Trigger: header corner in an empty right gutter | ✅ Complete | `trigger: "header"`; reserves the gutter through header and body, so no data column sits beneath the toggle |
| Trigger: column button + header context menus | ✅ Complete | `trigger: "menu"` → **Manage columns…**; `ColumnMenuService` |
| Trigger: footer corner in an empty right gutter | ✅ Complete | `trigger: "footer"`; same reserved-gutter geometry as header mode |
| Trigger: top grid toolbar | ✅ Complete | `trigger: "toolbar"`; reserved left/right toolbar regions, Columns at the extreme right |
| Toolbar export menu | ✅ Complete | Selection / Entire table scopes with CSV and Excel formats; delegates to `ExportRenderer` |
| Toolbar row-group controls | ✅ Complete | Trailing-area add-group picker and right-edge clear-all; shared position-aware insertion marker for header, panel, and chip drags; active chips with removal and Left/Right keyboard reordering through `rowGroupSet` |
| Search by label, colId, or key | ✅ Complete | Live panel-list filtering |
| Column-group hierarchy | ✅ Complete | Nested collapsible groups; ancestor names participate in search and matching paths expand automatically |
| Group-controlled visibility | ✅ Complete | Uses the column model's resolved `columnGroupVisible`; inactive leaves are omitted while manually hidden active leaves remain manageable |
| Show/hide and left/right pinning | ✅ Complete | Dispatches the existing `columnVisibility` / `columnPin` actions |
| Bulk show/hide | ✅ Complete | Tri-state checkbox scopes to current search matches and ignores `hideable: false` columns |
| Per-column opt-out | ✅ Complete | `ColDef.suppressColumnPanel` omits a column from drawer search and operations without removing it from grid state |
| Pointer and keyboard reordering | ✅ Complete | Native drag/drop plus labelled Move up/down controls |
| Reset to latest column definitions | ✅ Complete | Captured `ColumnState` reapplied through `columnStateSet` |
| Modified-state feedback | ✅ Complete | Footer status and Reset availability track managed visibility, pinning, and order against the latest definition baseline |
| Accessible action feedback | ✅ Complete | Polite atomic live region announces individual/bulk visibility, pinning, ordering, and reset results |
| Live React option changes | ✅ Complete | `GridRenderer.setColumnPanelOptions`; React layout effect |

---

## 6. Key Design Patterns

### 6.1 Action / Event Separation

- **Actions** (`events/action.ts`): Discriminated union types sent **into** the core via `dispatch()`. They describe what the user/renderer wants to do. The core mutates state.
- **Events** (`events/events.ts`): Typed payloads emitted **from** the core via `emit()`. They notify the renderer (and API consumers) of state changes.

This is unidirectional: `Interaction → Action → Core Mutation → Event → Renderer Repaint`.

### 6.2 Inversion of Control via Callbacks

The renderer doesn't call core methods directly (in most cases). Instead, the core provides callback interfaces like `IRowModelListener` and the renderer provides callback objects to the core. For example, `GridRendererCoreEventBinder` receives a bag of callbacks:

```ts
new GridRendererCoreEventBinder({
  core: this.core,
  setLoading: (isLoading) => this.setLoading(isLoading),
  buildPaginationControls: () => this.buildPaginationControls(),
  onColumnsChanged: (params) => this._modelChangeHandler.onColumnsChanged(params),
  // ... ~15 more callbacks
});
```

### 6.3 Parameter Object Pattern

Constructors throughout the codebase use a single params object rather than positional arguments. This is especially pronounced in `GridRenderer`'s ~20 sub-renderers, each receiving a typed params interface.

### 6.4 Row Pool Pattern

Instead of creating/destroying DOM rows on scroll, the renderer maintains a fixed-size **row pool**. `BodyWindowRenderer.update()` repositions existing row elements and re-renders their cell contents, avoiding layout thrash.

### 6.5 Request Deduplication

Both `GridCore` and `ServerSideRowModel` use monotonic counters (`requestIdCounter`, `requestGeneration`) to detect and discard stale async results when a newer request supersedes an older one.

---

## 7. Extension Points

### Adding a New Built-in Cell Editor

1. Create `src/renderer/editing/editors/yourEditor.ts` implementing `ICellEditor`
2. Register in `src/renderer/editing/resolveEditor.ts`
3. Add the alias to the `CellEditorAlias` union in `src/renderer/editing/cellEditor.ts`

### Adding a New Built-in Cell Renderer

1. Create `src/cellRenderers/yourRenderer.ts` implementing `ICellRenderer`
2. Export from `src/index.ts`
3. Use via `ColDef.cellRenderer`

### Custom Header / Tooltip / ActionFrame Components

Each follows the same fn-or-class contract as the cell renderer (`init/getGui/refresh/destroy` for
the class form; a re-invoked function for the fn form), with its own `is…Component` type guard:

- **Header** — `renderer/header/headerComponent.ts` (`IHeaderComponent`). Wire via
  `ColDef.headerComponent` (content only) or `ColDef.headerCellComponent` (whole cell).
- **Tooltip** — `renderer/tooltip/tooltipComponent.ts` (`ITooltipComponent`). Wire via
  `ColDef.tooltipComponent` / `headerTooltip`.
- **ActionFrame** — `renderer/actionFrame/actionFrameComponent.ts` (`IActionFrameComponent`). Wire
  via `ColDef.actionFrameComponent`.

The React wrapper adapts JSX components for all three in `packages/react-grid/src/cellRenderer.ts`
(`adaptTooltip` / `adaptActionFrame` / header via `adaptReactColDef`).

### Adding a New Aggregate Function

1. Add the type to `AggregateType` enum in `src/interfaces/aggregate.ts`
2. Implement the calculation in `src/aggregate/calculator.ts`
3. Register in `allAggregateTypes()` and the column menu

### Adding a New Filter Type

1. Add the operator to `FilterType` enum in `src/interfaces/filter.ts`
2. Add the operator to the relevant filter panel(s) in `src/filter/types.ts`
3. Implement evaluation logic in `src/csrm/filter.ts`

### Adding a New Event

1. Add the event name to `GridEventName` union in `src/events/events.ts`
2. Define the params type
3. Add to `GridEventMap`
4. Emit from `GridCore` where appropriate
5. Handle in `GridRendererCoreEventBinder`

---

## 8. Testing

Tests use **vitest** with `happy-dom` for DOM environment simulation — **508 tests across 66
files**, co-located with source (core `packages/grid/src/`, React smoke tests
`packages/react-grid/src/`). A representative slice:

**Core / model** — `core/core.editing.test.ts` (editing lifecycle), `core.history.test.ts`
(undo/redo), `core.reevaluate.test.ts` (post-edit re-sort/filter), `core.transaction.test.ts`
(add/update/remove, re-eval gating, history preservation), `core.sortConfig.test.ts` (sortingOrder
cycle, defaultColDef / column overrides), `core.quickFilter.test.ts`, `selectionModel.test.ts`,
`column/columnModel.applyColumnState.test.ts`, `column/columnModel.defaultColDef.test.ts`,
`interfaces/sort.test.ts`.

**Filtering** — `csrm/filter` / `csrm/quickFilter.test.ts` / `csrm/customFilter.test.ts` (custom
matcher function), `csrm/rowGroup.test.ts`.

**Rendering / body** — `renderer/body/colSpan.test.ts` (span resolution),
`renderer/editing/editors/editors.test.ts`, `renderer/clipboard/clipboardRenderer.test.ts` +
`tsv.test.ts`.

**Export** — `export/export.excel.test.ts` (value types, formats, merges, panes, DEFLATE, aggregate
formulas, grouping/outline — read back with exceljs), `renderer/exportRenderer.grouped.test.ts`,
`exportRenderer.range.test.ts`, `menu/bodyMenuService.grouped.test.ts`,
`menu/columnMenuService.export.test.ts`.

**React smoke tests** (`packages/react-grid/src/*.smoke.test.tsx`, mount the real renderer) — cover
`actionFrame`, `tooltip`, `colSpan`, `fullWidthRow`, `rowGroup`, `rowSelection`, `quickFilter`,
`conditionalStyling`, `visualStateOptions`, `interactionOptions`, `columnMenuFlags`,
`bodyContextMenu`, `clickCallbacks`, `editTrigger`, `editNavigation`, `sortIconVisibility`,
`sparklineResize`, `applyTransaction`, plus `lifecycle.strictmode.test.tsx`,
`cellEditor.test.tsx`, `publicExports.test.ts`, and the `packageResolution.test.ts` boundary guard.

The `apps/playground/` directory is a **Vite demo app**, not automated tests. Run tests with `npm test` (from the repo root, runs the whole workspace suite) or `npm run test:watch`.

---

## 9. Build & Development

This is an npm-workspaces monorepo; scripts run from the repo root unless noted. See
[`../maintainers/repository.md`](../maintainers/repository.md) for the full build/publish pipeline.

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server for the demo app (`http://localhost:5176`) |
| `npm run build` | `build:grid` then `build:react` (explicit order — react typecheck needs grid's `dist/*.d.ts`) |
| `npm run test` | vitest single run across both packages |
| `npm run typecheck` | build grid, then typecheck grid → react → playground |
| `npm run clean` | clean each package's `dist/` + root `dist-demo/` |

Each package's `dist/` produces `index.js` (ESM), `index.cjs` (CJS), and `index.d.ts` / `.d.cts`
(declarations); the core additionally emits `index.css` (portable stylesheet with inlined icons).

Path aliases for the dev loop (`@grid`, `@grid/*`, `@react-grid`, `@react-grid/*`, and the package
names → source) are configured in the root `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.
They are dev-only and never appear in published output; the React *package* build resolves the core
through its manifest, exactly as a registry consumer does (see `repository.md` §4).

---

## 10. Current Limitations & Gaps

Reflects the code as of 2026-07-27 (`mono-repo`). Everything listed as "recently completed" in
earlier drafts (grouping, sparklines, `addColumnDef`, column hierarchy, filter-menu service,
`applyColumnState`, row-selection API, quick filter, no-rows overlay) remains implemented.

### Now implemented (previously listed as TODO / Tier-2 gaps)
- **Row/cell spanning** — `ColDef.colSpan` (`renderer/body/colSpan.ts`); also exported as Excel merges.
- **Full-width rows** — `isFullWidthRow` + `fullWidthCellRenderer` (`renderer/body/window.ts`); CSRM.
- **Tooltips** — body + header, `renderer/tooltip/` on the shared `FloatingAnchor` primitive.
- **ActionFrame** — persistent cell frame + form popover, `renderer/actionFrame/`.
- **Custom header components** — `headerComponent` / `headerCellComponent`.
- **Sort ergonomics** — configurable cycle, multi-sort key, priority indicator, icon visibility,
  initial + column-level sort, custom comparator.
- **Conditional styling** — `getRowClass` / `getRowStyle` / `cellClass` / `cellStyle`.
- **`defaultColDef`**, **edit-trigger / keyboard-edit controls**, **visual-state + interaction
  options**, **custom filter function**.
- **Column panel / column chooser** — docked search, individual/filtered-bulk visibility, pinning,
  drag/keyboard ordering, and reset (`renderer/columnPanel/`).

### Genuine gaps (no implementation)

**Tier 2 — remaining new capabilities:**
- **Pinned top/bottom rows** — no frozen summary/pinned data rows (distinct from the aggregate footer).
- **Dynamic / auto row height + text wrapping** — all rows are fixed height (`renderer/body/viewport.ts` sizes the viewport as `rowCount * rowHeight`); no `getRowHeight` callback, `autoHeight`, or `wrapText`. (Full-width rows keep the standard row height.)
- **Tree data** — hierarchy from the data itself (`getDataPath`/`treeData`), distinct from value grouping.
- **Master/detail rows** — none (full-width rows exist, but no expandable detail panel).

**Tier 3 — platform features:**
- **Server-side grouping** — grouping is CSRM-only (`ssrm` `getGroupNodes` returns `[]`).
- **Pivoting** — appears only as a string in event `reason` enums; no model/logic.
- **Accessibility** — ARIA is menu/filter-only; the data grid lacks `role="grid"/"row"/"gridcell"/"columnheader"`, row/col counts, and a roving-tabindex focus model.

### Other notes
- **SSRM transactions** — `applyTransaction` is a no-op that returns zero counts.
- **Server-side row model** does not distinguish `forEachNodeAfterFilterAndSort` from `forEachNode` (identical implementations).
- **Quick filter, grouping, full-width rows, and custom filter functions are client-side (CSRM) only.**
- **Zero runtime dependencies** — the core's `dependencies` is empty (`react`/`react-dom` are the React binding's peer deps). `exceljs` is a dev-only test verifier; installing either package pulls in nothing but the peers.
- **Excel export uses `CompressionStream`** for DEFLATE; where it's unavailable the writer falls back to uncompressed STORE (still valid, larger files) — no hard runtime requirement.
