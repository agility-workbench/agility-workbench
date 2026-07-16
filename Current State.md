# Grid — Technical Architecture & Feature Reference

> **Doc status:** Refreshed 2026-07-16 against branch `renderer-split`. Since the original draft,
> **row grouping**, the **sparkline renderer**, and **`addColumnDef`** (transient columns) have all
> been implemented — they are no longer TODOs. `columnHierarchy.ts` and `filterMenuService.ts` are
> full implementations, not stubs. **All Tier-1 gaps are now closed**: `applyColumnState`
> (merge / exact restore, order-field-driven), the row-selection API + row-number-header select-all,
> and the `sparklineType` type fix. **Excel export is now a hand-rolled, zero-dependency OOXML
> writer** (`src/export/xlsx/`) — exceljs has been dropped from the runtime path (kept only as a
> dev-time verifier in tests). The writer adds live aggregate formulas, native row-group outlines
> with `SUBTOTAL` subtotals, DEFLATE compression, and selection-aware grouped export. See §5.9 and
> §10 for details.

## 0. What's new in export (this branch)

- **Hand-rolled `.xlsx` writer** (`src/export/xlsx/`): `zip.ts` (CRC-32 + STORE/DEFLATE via the
  platform `CompressionStream`), `xml.ts` (escaping, A1 refs, Excel date serials), `styleRegistry.ts`
  (index-deduped `styles.xml`), `writeXlsx.ts` (OOXML part assembler). No runtime dependency; ~10×
  smaller than uncompressed and on par with exceljs's output size.
- **Aggregate footer as live formulas**: `SUM/AVERAGE/MEDIAN/MIN/MAX/COUNTA` over the data range,
  with the grid's own computed value cached; static fallback for text MIN/MAX and distinct-count.
- **Row grouping → Excel outline levels**: group-header + per-group `SUBTOTAL(code,…)` rows (codes
  1–11 so nested subtotals never double-count), collapsed groups exported hidden, `summaryBelow=0`.
- **`groupDisplayType`-aware headings**: singleColumn prepends a "Group" column; multipleColumns puts
  each level's heading under its own column; groupRows uses the first column.
- **Selection-aware grouped export**: selecting group rows / a cell range prunes the exported tree;
  the range's column span is honored; a body-menu submenu offers "Export with row groups" vs "Export
  leaf rows" (the former disabled with a tooltip when the range excludes the heading column).
- **Column-header menu export** ("Export as CSV/Excel") is now wired to actually run.

## 1. Overview

**Grid** is a high-performance, virtualized, headless data grid library written in TypeScript. It ships as a plain JS/TS core with a **React wrapper** (`grid-react/`) for declarative use. The architecture cleanly separates **core state & logic** from **DOM rendering**, with a unidirectional action-dispatch pattern and an event-driven observer model.

- **Package name:** `@your-scope/grid` (internal)
- **React wrapper:** `@grid-react`
- **Build:** `tsup` (ESM + CJS), dev server via `vite`
- **Testing:** `vitest` with `happy-dom` for DOM tests
- **Exports:** CSV + Excel (`.xlsx`) via a hand-rolled, zero-dependency OOXML writer (`src/export/xlsx/`); exceljs is only a dev/test verifier

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Layer (grid-react/)          │
│  GridReact component, ReactCellRenderer,            │
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

```
src/
├── index.ts                   Public API barrel export
├── misc.ts                    Boolean/null utilities
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
│   ├── column.ts              Column class — wraps ColDef, holds runtime state, getValue/formatValue/parseValue
│   ├── columnModel.ts         ColumnModel — hierarchy, pinning, visibility, widths, lookup maps, addColumnDef, getColumnState
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
│   ├── column.ts              ColDef, ColumnType enum, ColumnSection
│   ├── filter.ts              FilterModel, FilterItem, FilterDef, FilterType enum, FilterParams
│   ├── gridOptions.ts         GridOptions (public) and InternalGridOptions (resolved defaults)
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
│   ├── gridRenderer.ts        GridRenderer — top-level orchestrator (~800 lines)
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
│   │   ├── poolSizer.ts       Compute pool size based on viewport height + overscan
│   │   ├── rowHover.ts        Row hover CSS class management
│   │   ├── rowPool.ts         RowPoolRenderer — builds/rebuilds the DOM row pool
│   │   ├── viewport.ts        BodyViewportRenderer — viewport spacer sizing, scroll reset
│   │   ├── window.ts          BodyWindowRenderer — sliding window: positions rows, renders cells
│   │   └── wrapper.ts         BodyWrapperElements — DOM skeleton for body sections
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
│   │   ├── renderer.ts        HeaderRenderer — builds header DOM from ColumnModel
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
│   ├── overlay/               Loading & filter overlays
│   │   ├── filter.ts          Filter overlay (not yet used for full-screen)
│   │   └── loading.ts         Loading overlay (spinner)
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
│   ├── table.css              Core grid CSS (~800 lines)
│   ├── icons.ts               Icon name union, getIconClassName, icon CSS variable injection
│   └── icons/                 SVG icon files (sort, filter, aggregate, menu, chevrons, etc.)
│
└── selection/                 (deprecated — merged into core/selectionModel.ts)
    └── columnSelection.ts     Column selection logic

grid-react/                    React wrapper
├── index.ts                   Re-exports GridReact, GridReactProps, ReactCellRenderer, ReactColDef
├── grid.tsx                   GridReact component (~220 lines) — lifecycle, prop→core bridging
├── factory.ts                 createCore, createApi, getGridOptions helpers
├── interface.ts               GridReactProps (extends GridOptions)
├── cellRenderer.ts            ReactCellRenderer type, adaptReactColumnDefs (JSX→CellRendererClass)
├── cellEditor.ts              ReactCellEditor, ReactCellEditorHandle types
├── menu.ts                    MenuItem type for React
├── BodyMenuAdapter.ts         Adapter: getBodyMenuItems → MenuAdapter interface
└── MenuAdapter.ts             Adapter: getColumnMenuItems → MenuAdapter interface

test/                          Demo app (Vite-based, not tests)
├── App.tsx                    Full demo with client-side + server-side, themes, trading grid
├── helpers.ts
├── index.html / main.tsx
└── dist-demo/

dist/                          Build output
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
reflow the view. See `test/App.tsx` → `TradingGrid` for a live streaming example.

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
| debounceMs, maxFilterItems, button customization | ✅ Complete | `FilterParams` |

### 5.4 Sort Features

| Feature | Status | Location |
|---------|--------|----------|
| Multi-column sort | ✅ Complete | `interfaces/sort.ts` → `SortModel` |
| Toggle sort (asc → desc → none) | ✅ Complete | `GridCore.toggleSort()` |
| Sort indicators on headers | ✅ Complete | `renderer/header/renderer.ts` |
| Type-aware comparator auto-detection | ✅ Complete | `column/columnModel.ts` → `identifyComparator` |
| Numeric vs. string comparators with Intl.Collator | ✅ Complete | `column/column.ts` → `getCollator`, `setComparator` |

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

### 5.6 Editing Features

| Feature | Status | Location |
|---------|--------|----------|
| Inline cell editing (double-click / F2 / Enter) | ✅ Complete | `renderer/editing/cellEditRenderer.ts` |
| Built-in editors: text, number, date, boolean, select, textarea | ✅ Complete | `renderer/editing/editors/` |
| Custom cell editor (class or factory function) | ✅ Complete | `renderer/editing/cellEditor.ts` → `CellEditorClass`, `ICellEditorFn` |
| Edit-on-typing (printable char opens editor) | ✅ Complete | `charPress` in `editStart` action |
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
| Aggregate row (bottom of grid) | ✅ Complete | `renderer/aggregate/wrapper.ts`, `rowBuilder.ts` |
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
| React cell renderers (JSX elements) | ✅ Complete | `grid-react/cellRenderer.ts` |
| Change flash cell renderer | ✅ Complete | `cellRenderers/changeFlashRenderer.ts` |
| Sparkline cell renderer (line/bar/area, SVG) | ✅ Complete | `cellRenderers/sparklineRenderer.ts` |
| Group cell renderer (chevron + indented label + child count) | ✅ Complete | `renderer/body/groupCellRenderer.ts` |
| Row hover highlighting | ✅ Complete | `renderer/body/rowHover.ts` |
| Loading overlay | ✅ Complete | `renderer/overlay/loading.ts` |
| Theme system (CSS custom properties + icon overrides) | ✅ Complete | `theme/table.css`, `theme/icons.ts` |
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
| React-customizable menu items | ✅ Complete | `grid-react/MenuAdapter.ts`, `BodyMenuAdapter.ts` |
| Filter menu (per-column filter panel) | ✅ Complete | `filter/filterMenuCoordinator.ts` |

### 5.13 React Wrapper Features

| Feature | Status | Location |
|---------|--------|----------|
| GridReact component (forwardRef to API) | ✅ Complete | `grid-react/grid.tsx` |
| Declarative props (data, columnDefs, loading, pagination, etc.) | ✅ Complete | `grid-react/interface.ts` |
| React cell renderers | ✅ Complete | `grid-react/cellRenderer.ts` |
| React cell editors | ✅ Complete | `grid-react/cellEditor.ts` |
| onGridReady callback | ✅ Complete | `grid-react/grid.tsx` |
| Menu customization hooks | ✅ Complete | `getColumnMenuItems`, `getBodyMenuItems` |
| Icon overrides | ✅ Complete | `icons` prop |

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

Tests use **vitest** with `happy-dom` for DOM environment simulation. Test files live co-located with source:

- `src/core/core.editing.test.ts` — editing lifecycle
- `src/core/core.history.test.ts` — undo/redo
- `src/core/core.reevaluate.test.ts` — post-edit re-sort/filter
- `src/core/core.transaction.test.ts` — applyTransaction add/update/remove, re-eval gating, history preservation
- `src/core/selectionModel.test.ts` — selection model
- `src/column/column.editing.test.ts` — column editing behavior
- `src/renderer/editing/editors/editors.test.ts` — editor instances
- `src/renderer/clipboard/clipboardRenderer.test.ts` — copy/paste
- `src/renderer/clipboard/tsv.test.ts` — TSV parsing
- `src/export/export.excel.test.ts` — hand-rolled xlsx: value types, formats, merges, panes, DEFLATE, aggregate formulas, grouping/outline (read back with exceljs)
- `src/renderer/exportRenderer.grouped.test.ts` — grouped export: groupDisplayType placement, selection pruning, collapsed groups, group-column-in-range gating
- `src/renderer/exportRenderer.range.test.ts` — ungrouped range export includes the first selected row (double-slice regression)
- `src/menu/bodyMenuService.grouped.test.ts` — body-menu Excel submenu detection + disable-with-tooltip + command routing
- `src/menu/columnMenuService.export.test.ts` — column-header menu export items build and route to the exporter
- `grid-react/cellEditor.test.tsx` — React editor integration
- `grid-react/applyTransaction.smoke.test.tsx` — end-to-end transaction stream through the React wrapper (mounts real renderer)

The `test/` directory is a **Vite demo app**, not automated tests. Run tests with `npm test` or `npm run test:watch`.

---

## 9. Build & Development

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server for the demo app |
| `npm run build` | tsup build → `dist/` (ESM + CJS + types) |
| `npm run test` | vitest single run |
| `npm run test:watch` | vitest watch mode |
| `npm run typecheck` | tsc --noEmit |
| `npm run clean` | rm -rf dist |

The `dist/` produces:
- `dist/index.esm.js` — ES module
- `dist/index.cjs.js` — CommonJS
- `dist/index.d.ts` — TypeScript declarations

Path aliases (`@grid`, `@grid/*`, `@grid-react`, `@grid-react/*`) are configured in `tsconfig.json` and `vitest.config.ts`.

---

## 10. Current Limitations & Gaps

Reflects the code as of 2026-07-14 (`renderer-split`). The earlier "sparkline / column-hierarchy /
filter-menu-service / grouping are stubs" notes are **obsolete** — all of those are implemented.

### Now implemented (previously listed as TODO)
- **Row grouping** — `csrm/rowGroup.ts`, all three `groupDisplayType` modes render, per-group aggregation.
- **Sparkline renderer** — `cellRenderers/sparklineRenderer.ts` (line/bar/area SVG).
- **`addColumnDef`** — runtime transient columns via `column/columnModel.ts`.
- **Column hierarchy** (`columnHierarchy.ts`) and **filter menu service** (`filterMenuService.ts`) are full implementations.

### Genuine gaps (no implementation)

**Tier 1 — all cleared.** The three remaining Tier-1 gaps are now implemented (see "Recently completed" below).

**Recently completed (were Tier 1 gaps):**
- **`applyColumnState`** ✅ — `column/columnModel.ts` → `applyColumnState`, wired through `columnStateSet` action → `core` → `api.applyColumnState(state, opts?)`. Default is a **merge** (unknown colIds ignored; columns absent from state keep their place). `opts.defaultState` (e.g. `{ hidden: true }`) applies a fallback to absent columns for an **exact restore**, hiding anything not in the saved view (including columns added since capture). Ordering is driven by each entry's explicit **`order` field** (not array position): entries with `order` reposition via remove-then-insert (ties keep array order); entries without `order` don't move. `getColumnState()` now also includes hidden columns so a layout round-trips. Tests: `src/column/columnModel.applyColumnState.test.ts`, `grid-react/rowSelection.smoke.test.tsx`; demo: `test/ColumnStateDemo.tsx`.
- **Row selection API + select-all** ✅ — `api.getSelectedRows()` / `getSelectedNodes()` / `selectAllRows()` / `deselectAllRows()` / `areAllRowsSelected()` (`api/api.ts`, `core/core.ts`, `core/selectionModel.ts`). Two independent, opt-in options (both default **false**): `rowSelection` (select via row-number-cell click / Ctrl+click / Shift+range) and `selectAllRowsOnHeaderClick` (clicking the row-number header toggles all rows, consistent with other header clicks — no separate checkbox column). `rowSelectAll` action. Tests: `src/core/selectionModel.test.ts`, `grid-react/rowSelection.smoke.test.tsx`; demo: `test/SelectionDemo.tsx`.
- **`sparklineType` type fixed** ✅ — `ColDef.sparklineType` is now `"line" | "bar" | "area"` (`interfaces/column.ts`), matching the renderer and the column menu (line/bar/area).
- **Quick filter / global search** ✅ — `quickFilter` grid option; floating widget (`renderer/quickFilter/quickFilterWidget.ts`) summoned with Ctrl/Cmd+F, multiTerm/substring + case-sensitivity options, debounced, matches formatted values across visible columns, ANDs with column filters. Predicate: `csrm/filter.ts` → `performQuickFilter`. API: `api.setQuickFilter()` / `getQuickFilterText()`. CSRM only. Tests: `src/csrm/quickFilter.test.ts`, `src/core/core.quickFilter.test.ts`, `grid-react/quickFilter.smoke.test.tsx`.
- **No-rows / empty overlay** ✅ — distinct empty-state overlay (`renderer/overlay/noRows.ts`), decoupled from the loading spinner in `coreEventBinder.ts`, driven from the actual row count, with a filter/search-aware message.

**Tier 2 — new capabilities:**
- **Pinned top/bottom rows** — no frozen summary/pinned data rows (distinct from the aggregate footer).
- **Dynamic / auto row height + text wrapping** — all rows are fixed height (`renderer/body/viewport.ts` sizes the viewport as `rowCount * rowHeight`); no `getRowHeight` callback, `autoHeight`, or `wrapText`.
- **Tree data** — hierarchy from the data itself (`getDataPath`/`treeData`), distinct from value grouping.
- **Master/detail rows** and **full-width rows** — none.
- **Row/cell spanning** — none.

**Tier 3 — platform features:**
- **Tool panel / sidebar / column chooser** — column show/hide/pin/group is only via the context menu.
- **Server-side grouping** — grouping is CSRM-only (`ssrm` `getGroupNodes` returns `[]`).
- **Pivoting** — appears only as a string in event `reason` enums; no model/logic.
- **Accessibility** — ARIA is menu/filter-only; the data grid lacks `role="grid"/"row"/"gridcell"/"columnheader"`, row/col counts, and a roving-tabindex focus model.

### Other notes
- **SSRM transactions** — `applyTransaction` is a no-op that returns zero counts.
- **Server-side row model** does not distinguish `forEachNodeAfterFilterAndSort` from `forEachNode` (identical implementations).
- **Zero runtime dependencies** — `package.json` `dependencies` is now empty (`react`/`react-dom` are peer deps). `exceljs` (test-only read-back verifier) and `@vitejs/plugin-react` (Vite build/demo config) both moved to `devDependencies`, so installing the package pulls in nothing but the peers.
- **Excel export uses `CompressionStream`** for DEFLATE; where it's unavailable the writer falls back to uncompressed STORE (still valid, larger files) — no hard runtime requirement.
