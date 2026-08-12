import { Column } from "../column/column";
import { GridCore } from "../core/core";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { PinnedRangeSegment, SelectionRange } from "../interfaces/selection";
import {
  exportCSV as downloadCSV,
  exportExcel as downloadExcel,
  buildCSV,
  buildXlsx,
  ExportConfig,
  ExportOptions,
  ExportScope,
} from "../export/export";


/** Append every data-bearing node under `node` (pre-order) to `out`. */
function collectLeafData(node: IRowNode, out: any[]): void {
  if (!node.isGroup) out.push(node.data);
  for (const child of node.children ?? []) {
    collectLeafData(child, out);
  }
}

/**
 * Prune a group tree to the subset the user selected, keyed by node id:
 *  - A selected GROUP node → kept with its entire subtree (selecting a group means "all under it").
 *  - A selected LEAF → kept.
 *  - An unselected group with a selected descendant → kept as a context header, holding only the
 *    kept descendants.
 *  - Anything else → dropped.
 * Returns pruned root-level nodes (may be empty if nothing matched).
 */
function pruneGroupTree(roots: IRowNode[], selected: Set<string>): IRowNode[] {
  // Returns a pruned copy of `node` if it (or a descendant) is selected, else null. `ancestor
  // selected` means an ancestor group was selected, so this whole subtree is included wholesale.
  const prune = (node: IRowNode, ancestorSelected: boolean): IRowNode | null => {
    const selfSelected = ancestorSelected || selected.has(node.id);

    const hierarchyNode = node.isGroup || !!node.children?.length;
    if (!hierarchyNode) {
      return selfSelected ? node : null;
    }

    if (selfSelected) {
      return node; // whole subtree included; keep the original node (children intact)
    }

    // Not selected — keep only if some descendant survives.
    const keptChildren: IRowNode[] = [];
    for (const child of node.children ?? []) {
      const kept = prune(child, false);
      if (kept) keptChildren.push(kept);
    }
    if (keptChildren.length === 0) return null;
    // Shallow clone so we can narrow children without mutating the live model node. Recompute the
    // leaf count so the displayed "(N)" reflects the kept subset, not the original group size.
    const leaves: any[] = [];
    for (const c of keptChildren) {
      collectLeafData(c, leaves);
    }
    return { ...node, children: keptChildren, childCount: leaves.length };
  };

  const out: IRowNode[] = [];
  for (const root of roots) {
    const kept = prune(root, false);
    if (kept) out.push(kept);
  }
  return out;
}

interface ExportRendererParams {
  core: GridCore;
  leafColumns: () => Column[];
  columnWidths: () => Map<string, {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    fixed?: boolean;
  }>;
  selectionRange: () => SelectionRange | null;
  selectedColumnIDs: () => Set<string>;
}

export class ExportRenderer {
  constructor(private params: ExportRendererParams) { }

  exportCSV(options: ExportOptions = {}) {
    this.performExport("csv", options);
  }

  exportExcel(options: ExportOptions = {}) {
    this.performExport("excel", options);
  }

  /** Build the CSV text for the current state + options without downloading. null if nothing to export. */
  getDataAsCsv(options: ExportOptions = {}): string | null {
    const config = this.buildExportConfig(options);
    if (!config) return null;
    return buildCSV(config);
  }

  /** Build the .xlsx bytes for the current state + options without downloading. null if nothing to export. */
  async getDataAsExcel(options: ExportOptions = {}): Promise<Uint8Array | null> {
    const config = this.buildExportConfig(options);
    if (!config) return null;
    return buildXlsx(config);
  }

  exportColumnCSV(columnIDs: string[] | null = []) {
    const selectedColumns = columnIDs || [...this.params.selectedColumnIDs()];
    let fileName = "Export";
    if (selectedColumns.length == 1) {
      fileName = this.params.core.getColumnModel().getById(selectedColumns[0])?.label || fileName;
    }
    this.performExport("csv", {
      scope: "all",
      columnIds: selectedColumns,
      fileName: fileName,
    });
  }

  exportColumnXLSX(columnIDs: string[] | null = []) {
    const selectedColumns = columnIDs || [...this.params.selectedColumnIDs()];
    let fileName = "Export";
    if (selectedColumns.length == 1) {
      fileName = this.params.core.getColumnModel().getById(selectedColumns[0])?.label || fileName;
    }
    this.performExport("excel", {
      scope: "all",
      columnIds: selectedColumns,
      fileName: fileName,
    });
  }

  private performExport(format: "csv" | "excel", options: ExportOptions = {}) {
    const config = this.buildExportConfig(options);
    if (!config) return;

    const fileName = options.fileName ?? this.defaultExportFileName(format, options);
    if (format === "csv") {
      downloadCSV(config, fileName);
    } else {
      downloadExcel(config, fileName);
    }
  }

  private buildExportConfig(options: ExportOptions): ExportConfig | null {
    const scope = this.resolveExportScope(options);
    const columns = this.params.leafColumns()?.length ? this.params.leafColumns().slice() : [];
    if (!columns.length) return null;

    const groupColumns = this.params.core.getRowGroupColumns();
    const grouped = groupColumns.length > 0 || !!this.params.core.getOptions().treeData;

    if (grouped) {
      return this.buildGroupedExportConfig(options, scope, columns, groupColumns);
    }

    let rows: any[] = [];
    let selectionRange = null;
    let selectedColumnIDs: Set<string> | undefined;

    if (scope === "selection" && this.params.selectionRange()) {
      // Pass the FULL view rows (view-index aligned) + the range; export.ts slices rows AND columns
      // by the range in one place (resolveRows/resolveColumns). Pre-slicing here would double-slice.
      rows = this.getRowsForExport(false);
      selectionRange = { ...this.params.selectionRange()! };
    } else if (scope === "selection" && this.params.core.getSelectedRowIds().size > 0) {
      // Row-id selection persists across pages, so honor the FULL filtered/sorted set — not just
      // the current page's view.
      const selectedRowIds = this.params.core.getSelectedRowIds();
      this.params.core.getRowModel().forEachNodeAfterFilterAndSort((node) => {
        if (node && !node.isGroup && selectedRowIds.has(node.id)) rows.push(node.data);
      });
    } else if (scope === "selectedColumns") {
      rows = this.getRowsForExport(true);
      selectedColumnIDs = this.params.selectedColumnIDs();
    } else if (scope === "selection") {
      return null;
    } else {
      rows = this.getRowsForExport(true);
    }

    const { pinnedTopRows, pinnedBottomRows } = this.pinnedRowsForExport(scope);
    if ((!rows || rows.length === 0) && pinnedTopRows.length === 0 && pinnedBottomRows.length === 0) {
      return null;
    }

    // Include the aggregate footer only when the grid is actually showing aggregates on-screen
    // (scope !== "none"). A flat range/selection export skips it, since the footer's formulas span
    // whole-column ranges, not an arbitrary block.
    const aggregates =
      scope !== "selection" && this.params.core.getAggregateScope() !== "none"
        ? this.params.core.getAggregateModel()
        : undefined;

    return {
      rows,
      columns,
      pinnedTopRows,
      pinnedBottomRows,
      selectionRange,
      selectedColumnIDs,
      columnIds: options.columnIds,
      includeHeaders: options.includeHeaders,
      processCellForExcel: options.processCellForExcel,
      columnTree: this.params.core.getColumnModel().getColumns(),
      columnWidths: this.params.columnWidths(),
      aggregates,
      ...this.buildSpanResolvers(),
    };
  }

  /**
   * Build the body-spanning resolvers the exporter uses to reproduce the grid's on-screen merges:
   *  - getCellColSpan: evaluates a column's own `colSpan` callback for a row (same CellClassParams
   *    the body renderer builds), so the export merges exactly where the grid does.
   *  - isFullWidthRow: true for rows the grid renders full-width (group rows in "groupRows" mode, or
   *    the grid's isFullWidthRow opt-ins), via the core's single predicate.
   *  - fullWidthText: the label the grid shows in a full-width row (group "<key> (<count>)", else
   *    the row's isFullWidthRow content isn't text-representable here, so empty).
   * All three take the row's underlying data; a node is reconstructed for the grid callbacks, with a
   * real data-derived id when the grid uses getRowId/rowIdKey (so rowId-dependent callbacks match).
   * Returns an empty object when neither feature is configured (keeps the original fast path).
   */
  private buildSpanResolvers(): Partial<ExportConfig> {
    const opts = this.params.core.getOptions();
    const anyColSpan = this.params.core.getColumnModel().getLeaves().some(c => c.colSpan != null);
    const anyFullWidth = opts.groupDisplayType === "groupRows" || opts.isFullWidthRow != null;
    if (!anyColSpan && !anyFullWidth) return {};

    // When the grid derives ids from data (getRowId / rowIdKey), a leaf row's id is a pure function
    // of its data — reproduce it so `colSpan`/`isFullWidthRow` callbacks that key off rowId behave
    // the same in export as on screen. (The auto "r_N" fallback is opaque and not data-derivable, so
    // rowId stays "" for those grids — nothing meaningful to key on anyway.)
    const idOf = (opts.getRowId || opts.rowIdKey) ? createRowIdFactory(opts) : null;

    // Reconstruct the row node from its data so the grid callbacks see a node. Export flattens rows
    // to node.data; a nested { data } (already a node) is used as-is, otherwise a leaf stub is built
    // with the real, data-derived id when available.
    const nodeFor = (rowData: any): IRowNode => {
      if (rowData && typeof rowData === "object" && "data" in rowData) return rowData as IRowNode;
      const id = idOf && rowData != null ? idOf(rowData) : "";
      return { data: rowData, isGroup: false, level: 0, id, viewIndex: -1, selected: false, type: "leaf", isExpanded: false } as IRowNode;
    };

    const resolvers: Partial<ExportConfig> = {};
    if (anyColSpan) {
      resolvers.getCellColSpan = (rowData, col, rowIndex) => {
        if (!col.colSpan) return 1;
        const node = nodeFor(rowData);
        return col.colSpan({ value: col.getValue(node), data: node.data, rowId: node.id, rowIndex, colDef: col.col });
      };
    }
    if (anyFullWidth) {
      resolvers.isFullWidthRow = (rowData) => this.params.core.isFullWidthNode(nodeFor(rowData));
      resolvers.fullWidthText = (rowData) => {
        const node = nodeFor(rowData);
        if (node.isGroup) return `${node.groupKey ?? ""} (${node.childCount ?? 0})`;
        return "";
      };
    }
    return resolvers;
  }

  /**
   * Build the export config for a row-grouped grid. The export is driven by the group tree (outline
   * levels + per-group subtotals), pruned to what the user selected:
   *  - Row selection (incl. selected group rows) → its selectedRowIds.
   *  - Cell range → the group/leaf node ids the rectangle covers, plus its column span.
   *  - Nothing selected (or the selection resolves to no nodes) → the full tree.
   * `groupMode` ("tree" | "leaves") chooses the grouped-outline layout or a flat leaf dump.
   */
  private buildGroupedExportConfig(
    options: ExportOptions,
    scope: ExportScope,
    columns: Column[],
    groupColumns: Column[],
  ): ExportConfig | null {
    const rowModel = this.params.core.getRowModel();
    const allRoots = rowModel.getHierarchyRoots?.()
      ?? rowModel.getGroupNodes().filter(node => node.level === 0);
    if (allRoots.length === 0) return null;

    // Resolve the active selection to a set of selected node ids + an optional column-id filter +
    // whether the (singleColumn) group column falls within the selection.
    const { nodeIds, columnIds, includeGroupColumn } = this.resolveGroupedSelection(scope, columns);

    // Prune the tree to the selection (empty selection → full tree).
    const groupRoots = nodeIds && nodeIds.size > 0 ? pruneGroupTree(allRoots, nodeIds) : allRoots;
    if (groupRoots.length === 0) return null;

    // Leaf data drives the empty-guard and (in leaves mode) the grand total.
    const leafData: any[] = [];
    for (const root of groupRoots) collectLeafData(root, leafData);
    if (leafData.length === 0) return null;

    const aggregates =
      this.params.core.getAggregateScope() !== "none"
        ? this.params.core.getAggregateModel()
        : undefined;

    const { pinnedTopRows, pinnedBottomRows } = this.pinnedRowsForExport(scope);

    return {
      rows: leafData,
      columns,
      pinnedTopRows,
      pinnedBottomRows,
      columnIds: columnIds ?? options.columnIds,
      selectedColumnIDs: scope === "selectedColumns" ? this.params.selectedColumnIDs() : undefined,
      includeHeaders: options.includeHeaders,
      processCellForExcel: options.processCellForExcel,
      columnTree: this.params.core.getColumnModel().getColumns(),
      columnWidths: this.params.columnWidths(),
      aggregates,
      groupRoots,
      groupColumns,
      groupDisplayType: this.params.core.getOptions().groupDisplayType,
      treeData: !!this.params.core.getOptions().treeData,
      // Only surface the synthesized group column when the selection actually covers it — a cell
      // range that excludes the group column must not conjure it back into the export.
      autoGroupColumn: includeGroupColumn
        ? this.params.core.getColumnModel().getHierarchyColumn()
        : undefined,
      groupMode: options.groupMode ?? "tree",
      // Leaf-row colSpan is honored in grouped exports too; full-width (group) rows keep their
      // existing SUBTOTAL-header layout, so only getCellColSpan is meaningful here.
      ...this.buildSpanResolvers(),
    };
  }

  /**
   * Resolve the active selection (for a grouped grid) to:
   *  - `nodeIds`: the selected view-node ids (null → export the whole tree),
   *  - `columnIds`: for a cell range, the exportable columns its column span covers,
   *  - `includeGroupColumn`: whether the singleColumn group column is in scope (a cell range that
   *    excludes it must not have the group column prepended back).
   */
  private resolveGroupedSelection(
    scope: ExportScope,
    exportableColumns: Column[],
  ): { nodeIds: Set<string> | null; columnIds: string[] | undefined; includeGroupColumn: boolean } {
    const rowModel = this.params.core.getRowModel();

    // An explicit row selection spans all columns, so the group heading column remains in scope.
    const selectedRowIds = this.params.core.getSelectedRowIds();
    if (scope === "selection" && selectedRowIds.size > 0) {
      return { nodeIds: new Set(selectedRowIds), columnIds: undefined, includeGroupColumn: true };
    }

    // Cell range: collect the node ids the row span covers, and map the column span to column ids.
    const range = this.params.selectionRange();
    if (scope === "selection" && range) {
      const nodeIds = new Set<string>();
      for (let i = range.rowStart; i <= range.rowEnd; i++) {
        const node = rowModel.getRowNodeAtViewIndex(i);
        if (node) nodeIds.add(node.id);
      }
      // Global leaf indices (getLeaves) → exportable columns' instanceIDs within [colStart,colEnd].
      const allLeaves = this.params.core.getColumnModel().getLeaves();
      const exportable = new Set(exportableColumns.map(c => c.instanceID));
      const columnIds: string[] = [];
      for (let c = range.colStart; c <= range.colEnd; c++) {
        const leaf = allLeaves[c];
        if (leaf && exportable.has(leaf.instanceID)) columnIds.push(leaf.instanceID);
      }
      // The synthesized group column (singleColumn mode) is only in scope if its global leaf index
      // falls inside the range's column span.
      const autoGroup = this.params.core.getColumnModel().getHierarchyColumn();
      const autoGroupIdx = autoGroup
        ? this.params.core.getColumnModel().leafColumnLookup.get(autoGroup.instanceID)?.globalIndex
        : undefined;
      const includeGroupColumn =
        autoGroupIdx != null && autoGroupIdx >= range.colStart && autoGroupIdx <= range.colEnd;

      return { nodeIds, columnIds: columnIds.length ? columnIds : undefined, includeGroupColumn };
    }

    return { nodeIds: null, columnIds: undefined, includeGroupColumn: true };
  }

  private resolveExportScope(options: ExportOptions): ExportScope {
    if (options.scope) return options.scope;
    if (options.columnIds && options.columnIds.length > 0) return "all";
    const range = this.params.selectionRange();
    if (range && (range.rowEnd >= range.rowStart || range.pinnedTop || range.pinnedBottom)) {
      return "selection";
    }
    if (this.params.core.getSelectedRowIds().size > 0) return "selection";
    if (this.params.selectedColumnIDs().size > 0) return "selectedColumns";
    return "all";
  }

  /**
   * The pinned band rows an export should include, in band order. For a cell-range selection the
   * range's pinned segments decide; every other scope exports the full bands (row-id selections
   * can't cover band rows, so they contribute none). Synthetic group headers carry no data row and
   * are skipped — pinned group rows of a grouped grid are part of the group tree already.
   */
  private pinnedRowsForExport(scope: ExportScope): { pinnedTopRows: any[]; pinnedBottomRows: any[] } {
    const range = scope === "selection" ? this.params.selectionRange() : null;
    const rowIdSelection = scope === "selection" && !range;
    const collect = (position: "top" | "bottom") => {
      const rows: any[] = [];
      if (rowIdSelection) return rows;
      const segment: PinnedRangeSegment | undefined = range
        ? (position === "top" ? range.pinnedTop : range.pinnedBottom)
        : undefined;
      if (range && !segment) return rows;
      for (let i = segment?.start ?? 0; segment == null || i <= segment.end; i++) {
        const node = this.params.core.getDisplayedPinnedRow(position, i);
        if (!node) break;
        if (!node.isGroup) rows.push(node.data);
      }
      return rows;
    };
    return { pinnedTopRows: collect("top"), pinnedBottomRows: collect("bottom") };
  }

  private getRowsForExport(includeAllRows: boolean): any[] {
    const rows: any[] = [];
    if (includeAllRows) {
      this.params.core.getRowModel().forEachNodeAfterFilterAndSort((node) => {
        rows.push(node.data);
      });
      return rows;
    }

    for (let i = 0; i < this.params.core.getRowModel().getViewCount(); i++) {
      const node = this.params.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  private defaultExportFileName(format: "csv" | "excel", options: ExportOptions): string {
    const ext = format === "csv" ? "csv" : "xlsx";
    if (options.columnIds && options.columnIds.length === 1) {
      const col = this.params.core.getColumnModel().getById(options.columnIds[0]);
      if (col) return `${col.label ?? col.key}.${ext}`;
    }
    const scope = this.resolveExportScope(options);
    if (scope === "selection") return `grid-selection.${ext}`;
    if (scope === "selectedColumns") return `grid-columns.${ext}`;
    return `grid-all.${ext}`;
  }
}
