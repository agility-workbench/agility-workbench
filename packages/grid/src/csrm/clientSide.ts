import { FilterModel } from "../interfaces/filter";
import { SortModel } from "../interfaces/sort";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { IRowModel, IRowModelRequestParams, RowDataChangeReason, RowDataDiff, RowModelType, RowTransaction, RowTransactionResult } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { performFilter, performQuickFilter } from "../csrm/filter";
import { GridOptions, GroupSortMode, QuickFilterMatchMode, TreeDataOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "@grid/interfaces/iRowModelListener";
import { AggregateCalculator } from "../aggregate/calculator";
import { Column } from "../column/column";
import { buildGroupTree, flattenGroupTree } from "./rowGroup";
import { buildTreeData, prepareTreeRows } from "./treeData";
import { PivotRequestState } from "../interfaces/pivot";
import {
  buildPivotTotalRoot,
  createPivotValueStamper,
  discoverPivot,
  identityPivotResolution,
  PivotValueStamper,
} from "./pivot";

// Identity of a column list for signature comparison — instanceIDs, in order.
const columnSignature = (columns: Column[]): string => columns.map(c => c.instanceID).join(",");

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
  // Pivot state. Non-null = pivot mode: the group tree is built with hidden leaf rows and each
  // group node's aggregateValues carry the generated pivot cells (keyed by resolved instanceID —
  // see onPivotResult). The stamper survives between full rebuilds so reAggregate can reuse it.
  private pivot: PivotRequestState | null = null;
  private pivotStamper: PivotValueStamper | null = null;
  // Columns the quick filter searches; while pivoted these are the source leaves, not the
  // generated ones (whose getValue on data rows is undefined). Null = use leafColumns.
  private quickFilterColumns: Column[] | null = null;
  // Request id of the applyRequest currently executing, for mid-request listener callbacks.
  private currentRequestId = 0;
  // Whether the derived state (group tree, pivot discovery, footer aggregates) currently holds:
  // false until the first rebuild, and cleared by anything that mutates the node store. The two
  // signatures record the configuration the current derived state was built from — see
  // treeStateSignature / pivotStateSignature.
  private derivedTreeValid = false;
  private treeSignature = "";
  private pivotSignature = "";
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
  // Whether ids come from the data rather than from createRowIdFactory's per-object fallback.
  // Without this a diff would mint a fresh id for every cloned row and report "remove all, add all".
  private readonly hasStableRowId: boolean;

  constructor(opts: GridOptions, readonly listener: IRowModelListener) {
    this.getId = createRowIdFactory(opts);
    this.hasStableRowId = opts.getRowId != null || opts.rowIdKey != null;
    this.groupDefaultExpanded = opts.groupDefaultExpanded ?? 0;
    this.treeData = opts.treeData as TreeDataOptions<Row> | undefined;
  }

  private get grouped(): boolean {
    // Pivot mode always displays a group tree — with no group columns, the synthesized "Total"
    // root is the whole tree.
    return this.groupColumns.length > 0 || this.treeData != null || this.pivot != null;
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
    this.derivedTreeValid = false;
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
  // applied first, then updates (data replaced in place, node identity kept), then adds are inserted
  // at addIndex (or appended when it is omitted).
  applyTransaction(tx: RowTransaction<Row>, order?: string[]): RowTransactionResult {
    this.derivedTreeValid = false;
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
      const addedNodes: IRowNode<Row>[] = [];
      for (const row of prepared.rows) {
        const node = this.createNode(row);
        if (this.nodesMap.has(node.id)) {
          // An id collision with an existing row is treated as an update rather than a duplicate.
          const existing = this.nodesMap.get(node.id)!;
          existing.data = row;
          updated++;
          continue;
        }
        addedNodes.push(node);
        this.nodesMap.set(node.id, node);
        added++;
      }

      if (addedNodes.length > 0) {
        // Be forgiving at the runtime boundary: invalid numbers retain the established append
        // behavior, while finite values are truncated and clamped to a valid insertion point.
        const requestedIndex = tx.addIndex;
        const addIndex = requestedIndex == null || !Number.isFinite(requestedIndex)
          ? this.nodes.length
          : Math.min(Math.max(Math.trunc(requestedIndex), 0), this.nodes.length);
        this.nodes.splice(addIndex, 0, ...addedNodes);
      }
    }

    // A caller replacing the whole array supplies the complete order it wants; honour it over any
    // insertion position. Ids the map does not know are skipped, and any node the order omits keeps
    // its relative position at the end.
    if (order) this.reorderNodes(order);

    return { added, updated, removed };
  }

  private reorderNodes(order: string[]): void {
    const ordered: IRowNode<Row>[] = [];
    const placed = new Set<string>();
    for (const id of order) {
      const node = this.nodesMap.get(id);
      if (!node || placed.has(id)) continue;
      ordered.push(node);
      placed.add(id);
    }
    if (ordered.length < this.nodes.length) {
      for (const node of this.nodes) {
        if (!placed.has(node.id)) ordered.push(node);
      }
    }
    this.nodes = ordered;
  }

  // Diff an incoming rowData array against the current nodes. Pure: nothing here mutates the model.
  // Null means "cannot diff, replace instead" — tree data derives a hierarchy from the flat array
  // (re-parenting, not just membership), which a row-level diff does not model.
  diffRows(rows: Row[]): RowDataDiff<Row> | null {
    if (!this.hasStableRowId || this.treeData) return null;

    const add: Row[] = [];
    const update: { rowId: string; row: Row }[] = [];
    const order: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const id = this.getId(row);
      // A duplicate id within the incoming array would otherwise be added twice and desync the
      // order; the first occurrence wins, matching how setRows' nodesMap build behaves.
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      const existing = this.nodesMap.get(id);
      if (!existing) {
        add.push(row);
      } else if (existing.data !== row) {
        // Reference inequality is the change signal: an application that mutates row objects in
        // place is invisible here by design (documented on the rowDataMode option).
        update.push({ rowId: id, row });
      }
    }

    const remove: string[] = [];
    for (const node of this.nodes) {
      if (!seen.has(node.id)) remove.push(node.id);
    }

    return { add, update, remove, order };
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
  private rebuildGroupTree(reuseDiscovery = false) {
    const leaves = this.sortedIdx.map(i => this.nodes[i]);
    if (this.pivot) {
      this.rebuildPivotTree(leaves, reuseDiscovery);
      return;
    }
    this.pivotStamper = null;
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

  // Pivot-mode tree rebuild: discover the generated header structure from the filtered leaves,
  // let the core reconcile the generated columns (onPivotResult returns generated colId →
  // instanceID), then build the group tree with a stamper that fills each group node's
  // aggregateValues per (pivot path × value entry). Leaf rows never display.
  //
  // `reuseDiscovery` keeps the existing stamper instead of re-deriving it: discovery is a function
  // of the leaves' VALUES, not their order, so a re-sort — which reorders the same leaf set under
  // an unchanged pivot configuration — leaves the discovered paths, the per-leaf path stamps and
  // the generated columns the core already reconciled all intact. The one thing it does not
  // preserve is which row is a path's representative leaf for a `sortComparator` that reads the
  // row node rather than the value; sibling order stays as first discovered in that case.
  private rebuildPivotTree(leaves: IRowNode<Row>[], reuseDiscovery: boolean) {
    const pivot = this.pivot!;
    if (!reuseDiscovery || !this.pivotStamper) {
      const { discovery, leafPathKeys, includedPaths } = discoverPivot({
        leaves,
        pivotColumns: pivot.columns,
        valueEntries: pivot.valueEntries,
        maxPivotColumns: pivot.maxPivotColumns,
      });
      const resolution = this.listener.onPivotResult
        ? this.listener.onPivotResult(this.currentRequestId, discovery)
        : identityPivotResolution(discovery);

      const valueColumns = new Map<string, Column>();
      for (const entry of pivot.valueEntries) valueColumns.set(entry.instanceID, entry.column);
      this.pivotStamper = createPivotValueStamper({
        leafPathKeys,
        includedPaths,
        valueEntries: pivot.valueEntries,
        valueColumns,
        resolution,
        calculator: this.aggregateCalculator,
      });
    }
    const computeAggregates = (groupLeaves: IRowNode<Row>[]) => this.pivotStamper!(groupLeaves);

    if (this.groupColumns.length === 0) {
      const root = buildPivotTotalRoot(leaves, computeAggregates(leaves));
      this.groupRoots = [root];
      this.groupNodesMap = new Map([[root.id, root]]);
      return;
    }

    const result = buildGroupTree<Row>({
      leaves,
      groupColumns: this.groupColumns,
      sortModel: this.sortModel,
      // Leaf order never shows while pivoted, so leaf-order propagation into bucket order
      // (hierarchy/global modes) would let an invisible sort reorder groups: force local.
      groupSortMode: "local",
      expansion: this.groupExpansion,
      defaultExpanded: this.groupDefaultExpanded,
      computeAggregates,
      hideLeafRows: true,
    });
    this.groupRoots = result.roots;
    this.groupNodesMap = result.groupNodesById;
    if (this.groupExpansion.size > 0) {
      for (const id of Array.from(this.groupExpansion.keys())) {
        if (!result.groupNodesById.has(id)) this.groupExpansion.delete(id);
      }
    }
  }

  // Flatten the group tree into the display list (pre-order, collapsed subtrees skipped), then apply
  // pagination. groupedFlatAll is the full flat list (used for pagination totals); viewNodes is the
  // paginated slice the viewport renders.
  private rebuildGroupedView() {
    this.groupedFlatAll = flattenGroupTree(this.groupRoots);
    this.sliceGroupedView();
  }

  // The pagination half of rebuildGroupedView, on its own: a request that only moves the page
  // re-slices the flat list the last rebuild produced (expansion toggles keep it current).
  private sliceGroupedView() {
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

  getViewIndexInFullView(id: string): number | undefined {
    if (this.grouped) {
      const node = this.getRowNode(id);
      if (!node) return undefined;
      // While grouping, viewIndex is stamped over the full flattened list (pagination slices it
      // afterwards), so it is already the answer — but a node whose subtree got collapsed keeps the
      // index it last held, so confirm the slot is still this row's before trusting it.
      return this.groupedFlatAll[node.viewIndex]?.id === id ? node.viewIndex : undefined;
    }
    const node = this.nodesMap.get(id);
    if (!node) return undefined;
    // Flat view: viewIndex is page-local, so it says nothing about rows on other pages. The row's
    // rank in the filtered+sorted order is the page-independent answer, and a filtered-out row is
    // simply absent from it. Linear, but this runs per explicit API call, not per frame.
    for (let i = 0; i < this.sortedIdx.length; i++) {
      if (this.nodes[this.sortedIdx[i]] === node) return i;
    }
    return undefined;
  }

  setCellValue(rowId: string, key: string, value: any): boolean {
    const node = this.nodesMap.get(rowId);
    if (!node) return false;
    (node.data as any)[key] = value;
    // The edited value may belong to a group key, a pivot key or an aggregated column, so nothing
    // derived from the node store can be reused on the next request.
    this.derivedTreeValid = false;
    return true;
  }

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  forEachNodeAfterFilter(callback: (node: IRowNode, idx: number) => void): void {
    this.filteredIdx.forEach((i: number) => callback(this.nodes[i], i));
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
            // The visible, non-internal leaves supplied on the request — except while pivoted,
            // where those are generated columns with no leaf values and the request supplies the
            // source leaves separately.
            columns: this.quickFilterColumns ?? this.leafColumns,
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

    // Pivot mode: the footer aggregate row shows grand totals per GENERATED column — the root
    // bucket over every filtered leaf, computed by the same stamper as the group rows (so
    // avg/median are true grand aggregates, not aggregates of aggregates). "page" scope is
    // treated as "all": the page holds group rows, not a leaf subset.
    if (this.pivot) {
      if (!this.pivotStamper) return;
      const stamped = this.pivotStamper(this.sortedIdx.map(i => this.nodes[i]));
      this.aggregateValues = new Map(Object.entries(stamped));
      return;
    }

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
    this.currentRequestId = id;
    this.aggregateScope = aggregateScope;
    this.aggregates = params.aggregates.slice();
    this.leafColumns = params.leafColumns.slice();
    this.groupColumns = params.groupColumns.slice();
    this.pivot = params.pivot ?? null;
    this.quickFilterColumns = params.quickFilterColumns?.slice() ?? null;
    this.sortModel = sortModel;
    this.groupSortMode = groupSortMode;
    if (params.quickFilter) {
      this.quickFilterText = params.quickFilter.text;
      this.quickFilterMatchMode = params.quickFilter.matchMode;
      this.quickFilterCaseSensitive = params.quickFilter.caseSensitive;
    }

    // Is the state the last rebuild produced still the state this request would produce? The two
    // signatures cover every configuration input the tree (resp. the pivot discovery) is derived
    // from; the leaf set behind both is covered by derivedTreeValid, which the node-store mutators
    // clear. Sort order sits in the tree signature and not the pivot one — that is what lets a
    // re-sort rebuild the tree while keeping discovery.
    const treeValid = this.derivedTreeValid && this.treeStateSignature() === this.treeSignature;
    const pivotValid = this.derivedTreeValid && this.pivotStateSignature() === this.pivotSignature;

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
        // Non-expandable groups (pivot mode's deepest level, the pivot grand-total row) ignore
        // expansion no matter how it is requested — their children are hidden leaf rows.
        if (!node || node.expandable === false) continue;
        const next = expanded ?? !node.isExpanded;
        node.isExpanded = next;
        this.groupExpansion.set(id, next);
      }
      this.setPagination(paginate, range.start, range.end);
      this.rebuildGroupedView();
    } else {
      // Turning a page (or switching the aggregate scope) changes neither the leaf set, its order,
      // nor any configuration the tree is derived from: the existing tree and pivot discovery are
      // exactly what a rebuild would produce, so the request re-slices the view and stops there.
      // A re-sort does need a new tree — but not new discovery (see rebuildPivotTree).
      const reuseTree = treeValid && this.isTreeReusableFor(params.reason);
      if (this.isReasonBeforeStep(params.reason, "filter")) this.applyFilters(filterModel);
      if (this.isReasonBeforeStep(params.reason, "sort")) this.setSorts(sortModel);
      this.setPagination(paginate, range.start, range.end);
      if (reuseTree) {
        if (this.grouped) this.sliceGroupedView();
        else this.rebuildView();
      } else if (this.grouped) {
        this.rebuildGroupTree(pivotValid && params.reason === "sort");
        this.rebuildGroupedView();
      } else {
        for (const node of this.nodes) delete node.parentId;
        this.groupRoots = [];
        this.groupNodesMap = new Map();
        this.groupedFlatAll = [];
        this.viewNodes = [];
        this.rebuildView();
      }
      // Stamped here rather than on entry: an expand/collapse request rebuilds nothing, so it must
      // leave the signatures describing the state that is actually in hand.
      this.derivedTreeValid = true;
      this.treeSignature = this.treeStateSignature();
      this.pivotSignature = this.pivotStateSignature();
      // The footer aggregates follow the same logic one step further: while pivoted they are grand
      // totals over every filtered leaf, and under "all" scope they aggregate the same rows, so a
      // page move cannot move them. "page" scope aggregates the slice that just changed, and an
      // explicit scope change is by definition a change of the row set.
      const reuseAggregates = reuseTree
        && params.reason !== "aggregateScope"
        && (this.pivot != null || this.aggregateScope === "all");
      if (!reuseAggregates) this.reAggregate();
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

  // Reasons that cannot invalidate the derived tree: they move the page window, or they change
  // only which rows the footer aggregate covers. Everything else re-derives.
  private isTreeReusableFor(reason: RowDataChangeReason): boolean {
    return reason === "page" || reason === "pagination" || reason === "aggregateScope";
  }

  // Everything the group tree is a function of, other than the leaf set itself. Compared between
  // requests so a reuse-eligible reason can never carry a configuration change past the rebuild
  // (the core routes those through their own reasons, but the tree must not depend on that).
  private treeStateSignature(): string {
    return [
      // Content, not the SortModel's identity: a caller that hands over an equivalent instance per
      // request must not silently disable reuse.
      this.sortModel.items.map(i => `${i.col.instanceID}:${i.dir}`).join(","),
      this.groupSortMode,
      columnSignature(this.groupColumns),
      // The visible leaves select which columns get per-group totals — a non-pivot concern only.
      // While pivoted they ARE the generated columns, which the rebuild replaces mid-request via
      // onPivotResult; including them would make every rebuild invalidate the state it just
      // produced, and the pivot tree never reads them anyway.
      this.pivot ? "" : columnSignature(this.leafColumns),
      this.aggregates.map(a => `${a.key}:${a.type}`).join(","),
      this.pivotStateSignature(),
    ].join("\u0000");
  }

  // The subset of the above that pivot discovery reads: which columns are pivoted on, which
  // measures they carry, and where the generated-column cap falls. Deliberately excludes sort
  // order and grouping, neither of which discovery looks at.
  private pivotStateSignature(): string {
    const pivot = this.pivot;
    if (!pivot) return "";
    return [
      columnSignature(pivot.columns),
      pivot.valueEntries.map(e => `${e.instanceID}:${e.type}`).join(","),
      pivot.maxPivotColumns,
    ].join("\u0001");
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
