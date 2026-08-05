import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType, type TreeDataOptions } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

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

const PATH_ROWS: OrgRow[] = FLAT_ROWS.map(row => ({
  ...row,
  path: PATH_BY_ID.get(row.id)!,
}));

const PARENT_ROWS: OrgRow[] = FLAT_ROWS.map(row => ({ ...row }));

function buildNestedRows(): OrgRow[] {
  const rows = new Map(FLAT_ROWS.map(row => [
    row.id,
    { ...row, children: [] } as OrgRow,
  ]));
  const roots: OrgRow[] = [];
  for (const source of FLAT_ROWS) {
    const row = rows.get(source.id)!;
    if (source.parentId == null) roots.push(row);
    else rows.get(source.parentId)?.children?.push(row);
  }
  return roots;
}

const NESTED_ROWS = buildNestedRows();

const MODE_COPY: Record<RelationshipMode, {
  label: string;
  summary: string;
  example: string;
}> = {
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

export function TreeDataDemo() {
  const [mode, setMode] = useState<RelationshipMode>("path");
  const [sticky, setSticky] = useState(true);
  const apiRef = useRef<IGridAPI | null>(null);

  const columns = useMemo<ReactColDef[]>(() => [
    {
      colId: "name",
      key: "name",
      label: "Record name",
      width: 190,
      editable: true,
    },
    { colId: "kind", key: "kind", label: "Type", width: 110 },
    {
      colId: "owner",
      key: "owner",
      label: "Owner",
      width: 150,
      editable: true,
    },
    {
      colId: "headcount",
      key: "headcount",
      label: "Headcount",
      width: 120,
      type: ColumnType.NUMBER,
      editable: true,
      cellEditor: "number",
    },
    {
      colId: "budget",
      key: "budget",
      label: "Annual budget",
      width: 155,
      type: ColumnType.CURRENCY,
      editable: true,
      cellEditor: "number",
    },
    {
      colId: "status",
      key: "status",
      label: "Status",
      width: 120,
      editable: true,
      cellEditor: "select",
      cellEditorParams: { values: ["On track", "At risk", "Planning"] },
      cellStyle: ({ value }) => ({
        color: value === "At risk" ? "#dc2626" : value === "On track" ? "#15803d" : "#a16207",
        fontWeight: "600",
      }),
    },
  ], []);

  const { rows, treeData } = useMemo<{
    rows: OrgRow[];
    treeData: TreeDataOptions<OrgRow>;
  }>(() => {
    if (mode === "parent") {
      return {
        rows: PARENT_ROWS,
        treeData: {
          mode: "parent",
          getParentId: row => row.parentId,
          getLabel: row => row.name,
          columnDef: { label: "Organization", width: 280 },
          keyboardNavigationMode: "grid",
          enableKeyboardNavigationModeSwitch: true,
        },
      };
    }
    if (mode === "children") {
      return {
        rows: NESTED_ROWS,
        treeData: {
          mode: "children",
          getChildren: row => row.children,
          getLabel: row => row.name,
          columnDef: { label: "Organization", width: 280 },
          keyboardNavigationMode: "grid",
          enableKeyboardNavigationModeSwitch: true,
        },
      };
    }
    return {
      rows: PATH_ROWS,
      treeData: {
        mode: "path",
        getPath: row => row.path ?? [],
        getLabel: row => row.name,
        columnDef: { label: "Organization", width: 280 },
        keyboardNavigationMode: "grid",
        enableKeyboardNavigationModeSwitch: true,
      },
    };
  }, [mode]);

  const setAllExpanded = (expanded: boolean) => {
    const core = apiRef.current?.getCore();
    if (!core) return;
    for (const node of core.getRowModel().getGroupNodes()) {
      core.dispatch({ type: "groupToggleExpand", groupId: node.id, expanded });
    }
  };

  const copy = MODE_COPY[mode];

  return (
    <div className="tree-data-demo">
      <section className="tree-data-demo-intro">
        <div>
          <p className="tree-data-demo-eyebrow">Client-side hierarchy</p>
          <h2>Tree data relationship modes</h2>
          <p>
            Switch 10,000 records between representations without changing the columns or interaction
            model. Parent rows remain ordinary editable records—double-click a name, owner, headcount,
            budget, or status.
          </p>
        </div>
        <code>{copy.example}</code>
      </section>

      <div className="tree-data-demo-controls">
        <div className="tree-data-demo-modes" aria-label="Tree relationship mode">
          {(Object.keys(MODE_COPY) as RelationshipMode[]).map(value => (
            <button
              className={`btn tree-data-demo-mode ${mode === value ? "is-active" : ""}`}
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {MODE_COPY[value].label}
            </button>
          ))}
        </div>

        <span className="tree-data-demo-summary">{copy.summary}</span>

        <div className="tree-data-demo-actions">
          <button className="btn" type="button" onClick={() => setAllExpanded(true)}>
            Expand all
          </button>
          <button className="btn" type="button" onClick={() => setAllExpanded(false)}>
            Collapse all
          </button>
          <label>
            <input
              type="checkbox"
              checked={sticky}
              onChange={event => setSticky(event.target.checked)}
            />
            Sticky ancestors
          </label>
        </div>
      </div>

      <div className="tree-data-demo-grid">
        <Grid
          key={mode}
          apiRef={apiRef}
          rowData={rows}
          columnDefs={columns}
          rowIdKey="id"
          treeData={treeData}
          groupDefaultExpanded={-1}
          groupRowsSticky={sticky}
          pagination
          pageSize={100}
          pageSizes={[25, 50, 100, 250, 500]}
          rowSelection
          quickFilter={{ mode: "always", debounceMs: 0 }}
          toolbar={{ sorting: true, export: true }}
          columnPanel={{ trigger: "toolbar" }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default TreeDataDemo;
