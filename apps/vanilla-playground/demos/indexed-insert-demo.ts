import {
  ColumnType,
  type ColDef,
  type RowInsertionMenuOptions,
  type RowTransactionResult,
} from "@grid";

import { btn, h, numberInput } from "../dom";
import { mountGrid, setRuntimeOptions } from "../demoGrid";

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

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "Row ID", width: 140 },
  { colId: "label", key: "label", label: "Label", width: 190 },
  { colId: "api", key: "api", label: "Inserted by", width: 120 },
  {
    colId: "requestedIndex", key: "requestedIndex", label: "Requested index",
    width: 145, type: ColumnType.NUMBER,
  },
  { colId: "batch", key: "batch", label: "Batch", width: 90, type: ColumnType.NUMBER },
  {
    colId: "batchOrder", key: "batchOrder", label: "Order in batch",
    width: 135, type: ColumnType.NUMBER,
  },
];

export function mountIndexedInsertDemo(container: HTMLElement): () => void {
  let nextRowId = INITIAL_ROW_COUNT + 1;
  let nextBatch = 1;
  let rowsToInsert = "5";
  let addIndexValue = "3";
  let pendingAsync = 0;
  let status = "Choose a block size and source index, then run either API.";
  let rowInsertionMenuEnabled = false;

  const host = h("div", { class: "indexed-insert-grid" });
  const statusBox = h("div", { class: "indexed-insert-status", "aria-live": "polite" });

  const menuButton = btn("Enable row-number Insert menu", () => {
    rowInsertionMenuEnabled = !rowInsertionMenuEnabled;
    menuButton.textContent = `${rowInsertionMenuEnabled ? "Disable" : "Enable"} row-number Insert menu`;
    menuButton.setAttribute("aria-pressed", String(rowInsertionMenuEnabled));
    // `rowInsertionMenu` is a runtime option, so it flips in place through the renderer.
    setRuntimeOptions(grid, {
      rowInsertionMenu: rowInsertionMenuEnabled ? rowInsertionMenu : undefined,
    });
    setStatus(rowInsertionMenuEnabled
      ? "Row-number Insert menu enabled. Right-click a row number to insert above or below it."
      : "Row-number Insert menu disabled.");
  }, { "aria-pressed": "false" });

  container.appendChild(h("section", { class: "indexed-insert-demo" },
    h("header", { class: "indexed-insert-header" },
      h("div", null,
        h("div", { class: "indexed-insert-eyebrow", text: "Client-side transactions" }),
        h("h2", { text: "Indexed row insertion" }),
        h("p", {
          text: "Insert a contiguous block into the underlying row order. With no active sort or"
            + " filter, the requested source index is also the displayed position. Enable the"
            + " row-number menu to insert one row above or below from a right-click.",
        }),
      ),
      statusBox,
    ),
    h("div", { class: "indexed-insert-controls" },
      h("label", null, "Number of rows", numberInput(rowsToInsert, value => { rowsToInsert = value; }, {
        min: 1, max: MAX_INSERT_COUNT, step: 1,
      })),
      h("label", null, "Insert at index", numberInput(addIndexValue, value => { addIndexValue = value; }, {
        min: 0, step: 1,
      })),
      btn("Insert with sync API", () => {
        const { count, index } = readRequest();
        const result = grid.api.applyTransaction({
          add: makeRows("sync", count, index),
          addIndex: index,
        });
        setStatus(`Sync transaction at index ${index}: ${resultText(result)}.`);
      }),
      btn("Insert with async API", () => void insertAsync()),
      menuButton,
    ),
    host,
  ));

  const rowInsertionMenu: RowInsertionMenuOptions = {
    createRow: ({ position, addIndex }) => {
      const [row] = makeRows("menu", 1, addIndex);
      setStatus(`Context menu inserted 1 row ${position} at source index ${addIndex}.`);
      return row;
    },
  };

  const grid = mountGrid(host, {
    rowData: buildInitialRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowNumbers: true,
    zebraRows: true,
    highlightActiveCell: true,
    asyncTransactionWaitMs: 64,
  });

  renderStatus();

  function readRequest(): { count: number; index: number } {
    return {
      count: normalizeInteger(rowsToInsert, 1, MAX_INSERT_COUNT, 1),
      index: normalizeInteger(addIndexValue, 0, Number.MAX_SAFE_INTEGER, 0),
    };
  }

  function makeRows(api: "sync" | "async" | "menu", count: number, index: number): InsertRow[] {
    const batch = nextBatch++;
    return Array.from({ length: count }, (_, offset) => {
      const id = nextRowId++;
      return {
        id: `inserted-${id}`,
        label: `${api === "sync" ? "Sync" : api === "async" ? "Async" : "Menu"} inserted row ${id}`,
        api,
        requestedIndex: index,
        batch,
        batchOrder: offset + 1,
      };
    });
  }

  async function insertAsync(): Promise<void> {
    const { count, index } = readRequest();
    pendingAsync += 1;
    setStatus(`Queued async transaction with ${count} rows at index ${index}…`);
    try {
      const result = await grid.api.applyTransactionAsync({
        add: makeRows("async", count, index),
        addIndex: index,
      });
      setStatus(`Async transaction settled at index ${index}: ${resultText(result)}.`);
    } finally {
      pendingAsync = Math.max(0, pendingAsync - 1);
      renderStatus();
    }
  }

  function setStatus(text: string): void {
    status = text;
    renderStatus();
  }

  function renderStatus(): void {
    statusBox.textContent = `${status}${pendingAsync > 0 ? ` (${pendingAsync} async pending)` : ""}`;
  }

  return () => grid.destroy();
}
