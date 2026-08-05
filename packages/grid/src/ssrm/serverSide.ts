import { IRowModel, IRowModelRequestParams, RowModelType, RowTransaction, RowTransactionResult, ServerSideRefreshOptions } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { AggregateModel, AggregateScope, AggregateType } from "../interfaces/aggregate";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "../interfaces/iRowModelListener";
import { AggregateCalculator } from "../aggregate/calculator";
import { Column } from "../column/column";
import { BLANK_GROUP_KEY, groupNodeId } from "../csrm/rowGroup";
import {
  IServerSideAggregationRequest,
  IServerSideDataSource,
  IServerSideFilter,
  IServerSideGroupKey,
  IServerSideRequest,
  IServerSideResult,
  IServerSideSort,
} from "../interfaces/serverSide";

export type ServerSideRequest = IServerSideRequest;
export type ServerSideResult = IServerSideResult;
export type ServerSideDataSource = IServerSideDataSource;
export type ServerSideAggregationRequest = IServerSideAggregationRequest;
export type ServerSideAggregationSource = NonNullable<IServerSideDataSource["getAggregates"]>;

// The children of one parent group path ("listing"). The root listing (id "") holds top-level
// rows: group rows while grouping is active, leaf rows otherwise. Child listings exist only for
// group nodes that have been expanded (or default-expanded) — nothing below a collapsed group is
// ever requested.
interface ChildListing<Row> {
  /** Owning group node id; "" for the root listing. */
  id: string;
  /** Raw-value path sent to the server (empty for root). */
  groupKeys: IServerSideGroupKey[];
  /** Display-key path (stringified values / blank placeholder) used to derive child node ids. */
  path: string[];
  /** Loaded child nodes keyed by child index within this listing. */
  nodes: Map<number, IRowNode<Row>>;
  /** Immediate children discovered so far; equals the exact count once `counted`. */
  knownCount: number;
  /** True once the server reported totalRows or a short block pinned the end. */
  counted: boolean;
  /** Block start indices with an in-flight request (dedupes concurrent fetches). */
  inFlight: Set<number>;
}

// One contiguous run of a listing's child indices in the flattened display list. Runs break only
// at loaded expanded group nodes (whose own row ends a run and whose subtree is spliced in after),
// so the segment count is proportional to the number of expanded groups, not the row count.
interface FlatSegment {
  listingId: string;
  childStart: number;
  childEnd: number;
  flatStart: number;
}

const ROOT_LISTING_ID = "";

export class ServerSideRowModel<Row extends object = any> implements IRowModel<Row> {
  private listings: Map<string, ChildListing<Row>> = new Map();
  private nodesMap: Map<string, IRowNode<Row>> = new Map();
  private segments: FlatSegment[] = [];
  private flatTotal = 0;
  private totalKnown = true;

  // Per-group expansion overrides (group node id → expanded). Survives purges so sorting/filtering
  // and refreshes keep the expanded tree; ids are content-derived paths, so they stay stable.
  private expansion: Map<string, boolean> = new Map();

  private groupBy: Column[] = [];
  private viewStartRow = 0;
  private viewEndRow = 0;
  private paginate = false;

  private aggregateScope: AggregateScope = "all";
  private aggregates: AggregateModel[] = [];
  private leafColumns: Column[] = [];
  private aggregateValues: Map<string, any> = new Map();
  private aggregateCalculator = new AggregateCalculator();
  private aggregateRequestSeq = 0;

  // Bumped on every purge; block responses from an older generation are dropped.
  private storeGeneration = 0;
  private lastRequestParams: IRowModelRequestParams | null = null;
  // Highest request id the core has handed us. Async completions report with THIS id, not the id
  // that started the fetch: the core drops callbacks whose id trails its counter by more than one,
  // and a renderer-issued viewport request can bump the counter while a block is in flight (e.g.
  // expanding a group emits rows synchronously, the renderer immediately requests the missing
  // children, and the expand fetch's own id is stale by the time it resolves). Data staleness is
  // guarded by storeGeneration here, not by ids.
  private latestRequestId = -1;
  // Number of in-flight block fetches; the loading overlay shows on 0→1 and hides on →0 so
  // concurrent fetches can't strand or flicker it.
  private loadingDepth = 0;

  private readonly blockSize: number;
  private getId: (row: Row) => string;

  constructor(
    private opts: GridOptions,
    readonly listener: IRowModelListener,
    public serverDataSource?: IServerSideDataSource,
    public serverAggregationSource?: IServerSideDataSource["getAggregates"],
  ) {
    this.getId = createRowIdFactory(opts);
    this.blockSize = Math.max(1, opts.serverSideBlockSize ?? opts.pageSize ?? 100);
  }

  getType(): RowModelType {
    return "serverSide";
  }

  applyTransaction(_tx: RowTransaction<Row>): RowTransactionResult {
    // The server owns its dataset; incremental client-side transactions aren't applied here.
    // The core guards this path and warns, so this is an unreachable safety net.
    return { added: 0, updated: 0, removed: 0 };
  }

  isValid(): boolean {
    return this.serverDataSource?.getRows != null;
  }

  // Direct data replacement (api.setRowData on a server-side grid): the rows become the fully
  // counted root listing at the current level (group rows when grouping is active).
  setRows(rows: Row[], totalRows: number = rows.length, startRow: number = 0, replace: boolean = true) {
    if (replace) this.purgeStore();
    const root = this.getOrCreateListing(ROOT_LISTING_ID, [], []);
    this.ingestRows(root, rows, startRow, { totalRows });
    root.counted = true;
    this.rebuildFlat();
  }

  async refreshData(): Promise<boolean> {
    if (!this.lastRequestParams) return false;
    this.applyRequest({ ...this.lastRequestParams, reason: "refresh" });
    return true;
  }

  getRowCount(): number {
    return this.flatTotal;
  }

  isTotalRowCountKnown(): boolean {
    return this.totalKnown;
  }

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    // All loaded leaf rows in document order, regardless of expansion (mirrors the client-side
    // model, whose forEachNode iterates leaves only).
    let idx = 0;
    const walk = (listing: ChildListing<Row> | undefined) => {
      if (!listing) return;
      for (const childIdx of this.sortedIndices(listing)) {
        const node = listing.nodes.get(childIdx)!;
        if (node.isGroup) {
          walk(this.listings.get(node.id));
        } else {
          callback(node, idx++);
        }
      }
    };
    walk(this.listings.get(ROOT_LISTING_ID));
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    // Visible flattened order: group rows and leaves of expanded subtrees, collapsed ones skipped.
    let idx = 0;
    for (const seg of this.segments) {
      const listing = this.listings.get(seg.listingId);
      if (!listing) continue;
      for (let childIdx = seg.childStart; childIdx < seg.childEnd; childIdx++) {
        const node = listing.nodes.get(childIdx);
        if (node) callback(node, idx);
        idx++;
      }
    }
  }

  getGroupNodes(): IRowNode[] {
    const out: IRowNode[] = [];
    for (const listing of this.listings.values()) {
      for (const node of listing.nodes.values()) {
        if (node.isGroup) out.push(node);
      }
    }
    return out;
  }

  getHierarchyRoots(): IRowNode[] {
    if (this.groupBy.length === 0) return [];
    const root = this.listings.get(ROOT_LISTING_ID);
    if (!root) return [];
    return this.sortedIndices(root).map(i => root.nodes.get(i)!).filter(n => n.isGroup);
  }

  getViewCount() {
    if (!this.paginate) return this.flatTotal;
    return Math.max(0, Math.min(this.flatTotal, this.viewEndRow) - this.viewStartRow);
  }

  getRowNodeAt(index: number): IRowNode<Row> | undefined {
    return this.getRowNodeAtViewIndex(index);
  }

  getRowNodeAtViewIndex(viewRowIndex: number): IRowNode<Row> | undefined {
    const flatIdx = (this.paginate ? this.viewStartRow : 0) + viewRowIndex;
    const seg = this.findSegment(flatIdx);
    if (!seg) return undefined;
    const listing = this.listings.get(seg.listingId);
    return listing?.nodes.get(seg.childStart + (flatIdx - seg.flatStart));
  }

  getRowNode(id: string): IRowNode<Row> | undefined {
    return this.nodesMap.get(id);
  }

  setCellValue(rowId: string, key: string, value: any): boolean {
    const node = this.nodesMap.get(rowId);
    if (!node) return false;
    (node.data as any)[key] = value;
    return true;
  }

  applyRequest(params: IRowModelRequestParams): void {
    this.latestRequestId = Math.max(this.latestRequestId, params.id);
    if (params.reason !== "viewport") {
      this.lastRequestParams = params;
    }
    this.aggregateScope = this.normalizeAggregateScope(params.aggregateScope);
    this.aggregates = params.aggregates.slice();
    this.leafColumns = params.leafColumns.slice();

    if (params.reason === "aggregateScope"
      || (params.reason === "aggregateModel" && this.groupBy.length === 0)) {
      // Footer-only change: no per-group values to refetch.
      void this.reAggregate(params.id, params.reason === "aggregateScope" ? "aggregateScope" : "aggregateModel", params.aggregateReason);
      return;
    }
    if (this.aggregates.length > 0) {
      this.aggregateRequestSeq++;
    }

    if (params.reason === "viewport") {
      this.paginate = params.paginate;
      const range = params.loadRange ?? params.range;
      this.ensureRange(params, range.start, range.end);
      return;
    }

    this.paginate = params.paginate;
    this.viewStartRow = params.paginate ? params.range.start : 0;
    this.viewEndRow = params.paginate ? params.range.end : Number.MAX_SAFE_INTEGER;

    if (params.reason === "group" && params.groupExpansion) {
      this.applyGroupExpansion(params);
      return;
    }

    if (params.reason === "pagination" || params.reason === "page") {
      // Page moves reuse cached blocks; only missing ones are fetched.
      this.rebuildFlat();
      this.emitRows(params, params.reason);
      this.ensureViewRange(params);
      void this.reAggregate(params.id, "aggregateModel", params.aggregateReason ?? "rows");
      return;
    }

    // Structural reload: init / refresh / sort / filter / grouping model change / aggregate model
    // change while grouped. The block store is invalidated wholesale; expansion state survives and
    // expanded-but-visible subtrees re-fetch lazily as the renderer finds their rows missing.
    this.groupBy = params.groupColumns.slice();
    this.purgeStore();
    this.rebuildFlat();
    if (!this.isValid()) {
      this.listener.onError(params.id, new Error("Server-side row model requires a data source."));
      return;
    }
    this.ensureViewRange(params);
  }

  setAggregateScope(scope: AggregateScope): void {
    this.aggregateScope = this.normalizeAggregateScope(scope);
  }

  getAggregateValues(): Map<string, any> {
    return new Map(this.aggregateValues);
  }

  // Re-invoke the data source for the whole store or one group subtree (see
  // IGridAPI.refreshServerSideData). purge=true drops affected rows immediately; purge=false keeps
  // them rendered while blocks in the current view refetch and swap in place (off-view blocks are
  // dropped and lazily reload on scroll).
  async refreshServerSideData(options: ServerSideRefreshOptions | undefined, requestId: number): Promise<boolean> {
    if (!this.isValid()) return false;
    this.latestRequestId = Math.max(this.latestRequestId, requestId);
    const purge = options?.purge === true;
    const targetId = options?.groupKeys?.length
      ? groupNodeId(options.groupKeys.map(k => this.toDisplayKey(k.value)))
      : ROOT_LISTING_ID;
    const target = this.listings.get(targetId);
    if (targetId !== ROOT_LISTING_ID && !target) return false;

    const inSubtree = (listing: ChildListing<Row>): boolean =>
      targetId === ROOT_LISTING_ID
      || listing.id === targetId
      || listing.id.startsWith(targetId + "/");

    if (purge) {
      for (const listing of Array.from(this.listings.values())) {
        if (inSubtree(listing)) this.dropListing(listing);
      }
      this.storeGeneration++;
      this.rebuildFlat();
      this.emitRows({ id: requestId } as IRowModelRequestParams, "refresh");
      // "refresh" (not "viewport") so completed blocks chain ensureViewRange and expanded
      // subtrees reload without waiting for the renderer's missing-row scan.
      this.ensureViewRange({ ...this.viewportParams(requestId), reason: "refresh" });
      return true;
    }

    // Soft refresh: refetch view-intersecting blocks in place, drop the rest of the subtree's
    // loaded blocks so stale off-screen rows cannot linger (they reload lazily on scroll).
    const viewBlocks = this.collectViewBlocks();
    const params = this.viewportParams(requestId);
    for (const listing of Array.from(this.listings.values())) {
      if (!inSubtree(listing)) continue;
      const keep = viewBlocks.get(listing.id) ?? new Set<number>();
      for (const childIdx of Array.from(listing.nodes.keys())) {
        const block = Math.floor(childIdx / this.blockSize) * this.blockSize;
        if (!keep.has(block)) this.dropNodeAt(listing, childIdx);
      }
      for (const block of keep) {
        this.fetchBlock(listing, block, params, true);
      }
    }
    if (targetId === ROOT_LISTING_ID && !this.listings.has(ROOT_LISTING_ID)) {
      this.ensureViewRange(params);
    }
    return true;
  }

  destroy(): void {
    this.listings.clear();
    this.nodesMap.clear();
    this.segments = [];
  }

  // ---------------------------------------------------------------------------------------------
  // Store maintenance

  private purgeStore(): void {
    this.listings.clear();
    this.nodesMap.clear();
    this.segments = [];
    this.flatTotal = 0;
    this.storeGeneration++;
  }

  private dropListing(listing: ChildListing<Row>): void {
    for (const node of listing.nodes.values()) {
      this.nodesMap.delete(node.id);
      const child = this.listings.get(node.id);
      if (child) this.dropListing(child);
    }
    this.listings.delete(listing.id);
  }

  private dropNodeAt(listing: ChildListing<Row>, childIdx: number): void {
    const node = listing.nodes.get(childIdx);
    if (!node) return;
    listing.nodes.delete(childIdx);
    this.nodesMap.delete(node.id);
    const child = this.listings.get(node.id);
    if (child) this.dropListing(child);
  }

  private getOrCreateListing(id: string, groupKeys: IServerSideGroupKey[], path: string[]): ChildListing<Row> {
    let listing = this.listings.get(id);
    if (!listing) {
      listing = { id, groupKeys, path, nodes: new Map(), knownCount: 0, counted: false, inFlight: new Set() };
      this.listings.set(id, listing);
    }
    return listing;
  }

  private sortedIndices(listing: ChildListing<Row>): number[] {
    return Array.from(listing.nodes.keys()).sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------------------------------------
  // Flattening

  // Rebuild the flat segment index over expanded listings. An uncounted listing contributes one
  // phantom slot past its loaded edge; the renderer sees a missing row there and requests its
  // block, which is how open-ended listings extend (and eventually pin) their count.
  private rebuildFlat(): void {
    this.segments = [];
    let flat = 0;
    let known = true;
    const viewOffset = this.paginate ? this.viewStartRow : 0;

    const walk = (listing: ChildListing<Row>) => {
      if (!listing.counted) known = false;
      const slots = listing.knownCount + (listing.counted ? 0 : 1);
      let cursor = 0;
      for (const childIdx of this.sortedIndices(listing)) {
        if (childIdx >= slots) break;
        const node = listing.nodes.get(childIdx)!;
        if (!node.isGroup || !node.isExpanded) continue;
        // Segment covering [cursor, childIdx] — ends with the expanded group's own row — then the
        // group's subtree spliced in directly after.
        this.pushSegment(listing, cursor, childIdx + 1, flat, viewOffset);
        flat += childIdx + 1 - cursor;
        cursor = childIdx + 1;
        walk(this.getOrCreateListing(
          node.id,
          [...listing.groupKeys, { key: this.groupBy[listing.groupKeys.length]?.key ?? "", value: node.groupValue ?? null }],
          [...listing.path, node.groupKey ?? BLANK_GROUP_KEY],
        ));
      }
      if (cursor < slots) {
        this.pushSegment(listing, cursor, slots, flat, viewOffset);
        flat += slots - cursor;
      }
    };

    const root = this.listings.get(ROOT_LISTING_ID);
    if (root) {
      walk(root);
    } else {
      known = false;
    }
    this.flatTotal = flat;
    this.totalKnown = known;
  }

  private pushSegment(listing: ChildListing<Row>, childStart: number, childEnd: number, flatStart: number, viewOffset: number): void {
    if (childEnd <= childStart) return;
    this.segments.push({ listingId: listing.id, childStart, childEnd, flatStart });
    for (let childIdx = childStart; childIdx < childEnd; childIdx++) {
      const node = listing.nodes.get(childIdx);
      if (node) node.viewIndex = flatStart + (childIdx - childStart) - viewOffset;
    }
  }

  private findSegment(flatIdx: number): FlatSegment | undefined {
    if (flatIdx < 0 || flatIdx >= this.flatTotal) return undefined;
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const seg = this.segments[mid];
      if (flatIdx < seg.flatStart) {
        hi = mid - 1;
      } else if (flatIdx >= seg.flatStart + (seg.childEnd - seg.childStart)) {
        lo = mid + 1;
      } else {
        return seg;
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------------------------
  // Expansion

  private isExpandedByDefault(level: number): boolean {
    const depth = this.opts.groupDefaultExpanded ?? 0;
    return depth === -1 || level < depth;
  }

  private applyGroupExpansion(params: IRowModelRequestParams): void {
    const { groupId, expanded } = params.groupExpansion!;
    const node = this.nodesMap.get(groupId);
    if (!node || !node.isGroup) return;
    const next = expanded ?? !node.isExpanded;
    this.expansion.set(groupId, next);
    node.isExpanded = next;
    this.rebuildFlat();
    this.emitRows(params, "group");
    if (next) this.ensureViewRange(params);
    void this.reAggregate(params.id, "aggregateModel", params.aggregateReason ?? "rows");
  }

  // ---------------------------------------------------------------------------------------------
  // Fetching

  // Fetch whatever is missing to display the given flat range: for every listing the range
  // intersects, request the blocks with unloaded child indices. Uncounted listings expose a
  // phantom slot at their edge, so probing past the loaded frontier falls out of the same scan.
  private ensureRange(params: IRowModelRequestParams, flatStart: number, flatEnd: number): void {
    if (!this.isValid()) return;
    const start = Math.max(0, flatStart);
    const end = Math.min(this.flatTotal, flatEnd);
    for (const seg of this.segments) {
      const segEnd = seg.flatStart + (seg.childEnd - seg.childStart);
      if (segEnd <= start || seg.flatStart >= end) continue;
      const listing = this.listings.get(seg.listingId);
      if (!listing) continue;
      const fromChild = seg.childStart + Math.max(0, start - seg.flatStart);
      const toChild = seg.childStart + Math.min(seg.childEnd - seg.childStart, end - seg.flatStart);
      const blocks = new Set<number>();
      for (let childIdx = fromChild; childIdx < toChild; childIdx++) {
        if (!listing.nodes.has(childIdx)) {
          blocks.add(Math.floor(childIdx / this.blockSize) * this.blockSize);
        }
      }
      for (const block of blocks) {
        this.fetchBlock(listing, block, params);
      }
    }
  }

  private ensureViewRange(params: IRowModelRequestParams): void {
    const range = params.loadRange ?? params.range;
    const start = this.paginate ? Math.max(range.start, this.viewStartRow) : range.start;
    const end = this.paginate ? Math.min(range.end, this.viewEndRow) : range.end;
    if (this.flatTotal === 0 && !this.totalKnown) {
      // Nothing known yet (fresh store): the root listing's first block bootstraps everything.
      const root = this.getOrCreateListing(ROOT_LISTING_ID, [], []);
      this.fetchBlock(root, 0, params);
      return;
    }
    // A page start beyond the known frontier (provisional "next" navigation) probes the tail
    // phantom; each arrival re-enters here until the page fills or the count pins.
    const probeStart = this.paginate && start >= this.flatTotal ? Math.max(0, this.flatTotal - 1) : start;
    this.ensureRange(params, probeStart, Math.max(end, probeStart + 1));
  }

  private fetchBlock(listing: ChildListing<Row>, blockStart: number, params: IRowModelRequestParams, force = false): void {
    if (!this.isValid()) return;
    if (listing.inFlight.has(blockStart)) return;
    const requestedEnd = blockStart + this.blockSize;
    if (!force) {
      // Skip only when every index the block covers is loaded. An uncounted listing's phantom slot
      // (index knownCount) is never loaded, so frontier blocks always fetch — that's the probe.
      const upper = listing.counted ? Math.min(requestedEnd, listing.knownCount) : requestedEnd;
      let missing = false;
      for (let childIdx = blockStart; childIdx < upper; childIdx++) {
        if (!listing.nodes.has(childIdx)) {
          missing = true;
          break;
        }
      }
      if (!missing) return;
    }

    const generation = this.storeGeneration;
    listing.inFlight.add(blockStart);
    if (++this.loadingDepth === 1) {
      this.listener.onLoadingStart(this.latestRequestId);
    }

    const request: IServerSideRequest = {
      filters: this.serializeFilters((this.lastRequestParams ?? params).filterModel),
      sorts: this.serializeSorts((this.lastRequestParams ?? params).sortModel),
      startRow: blockStart,
      endRow: requestedEnd,
      groupBy: this.groupBy.map(col => col.key),
      groupKeys: listing.groupKeys,
      aggregates: this.isGroupLevel(listing) ? this.serializeAggregates() : [],
    };

    void (async () => {
      try {
        const result = await new Promise<IServerSideResult>((resolve, reject) => {
          const maybePromise = this.serverDataSource!.getRows({
            request,
            success: resolve,
            error: reject,
          });
          Promise.resolve(maybePromise)
            .then((maybeResult) => {
              if (maybeResult && typeof maybeResult === "object") {
                resolve(maybeResult);
              }
            })
            .catch(reject);
        });

        listing.inFlight.delete(blockStart);
        const settled = --this.loadingDepth === 0;
        if (generation !== this.storeGeneration) {
          if (settled) this.listener.onLoadingEnd(this.latestRequestId);
          return;
        }
        if (!this.listings.has(listing.id) && listing.id !== ROOT_LISTING_ID) {
          if (settled) this.listener.onLoadingEnd(this.latestRequestId);
          return;
        }

        if (listing.id === ROOT_LISTING_ID && result?.columns?.length) {
          this.listener.onServerSideSchema?.(this.latestRequestId, {
            columns: result.columns,
            schemaVersion: result.schemaVersion,
          });
        }

        this.listings.set(listing.id, listing);
        this.ingestRows(listing, (result?.rows ?? []) as Row[], blockStart, {
          totalRows: result?.totalRows,
          requestedCount: requestedEnd - blockStart,
        });
        this.rebuildFlat();
        this.emitRows(params, params.reason);
        void this.reAggregate(this.latestRequestId, "aggregateModel", params.aggregateReason ?? "rows");
        // Keep filling the target window BEFORE deciding whether the overlay can hide: expansion
        // fan-out and provisional page jumps need more blocks than one response covers, and any
        // chained fetch re-raises loadingDepth so the overlay stays up across the whole fill.
        if (params.reason !== "viewport") {
          this.ensureViewRange(params);
        }
        if (settled && this.loadingDepth === 0) {
          this.listener.onLoadingEnd(this.latestRequestId);
        }
      } catch (err) {
        listing.inFlight.delete(blockStart);
        const settled = --this.loadingDepth === 0;
        if (generation !== this.storeGeneration) {
          if (settled) this.listener.onLoadingEnd(this.latestRequestId);
          return;
        }
        this.listener.onError(this.latestRequestId, err);
        if (settled) this.listener.onLoadingEnd(this.latestRequestId);
      }
    })();
  }

  private isGroupLevel(listing: ChildListing<Row>): boolean {
    return listing.groupKeys.length < this.groupBy.length;
  }

  private ingestRows(
    listing: ChildListing<Row>,
    rows: Row[],
    startRow: number,
    counts: { totalRows?: number; requestedCount?: number },
  ): void {
    const isGroupLevel = this.isGroupLevel(listing);
    const level = listing.groupKeys.length;
    const groupCol = this.groupBy[level];

    rows.forEach((raw, i) => {
      const childIdx = startRow + i;
      let node: IRowNode<Row>;
      if (isGroupLevel && groupCol) {
        const value = (raw as any)[groupCol.key];
        const key = value == null || value === "" ? BLANK_GROUP_KEY : String(value);
        const id = groupNodeId([...listing.path, key]);
        node = {
          id,
          data: raw,
          viewIndex: -1,
          selected: this.nodesMap.get(id)?.selected ?? false,
          type: "group",
          isGroup: true,
          level,
          isExpanded: this.expansion.get(id) ?? this.isExpandedByDefault(level),
          childCount: this.opts.getGroupChildCount?.(raw) ?? undefined,
          groupKey: key,
          groupValue: value,
          parentId: listing.id === ROOT_LISTING_ID ? undefined : listing.id,
          aggregateValues: this.buildGroupAggregates(raw),
        };
      } else {
        const id = this.getId(raw);
        node = {
          id,
          data: raw,
          viewIndex: -1,
          selected: this.nodesMap.get(id)?.selected ?? false,
          type: "leaf",
          isGroup: false,
          level: 0,
          isExpanded: false,
          parentId: listing.id === ROOT_LISTING_ID ? undefined : listing.id,
        };
      }
      // Same node id at the same slot (a refetch): keep the child listing so an expanded subtree
      // survives its parent block's refresh. A different id displaces the old node and its subtree.
      const existing = listing.nodes.get(childIdx);
      if (existing && existing.id !== node.id) {
        this.dropNodeAt(listing, childIdx);
      } else if (existing) {
        this.nodesMap.delete(existing.id);
      }
      listing.nodes.set(childIdx, node);
      this.nodesMap.set(node.id, node);
    });

    if (counts.totalRows != null) {
      listing.knownCount = counts.totalRows;
      listing.counted = true;
    } else if (counts.requestedCount != null && rows.length < counts.requestedCount) {
      // Short block: the listing ends here.
      listing.knownCount = startRow + rows.length;
      listing.counted = true;
    } else {
      listing.knownCount = Math.max(listing.knownCount, startRow + rows.length);
    }
    // Drop any stale nodes past a pinned end (e.g. the dataset shrank on refresh).
    if (listing.counted) {
      for (const childIdx of Array.from(listing.nodes.keys())) {
        if (childIdx >= listing.knownCount) this.dropNodeAt(listing, childIdx);
      }
    }
  }

  private buildGroupAggregates(raw: Row): { [key: string]: any } | undefined {
    if (this.aggregates.length === 0) return undefined;
    const out: { [key: string]: any } = {};
    let any = false;
    for (const aggregate of this.aggregates) {
      const col = this.leafColumns.find(c => c.instanceID === aggregate.key || c.key === aggregate.key);
      if (!col) continue;
      const value = (raw as any)[col.key];
      if (value === undefined) continue;
      out[col.instanceID] = value;
      any = true;
    }
    return any ? out : undefined;
  }

  private emitRows(params: IRowModelRequestParams, reason: IRowModelRequestParams["reason"]): void {
    const viewOffset = this.paginate ? this.viewStartRow : 0;
    let visibleStart = 0;
    let visibleEnd = this.getViewCount();
    if (reason === "viewport" && params.range) {
      // Echo the requested window so the renderer's pending-range bookkeeping matches its key.
      visibleStart = Math.max(0, params.range.start - viewOffset);
      visibleEnd = Math.max(0, params.range.end - viewOffset);
    }
    // Report with the newest id the core has issued: async block completions must not be treated
    // as stale just because the renderer requested another block while this one was in flight.
    this.listener.onRows(Math.max(params.id, this.latestRequestId), {
      reason,
      rows: [],
      rowCount: this.flatTotal,
      visibleStart,
      visibleEnd,
    });
  }

  private viewportParams(requestId: number): IRowModelRequestParams {
    const base = this.lastRequestParams;
    return {
      ...(base ?? ({} as IRowModelRequestParams)),
      id: requestId,
      reason: "viewport",
      paginate: this.paginate,
      range: { start: this.viewStartRow, end: this.paginate ? this.viewEndRow : this.viewStartRow + Math.max(this.blockSize, this.getViewCount()) },
      loadRange: undefined,
    };
  }

  // Blocks (listing id → block starts) intersecting the current view window, for soft refresh.
  private collectViewBlocks(): Map<string, Set<number>> {
    const out = new Map<string, Set<number>>();
    const start = this.paginate ? this.viewStartRow : 0;
    const end = this.paginate ? Math.min(this.viewEndRow, this.flatTotal) : this.flatTotal;
    for (const seg of this.segments) {
      const segEnd = seg.flatStart + (seg.childEnd - seg.childStart);
      if (segEnd <= start || seg.flatStart >= end) continue;
      const fromChild = seg.childStart + Math.max(0, start - seg.flatStart);
      const toChild = seg.childStart + Math.min(seg.childEnd - seg.childStart, end - seg.flatStart);
      let blocks = out.get(seg.listingId);
      if (!blocks) {
        blocks = new Set();
        out.set(seg.listingId, blocks);
      }
      const firstBlock = Math.floor(fromChild / this.blockSize) * this.blockSize;
      for (let b = firstBlock; b < toChild; b += this.blockSize) {
        blocks.add(b);
      }
    }
    return out;
  }

  private toDisplayKey(value: any): string {
    return value == null || value === "" ? BLANK_GROUP_KEY : String(value);
  }

  // ---------------------------------------------------------------------------------------------
  // Serialization

  private createAggregationFilters(): IServerSideFilter[] {
    const params = this.lastRequestParams;
    return params ? this.serializeFilters(params.filterModel) : [];
  }

  private serializeFilters(filterModel: IRowModelRequestParams["filterModel"] | undefined): IServerSideFilter[] {
    if (!filterModel) return [];
    const filtersByKey = new Map<string, IServerSideFilter>();
    for (const item of filterModel.items) {
      filtersByKey.set(item.col.key, {
        key: item.col.key,
        filters: item.filters.map(filter => ({
          type: filter.type,
          values: filter.values,
        })),
        join: item.join,
      });
    }
    return Array.from(filtersByKey.values());
  }

  private serializeSorts(sortModel: IRowModelRequestParams["sortModel"] | undefined): IServerSideSort[] {
    if (!sortModel) return [];
    const sortsByKey = new Map<string, IServerSideSort>();
    for (const item of sortModel.items) {
      sortsByKey.set(item.col.key, {
        key: item.col.key,
        dir: item.dir,
      });
    }
    return Array.from(sortsByKey.values());
  }

  /** Configured aggregates on the wire, keyed by column key (core keys them by instance id). */
  private serializeAggregates(): AggregateModel[] {
    const out: AggregateModel[] = [];
    for (const aggregate of this.aggregates) {
      const col = this.leafColumns.find(c => c.instanceID === aggregate.key || c.key === aggregate.key);
      if (col) out.push({ key: col.key, type: aggregate.type });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Aggregation (grand totals — unchanged contract; grouping does not affect these)

  private async reAggregate(
    requestId: number,
    reason: "aggregateScope" | "aggregateModel" = "aggregateModel",
    aggregateReason?: IRowModelRequestParams["aggregateReason"],
  ): Promise<void> {
    this.aggregateValues.clear();
    const requestSeq = ++this.aggregateRequestSeq;
    if (this.aggregateScope !== "none" && this.aggregates.length > 0) {
      if (this.aggregateScope === "all" && this.serverAggregationSource) {
        await this.requestServerAggregates(requestSeq);
      } else {
        this.calculateLocalAggregates();
      }
    }

    if (requestSeq !== this.aggregateRequestSeq) return;
    this.listener.onAggregates(requestId, {
      reason: aggregateReason ?? (reason === "aggregateScope" ? "scope" : "model"),
      scope: this.aggregateScope,
      aggregateModel: this.aggregates.slice(),
      valuesAvailable: this.aggregateValues.size > 0,
    });
  }

  private calculateLocalAggregates(): void {
    const rows = this.getAggregateRows();
    this.aggregateValues = this.aggregateCalculator.calculateAggregates(this.leafColumns, this.aggregates, rows);
  }

  private getAggregateRows(): IRowNode<Row>[] {
    const rows: IRowNode<Row>[] = [];
    if (this.aggregateScope === "all") {
      this.forEachNode((node) => rows.push(node as IRowNode<Row>));
      return rows;
    }
    for (let i = 0; i < this.getViewCount(); i++) {
      const node = this.getRowNodeAtViewIndex(i);
      if (node && !node.isGroup) rows.push(node);
    }
    return rows;
  }

  private async requestServerAggregates(requestSeq: number): Promise<void> {
    if (!this.serverAggregationSource) return;
    const aggregates = this.buildServerAggregateRequest();
    if (aggregates.length === 0) return;
    const params = this.lastRequestParams;

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const maybePromise = this.serverAggregationSource!({
          request: {
            aggregates,
            aggregateScope: "all",
            filters: this.createAggregationFilters(),
            sorts: params ? this.serializeSorts(params.sortModel) : [],
            startRow: undefined,
            endRow: undefined,
          },
          success: resolve,
          error: reject,
        });
        Promise.resolve(maybePromise)
          .then((maybeResult) => {
            if (maybeResult && typeof maybeResult === "object") {
              resolve(maybeResult);
            }
          })
          .catch(reject);
      });

      if (requestSeq !== this.aggregateRequestSeq) return;
      const valuesObj = result?.values ?? result ?? {};
      for (const col of this.leafColumns) {
        const value = valuesObj?.[col.instanceID] ?? valuesObj?.[col.key];
        if (value != null) this.aggregateValues.set(col.instanceID, value);
      }
    } catch (err) {
      if (requestSeq !== this.aggregateRequestSeq) return;
      this.aggregateValues.clear();
      console.error("Failed to fetch server-side aggregates", err);
    }
  }

  private buildServerAggregateRequest(): AggregateModel[] {
    const aggregateMap = new Map(this.aggregates.map(a => [a.key, a.type]));
    const aggregates: AggregateModel[] = [];
    for (const col of this.leafColumns) {
      const type = aggregateMap.get(col.instanceID) ?? this.getDefaultAggregateOp(col);
      aggregates.push({ key: col.key, type });
    }
    return aggregates;
  }

  private getDefaultAggregateOp(col: { isComputableType(): boolean }): AggregateType {
    return this.aggregateCalculator.getDefaultAggregateOp(col);
  }

  private normalizeAggregateScope(scope: AggregateScope): AggregateScope {
    if (scope === "all" && !this.serverAggregationSource) return "page";
    return scope;
  }
}
