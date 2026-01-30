import { GridEventMap } from "@grid/events/events";
import { ColDef } from "@grid/interfaces/column";
import { IGridAPI } from "@grid/interfaces/IApi";
import { ColumnState, GridId, IGridCore, RowData } from "@grid/interfaces/iCore";

export class GridAPI implements IGridAPI {
  constructor(private core: IGridCore) {}

  getCore(): IGridCore {
    return this.core;
  }

  dispatch(action: any): void {
    this.core.dispatch(action);
  }

  on<E extends keyof GridEventMap>(
    event: E,
    handler: (ev: GridEventMap[E]) => void
  ): () => void {
    return this.core.on(event, handler);
  }

  setColumnDefs(defs: ColDef[]): void {
    this.dispatch({ type: "SET_COLUMN_DEFS", columnDefs: defs });
  }

  setRowData(rows: RowData[]): void {
    this.dispatch({ type: "SET_ROW_DATA", rows });
  }

  getColumnState(): ColumnState[] {
    return this.core.getColumnModel().getColumnState();
  }

  applyTransaction(tx: {
    add?: RowData[];
    update?: { rowId: GridId; row: RowData }[];
    remove?: GridId[];
  }): void {
    this.dispatch({ type: "APPLY_TRANSACTION", transaction: tx });
  }

  destroy(): void {
    // Cleanup if necessary
  }
}
