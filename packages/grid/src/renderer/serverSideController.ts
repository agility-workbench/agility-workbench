import { GridCore } from "../core/core";
import { ServerSideRefreshOptions } from "../interfaces/iRowModel";
import { IServerSideDataSource } from "../interfaces/serverSide";
import { ServerSideAggregationSource } from "../ssrm/serverSide";

type ServerSideControllerParams = {
  core: GridCore;
  markAggregatesDirty: () => void;
  renderAggregateRow: () => void;
};

export class ServerSideController {
  constructor(private params: ServerSideControllerParams) {}

  setDataSource(dataSource?: IServerSideDataSource) {
    this.params.core.setServerSideDataSource(dataSource ?? null);
    this.params.markAggregatesDirty();
    this.params.renderAggregateRow();
  }

  setAggregation(aggregation?: ServerSideAggregationSource) {
    this.params.core.setServerSideAggregationSource(aggregation ?? null);
    this.params.markAggregatesDirty();
    this.params.renderAggregateRow();
  }

  refreshData(options?: ServerSideRefreshOptions): Promise<boolean> {
    if (this.params.core.getRowModel().getType() !== "serverSide") return Promise.resolve(false);
    return this.params.core.refreshServerSideData(options);
  }
}
