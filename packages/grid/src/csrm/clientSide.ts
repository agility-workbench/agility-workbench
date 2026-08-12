import { FilterModel } from "../interfaces/filter";
import { SortModel } from "../interfaces/sort";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { IRowModel, IRowModelRequestParams, RowDataChangeReason, RowModelType, RowTransaction, RowTransactionResult } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { performFilter, performQuickFilter } from "../csrm/filter";
import { GridOptions, GroupSortMode, QuickFilterMatchMode, TreeDataOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "@grid/interfaces/iRowModelListener";
import { AggregateCalculator } from "../aggregate/calculator";
import { Column } from "../column/column";
import { buildGroupTree, flattenGroupTree } from "./rowGroup";
import { buildTreeData, prepareTreeRows } from "./treeData";

export class ClientSideRowModel<Row extends object = any> implements IRowModel<Row> {
  private nodes: IRowNode<Row>[] = [];
  private nodesMap: Map<string, IRowNode<Row>> = new Map();

  private filteredIdx: number[] = [];
  private sortedIdx: number[] = [];
  private viewIdx: number[] = [];
  private sortModel: SortModel = new SortModel();
  private groupSortMode: GroupSortMode = "local";
  private aggregateScope: AggregateScope = "all";
  private aggregates: AggregateModel[] = [];
  private leafColumns: Column[] = [];
  private aggregateValues: Map<string, any> = new Map();
  private aggregateCalculator = new AggregateCalculator();

  // Quick-filter (global search) state. Applied as a second predicate ANDed with the column filters
  // inside applyFilters, so both the flat and grouped view paths pick it up. Empty text is a no-op.
  private quickFilterText = "";
  private quickFilterMatchMode: QuickFilterMatchMode = "multiTerm";
  private quickFilterCaseSensitive = false;

  // Row grouping state. When groupColumns is non-empty the model derives a group tree from the
  // filtered+sorted leaves and exposes a flat display list (group headers + visible leaves) via
  // viewNodes; the flat viewIdx path is bypassed. Synthetic group nodes never enter nodes[].
  private groupColumns: Column[] = [];
  private groupExpansion: Map<string, boolean> = new Map();
  private groupRoots: IRowNode<Row>[] = [];
  private groupNodesMap: Map<string, IRowNode<Row>> = new Map();
  private groupedFlatAll: IRowNode<Row>[] = [];
  private viewNodes: IRowNode<Row>[] = [];
  private readonly groupDefaultExpanded: number;
  private readonly treeData?: TreeDataOptions<Row>;
  private nestedTreeParents: Map<string, string | undefined> = new Map();
  private warnedMissingTreeParents = new Set<string>();

  paginate: boolean = false;
  startIdx = 0;
  endIdx = 100;

  private getId: (row: Row) => string;

  constructor(opts: GridOptions, readonly listener: IRowModelListener) {
    this.getId = createRowIdFactory(opts);
    this.groupDefaultExpanded = opts.groupDefaultExpanded ?? 0;
    this.treeData = opts.treeData as TreeDataOptions<Row> | undefined;
  }

  private get grouped(): boolean {
    return this.groupColumns.length > 0 || this.treeData != null;
  }

  getType(): RowModelType {
    return "clientSide";
  }

  isValid(): boolean {
    return true;
  }

  private createNode(row: Row): IRowNode<Row> {
    return {
      id: this.getId(row),
      data: row,
      selected: false,
      level: 0,
      isGroup: false,
      type: "leaf",
      isExpanded: false,
      viewIndex: -1,
    };
  }

  setRows(rows: Row[]) {
    const prepared = this.treeData
      ? prepareTreeRows(rows, this.treeData, this.getId)
      : { rows, nestedParents: new Map<string, string | undefined>() };
    this.nestedTreeParents = prepared.nestedParents;
    this.nodes = prepared.rows.map((r) => this.createNode(r));

    // Index nodes by id so getRowNode / setCellValue can resolve rows by their stable id.
    this.nodesMap.clear();
    for (const node of this.nodes) {
      this.nodesMap.set(node.id, node);
    }

    // initial: no filter, no sort
    const n = this.nodes.length;
    this.filteredIdx = new Array(n);
    for (let i = 0; i < n; i++) this.filteredIdx[i] = i;

    // by default sortedIdx = filteredIdx (stable)
    this.sortedIdx = this.filteredIdx.slice();

    // Refresh or init must be called upon setting rows.
    // this.rebuildView();
  }

  // Apply an incremental add / update / remove against the current node set. This only mutates the
  // node store; the caller re-derives filter/sort/view via applyRequest afterwards. Removes are
  // applied first, then updates (data replaced in place, node identity kept), then adds appended.
  applyTransaction(tx: RowTransaction<Row>): RowTransactionResult {
    let removed = 0;
    if (tx.remove?.length) {
      const removeIds = new Set(tx.remove);
      // Nested-children relationships have no parent-id field to re-evaluate after a removal.
      // Removing a parent therefore removes its complete nested subtree.
      if (this.treeData?.mode === "children") {
        let changed = true;
        while (changed) {
          changed = false;
          for (const [id, parentId] of this.nestedTreeParents) {
            if (parentId != null && removeIds.has(parentId) && !removeIds.has(id)) {
              removeIds.add(id);
              changed = true;
            }
          }
        }
      }
      const kept: IRowNode<Row>[] = [];
      for (const node of this.nodes) {
        if (removeIds.has(node.id) && this.nodesMap.delete(node.id)) {
          this.nestedTreeParents.delete(node.id);
          removed++;
        } else {
          kept.push(node);
        }
      }
      if (removed > 0) this.nodes = kept;
    }

    let updated = 0;
    if (tx.update?.length) {
      for (const { rowId, row } of tx.update) {
        const node = this.nodesMap.get(rowId);
        if (!node) continue;
        // Replace data in place so the node object (and its identity) is preserved — renderers that
        // diff against the previous node/value (change-flash, sparklines) keep working.
        node.data = row;
        updated++;
      }
    }

    let added = 0;
    if (tx.add?.length) {
      const prepared = this.treeData?.mode === "children"
        ? prepareTreeRows(tx.add, this.treeData, this.getId)
        : { rows: tx.add, nestedParents: new Map<string, string | undefined>() };
      for (const [id, parentId] of prepared.nestedParents) {
        this.nestedTreeParents.set(id, parentId);
      }
      for (const row of prepared.rows) {
        const node = this.createNode(row);
        if (this.nodesMap.has(node.id)) {
          // An id collision with an existing row is treated as an update rather than a duplicate.
          const existing = this.nodesMap.get(node.id)!;
          existing.data = row;
          updated++;
          continue;
        }
        this.nodes.push(node);
        this.nodesMap.set(node.id, node);
        added++;
      }
    }

    return { added, updated, removed };
  }

  getRowCount(): number {
    // While grouping, pagination pages over the flat display list (group headers + visible
    // leaves), so report that count. Otherwise the raw leaf-node total.
    return this.grouped ? this.groupedFlatAll.length : this.nodes.length;
  }

  private setPagination(paginate: boolean, startIdx: number, endIdx: number) {
    this.paginate = paginate;
    this.startIdx = startIdx;
    this.endIdx = endIdx;
  }

  private rebuildView() {
    const end = this.paginate ? this.endIdx : undefined;
    this.viewIdx = this.sortedIdx.slice(this.startIdx, end);
    for (let i = 0; i < this.viewIdx.length; i++) {
      const nodeIdx = this.viewIdx[i];
      this.nodes[nodeIdx].viewIndex = i;
    }
  }

  // Rebuild the group tree from the current filtered+sorted leaves. Group buckets honor an active
  // sort on their grouping column (and otherwise use ascending comparator order); leaves keep their
  // sorted order within each bucket. Per-group aggregate values are computed over each group's full
  // leaf-descendant set (only when aggregates are configured). Expansion state is read from
  // groupExpansion, falling back to the default depth.
  private rebuildGroupTree() {
    const leaves = this.sortedIdx.map(i => this.nodes[i]);
    // Only compute per-group totals for columns with an aggregate explicitly configured. Unlike the
    // footer aggregate row (which fills every column via a default op), group rows show a value only
    // where one was asked for — otherwise every column reads as aggregated and the grid looks cluttered.
    const aggregatedKeys = new Set(this.aggregates.map(a => a.key));
    const aggregatedColumns = this.leafColumns.filter(col => aggregatedKeys.has(col.instanceID));
    const computeAggregates = aggregatedColumns.length > 0
      ? (groupLeaves: IRowNode<Row>[]) => {
          const map = this.aggregateCalculator.calculateAggregates(aggregatedColumns, this.aggregates, groupLeaves);
          const obj: { [key: string]: any } = {};
          map.forEach((value, key) => { obj[key] = value; });
          return obj;
        }
      : undefined;

    let roots: IRowNode<Row>[];
    let groupNodesById: Map<string, IRowNode<Row>>;
    if (this.treeData) {
      const result = buildTreeData<Row>({
        nodes: this.nodes,
        options: this.treeData,
        nestedParents: this.nestedTreeParents,
        includedIds: new Set(this.filteredIdx.map(i => this.nodes[i].id)),
        sortRank: new Map(this.sortedIdx.map((i, rank) => [this.nodes[i].id, rank])),
        expansion: this.groupExpansion,
        defaultExpanded: this.groupDefaultExpanded,
        onMissingParent: (rowId, parentId) => {
          const key = `${rowId}\0${parentId}`;
          if (this.warnedMissingTreeParents.has(key)) return;
          this.warnedMissingTreeParents.add(key);
          console.warn(`Tree data parent "${parentId}" for row "${rowId}" was not found; rendering it as a root.`);
        },
      });
      roots = result.roots;
      groupNodesById = result.expandableNodesById;
    } else {
      const result = buildGroupTree<Row>({
        leaves,
        groupColumns: this.groupColumns,
        sortModel: this.sortModel,
        groupSortMode: this.groupSortMode,
        expansion: this.groupExpansion,
        defaultExpanded: this.groupDefaultExpanded,
        computeAggregates,
      });
      roots = result.roots;
      groupNodesById = result.groupNodesById;
    }
    this.groupRoots = roots;
    this.groupNodesMap = groupNodesById;

    // Drop expansion entries for groups that no longer exist to bound memory growth.
    if (this.groupExpansion.size > 0) {
      for (const id of Array.from(this.groupExpansion.keys())) {
        if (!groupNodesById.has(id)) this.groupExpansion.delete(id);
      }
    }
  }

  // Flatten the group tree into the display list (pre-order, collapsed subtrees skipped), then apply
  // pagination. groupedFlatAll is the full flat list (used for pagination totals); viewNodes is the
  // paginated slice the viewport renders.
  private rebuildGroupedView() {
    this.groupedFlatAll = flattenGroupTree(this.groupRoots);
    const end = this.paginate ? this.endIdx : undefined;
    this.viewNodes = this.groupedFlatAll.slice(this.startIdx, end);
  }

  getViewCount() {
    return this.grouped ? this.viewNodes.length : this.viewIdx.length;
  }

  getViewTotalCount() {
    // The un-paginated sources the view is sliced from: the whole flattened group list, or the
    // filtered+sorted index. Not `nodes.length`, which is every loaded row regardless of filter.
    return this.grouped ? this.groupedFlatAll.length : this.sortedIdx.length;
  }

  getRowNodeAt(index: number): IRowNode<Row> | undefined {
    if (index < 0 || index >= this.nodes.length) return undefined;
    return this.nodes[index];
  }

  getRowNodeAtViewIndex(viewRowIndex: number): IRowNode<Row> | undefined {
    if (this.grouped) return this.viewNodes[viewRowIndex];
    const nodeIdx = this.viewIdx[viewRowIndex];
    if (nodeIdx == null) return undefined;
    return this.nodes[nodeIdx];
  }

  getRowNode(id: string): IRowNode<Row> | undefined {
    return this.nodesMap.get(id) ?? this.groupNodesMap.get(id);
  }

  setCellValue(rowId: string, key: string, value: any): boolean {
    const node = this.nodesMap.get(rowId);
    if (!node) return false;
    (node.data as any)[key] = value;
    return true;
  }

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    this.sortedIdx.forEach((i: number) => callback(this.nodes[i], i));
  }

  getGroupNodes(): IRowNode<Row>[] {
    return this.grouped ? Array.from(this.groupNodesMap.values()) : [];
  }

  getHierarchyRoots(): IRowNode<Row>[] {
    return this.grouped ? this.groupRoots.slice() : [];
  }

  private setSorts(sort: SortModel): void {
    this.sortedIdx = this.filteredIdx.slice();
    const comparators = sort.items
      // A column's comparator may not be resolved yet (e.g. an initial sort seeded before the first
      // data load identifies comparators); skip such items rather than crash. They sort correctly on
      // the next pass once comparators exist.
      .filter(s => s.col && s.dir !== null && typeof s.col.comparator === "function")
      .map(sort => {
        const { col, dir } = sort;
        const mult = dir === "desc" ? -1 : 1;
        const cmp = col.comparator!;
        return (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => cmp(a, b, nodeA, nodeB) * mult;
      });

    this.sortedIdx.sort((a, b) => {
      for (const cmp of comparators) {
        const result = cmp(this.nodes[a].data, this.nodes[b].data, this.nodes[a], this.nodes[b]);
        if (result !== 0) return result;
      }
      return 0;
    });
  }

  private applyFilters(filter: FilterModel): void {
    const columnFiltered = performFilter(filter.items, this.nodes);
    this.filteredIdx = this.quickFilterText.trim() === ""
      ? columnFiltered
      : performQuickFilter(
          {
            text: this.quickFilterText,
            matchMode: this.quickFilterMatchMode,
            caseSensitive: this.quickFilterCaseSensitive,
            // leafColumns is the set of visible, non-internal leaves supplied on the request.
            columns: this.leafColumns,
          },
          this.nodes,
          columnFiltered,
        );
  }

  setAggregateScope(scope: AggregateScope): void {
    this.aggregateScope = scope;
  }

  private reAggregate(): void {
    this.aggregateValues.clear();
    if (this.aggregateScope === "none" || this.aggregates.length === 0) return;

    const rows = this.getAggregateRows();
    this.aggregateValues = this.aggregateCalculator.calculateAggregates(this.leafColumns, this.aggregates, rows);
  }

  getAggregateValues(): Map<string, any> {
    return new Map(this.aggregateValues);
  }

  applyRequest(params: IRowModelRequestParams): void {
    const { id, sortModel, filterModel, paginate, range, aggregateScope, groupSortMode } = params;
    const aggregateOnly = params.reason === "aggregateScope" || params.reason === "aggregateModel";
    if (!aggregateOnly) this.listener.onLoadingStart(id);
    this.aggregateScope = aggregateScope;
    this.aggregates = params.aggregates.slice();
    this.leafColumns = params.leafColumns.slice();
    this.groupColumns = params.groupColumns.slice();
    this.sortModel = sortModel;
    this.groupSortMode = groupSortMode;
    if (params.quickFilter) {
      this.quickFilterText = params.quickFilter.text;
      this.quickFilterMatchMode = params.quickFilter.matchMode;
      this.quickFilterCaseSensitive = params.quickFilter.caseSensitive;
    }

    // A pure expand/collapse toggle: update expansion state and re-flatten only — no filter, sort,
    // or tree rebuild. Batched targets (`groupIds`/`all`) share the single re-flatten below.
    const expansionOnly = params.groupExpansion != null;
    if (expansionOnly) {
      const { groupId, groupIds, all, expanded } = params.groupExpansion!;
      const targetIds = all
        ? this.groupNodesMap.keys()
        : groupIds ?? (groupId != null ? [groupId] : []);
      for (const id of targetIds) {
        const node = this.groupNodesMap.get(id);
        if (!node) continue;
        const next = expanded ?? !node.isExpanded;
        node.isExpanded = next;
        this.groupExpansion.set(id, next);
      }
      this.setPagination(paginate, range.start, range.end);
      this.rebuildGroupedView();
    } else {
      if (this.isReasonBeforeStep(params.reason, "filter")) this.applyFilters(filterModel);
      if (this.isReasonBeforeStep(params.reason, "sort")) this.setSorts(sortModel);
      this.setPagination(paginate, range.start, range.end);
      if (this.grouped) {
        this.rebuildGroupTree();
        this.rebuildGroupedView();
      } else {
        for (const node of this.nodes) delete node.parentId;
        this.groupRoots = [];
        this.groupNodesMap = new Map();
        this.groupedFlatAll = [];
        this.viewNodes = [];
        this.rebuildView();
      }
      this.reAggregate();
    }

    // An aggregate-only request normally skips the row repaint (only the footer aggregate row
    // changes). But while grouping, per-group totals live on the group rows themselves, so those
    // rows must repaint too.
    const emitRows = !aggregateOnly || (this.grouped && !expansionOnly);
    if (emitRows) {
      const rows = this.grouped ? this.viewNodes : this.viewIdx.map(i => this.nodes[i]);
      this.listener.onRows(id, {
        reason: params.reason,
        rows,
        rowCount: this.grouped ? this.groupedFlatAll.length : this.filteredIdx.length,
        visibleStart: range.start,
        visibleEnd: range.end,
      });
    }
    this.listener.onAggregates(id, {
      reason: params.aggregateReason ?? (aggregateOnly ? (params.reason === "aggregateScope" ? "scope" : "model") : "rows"),
      scope: this.aggregateScope,
      aggregateModel: this.aggregates.slice(),
      valuesAvailable: this.aggregateValues.size > 0,
    });
    if (!aggregateOnly) this.listener.onLoadingEnd(id);
  }

  destroy(): void {
    this.nodesMap.clear();
    this.groupNodesMap.clear();
    this.groupExpansion.clear();
    this.warnedMissingTreeParents.clear();
  }

  private isReasonBeforeStep(reason: RowDataChangeReason, step: RowDataChangeReason): boolean {
    switch (reason) {
      case "filter":
      case "quickFilter":
        return step === "filter" || step === "sort";
      case "sort": return step === "sort";
      case "page":
      case "pagination":
      case "aggregateScope":
      case "aggregateModel":
        return false;
    }
    return true;
  }

  private getAggregateRows(): IRowNode<Row>[] {
    const indexes = this.aggregateScope === "all" ? this.sortedIdx : this.viewIdx;
    return indexes.map(i => this.nodes[i]).filter(Boolean);
  }

}
