import {
  createGrid,
  type IGridAPI,
  ColumnType,
  type ColDef,
  type TreeDataKeyboardNavigationOptions,
  type TreeDataOptions,
} from "@grid";

import { btn, checkbox, field, h } from "../dom";

type RelationshipMode = "path" | "parent" | "children";

type OrgRow = {
  id: string;
  name: string;
  kind: "Company" | "Division" | "Team" | "Project";
  owner: string;
  headcount: number;
  budget: number;
  status: "On track" | "At risk" | "Planning";
  path?: string[];
  parentId?: string | null;
  children?: OrgRow[];
};

const ROW_COUNT = 10_000;
const DIVISION_COUNT = 20;
const TEAMS_PER_DIVISION = 25;
const OWNERS = [
  "Maya Chen",
  "Ravi Shah",
  "Elena Rossi",
  "Noah Williams",
  "Aisha Khan",
  "Sofia Martin",
  "Owen Brooks",
  "Inez Costa",
  "Lucas Meyer",
  "Amara Okafor",
];
const STATUSES: OrgRow["status"][] = ["On track", "At risk", "Planning"];

function buildFlatRows(): Array<Omit<OrgRow, "path" | "children">> {
  const rows: Array<Omit<OrgRow, "path" | "children">> = [{
    id: "northstar",
    parentId: null,
    name: "Northstar Labs",
    kind: "Company",
    owner: OWNERS[0],
    headcount: 10_000,
    budget: 1_250_000_000,
    status: "On track",
  }];
  const teamIds: string[] = [];

  for (let division = 1; division <= DIVISION_COUNT; division++) {
    const divisionId = `division-${division}`;
    rows.push({
      id: divisionId,
      parentId: "northstar",
      name: `Division ${division}`,
      kind: "Division",
      owner: OWNERS[division % OWNERS.length],
      headcount: 400 + division * 7,
      budget: 35_000_000 + division * 1_250_000,
      status: STATUSES[division % STATUSES.length],
    });

    for (let team = 1; team <= TEAMS_PER_DIVISION; team++) {
      const teamId = `team-${division}-${team}`;
      teamIds.push(teamId);
      rows.push({
        id: teamId,
        parentId: divisionId,
        name: `Team ${division}.${team}`,
        kind: "Team",
        owner: OWNERS[(division + team) % OWNERS.length],
        headcount: 12 + (division * team) % 38,
        budget: 1_000_000 + ((division * 31 + team * 17) % 40) * 125_000,
        status: STATUSES[(division + team) % STATUSES.length],
      });
    }
  }

  const projectCount = ROW_COUNT - rows.length;
  for (let project = 1; project <= projectCount; project++) {
    const parentId = teamIds[(project - 1) % teamIds.length];
    rows.push({
      id: `project-${project}`,
      parentId: parentId,
      name: `Project ${parentId.slice(5)}.${String(project).padStart(4, "0")}`,
      kind: "Project",
      owner: OWNERS[project % OWNERS.length],
      headcount: 2 + project % 17,
      budget: 150_000 + (project % 48) * 50_000,
      status: STATUSES[project % STATUSES.length],
    });
  }

  return rows;
}

const FLAT_ROWS = buildFlatRows();

const PATH_BY_ID = new Map<string, string[]>();
for (const row of FLAT_ROWS) {
  const parentPath = row.parentId ? PATH_BY_ID.get(row.parentId) ?? [] : [];
  PATH_BY_ID.set(row.id, [...parentPath, row.name]);
}

const PATH_ROWS: OrgRow[] = FLAT_ROWS.map(row => ({ ...row, path: PATH_BY_ID.get(row.id)! }));
const PARENT_ROWS: OrgRow[] = FLAT_ROWS.map(row => ({ ...row }));

function buildNestedRows(): OrgRow[] {
  const rows = new Map(FLAT_ROWS.map(row => [row.id, { ...row, children: [] } as OrgRow]));
  const roots: OrgRow[] = [];
  for (const source of FLAT_ROWS) {
    const row = rows.get(source.id)!;
    if (source.parentId == null) roots.push(row);
    else rows.get(source.parentId)?.children?.push(row);
  }
  return roots;
}

const NESTED_ROWS = buildNestedRows();

const MODE_COPY: Record<RelationshipMode, { label: string; summary: string; example: string }> = {
  path: {
    label: "Full path",
    summary: "Flat rows provide their complete root-to-node path.",
    example: 'getPath: row => row.path // ["Northstar Labs", "Engineering", "Platform"]',
  },
  parent: {
    label: "Parent ID",
    summary: "Flat rows reference the stable ID of their direct parent.",
    example: "getParentId: row => row.parentId",
  },
  children: {
    label: "Nested children",
    summary: "rowData contains roots; each record exposes its direct children.",
    example: "getChildren: row => row.children",
  },
};

const COLUMNS: ColDef[] = [
  { colId: "name", key: "name", label: "Record name", width: 190, editable: true },
  { colId: "kind", key: "kind", label: "Type", width: 110 },
  { colId: "owner", key: "owner", label: "Owner", width: 150, editable: true },
  {
    colId: "headcount", key: "headcount", label: "Headcount", width: 120,
    type: ColumnType.NUMBER, editable: true, cellEditor: "number",
  },
  {
    colId: "budget", key: "budget", label: "Annual budget", width: 155,
    type: ColumnType.CURRENCY, editable: true, cellEditor: "number",
  },
  {
    colId: "status", key: "status", label: "Status", width: 120,
    editable: true, cellEditor: "select",
    cellEditorParams: { values: ["On track", "At risk", "Planning"] },
    cellStyle: ({ value }) => ({
      color: value === "At risk" ? "#dc2626" : value === "On track" ? "#15803d" : "#a16207",
      fontWeight: "600",
    }),
  },
];

function treeDataFor(
  mode: RelationshipMode,
  keyboard: TreeDataKeyboardNavigationOptions,
): { rows: OrgRow[]; treeData: TreeDataOptions<OrgRow> } {
  const columnDef = { label: "Organization", width: 280 };
  const shared = {
    getLabel: (row: OrgRow) => row.name,
    columnDef,
    ...keyboard,
  };
  if (mode === "parent") {
    return {
      rows: PARENT_ROWS,
      treeData: { mode: "parent", getParentId: row => row.parentId, ...shared },
    };
  }
  if (mode === "children") {
    return {
      rows: NESTED_ROWS,
      treeData: { mode: "children", getChildren: row => row.children, ...shared },
    };
  }
  return {
    rows: PATH_ROWS,
    treeData: { mode: "path", getPath: row => row.path ?? [], ...shared },
  };
}

export function mountTreeDataDemo(container: HTMLElement): () => void {
  let mode: RelationshipMode = "path";
  let sticky = true;
  // Seeded into `treeData` at creation, then changed live through the API. Kept here so a
  // relationship-mode rebuild carries the current keyboard configuration into the new grid.
  const keyboard: TreeDataKeyboardNavigationOptions = {
    keyboardNavigationMode: "grid",
    enableKeyboardNavigationModeSwitch: true,
  };
  let api: IGridAPI;
  let unsubscribeNavMode: (() => void) | null = null;

  const host = h("div", { class: "tree-data-demo-grid" });
  const example = h("code");
  const summary = h("span", { class: "tree-data-demo-summary" });
  const navStatus = h("span", {
    class: "tree-data-demo-summary",
    style: { fontFamily: "monospace", fontSize: "12px" },
  });

  const hierarchyToggle = checkbox(keyboard.keyboardNavigationMode === "hierarchy", value => {
    // Only the mode is passed: the shortcut flag below is left exactly as it is.
    api.setTreeDataKeyboardNavigationOptions({
      keyboardNavigationMode: value ? "hierarchy" : "grid",
    });
  });

  const switchToggle = checkbox(keyboard.enableKeyboardNavigationModeSwitch === true, value => {
    api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: value });
    keyboard.enableKeyboardNavigationModeSwitch = value;
    renderNavStatus();
  });

  const modeButtons = (Object.keys(MODE_COPY) as RelationshipMode[]).map(value => btn(
    MODE_COPY[value].label,
    () => setMode(value),
    { class: "btn tree-data-demo-mode", "aria-pressed": String(mode === value) },
  ));

  container.appendChild(h("div", { class: "tree-data-demo" },
    h("section", { class: "tree-data-demo-intro" },
      h("div", null,
        h("p", { class: "tree-data-demo-eyebrow", text: "Client-side hierarchy" }),
        h("h2", { text: "Tree data relationship modes" }),
        h("p", {
          text: "Switch 10,000 records between representations without changing the columns or"
            + " interaction model. Parent rows remain ordinary editable records—double-click a name,"
            + " owner, headcount, budget, or status.",
        }),
      ),
      example,
    ),
    h("div", { class: "tree-data-demo-controls" },
      h("div", { class: "tree-data-demo-modes", "aria-label": "Tree relationship mode" }, ...modeButtons),
      summary,
      h("div", { class: "tree-data-demo-actions" },
        btn("Expand all", () => api.setAllGroupsExpanded(true)),
        btn("Collapse all", () => api.setAllGroupsExpanded(false)),
        field("Sticky ancestors", checkbox(sticky, value => {
          sticky = value;
          api.updateGridOptions({ groupRowsSticky: sticky });
        })),
      ),
    ),
    // Keyboard navigation is the one part of `treeData` that can be reconfigured on a mounted grid,
    // via api.setTreeDataKeyboardNavigationOptions — everything else about the relationship decides
    // the row shape, which is why switching mode above rebuilds instead.
    h("div", { class: "tree-data-demo-controls" },
      field("Hierarchy navigation (Ctrl/Cmd+Arrow)", hierarchyToggle),
      field("Ctrl/Cmd+Shift+Space switches modes", switchToggle),
      navStatus,
      h("span", {
        class: "tree-data-demo-summary",
        text: "The shortcut works wherever the keyboard cursor is, header included.",
      }),
    ),
    host,
  ));

  build();

  /**
   * The tree relationship mode changes the shape of `rowData` itself, so switching it recreates the
   * grid — the same thing the React demo's `key={mode}` does.
   */
  function build(): void {
    const { rows, treeData } = treeDataFor(mode, keyboard);
    api = createGrid(host, {
      rowData: rows,
      columnDefs: COLUMNS,
      rowIdKey: "id",
      treeData: treeData as TreeDataOptions,
      groupDefaultExpanded: -1,
      groupRowsSticky: sticky,
      pagination: true,
      pageSize: 100,
      pageSizes: [25, 50, 100, 250, 500],
      rowSelection: true,
      quickFilter: { mode: "always", debounceMs: 0 },
      toolbar: { sorting: true, export: true },
      columnPanel: { trigger: "toolbar" },
    });
    // The mode also changes from the grid itself (the Ctrl/Cmd+Shift+Space shortcut), so the
    // checkbox follows the event rather than assuming it is the only thing that can move it.
    // `source` says who did it: "options" for the API call, "shortcut" for the keystroke.
    unsubscribeNavMode = api.on("keyboardNavigationModeChanged", ({ mode: next, source }) => {
      keyboard.keyboardNavigationMode = next;
      hierarchyToggle.checked = next === "hierarchy";
      renderNavStatus(source);
    });
    renderCopy();
    renderNavStatus();
  }

  function setMode(next: RelationshipMode): void {
    if (next === mode) return;
    mode = next;
    unsubscribeNavMode?.();
    unsubscribeNavMode = null;
    api.destroy();
    host.replaceChildren();
    build();
  }

  function renderNavStatus(source?: string): void {
    const shortcut = keyboard.enableKeyboardNavigationModeSwitch ? "enabled" : "disabled";
    navStatus.textContent = `mode: ${keyboard.keyboardNavigationMode}`
      + `  •  shortcut: ${shortcut}`
      + (source ? `  •  last change from: ${source}` : "");
  }

  function renderCopy(): void {
    example.textContent = MODE_COPY[mode].example;
    summary.textContent = MODE_COPY[mode].summary;
    modeButtons.forEach((button, index) => {
      const value = (Object.keys(MODE_COPY) as RelationshipMode[])[index];
      const active = value === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  return () => {
    unsubscribeNavMode?.();
    api.destroy();
  };
}
