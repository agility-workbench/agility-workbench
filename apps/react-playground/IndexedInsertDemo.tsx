import { useMemo, useRef, useState } from "react";

import { ColumnType, type IGridAPI, type RowTransactionResult } from "@grid";
import { Grid, type ReactColDef } from "@react-grid";

type InsertRow = {
  id: string;
  label: string;
  api: "initial" | "sync" | "async" | "menu";
  requestedIndex: number | null;
  batch: number;
  batchOrder: number;
};

const INITIAL_ROW_COUNT = 24;
const MAX_INSERT_COUNT = 1_000;

function buildInitialRows(): InsertRow[] {
  return Array.from({ length: INITIAL_ROW_COUNT }, (_, index) => ({
    id: `initial-${index + 1}`,
    label: `Initial row ${index + 1}`,
    api: "initial",
    requestedIndex: null,
    batch: 0,
    batchOrder: index + 1,
  }));
}

function normalizeInteger(raw: string, minimum: number, maximum: number, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

function resultText(result: RowTransactionResult): string {
  return `${result.added} added, ${result.updated} updated, ${result.removed} removed`;
}

export default function IndexedInsertDemo() {
  const initialRows = useMemo(buildInitialRows, []);
  const apiRef = useRef<IGridAPI | null>(null);
  const nextRowId = useRef(INITIAL_ROW_COUNT + 1);
  const nextBatch = useRef(1);
  const [rowsToInsert, setRowsToInsert] = useState("5");
  const [addIndex, setAddIndex] = useState("3");
  const [pendingAsync, setPendingAsync] = useState(0);
  const [rowInsertionMenuEnabled, setRowInsertionMenuEnabled] = useState(false);
  const [status, setStatus] = useState("Choose a block size and source index, then run either API.");

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "Row ID", width: 140 },
    { colId: "label", key: "label", label: "Label", width: 190 },
    { colId: "api", key: "api", label: "Inserted by", width: 120 },
    {
      colId: "requestedIndex",
      key: "requestedIndex",
      label: "Requested index",
      width: 145,
      type: ColumnType.NUMBER,
    },
    { colId: "batch", key: "batch", label: "Batch", width: 90, type: ColumnType.NUMBER },
    {
      colId: "batchOrder",
      key: "batchOrder",
      label: "Order in batch",
      width: 135,
      type: ColumnType.NUMBER,
    },
  ], []);

  const readRequest = () => ({
    count: normalizeInteger(rowsToInsert, 1, MAX_INSERT_COUNT, 1),
    index: normalizeInteger(addIndex, 0, Number.MAX_SAFE_INTEGER, 0),
  });

  const makeRows = (api: "sync" | "async" | "menu", count: number, index: number): InsertRow[] => {
    const batch = nextBatch.current++;
    return Array.from({ length: count }, (_, offset) => {
      const id = nextRowId.current++;
      return {
        id: `inserted-${id}`,
        label: `${api === "sync" ? "Sync" : api === "async" ? "Async" : "Menu"} inserted row ${id}`,
        api,
        requestedIndex: index,
        batch,
        batchOrder: offset + 1,
      };
    });
  };

  const insertSync = () => {
    const api = apiRef.current;
    if (!api) return;
    const { count, index } = readRequest();
    const result = api.applyTransaction({ add: makeRows("sync", count, index), addIndex: index });
    setStatus(`Sync transaction at index ${index}: ${resultText(result)}.`);
  };

  const insertAsync = async () => {
    const api = apiRef.current;
    if (!api) return;
    const { count, index } = readRequest();
    setPendingAsync(value => value + 1);
    setStatus(`Queued async transaction with ${count} rows at index ${index}…`);
    try {
      const result = await api.applyTransactionAsync({
        add: makeRows("async", count, index),
        addIndex: index,
      });
      setStatus(`Async transaction settled at index ${index}: ${resultText(result)}.`);
    } finally {
      setPendingAsync(value => Math.max(0, value - 1));
    }
  };

  const toggleRowInsertionMenu = () => {
    const enabled = !rowInsertionMenuEnabled;
    setRowInsertionMenuEnabled(enabled);
    setStatus(enabled
      ? "Row-number Insert menu enabled. Right-click a row number to insert above or below it."
      : "Row-number Insert menu disabled.");
  };

  const rowInsertionMenu = rowInsertionMenuEnabled
    ? {
        createRow: ({ position, addIndex }: { position: "above" | "below"; addIndex: number }) => {
          const [row] = makeRows("menu", 1, addIndex);
          setStatus(`Context menu inserted 1 row ${position} at source index ${addIndex}.`);
          return row;
        },
      }
    : undefined;

  return (
    <section className="indexed-insert-demo">
      <header className="indexed-insert-header">
        <div>
          <div className="indexed-insert-eyebrow">Client-side transactions</div>
          <h2>Indexed row insertion</h2>
          <p>
            Insert a contiguous block into the underlying row order. With no active sort or filter,
            the requested source index is also the displayed position. Enable the row-number menu
            to insert one row above or below from a right-click.
          </p>
        </div>
        <div className="indexed-insert-status" aria-live="polite">
          {status}{pendingAsync > 0 ? ` (${pendingAsync} async pending)` : ""}
        </div>
      </header>

      <div className="indexed-insert-controls">
        <label>
          Number of rows
          <input
            type="number"
            min={1}
            max={MAX_INSERT_COUNT}
            step={1}
            value={rowsToInsert}
            onChange={event => setRowsToInsert(event.target.value)}
          />
        </label>
        <label>
          Insert at index
          <input
            type="number"
            min={0}
            step={1}
            value={addIndex}
            onChange={event => setAddIndex(event.target.value)}
          />
        </label>
        <button className="btn" type="button" onClick={insertSync}>
          Insert with sync API
        </button>
        <button className="btn" type="button" onClick={() => void insertAsync()}>
          Insert with async API
        </button>
        <button
          className="btn"
          type="button"
          aria-pressed={rowInsertionMenuEnabled}
          onClick={toggleRowInsertionMenu}
        >
          {rowInsertionMenuEnabled ? "Disable" : "Enable"} row-number Insert menu
        </button>
      </div>

      <div className="indexed-insert-grid">
        <Grid
          apiRef={apiRef}
          rowData={initialRows}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowNumbers
          rowInsertionMenu={rowInsertionMenu}
          zebraRows
          highlightActiveCell
          asyncTransactionWaitMs={64}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </section>
  );
}
