/**
 * The rule a refused block of server-side tree rows broke. Each is one the grid can be certain of:
 * a row is never legitimately its own ancestor, and one response never legitimately lists an id
 * twice. The same id under two DIFFERENT parents is deliberately not here — part-way through a soft
 * refresh that is exactly what a row that moved between folders looks like, so the store accepts it.
 */
export type ServerSideDataErrorReason =
  /** The row's id is "", which is the root listing's own key. */
  | "empty_row_id"
  /** The row's id repeats the id of one of its ancestors, its parent included. */
  | "row_id_repeats_ancestor"
  /** Two rows in the same block carry this id. */
  | "row_id_repeats_sibling";

interface ServerSideDataErrorInfo {
  reason: ServerSideDataErrorReason;
  rowId: string;
  parentId: string | undefined;
  path: readonly string[];
  row: unknown;
}

/**
 * A block of server-side tree rows the grid refused to load because its row ids break the contract
 * (ids must be unique across the whole tree — see `treeData.mode: "server"`). Nothing from the
 * block entered the store; the parent stays open over the unloaded slot, and the next fill that
 * covers it asks the server again.
 *
 * It reaches the app as `details` of the `error` event (`code: "row_model_error"`), through the
 * same door a data source's own `error()` rejection takes, so a handler can tell bad data from a
 * failed request without reading the message: `if (isServerSideDataError(ev.details)) …`.
 */
export class ServerSideDataError extends Error {
  override readonly name = "ServerSideDataError";
  /** Which rule the block broke. */
  readonly reason: ServerSideDataErrorReason;
  /** The offending row's id as `getRowId` / `rowIdKey` produced it ("" for `empty_row_id`). */
  readonly rowId: string;
  /** Id of the parent whose children the block holds; `undefined` for the root listing. */
  readonly parentId: string | undefined;
  /** Row ids from the root down to that parent, inclusive — the chain a `row_id_repeats_ancestor`
   * collided with. Empty for the root listing. */
  readonly path: readonly string[];
  /** The offending row object, exactly as the server returned it. */
  readonly row: unknown;

  constructor(info: ServerSideDataErrorInfo) {
    super(messageFor(info));
    this.reason = info.reason;
    this.rowId = info.rowId;
    this.parentId = info.parentId;
    this.path = info.path;
    this.row = info.row;
  }
}

/**
 * Whether a value — typically an `error` event's `details` — is a `ServerSideDataError`. Matches by
 * name as well as by prototype, so a second copy of the grid bundle cannot hide one.
 */
export function isServerSideDataError(value: unknown): value is ServerSideDataError {
  if (value instanceof ServerSideDataError) return true;
  return typeof value === "object" && value !== null && (value as { name?: unknown }).name === "ServerSideDataError";
}

const RULE = "Row ids must be unique across the whole tree (getRowId / rowIdKey); the block was not loaded.";

function messageFor(info: ServerSideDataErrorInfo): string {
  const where = info.parentId === undefined ? "the root listing" : `the children of "${info.parentId}"`;
  switch (info.reason) {
    case "empty_row_id":
      return "Server-side tree data rows need a non-empty row id (getRowId / rowIdKey).";
    case "row_id_repeats_ancestor":
      return `Server-side tree data: row "${info.rowId}" in ${where} repeats the id of one of its ancestors `
        + `(${info.path.join(" › ")}). ${RULE}`;
    case "row_id_repeats_sibling":
      return `Server-side tree data: two rows with id "${info.rowId}" arrived in one block of ${where}. ${RULE}`;
  }
}
