import { GridCore } from "../core/core";
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

  refreshData() {
    if (this.params.core.getRowModel().getType() !== "serverSide") return;
    this.params.core.refreshRows("refresh");
  }
}
