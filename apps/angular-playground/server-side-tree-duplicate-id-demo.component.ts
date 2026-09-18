import { Component, HostListener, OnDestroy, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  isServerSideDataError,
  type GridOptions,
  type IGridAPI,
  type IServerSideDataSource,
  type IServerSideRequest,
  type NgColDef,
} from "@agility-workbench/angular-grid";

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

@Component({
  selector: "server-side-tree-duplicate-id-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="font-size: 12px; line-height: 1.5; max-width: 1100px">
      <strong>Duplicate id guard:</strong> folder <code>alpha</code> has a child folder whose row id
      is also <code>alpha</code>. Press <em>Run repro</em> (or expand <code>beta</code>, then
      <code>alpha</code>, by hand). The grid checks every id in the child block before any row
      enters the store, rejects the block whole, and reports one <code>error</code> event naming
      the row, its parent, and the ancestor chain. alpha stays open over one blank slot and nothing
      else is affected: <strong>click any chevron</strong>, <strong>sort a column</strong>, turn on
      sticky ancestors and scroll, or refresh <code>beta</code> — no uncaught errors, no hang. Each
      later fill that covers the blank slot asks the server again, so the error count grows by one
      per attempt. Turn the checkbox off to see the same tree behave normally.
    </div>

    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="duplicateId()" (change)="onDuplicateChange($event)" />
        Child repeats parent id (the bug)
      </label>

      <button class="btn" type="button" [disabled]="running()" (click)="runRepro()">
        {{ running() ? "Running…" : "Run repro (expand beta, then alpha)" }}
      </button>

      <button class="btn" type="button" (click)="reset(duplicateId())">Reset grid</button>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="sticky()" (change)="onStickyChange($event)" />
        Sticky ancestors
      </label>

      <button class="btn" type="button" (click)="refreshBeta()">Refresh beta subtree</button>
    </div>

    <div
      style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 11px; font-family: monospace; padding: 8px; border-radius: 4px"
      [style.border]="hasErrors() ? '1px solid #ef4444' : '1px solid #d1d5db'"
      [style.background]="hasErrors() ? 'rgba(239, 68, 68, 0.08)' : 'rgba(156, 163, 175, 0.08)'"
    >
      <div>
        <div style="font-weight: 600; margin-bottom: 4px">grid "error" events ({{ errors().length }})</div>
        @if (errors().length === 0) {
          <div style="color: #9ca3af">none</div>
        } @else {
          @for (message of errors(); track $index) {
            <div style="color: #b91c1c; white-space: pre-wrap">{{ message }}</div>
          }
        }
        <div style="font-weight: 600; margin-top: 8px; margin-bottom: 4px">
          uncaught errors from grid event handlers ({{ uncaught().length }})
        </div>
        @if (uncaught().length === 0) {
          <div style="color: #9ca3af">none</div>
        } @else {
          @for (message of uncaught(); track $index) {
            <div style="color: #b91c1c">{{ message }}</div>
          }
        }
        <div style="margin-top: 8px">last rowsChanged.rowCount: <strong>{{ rowCountText() }}</strong></div>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px">forEachNodeAfterFilterAndSort walk: {{ walkHeading() }}</div>
        <div style="word-break: break-all">{{ walkIds() }}</div>
        <div style="margin-top: 8px; color: #9ca3af">children requests: {{ requestLogText() }}</div>
      </div>
    </div>

    <div style="flex: 1; min-width: 0; min-height: 0">
      @for (gen of [generation()]; track gen) {
        <awb-grid
          [columnDefs]="columnDefs"
          rowIdKey="id"
          rowModelType="serverSide"
          [serverSideDataSource]="dataSource"
          [serverSideBlockSize]="50"
          [treeData]="treeData"
          [groupRowsSticky]="sticky()"
          (gridReady)="onReady($event)"
        />
      }
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0 }"],
})
export class ServerSideTreeDuplicateIdDemoComponent implements OnDestroy {
  readonly duplicateId = signal(true);
  readonly sticky = signal(false);
  readonly errors = signal<string[]>([]);
  readonly uncaught = signal<string[]>([]);
  readonly rowCount = signal<number | null>(null);
  readonly walk = signal<StoreWalk | null>(null);
  readonly requestLog = signal<string[]>([]);
  readonly running = signal(false);
  /** Remount key: a reset or a dataset change rebuilds the grid (the React page changes its `key`).
   * Rendered through `@for … track generation()` because an `@if` flipped off and back on inside
   * one change-detection turn never actually destroys the component. */
  readonly generation = signal(0);
  readonly hasErrors = computed(() => this.errors().length > 0);

  private rows: FsRow[] = buildTree(true);
  private api: IGridAPI | null = null;
  private unsubscribe: Array<() => void> = [];

  readonly treeData: GridOptions["treeData"] = {
    mode: "server",
    hasChildren: (row: any) => row.kind === "folder",
    getLabel: (row: any) => row.name,
    columnDef: { label: "Path", width: 380, key: "name" },
  };

  readonly dataSource: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      const parent = request.treeParent;
      this.requestLog.update(log => [
        `${parent ? parent.path.join("/") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...log,
      ].slice(0, 6));
      setTimeout(() => success(serveTree(this.rows, request)), 250);
    },
  };

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "Row id", width: 130 },
    { colId: "kind", key: "kind", label: "Kind", width: 100 },
    { colId: "size", key: "size", label: "Size (KB)", width: 110, type: ColumnType.NUMBER },
  ];

  // Before the guard, a chevron click after the corruption re-entered the recursion synchronously
  // and escaped the grid's own event handlers as an uncaught error; window "error" is the only
  // place to see those, and this list must now stay empty.
  @HostListener("window:error", ["$event"])
  onWindowError(ev: ErrorEvent): void {
    this.uncaught.update(list => [...list, ev.message].slice(-6));
  }

  ngOnDestroy(): void {
    this.detach();
  }

  rowCountText(): string {
    const count = this.rowCount();
    return count == null ? "—" : String(count);
  }

  walkHeading(): string {
    const walk = this.walk();
    return walk ? `${walk.count} loaded rows` : "—";
  }

  walkIds(): string {
    const walk = this.walk();
    return walk ? walk.ids.join(", ") + (walk.count > walk.ids.length ? ", …" : "") : "";
  }

  requestLogText(): string {
    return this.requestLog().join("  •  ") || "—";
  }

  onReady(api: IGridAPI): void {
    this.api = api;
    this.detach();
    this.unsubscribe = [
      api.on("error", ev => {
        this.errors.update(list => [...list, describeError(ev)]);
        this.inspectStore(api);
      }),
      api.on("rowsChanged", ev => {
        if (ev.rowCount !== undefined) this.rowCount.set(ev.rowCount);
        this.inspectStore(api);
      }),
    ];
  }

  onDuplicateChange(ev: Event): void {
    this.reset((ev.target as HTMLInputElement).checked);
  }

  onStickyChange(ev: Event): void {
    this.sticky.set((ev.target as HTMLInputElement).checked);
  }

  reset(nextDuplicate: boolean): void {
    this.duplicateId.set(nextDuplicate);
    this.rows = buildTree(nextDuplicate);
    this.sticky.set(false);
    this.errors.set([]);
    this.uncaught.set([]);
    this.rowCount.set(null);
    this.walk.set(null);
    this.requestLog.set([]);
    this.api = null;
    this.detach();
    this.generation.update(g => g + 1);
  }

  // Expand beta first (a healthy listing the grid can scroll), then alpha — whose first child
  // carries the duplicate id.
  async runRepro(): Promise<void> {
    const api = this.api;
    if (!api || this.running()) return;
    this.running.set(true);
    try {
      api.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: ["beta"] });
      await sleep(700);
      api.dispatch({ type: "groupSetExpanded", expanded: true, groupIds: ["alpha"] });
      await sleep(700);
    } finally {
      this.running.set(false);
    }
  }

  // Used to hang the tab: the refresh walked parentId links that formed a cycle.
  refreshBeta(): void {
    void this.api?.refreshServerSideData({ rowId: "beta", purge: true });
  }

  // What the model would hand the renderer: walk the visible order and count what comes back.
  // With the guard this is rowsChanged's count minus the one unloaded slot; before it, the walk
  // covered thousands of half-built segments while `rowsChanged` last announced a few dozen rows.
  private inspectStore(api: IGridAPI): void {
    const ids: string[] = [];
    let count = 0;
    api.forEachNodeAfterFilterAndSort(node => {
      count++;
      if (ids.length < 12) ids.push(node.id);
    });
    this.walk.set({ count, ids });
  }

  private detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }
}
