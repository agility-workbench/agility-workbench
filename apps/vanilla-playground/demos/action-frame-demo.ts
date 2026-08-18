import {
  ColumnType,
  createGrid,
  type ActionFrameComponentParams,
  type ColDef,
  type IGridAPI,
} from "@grid";

import { bold, btn, code, demoRoot, gridHost, h, note, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * ActionFrame — a persistent frame + attached form popover on a body cell (like a Google Sheets
 * comment). Demonstrates:
 *  - click-to-open trigger (`actionFrameTrigger: "click"`) on the Comment column
 *  - a client-built form (textarea + Save/Delete) rendered in the popover
 *  - persistence + cell tracking across scroll (the frame follows its cell; scroll away and back)
 *  - coexistence with a tooltip on the same column (hover shows a tooltip UNDER the frame popover)
 *  - editing-closes-frame (double-click the cell to edit → the frame dismisses)
 *  - programmatic open via the API button
 */

type Task = {
  id: number;
  title: string;
  owner: string;
  status: string;
  comment: string;
};

const OWNERS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva"];
const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

function buildRows(count: number): Task[] {
  const rand = mulberry32(19);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => ({
    id: 1 + i,
    title: `Task ${1 + i}`,
    owner: pick(OWNERS),
    status: pick(STATUSES),
    comment: i % 4 === 0 ? "Needs follow-up" : "",
  }));
}

/**
 * The client-owned form body. Purely client-scope: the grid gives us the cell context and a `close`
 * callback; we own the contents and how we persist them. Because this is the function form of the
 * component contract, it is re-invoked to refresh — so it builds its element each call and keeps
 * its draft text in a local `let`.
 */
function commentForm(
  params: ActionFrameComponentParams,
  onSave: (rowId: string, text: string) => void,
): HTMLElement {
  let text = String(params.value ?? "");

  const textarea = h("textarea", {
    rows: 4,
    value: text,
    placeholder: "Add a comment…",
    style: { width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" },
    onInput: (event: Event) => { text = (event.target as HTMLTextAreaElement).value; },
  });
  // The popover is already open when the component mounts, so focusing next frame wins the race
  // with the grid's own focus handling.
  requestAnimationFrame(() => textarea.focus());

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
    h("div", {
      text: `Comment · ${params.data?.title}`,
      style: { fontWeight: "700", fontSize: "13px" },
    }),
    textarea,
    h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
      btn("Delete", () => {
        onSave(params.rowId, "");
        params.close();
      }),
      btn("Save", () => {
        onSave(params.rowId, text);
        params.close();
      }),
    ),
  );
}

export function mountActionFrameDemo(container: HTMLElement): () => void {
  const rows = buildRows(500);
  const rowsById = new Map(rows.map(row => [String(row.id), row]));
  let api: IGridAPI;

  const onSave = (rowId: string, text: string): void => {
    const row = rowsById.get(rowId);
    if (!row) return;
    const next = { ...row, comment: text };
    rowsById.set(rowId, next);
    // A targeted transaction repaints just this row — no full setRowData, so scroll position and
    // edit history survive.
    api.applyTransaction({ update: [{ rowId, row: next }] });
  };

  const columnDefs: ColDef[] = [
    { colId: "title", key: "title", label: "Task", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 150 },
    { colId: "status", key: "status", label: "Status", width: 130 },
    {
      colId: "comment", key: "comment", label: "Comment", width: 220,
      editable: true,
      // Click opens the ActionFrame; hovering still shows a tooltip (they coexist).
      actionFrameTrigger: "click",
      actionFrameComponent: params => commentForm(params, onSave),
      // Corner-triangle indicator on cells that already have a comment (field-based form). Try the
      // predicate form too: `p => !!p.data.comment`.
      actionFrameIndicator: "comment",
      // Per-column placement override: this column's popover opens to the right of the cell.
      actionFrameOptions: { placement: "right" },
      tooltipValueGetter: p => (p.value ? `Comment: ${p.value}` : "Click to add a comment"),
      headerTooltip: "Click a cell to open the comment form (persists across scroll).",
    },
    { colId: "id", key: "id", label: "ID", width: 90, type: ColumnType.NUMBER },
  ];

  const host = gridHost();

  container.appendChild(demoRoot(
    note(
      bold("ActionFrame."), " Click a ", bold("Comment"), " cell → a distinct frame appears with an"
      + " attached form. The frame is ", h("em", { text: "persistent" }), ": scroll and it tracks its"
      + " cell (scroll far away and it hides, scroll back and it returns). Hovering the cell still"
      + " shows a tooltip (they coexist). Double-click to edit the cell → the frame closes (editing"
      + " and the frame are mutually exclusive). Esc or click-away dismisses. Cells that already have"
      + " a comment show a corner-triangle ", h("em", { text: "indicator" }), " (",
      code("actionFrameIndicator"), "), and this column's popover opens to the ",
      h("em", { text: "right" }), " via ", code("actionFrameOptions.placement"), ".",
    ),
    toolbarRow(
      btn("Open on row 1 (API)", () => api.openActionFrame({ rowId: "1", colId: "comment" })),
      btn("Close (API)", () => api.closeActionFrame()),
    ),
    host,
  ));

  api = createGrid(host, {
    rowData: rows,
    columnDefs,
    rowIdKey: "id",
  });

  return () => api.destroy();
}
