import { useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import { isServerSideDataError } from "@grid";
import type { IServerSideDataSource, IServerSideRequest, TreeDataOptions } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Server-side tree data with a row id that repeats an ancestor's id — the store's guard in action.
 *
 * The contract says row ids must be unique across the whole tree. This page shows what the grid
 * does when a server breaks that rule: folder "alpha" has a child folder whose id is ALSO "alpha".
 *
 * Expanding alpha fetches its child block. The store checks every id in the block before any row
 * enters it; "alpha" repeats its own parent's id, so the block is rejected whole and reported as an
 * `error` event (code `row_model_error`) naming the row, its parent, and the ancestor chain. What
 * to look for:
 *
 *   1. One error event with that message and NO uncaught errors — the panel's second list stays
 *      empty whatever you click.
 *   2. alpha stays open over one blank slot (the unloaded block) and everything else keeps working:
 *      collapse/expand alpha, sort a column, sticky ancestors while scrolling, refresh beta's subtree.
 *   3. Every later fill that covers the blank slot asks the server again and gets the same answer,
 *      so the error count grows by one per attempt — and stays put while the grid is idle.
 *
 * Before the guard, the block entered the store, the child inherited its parent's expansion entry,
 * and the flatten walk re-entered the same listing until the stack overflowed: a stale paint,
 * thousands of "alpha" copies in the model's walk, an uncaught RangeError on every chevron click,
 * and a hung tab from sticky ancestors or a subtree refresh.
 *
 * Turn "Child repeats parent id" off to see the same tree behave normally.
 */

type FsRow = {
  id: string;
  name: string;
  kind: "folder" | "file";
  parentId: string | null;
  size: number;
};

function buildTree(duplicateId: boolean): FsRow[] {
  const rows: FsRow[] = [];
  const folder = (id: string, name: string, parentId: string | null) =>
    rows.push({ id, name, kind: "folder", parentId, size: 0 });
  const file = (id: string, name: string, parentId: string | null, size: number) =>
    rows.push({ id, name, kind: "file", parentId, size });

  folder("alpha", "alpha", null);
  folder("beta", "beta", null);
  folder("gamma", "gamma", null);
  file("readme", "readme.md", null, 12);
  file("todo", "todo.txt", null, 3);

  // alpha's FIRST child is the offender: a folder whose id is its parent's id.
  if (duplicateId) {
    folder("alpha", 'archive   ← id "alpha" (same as its parent)', "alpha");
  } else {
    folder("alpha-archive", 'archive   (id "alpha-archive")', "alpha");
  }
  for (let i = 1; i <= 12; i++) file(`a${i}`, `alpha-${i}.md`, "alpha", 10 * i);
  // Enough children under beta that the grid scrolls once beta is open.
  for (let i = 1; i <= 24; i++) file(`b${i}`, `beta-${i}.md`, "beta", 5 * i);
  for (let i = 1; i <= 6; i++) file(`g${i}`, `gamma-${i}.md`, "gamma", 7 * i);
  return rows;
}

function serveTree(rows: FsRow[], request: IServerSideRequest) {
  const children = rows
    .filter(row => row.parentId === (request.treeParent?.id ?? null))
    .sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) || a.name.localeCompare(b.name));
  const sort = request.sorts[0];
  if (sort) {
    const dir = sort.dir === "desc" ? -1 : 1;
    children.sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }
  const start = request.startRow ?? 0;
  const end = request.endRow ?? children.length;
  return { rows: children.slice(start, end), totalRows: children.length };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// One entry per error: the structured `details` first (what a handler would switch on), then the
// human message. Whatever a data source's own error() rejection carries shows as just the message.
function describeError(ev: { code: string; message: string; details?: unknown }): string {
  const head = isServerSideDataError(ev.details)
    ? `details: ServerSideDataError reason=${ev.details.reason} rowId="${ev.details.rowId}" `
      + `parentId=${ev.details.parentId === undefined ? "(root)" : `"${ev.details.parentId}"`} `
      + `path=[${ev.details.path.join(" › ")}]\n`
    : "";
  return `${head}${ev.code}: ${ev.message}`;
}

type StoreWalk = { count: number; ids: string[] };

const mono: React.CSSProperties = { fontSize: 11, fontFamily: "monospace" };

export function ServerSideTreeDuplicateIdDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const [duplicateId, setDuplicateId] = useState(true);
  const [sticky, setSticky] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [uncaught, setUncaught] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [walk, setWalk] = useState<StoreWalk | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const rows = useMemo(() => buildTree(duplicateId), [duplicateId]);

  const dataSource = useMemo<IServerSideDataSource>(() => ({
    getRows: ({ request, success }) => {
      const parent = request.treeParent;
      setRequestLog(log => [
        `${parent ? parent.path.join("/") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...log,
      ].slice(0, 6));
      setTimeout(() => success(serveTree(rows, request)), 250);
    },
  }), [rows]);

  const treeData = useMemo<TreeDataOptions<FsRow>>(() => ({
    mode: "server",
    hasChildren: (row: FsRow) => row.kind === "folder",
    getLabel: (row: FsRow) => row.name,
    columnDef: { label: "Path", width: 380, key: "name" },
  }), []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "Row id", width: 130 },
    { colId: "kind", key: "kind", label: "Kind", width: 100 },
    { colId: "size", key: "size", label: "Size (KB)", width: 110, type: ColumnType.NUMBER },
  ], []);

  // What the model would hand the renderer: walk the visible order and count what comes back.
  // With the guard this is rowsChanged's count minus the one unloaded slot; before it, the walk
  // covered thousands of half-built segments while `rowsChanged` last announced a few dozen rows.
  const inspectStore = (api: IGridAPI) => {
    const ids: string[] = [];
    let count = 0;
    api.forEachNodeAfterFilterAndSort(node => {
      count++;
      if (ids.length < 12) ids.push(node.id);
    });
    setWalk({ count, ids });
  };

  const onGridReady = (api: IGridAPI) => {
    for (const off of unsubscribeRef.current) off();
    unsubscribeRef.current = [
      api.on("error", ev => {
        setErrors(list => [...list, describeError(ev)]);
        inspectStore(api);
      }),
      api.on("rowsChanged", ev => {
        if (ev.rowCount !== undefined) setRowCount(ev.rowCount);
        inspectStore(api);
      }),
    ];
  };

  // Before the guard, a chevron click after the corruption re-entered the recursion synchronously
  // and escaped the grid's own event handlers as an uncaught error; window "error" is the only
  // place to see those, and this list must now stay empty.
  useEffect(() => {
    const onWindowError = (ev: ErrorEvent) => {
      setUncaught(list => [...list, ev.message].slice(-6));
    };
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener("error", onWindowError);
      for (const off of unsubscribeRef.current) off();
      unsubscribeRef.current = [];
    };
  }, []);

  const reset = (nextDuplicate = duplicateId) => {
    setDuplicateId(nextDuplicate);
    setSticky(false);
    setGeneration(g => g + 1);
    setErrors([]);
    setUncaught([]);
    setRowCount(null);
    setWalk(null);
    setRequestLog([]);
  };

  // Expand beta first (a healthy listing the grid can scroll), then alpha — whose first child
  // carries the duplicate id.
  const runRepro = async () => {
    const api = apiRef.current;
    if (!api || running) return;
    setRunning(true);
    try {
      api.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: ["beta"] });
      await sleep(700);
      api.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: ["alpha"] });
      await sleep(700);
    } finally {
      setRunning(false);
    }
  };

  // Used to hang the tab: the refresh walked parentId links that formed a cycle.
  const refreshBeta = () => {
    void apiRef.current?.refreshServerSideData({ rowId: "beta", purge: true });
  };

  const hasErrors = errors.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 1100 }}>
        <strong>Duplicate id guard:</strong> folder <code>alpha</code> has a child folder whose row
        id is also <code>alpha</code>. Press <em>Run repro</em> (or expand <code>beta</code>, then{" "}
        <code>alpha</code>, by hand). The grid checks every id in the child block before any row
        enters the store, rejects the block whole, and reports one <code>error</code> event naming
        the row, its parent, and the ancestor chain. alpha stays open over one blank slot and
        nothing else is affected: <strong>click any chevron</strong>, <strong>sort a column</strong>,
        turn on sticky ancestors and scroll, or refresh <code>beta</code> — no uncaught errors, no
        hang. Each later fill that covers the blank slot asks the server again, so the error count
        grows by one per attempt. Turn the checkbox off to see the same tree behave normally.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={duplicateId}
            onChange={(e) => reset(e.target.checked)}
          />
          Child repeats parent id (the bug)
        </label>

        <button className="btn" type="button" disabled={running} onClick={() => void runRepro()}>
          {running ? "Running…" : "Run repro (expand beta, then alpha)"}
        </button>

        <button className="btn" type="button" onClick={() => reset()}>
          Reset grid
        </button>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
          Sticky ancestors
        </label>

        <button className="btn" type="button" onClick={refreshBeta}>
          Refresh beta subtree
        </button>
      </div>

      <div
        style={{
          ...mono,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          padding: 8,
          borderRadius: 4,
          border: `1px solid ${hasErrors ? "#ef4444" : "#d1d5db"}`,
          background: hasErrors ? "rgba(239, 68, 68, 0.08)" : "rgba(156, 163, 175, 0.08)",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            grid "error" events ({errors.length})
          </div>
          {errors.length === 0
            ? <div style={{ color: "#9ca3af" }}>none</div>
            : errors.map((message, i) => (
              <div key={i} style={{ color: "#b91c1c", whiteSpace: "pre-wrap" }}>{message}</div>
            ))}
          <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>
            uncaught errors from grid event handlers ({uncaught.length})
          </div>
          {uncaught.length === 0
            ? <div style={{ color: "#9ca3af" }}>none</div>
            : uncaught.map((message, i) => <div key={i} style={{ color: "#b91c1c" }}>{message}</div>)}
          <div style={{ marginTop: 8 }}>
            last rowsChanged.rowCount: <strong>{rowCount ?? "—"}</strong>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            forEachNodeAfterFilterAndSort walk: {walk ? `${walk.count} loaded rows` : "—"}
          </div>
          <div style={{ wordBreak: "break-all" }}>
            {walk ? walk.ids.join(", ") + (walk.count > walk.ids.length ? ", …" : "") : ""}
          </div>
          <div style={{ marginTop: 8, color: "#9ca3af" }}>
            children requests: {requestLog.join("  •  ") || "—"}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          // Remount on every reset and whenever the dataset's ids change.
          key={`${generation}:${duplicateId ? "dup" : "unique"}`}
          apiRef={apiRef}
          onGridReady={onGridReady}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          serverSideBlockSize={50}
          treeData={treeData}
          groupRowsSticky={sticky}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default ServerSideTreeDuplicateIdDemo;
