import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { IServerSideDataSource, IServerSideRequest, TreeDataOptions } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Server-side tree data: the hierarchy is the rows' own (a file tree), and the fake server (in
 * memory, 250ms latency) answers one question — "the children of this row" — through
 * `request.treeParent`. Folders and files are siblings at every level and depth is unbounded, so
 * nothing here could be expressed as column-value grouping.
 *
 * Things worth trying: expand a deep folder and watch the request log show a single child fetch;
 * turn "Report totalRows" off to see open-ended listings probe their own end; sort the Path column
 * (its `key` is the server's `name` field, so the server sorts the hierarchy); switch keyboard mode
 * to hierarchy and drive the tree with Ctrl/Cmd+Arrows; and mutate a subtree on the "server", which
 * only becomes visible through `refreshServerSideData({ rowId })`.
 */

type FsRow = {
  id: string;
  name: string;
  kind: "folder" | "file";
  parentId: string | null;
  owner: string;
  size: number;
};

const FOLDERS = ["assets", "billing", "checkout", "docs", "identity", "ledger", "media", "search", "shipping", "telemetry"];
const FILES = ["changelog", "handbook", "index", "notes", "readme", "report", "schema", "spec", "summary", "todo"];
const EXTENSIONS = ["md", "json", "ts", "csv", "png"];
const OWNERS = ["ana", "bruno", "chen", "dara", "efe", "farah"];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A ragged tree of ~3,400 nodes over 5 levels: 14 root folders + 6 root files, then 3 folders and
// 7 files per folder down to depth 3, and files only at depth 4.
function buildTree(): FsRow[] {
  const rand = mulberry32(7);
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(rand() * values.length)];
  const rows: FsRow[] = [];
  let seq = 0;

  const addFile = (parentId: string | null) => {
    seq++;
    rows.push({
      id: `n${seq}`,
      name: `${pick(FILES)}-${seq}.${pick(EXTENSIONS)}`,
      kind: "file",
      parentId,
      owner: pick(OWNERS),
      size: 1 + Math.floor(rand() * 4096),
    });
  };

  const addFolder = (parentId: string | null, depth: number) => {
    seq++;
    const id = `n${seq}`;
    rows.push({
      id,
      name: `${pick(FOLDERS)}-${seq}`,
      kind: "folder",
      parentId,
      owner: pick(OWNERS),
      size: 0,
    });
    const folders = depth >= 3 ? 0 : 3;
    const files = depth >= 3 ? 6 : 7;
    for (let i = 0; i < folders; i++) addFolder(id, depth + 1);
    for (let i = 0; i < files; i++) addFile(id);
  };

  for (let i = 0; i < 14; i++) addFolder(null, 0);
  for (let i = 0; i < 6; i++) addFile(null);
  return rows;
}

// The "database": mutable module state, so the Mutate button can change the server's answer the
// way a real backend would — invisible to the grid until a refresh asks again.
const ALL_ROWS = buildTree();
const ROOT_FOLDERS = ALL_ROWS.filter(row => row.parentId === null && row.kind === "folder");
let mutations = 0;

function childrenOf(parentId: string | null): FsRow[] {
  return ALL_ROWS.filter(row => row.parentId === parentId);
}

// Folders before files, then alphabetical — a directory listing's natural order — unless the grid
// asked for a sort. The Path column's key is the server's `name` field (see treeData.columnDef),
// so a hierarchy-column sort arrives here as an ordinary field sort.
function serveTree(request: IServerSideRequest, reportTotals: boolean) {
  const rows = childrenOf(request.treeParent?.id ?? null).slice();
  const sort = request.sorts[0];
  if (sort) {
    const dir = sort.dir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  } else {
    rows.sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) || a.name.localeCompare(b.name));
  }
  const start = request.startRow ?? 0;
  const end = request.endRow ?? rows.length;
  return {
    rows: rows.slice(start, end),
    totalRows: reportTotals ? rows.length : undefined,
  };
}

/** Rename the target's direct children and add one file, on the server only. */
function mutateSubtree(parentId: string): void {
  mutations++;
  for (const row of childrenOf(parentId)) {
    row.name = `${row.name.replace(/ \(v\d+\)$/, "")} (v${mutations})`;
    row.owner = OWNERS[mutations % OWNERS.length];
  }
  ALL_ROWS.push({
    id: `added-${parentId}-${mutations}`,
    name: `added-${mutations}.md`,
    kind: "file",
    parentId,
    owner: "server",
    size: 100 * mutations,
  });
}

type DefaultExpanded = "0" | "1" | "-1";

export function ServerSideTreeDataDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const [reportTotals, setReportTotals] = useState(true);
  const [defaultExpanded, setDefaultExpanded] = useState<DefaultExpanded>("0");
  const [stickyAncestors, setStickyAncestors] = useState(true);
  const [keyboardMode, setKeyboardMode] = useState<"grid" | "hierarchy">("hierarchy");
  const [targetId, setTargetId] = useState(ROOT_FOLDERS[0].id);
  const [purge, setPurge] = useState(true);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const reportTotalsRef = useRef(reportTotals);
  reportTotalsRef.current = reportTotals;

  const dataSource = useMemo<IServerSideDataSource>(() => ({
    getRows: ({ request, success }) => {
      const parent = request.treeParent;
      setRequestLog(log => [
        `${parent ? parent.path.join("/") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...log,
      ].slice(0, 6));
      setTimeout(() => success(serveTree(request, reportTotalsRef.current)), 250);
    },
  }), []);

  const treeData = useMemo<TreeDataOptions<FsRow>>(() => ({
    mode: "server",
    hasChildren: (row: FsRow) => row.kind === "folder",
    getLabel: (row: FsRow) => row.name,
    // `key: "name"` names the server field the labels come from, so sorting/filtering the
    // hierarchy column goes on the wire under "name" instead of the internal "__pte_tree__".
    columnDef: { label: "Path", width: 340, key: "name" },
    keyboardNavigationMode: keyboardMode,
    enableKeyboardNavigationModeSwitch: true,
  }), [keyboardMode]);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "kind", key: "kind", label: "Kind", width: 110 },
    { colId: "owner", key: "owner", label: "Owner", width: 120 },
    { colId: "size", key: "size", label: "Size (KB)", width: 130, type: ColumnType.NUMBER },
  ], []);

  const applyKeyboardMode = (mode: "grid" | "hierarchy") => {
    setKeyboardMode(mode);
    apiRef.current?.setTreeDataKeyboardNavigationOptions({
      keyboardNavigationMode: mode,
      enableKeyboardNavigationModeSwitch: true,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={reportTotals}
            onChange={(e) => setReportTotals(e.target.checked)}
          />
          Report totalRows (off → listings probe their own end)
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          Default expanded
          <select
            value={defaultExpanded}
            onChange={(e) => setDefaultExpanded(e.target.value as DefaultExpanded)}
          >
            <option value="0">collapsed</option>
            <option value="1">first level</option>
            <option value="-1">all (fans out lazily)</option>
          </select>
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={stickyAncestors}
            onChange={(e) => setStickyAncestors(e.target.checked)}
          />
          Sticky ancestors
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          Keyboard
          <select
            value={keyboardMode}
            onChange={(e) => applyKeyboardMode(e.target.value as "grid" | "hierarchy")}
          >
            <option value="grid">grid</option>
            <option value="hierarchy">hierarchy (Ctrl/Cmd+Arrows)</option>
          </select>
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          Subtree
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {ROOT_FOLDERS.map(folder => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
          purge
        </label>

        <button
          className="btn"
          type="button"
          onClick={() => {
            mutateSubtree(targetId);
            void apiRef.current?.refreshServerSideData({ rowId: targetId, purge });
          }}
        >
          Mutate subtree + refresh
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", minHeight: 16 }}>
        children requests: {requestLog.join("  •  ") || "—"}
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          // groupDefaultExpanded is a creation option, so changing it remounts the grid.
          key={defaultExpanded}
          apiRef={apiRef}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          serverSideBlockSize={50}
          treeData={treeData}
          groupDefaultExpanded={Number(defaultExpanded)}
          groupRowsSticky={stickyAncestors}
          rowSelection={{ mode: "multiple" }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default ServerSideTreeDataDemo;
