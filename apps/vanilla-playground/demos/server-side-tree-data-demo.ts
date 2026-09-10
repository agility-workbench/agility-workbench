import {
  createGrid,
  ColumnType,
  type ColDef,
  type IGridAPI,
  type IServerSideDataSource,
  type IServerSideRequest,
  type TreeDataOptions,
} from "@grid";

import { btn, checkbox, demoRoot, field, gridHost, h, select, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

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

// A ragged tree of ~3,400 nodes over 5 levels: 14 root folders + 6 root files, then 3 folders and
// 7 files per folder down to depth 3, and files only at depth 4.
function buildTree(): FsRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
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

const COLUMNS: ColDef[] = [
  { colId: "kind", key: "kind", label: "Kind", width: 110 },
  { colId: "owner", key: "owner", label: "Owner", width: 120 },
  { colId: "size", key: "size", label: "Size (KB)", width: 130, type: ColumnType.NUMBER },
];

export function mountServerSideTreeDataDemo(container: HTMLElement): () => void {
  let reportTotals = true;
  let defaultExpanded = 0;
  let stickyAncestors = true;
  let keyboardMode: "grid" | "hierarchy" = "hierarchy";
  let targetId = ROOT_FOLDERS[0].id;
  let purge = true;
  let requestLog: string[] = [];

  const host = gridHost();
  const logLine = h("div", {
    style: { fontSize: "11px", color: "#9ca3af", fontFamily: "monospace", minHeight: "16px" },
  });

  const dataSource: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      const parent = request.treeParent;
      requestLog = [
        `${parent ? parent.path.join("/") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...requestLog,
      ].slice(0, 6);
      renderLog();
      setTimeout(() => success(serveTree(request, reportTotals)), 250);
    },
  };

  container.appendChild(demoRoot(
    toolbarRow(
      field("Report totalRows (off → listings probe their own end)", checkbox(reportTotals, value => {
        reportTotals = value;
      }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } }),
      field("Default expanded", select(
        [
          { value: 0, label: "collapsed" },
          { value: 1, label: "first level" },
          { value: -1, label: "all (fans out lazily)" },
        ],
        defaultExpanded,
        value => {
          defaultExpanded = Number(value);
          // groupDefaultExpanded is a creation option: the grid is rebuilt, as the React page's
          // `key` change does.
          rebuild();
        },
      ), { style: { fontSize: "12px" } }),
      field("Sticky ancestors", checkbox(stickyAncestors, value => {
        stickyAncestors = value;
        api.updateGridOptions({ groupRowsSticky: stickyAncestors });
      }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } }),
      field("Keyboard", select(
        [
          { value: "grid", label: "grid" },
          { value: "hierarchy", label: "hierarchy (Ctrl/Cmd+Arrows)" },
        ],
        keyboardMode,
        value => {
          keyboardMode = value as typeof keyboardMode;
          api.setTreeDataKeyboardNavigationOptions({
            keyboardNavigationMode: keyboardMode,
            enableKeyboardNavigationModeSwitch: true,
          });
        },
      ), { style: { fontSize: "12px" } }),
      field("Subtree", select(
        ROOT_FOLDERS.map(folder => ({ value: folder.id, label: folder.name })),
        targetId,
        value => { targetId = value; },
      ), { style: { fontSize: "12px" } }),
      field("purge", checkbox(purge, value => { purge = value; }), {
        style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" },
      }),
      btn("Mutate subtree + refresh", () => {
        mutateSubtree(targetId);
        void api.refreshServerSideData({ rowId: targetId, purge });
      }),
    ),
    logLine,
    host,
  ));

  let api = create();
  renderLog();

  function treeData(): TreeDataOptions<FsRow> {
    return {
      mode: "server",
      hasChildren: (row: FsRow) => row.kind === "folder",
      getLabel: (row: FsRow) => row.name,
      // `key: "name"` names the server field the labels come from, so sorting/filtering the
      // hierarchy column goes on the wire under "name" instead of the internal "__pte_tree__".
      columnDef: { label: "Path", width: 340, key: "name" },
      keyboardNavigationMode: keyboardMode,
      enableKeyboardNavigationModeSwitch: true,
    };
  }

  function create(): IGridAPI {
    return createGrid(host, {
      columnDefs: COLUMNS,
      rowIdKey: "id",
      rowModelType: "serverSide",
      serverSideDataSource: dataSource,
      serverSideBlockSize: 50,
      treeData: treeData(),
      groupDefaultExpanded: defaultExpanded,
      groupRowsSticky: stickyAncestors,
      rowSelection: { mode: "multiple" },
    });
  }

  function rebuild(): void {
    api.destroy();
    host.replaceChildren();
    api = create();
  }

  function renderLog(): void {
    logLine.textContent = `children requests: ${requestLog.join("  •  ") || "—"}`;
  }

  return () => api.destroy();
}
