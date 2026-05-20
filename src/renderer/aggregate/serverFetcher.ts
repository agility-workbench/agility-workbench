import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { AggregateModel, AggregateType } from "../../interfaces/aggregate";
import { ServerSideAggregationSource, ServerSideRequest } from "../../ssrm/serverSide";

type AggregateServerFetcherParams = {
  core: GridCore;
  leafColumns: () => Column[];
  getAggregateMap: () => Map<string, AggregateType>;
  renderAggregateRow: () => void;
};

export class AggregateServerFetcher {
  private remoteValues: Map<string, any> | null = null;
  private remoteDirty = true;
  private requestSeq = 0;
  private fetchInFlight = false;

  constructor(private params: AggregateServerFetcherParams) {}

  getRemoteValues() {
    return this.remoteValues;
  }

  markDirty() {
    const rowModel = this.params.core.getRowModel();
    if (rowModel.getType() !== "serverSide") return;
    this.remoteDirty = true;
    this.remoteValues = null;
    this.requestSeq++;
    this.fetchInFlight = false;
  }

  maybeRequest() {
    const rowModel = this.params.core.getRowModel();
    if (rowModel.getType() !== "serverSide") return;
    if (this.params.core.getAggregateScope() !== "all") return;
    const serverAggregationSource = (rowModel as any).serverAggregationSource as ServerSideAggregationSource | undefined;
    if (!serverAggregationSource) return;
    const aggregateMap = this.params.getAggregateMap();
    if (aggregateMap.size === 0) return;
    if (!this.remoteDirty && this.remoteValues) return;
    if (this.fetchInFlight) return;

    const leafColumns = this.params.leafColumns();
    const aggregates = Array.from(aggregateMap.entries())
      .map(([colId, type]) => {
        const col = this.params.core.getColumnModel().getById(colId);
        if (!col) return null;
        return { key: col.key, type };
      })
      .filter(Boolean) as Array<AggregateModel>;

    if (aggregates.length === 0) return;

    if (aggregates.length < leafColumns.length) {
      const missingLeaves = leafColumns.filter(l => aggregates.findIndex(f => f.key == l.key) < 0);
      aggregates.push(...missingLeaves.map(m => ({ key: m.key, type: AggregateType.COUNT })) as Array<AggregateModel>);
    }

    const filtersByKey = new Map<string, ServerSideRequest["filters"][number]>();
    for (const item of this.params.core.getFilterModel().items) {
      filtersByKey.set(item.col.key, {
        key: item.col.key,
        filters: item.filters.map(filter => ({ type: filter.type, values: filter.values })),
        join: item.join,
      });
    }
    const filters: ServerSideRequest["filters"] = Array.from(filtersByKey.values());

    const sortsByKey = new Map<string, ServerSideRequest["sorts"][number]>();
    for (const item of this.params.core.getSortModel().items) {
      sortsByKey.set(item.col.key, {
        key: item.col.key,
        dir: item.dir,
      });
    }
    const sorts: ServerSideRequest["sorts"] = Array.from(sortsByKey.values());

    this.fetchInFlight = true;
    this.remoteDirty = false;
    const requestId = ++this.requestSeq;
    new Promise<any>((resolve, reject) => {
      const maybePromise = serverAggregationSource({
        request: {
          aggregates,
          aggregateScope: "all",
          filters,
          sorts,
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
    })
      .then((result) => {
        if (requestId !== this.requestSeq) return;
        const valuesObj = (result as any)?.values ?? result ?? {};
        const map = new Map<string, any>();
        for (const col of leafColumns) {
          const v = valuesObj?.[col.instanceID] ?? valuesObj?.[col.key];
          if (v != null) {
            map.set(col.instanceID, v);
          }
        }
        this.remoteValues = map;
        this.fetchInFlight = false;
        this.params.renderAggregateRow();
      })
      .catch((err) => {
        console.error("Failed to fetch server-side aggregates", err);
        if (requestId !== this.requestSeq) return;
        this.remoteValues = null;
        this.fetchInFlight = false;
        this.params.renderAggregateRow();
      });
  }
}
