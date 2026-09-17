import {
  createGrid,
  ColumnType,
  type ColDef,
  type IGridAPI,
  type IServerSideDataSource,
  type IServerSideRequest,
  type TreeDataOptions,
} from "@grid";

import { bold, btn, checkbox, code, demoRoot, gridHost, h, toolbarRow } from "../dom";

/**
 * BUG REPRO — server-side tree data with a row id that repeats an ancestor's id.
 *
 * The contract says row ids must be unique across the whole tree. This page shows what happens
 * when a server breaks that rule: folder "alpha" has a child folder whose id is ALSO "alpha".
 *
 * Expanding alpha fetches its child block. The store registers the child under the id its parent
 * already owns, the child inherits the parent's "expanded" state (same id, same expansion entry),
 * and the flatten walk (`rebuildFlat`) re-enters the same child listing until the stack overflows.
 * The core surfaces that only as an `error` event. Observed consequences, in order:
 *
 *   1. The paint goes stale: alpha shows open with a permanently blank slot under it, the row
 *      count freezes, and the model's visible walk reports thousands of copies of "alpha".
 *   2. Every later expand/collapse click re-enters the recursion synchronously — an UNCAUGHT
 *      RangeError out of the grid's mousedown handler, and the click does nothing.
 *   3. A sort or filter purges and re-fetches, hits the overflow again, and leaves blank rows.
 *   4. The duplicate node's `parentId` points at itself, so every `parentId` walk cycles: sticky
 *      ancestors (on scroll) and `refreshServerSideData({ rowId })` on another subtree hang the tab.
 *      Both are behind explicit opt-ins below.
 *
 * Turn "Child repeats parent id" off to see the same tree behave normally. Mirrors the React page
 * (apps/react-playground/ServerSideTreeDuplicateIdDemo.tsx).
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

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "Row id", width: 130 },
  { colId: "kind", key: "kind", label: "Kind", width: 100 },
  { colId: "size", key: "size", label: "Size (KB)", width: 110, type: ColumnType.NUMBER },
];

const TREE_DATA: TreeDataOptions<FsRow> = {
  mode: "server",
  hasChildren: (row: FsRow) => row.kind === "folder",
  getLabel: (row: FsRow) => row.name,
  columnDef: { label: "Path", width: 380, key: "name" },
};

const RED = "#b91c1c";
const MUTED = "#9ca3af";

export function mountServerSideTreeDuplicateIdDemo(container: HTMLElement): () => void {
  let duplicateId = true;
  let sticky = false;
  let rows = buildTree(duplicateId);
  let errors: string[] = [];
  let uncaught: string[] = [];
  let rowCount: number | null = null;
  let walk: { count: number; ids: string[] } | null = null;
  let requestLog: string[] = [];
  let running = false;
  let unsubscribe: Array<() => void> = [];

  const host = gridHost();

  // Status panel — plain nodes that renderPanel() rewrites.
  const errorsHeading = h("div", { style: { fontWeight: "600", marginBottom: "4px" } });
  const errorsList = h("div");
  const uncaughtHeading = h("div", { style: { fontWeight: "600", marginTop: "8px", marginBottom: "4px" } });
  const uncaughtList = h("div");
  const rowCountLine = h("div", { style: { marginTop: "8px" } });
  const walkHeading = h("div", { style: { fontWeight: "600", marginBottom: "4px" } });
  const walkIds = h("div", { style: { wordBreak: "break-all" } });
  const requestsLine = h("div", { style: { marginTop: "8px", color: MUTED } });
  const panel = h(
    "div",
    {
      style: {
        fontSize: "11px", fontFamily: "monospace", display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: "12px", padding: "8px", borderRadius: "4px",
      },
    },
    h("div", null, errorsHeading, errorsList, uncaughtHeading, uncaughtList, rowCountLine),
    h("div", null, walkHeading, walkIds, requestsLine),
  );

  const dataSource: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      const parent = request.treeParent;
      requestLog = [
        `${parent ? parent.path.join("/") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...requestLog,
      ].slice(0, 6);
      renderPanel();
      setTimeout(() => success(serveTree(rows, request)), 250);
    },
  };

  const duplicateBox = checkbox(duplicateId, value => reset(value));
  const stickyBox = checkbox(sticky, value => {
    sticky = value;
    api.updateGridOptions({ groupRowsSticky: sticky });
  });
  const runButton = btn("Run repro (expand beta, then alpha)", () => void runRepro());
  const refreshButton = btn("Refresh beta subtree", () => {
    if (errors.length > 0 && !window.confirm(
      "The store is corrupted: this refresh walks parentId links that now form a cycle and will "
      + "hang this tab. Continue anyway?",
    )) return;
    void api.refreshServerSideData({ rowId: "beta", purge: true });
  });

  const smallLabel = { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" };

  container.appendChild(demoRoot(
    h(
      "div",
      { style: { fontSize: "12px", lineHeight: "1.5", maxWidth: "1100px" } },
      bold("Bug repro: "), "folder ", code("alpha"), " has a child folder whose row id is also ",
      code("alpha"), ". Press ", h("em", { text: "Run repro" }), " (or expand ", code("beta"),
      ", then ", code("alpha"), ", by hand). The child fetch succeeds, then the store's flatten ",
      "walk re-enters the same listing until the stack overflows — the grid reports it only as an ",
      code("error"), " event. Then: alpha stays open over a blank slot while the row count freezes ",
      "and the model's walk (right panel) returns thousands of copies of ", code("alpha"), "; ",
      bold("click any chevron"), " → an uncaught RangeError and no change; ", bold("sort a column"),
      " → a re-fetch that overflows again and leaves blank rows. Turn the checkbox off to see the ",
      "same tree behave normally.",
    ),
    toolbarRow(
      h("label", { style: smallLabel }, duplicateBox, "Child repeats parent id (the bug)"),
      runButton,
      btn("Reset grid", () => reset(duplicateId)),
      h(
        "label",
        { style: smallLabel },
        stickyBox,
        "Sticky ancestors ",
        h("span", { text: "⚠ once corrupted, scrolling with this on hangs the tab", style: { color: "#b45309" } }),
      ),
      refreshButton,
    ),
    panel,
    host,
  ));

  let api = create();
  renderPanel();

  const onWindowError = (ev: ErrorEvent) => {
    // The synchronous re-entries (a chevron click after the corruption) escape the grid's own
    // event handlers as uncaught errors — the only place to see them is window "error".
    uncaught = [...uncaught, ev.message].slice(-6);
    renderPanel();
  };
  window.addEventListener("error", onWindowError);

  function create(): IGridAPI {
    const grid = createGrid(host, {
      columnDefs: COLUMNS,
      rowIdKey: "id",
      rowModelType: "serverSide",
      serverSideDataSource: dataSource,
      serverSideBlockSize: 50,
      treeData: TREE_DATA,
      groupRowsSticky: sticky,
    });
    for (const off of unsubscribe) off();
    unsubscribe = [
      grid.on("error", ev => {
        errors = [...errors, `${ev.code}: ${ev.message}`];
        inspectStore(grid);
        renderPanel();
      }),
      grid.on("rowsChanged", ev => {
        if (ev.rowCount !== undefined) rowCount = ev.rowCount;
        inspectStore(grid);
        renderPanel();
      }),
    ];
    return grid;
  }

  // What the model would hand the renderer: walk the visible order and count what comes back. On
  // the corrupted store this walks thousands of half-built segments while `rowsChanged` last
  // announced a few dozen rows.
  function inspectStore(grid: IGridAPI): void {
    const ids: string[] = [];
    let count = 0;
    grid.forEachNodeAfterFilterAndSort(node => {
      count++;
      if (ids.length < 12) ids.push(node.id);
    });
    walk = { count, ids };
  }

  function reset(nextDuplicate: boolean): void {
    duplicateId = nextDuplicate;
    duplicateBox.checked = duplicateId;
    sticky = false;
    stickyBox.checked = false;
    rows = buildTree(duplicateId);
    errors = [];
    uncaught = [];
    rowCount = null;
    walk = null;
    requestLog = [];
    for (const off of unsubscribe) off();
    unsubscribe = [];
    api.destroy();
    host.replaceChildren();
    api = create();
    renderPanel();
  }

  // Expand beta first (a healthy listing the grid can scroll), then alpha — whose first child
  // carries the duplicate id.
  async function runRepro(): Promise<void> {
    if (running) return;
    running = true;
    runButton.disabled = true;
    runButton.textContent = "Running…";
    try {
      api.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: ["beta"] });
      await sleep(700);
      api.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: ["alpha"] });
      await sleep(700);
    } finally {
      running = false;
      runButton.disabled = false;
      runButton.textContent = "Run repro (expand beta, then alpha)";
    }
  }

  function renderPanel(): void {
    const corrupted = errors.length > 0;
    panel.style.border = `1px solid ${corrupted ? "#ef4444" : "#d1d5db"}`;
    panel.style.background = corrupted ? "rgba(239, 68, 68, 0.08)" : "rgba(156, 163, 175, 0.08)";

    errorsHeading.textContent = `grid "error" events (${errors.length})`;
    errorsList.replaceChildren(...(errors.length === 0
      ? [h("div", { text: "none", style: { color: MUTED } })]
      : errors.map(message => h("div", { text: message, style: { color: RED } }))));

    uncaughtHeading.textContent = `uncaught errors from grid event handlers (${uncaught.length})`;
    uncaughtList.replaceChildren(...(uncaught.length === 0
      ? [h("div", { text: "none", style: { color: MUTED } })]
      : uncaught.map(message => h("div", { text: message, style: { color: RED } }))));

    rowCountLine.replaceChildren("last rowsChanged.rowCount: ", bold(rowCount == null ? "—" : String(rowCount)));

    walkHeading.textContent = `forEachNodeAfterFilterAndSort walk: ${walk ? `${walk.count} loaded rows` : "—"}`;
    walkIds.style.color = corrupted ? RED : "inherit";
    walkIds.textContent = walk ? walk.ids.join(", ") + (walk.count > walk.ids.length ? ", …" : "") : "";

    requestsLine.textContent = `children requests: ${requestLog.join("  •  ") || "—"}`;

    refreshButton.textContent = corrupted ? "Refresh beta subtree ⚠ hangs the tab" : "Refresh beta subtree";
    refreshButton.style.backgroundColor = corrupted ? RED : "";
  }

  return () => {
    window.removeEventListener("error", onWindowError);
    for (const off of unsubscribe) off();
    api.destroy();
  };
}
