import { GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { ColumnState, GridId, RowData } from "./iCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";

export interface IGridAPI {
  /** Dispatch an action to the core. */
  dispatch(action: GridAction): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: (ev: GridEventMap[E]) => void): Unsubscribe;

  /** Get the current column state. */
  getColumnState(): ColumnState[];

  /** Set the column definitions. */
  setColumnDefs(defs: ColDef[]): void;

  /** Set the row data. */
  setRowData(rows: RowData[]): void;

  /** Apply a transaction to the row data. */
  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData }[]; remove?: GridId[] }): void;

  destroy(): void;
}
