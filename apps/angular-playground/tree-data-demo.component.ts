import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridOptions,
  type IGridAPI,
  type NgColDef,
  type TreeDataOptions,
} from "@agility-workbench/angular-grid";

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

const MODES: RelationshipMode[] = ["path", "parent", "children"];

@Component({
  selector: "tree-data-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <section class="tree-data-demo-intro">
      <div>
        <p class="tree-data-demo-eyebrow">Client-side hierarchy</p>
        <h2>Tree data relationship modes</h2>
        <p>
          Switch 10,000 records between representations without changing the columns or interaction
          model. Parent rows remain ordinary editable records—double-click a name, owner, headcount,
          budget, or status.
        </p>
      </div>
      <code>{{ copy().example }}</code>
    </section>

    <div class="tree-data-demo-controls">
      <div class="tree-data-demo-modes" aria-label="Tree relationship mode">
        @for (value of modes; track value) {
          <button
            class="btn tree-data-demo-mode"
            [class.is-active]="mode() === value"
            type="button"
            [attr.aria-pressed]="mode() === value"
            (click)="setMode(value)"
          >
            {{ modeCopy[value].label }}
          </button>
        }
      </div>

      <span class="tree-data-demo-summary">{{ copy().summary }}</span>

      <div class="tree-data-demo-actions">
        <button class="btn" type="button" (click)="setAllExpanded(true)">
          Expand all
        </button>
        <button class="btn" type="button" (click)="setAllExpanded(false)">
          Collapse all
        </button>
        <label>
          <input type="checkbox" [checked]="sticky()" (change)="onStickyChange($event)" />
          Sticky ancestors
        </label>
      </div>
    </div>

    <div class="tree-data-demo-grid">
      @if (gridVisible()) {
        <awb-grid
          [rowData]="config().rows"
          [columnDefs]="columns"
          rowIdKey="id"
          [treeData]="config().treeData"
          [groupDefaultExpanded]="-1"
          [groupRowsSticky]="sticky()"
          [pagination]="true"
          [pageSize]="100"
          [pageSizes]="pageSizes"
          [rowSelection]="true"
          [quickFilter]="quickFilterOptions"
          [toolbar]="toolbarOptions"
          [columnPanel]="columnPanelOptions"
          (gridReady)="onReady($event)"
        />
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        height: 100%;
        min-width: 0;
        flex-direction: column;
        gap: 10px;
      }

      .tree-data-demo-intro {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 24px;
        padding: 14px 16px;
        border: 1px solid var(--pte-frame-border-color, #d1d5db);
        border-radius: 8px;
        background: var(--pte-header-bg-color, #fff);
      }

      .tree-data-demo-intro h2 {
        margin: 2px 0 5px;
        font-size: 20px;
        line-height: 1.2;
      }

      .tree-data-demo-intro p {
        max-width: 760px;
        color: color-mix(in srgb, var(--pte-text-color, #111827) 72%, transparent);
        font-size: 13px;
        line-height: 1.45;
      }

      .tree-data-demo-intro .tree-data-demo-eyebrow {
        color: var(--pte-selected-border-color, #2563eb);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .tree-data-demo-intro code {
        flex: 0 1 520px;
        padding: 9px 11px;
        border: 1px solid var(--pte-control-border-color, #d1d5db);
        border-radius: 6px;
        background: var(--pte-input-bg-color, #f8fafc);
        color: var(--pte-text-color, #111827);
        font-size: 11px;
        white-space: normal;
      }

      .tree-data-demo-controls {
        display: flex;
        min-height: 34px;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .tree-data-demo-modes,
      .tree-data-demo-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tree-data-demo-mode {
        padding-inline: 12px;
        opacity: 0.58;
      }

      .tree-data-demo-mode.is-active {
        opacity: 1;
        box-shadow: inset 0 0 0 2px color-mix(in srgb, #fff 72%, transparent);
      }

      .tree-data-demo-summary {
        flex: 1;
        min-width: 220px;
        color: color-mix(in srgb, var(--pte-text-color, #111827) 68%, transparent);
        font-size: 12px;
      }

      .tree-data-demo-actions label {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
      }

      .tree-data-demo-grid {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }

      @media (max-width: 900px) {
        .tree-data-demo-intro {
          align-items: stretch;
          flex-direction: column;
        }

        .tree-data-demo-intro code {
          flex-basis: auto;
        }
      }
    `,
  ],
})
export class TreeDataDemoComponent {
  readonly modes = MODES;
  readonly modeCopy = MODE_COPY;

  readonly mode = signal<RelationshipMode>("path");
  readonly sticky = signal(true);
  // React remounts the grid via key={mode}; here the @if flips false→true across a microtask.
  readonly gridVisible = signal(true);

  readonly copy = computed(() => MODE_COPY[this.mode()]);

  readonly pageSizes = [25, 50, 100, 250, 500];
  readonly quickFilterOptions: GridOptions["quickFilter"] = { mode: "always", debounceMs: 0 };
  readonly toolbarOptions: GridOptions["toolbar"] = { sorting: true, export: true };
  readonly columnPanelOptions: GridOptions["columnPanel"] = { trigger: "toolbar" };

  readonly columns: NgColDef[] = [
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
  ];

  readonly config = computed<{ rows: OrgRow[]; treeData: TreeDataOptions<OrgRow> }>(() => {
    const mode = this.mode();
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
  });

  private api: IGridAPI | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  setMode(mode: RelationshipMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    // Remount the grid for the new relationship mode (treeData is a creation-time option).
    this.api = null;
    this.gridVisible.set(false);
    queueMicrotask(() => this.gridVisible.set(true));
  }

  onStickyChange(event: Event): void {
    this.sticky.set((event.target as HTMLInputElement).checked);
  }

  setAllExpanded(expanded: boolean): void {
    const core = this.api?.getCore();
    if (!core) return;
    for (const node of core.getRowModel().getGroupNodes()) {
      core.dispatch({ type: "groupToggleExpand", groupId: node.id, expanded });
    }
  }
}
