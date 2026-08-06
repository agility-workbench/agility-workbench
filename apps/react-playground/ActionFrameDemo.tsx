import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";
import type { ActionFrameComponentParams } from "@grid/renderer/actionFrame/actionFrameComponent";

/**
 * ActionFrame — a persistent frame + attached form popover on a body cell (like a Google Sheets
 * comment). Demonstrates:
 *  - click-to-open trigger (`actionFrameTrigger: "click"`) on the Comment column
 *  - a client-built React form (textarea + Save/Delete) rendered in the popover
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

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): Task[] {
  const rand = mulberry32(19);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => ({
    id: 1 + i,
    title: `Task ${1 + i}`,
    owner: pick(OWNERS),
    status: pick(STATUSES),
    comment: i % 4 === 0 ? "Needs follow-up" : "",
  }));
}

// The client-owned form body. Purely client-scope: the grid gives us the cell context + a `close`
// callback; we own the contents and how we persist them.
function CommentForm(params: ActionFrameComponentParams & { onSave?: (rowId: string, text: string) => void }) {
  const [text, setText] = useState<string>(String(params.value ?? ""));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Comment · {params.data?.title}</div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" }}
        placeholder="Add a comment…"
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            params.onSave?.(params.rowId, "");
            params.close();
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            params.onSave?.(params.rowId, text);
            params.close();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function ActionFrameDemo() {
  const [rows, setRows] = useState(() => buildRows(500));
  const apiRef = useRef<IGridAPI | null>(null);

  const onSave = (rowId: string, text: string) => {
    setRows((prev) => prev.map((r) => (String(r.id) === rowId ? { ...r, comment: text } : r)));
  };

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "title", key: "title", label: "Task", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 150 },
    { colId: "status", key: "status", label: "Status", width: 130 },
    {
      colId: "comment", key: "comment", label: "Comment", width: 220,
      editable: true,
      // Click opens the ActionFrame; hovering still shows a tooltip (they coexist).
      actionFrameTrigger: "click",
      actionFrameComponent: (p: ActionFrameComponentParams) => <CommentForm {...p} onSave={onSave} />,
      // Corner-triangle indicator on cells that already have a comment (field-based form). Try the
      // predicate form too: `(p) => !!p.data.comment`.
      actionFrameIndicator: "comment",
      // Per-column placement override: this column's popover opens to the right of the cell.
      actionFrameOptions: { placement: "right" },
      tooltipValueGetter: (p) => (p.value ? `Comment: ${p.value}` : "Click to add a comment"),
      headerTooltip: "Click a cell to open the comment form (persists across scroll).",
    },
    { colId: "id", key: "id", label: "ID", width: 90, type: ColumnType.NUMBER },
  ], []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        <strong>ActionFrame.</strong> Click a <span style={{ fontWeight: 700 }}>Comment</span> cell → a
        distinct frame appears with an attached form. The frame is <em>persistent</em>: scroll and it
        tracks its cell (scroll far away and it hides, scroll back and it returns). Hovering the cell
        still shows a tooltip (they coexist). Double-click to edit the cell → the frame closes
        (editing and the frame are mutually exclusive). Esc or click-away dismisses. Cells that
        already have a comment show a corner-triangle <em>indicator</em>{" "}
        (<code>actionFrameIndicator</code>), and this column's popover opens to the{" "}
        <em>right</em> via <code>actionFrameOptions.placement</code>.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <button
          type="button"
          className="btn"
          onClick={() => apiRef.current?.openActionFrame({ rowId: "1", colId: "comment" })}
        >
          Open on row 1 (API)
        </button>
        <button type="button" className="btn" onClick={() => apiRef.current?.closeActionFrame()}>
          Close (API)
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          apiRef={apiRef}
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default ActionFrameDemo;
