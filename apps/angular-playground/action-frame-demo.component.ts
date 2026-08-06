import { AfterViewInit, Component, ElementRef, signal, viewChild } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type ActionFrameComponentParams,
  type IActionFrameNgComp,
  type NgColDef,
} from "@agility-workbench/angular-grid";

/**
 * ActionFrame — a persistent frame + attached form popover on a body cell (like a Google Sheets
 * comment). Demonstrates:
 *  - click-to-open trigger (`actionFrameTrigger: "click"`) on the Comment column
 *  - a client-built Angular form (textarea + Save/Delete) rendered in the popover
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
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => ({
    id: 1 + i,
    title: `Task ${1 + i}`,
    owner: pick(OWNERS),
    status: pick(STATUSES),
    comment: i % 4 === 0 ? "Needs follow-up" : "",
  }));
}

/** Params delivered to the comment form: the grid's cell context plus the demo's `onSave` callback,
 * injected via `colDef.actionFrameComponentParams` (the extra-params channel). */
type CommentFormParams = ActionFrameComponentParams & {
  onSave?: (rowId: string, text: string) => void;
};

/**
 * The client-owned form body. Purely client-scope: the grid gives us the cell context + a `close`
 * callback; we own the contents and how we persist them.
 */
@Component({
  standalone: true,
  template: `
    <div style="display: flex; flex-direction: column; gap: 8px">
      <div style="font-weight: 700; font-size: 13px">Comment · {{ title }}</div>
      <textarea
        #box
        rows="4"
        style="width: 100%; box-sizing: border-box; font: inherit; resize: vertical"
        placeholder="Add a comment…"
        [value]="text()"
        (input)="onInput($event)"
      ></textarea>
      <div style="display: flex; gap: 8px; justify-content: flex-end">
        <button type="button" class="btn" (click)="save('')">Delete</button>
        <button type="button" class="btn" (click)="save(text())">Save</button>
      </div>
    </div>
  `,
})
export class CommentFormComponent implements IActionFrameNgComp, AfterViewInit {
  private readonly box = viewChild.required<ElementRef<HTMLTextAreaElement>>("box");
  readonly text = signal("");
  title = "";
  private params: CommentFormParams | null = null;

  awbInit(params: CommentFormParams): void {
    this.params = params;
    this.title = String(params.data?.title ?? "");
    this.text.set(String(params.value ?? ""));
  }

  awbRefresh(params: CommentFormParams): boolean {
    // Keep the draft the user is typing; just track the latest cell context.
    this.params = params;
    this.title = String(params.data?.title ?? "");
    return true;
  }

  ngAfterViewInit(): void {
    // The React form used autoFocus; focus the textarea once it is in the popover.
    this.box().nativeElement.focus();
  }

  onInput(ev: Event): void {
    this.text.set((ev.target as HTMLTextAreaElement).value);
  }

  save(text: string): void {
    this.params?.onSave?.(this.params.rowId, text);
    this.params?.close();
  }
}

@Component({
  selector: "action-frame-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="demo-intro">
      <strong>ActionFrame.</strong> Click a <span style="font-weight: 700">Comment</span> cell → a
      distinct frame appears with an attached form. The frame is <em>persistent</em>: scroll and it
      tracks its cell (scroll far away and it hides, scroll back and it returns). Hovering the cell
      still shows a tooltip (they coexist). Double-click to edit the cell → the frame closes
      (editing and the frame are mutually exclusive). Esc or click-away dismisses. Cells that
      already have a comment show a corner-triangle <em>indicator</em>
      (<code>actionFrameIndicator</code>), and this column's popover opens to the
      <em>right</em> via <code>actionFrameOptions.placement</code>.
    </div>
    <div class="demo-topbar" style="font-size: 13px">
      <button
        type="button"
        class="btn"
        (click)="grid.api?.openActionFrame({ rowId: '1', colId: 'comment' })"
      >
        Open on row 1 (API)
      </button>
      <button type="button" class="btn" (click)="grid.api?.closeActionFrame()">Close (API)</button>
    </div>
    <div class="demo-grid-host">
      <awb-grid #grid="awbGrid" [rowData]="rows()" [columnDefs]="columnDefs" rowIdKey="id" />
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0; }"],
})
export class ActionFrameDemoComponent {
  readonly rows = signal<Task[]>(buildRows(500));

  private readonly onSave = (rowId: string, text: string): void => {
    this.rows.update((prev) =>
      prev.map((r) => (String(r.id) === rowId ? { ...r, comment: text } : r)),
    );
  };

  readonly columnDefs: NgColDef[] = [
    { colId: "title", key: "title", label: "Task", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 150 },
    { colId: "status", key: "status", label: "Status", width: 130 },
    {
      colId: "comment", key: "comment", label: "Comment", width: 220,
      editable: true,
      // Click opens the ActionFrame; hovering still shows a tooltip (they coexist).
      actionFrameTrigger: "click",
      actionFrameComponent: CommentFormComponent,
      // The demo's persistence callback reaches the form through the extra-params channel
      // (spread into the component's params by the adapter).
      actionFrameComponentParams: { onSave: this.onSave },
      // Corner-triangle indicator on cells that already have a comment (field-based form). Try the
      // predicate form too: `(p) => !!p.data.comment`.
      actionFrameIndicator: "comment",
      // Per-column placement override: this column's popover opens to the right of the cell.
      actionFrameOptions: { placement: "right" },
      tooltipValueGetter: (p) => (p.value ? `Comment: ${p.value}` : "Click to add a comment"),
      headerTooltip: "Click a cell to open the comment form (persists across scroll).",
    },
    { colId: "id", key: "id", label: "ID", width: 90, type: ColumnType.NUMBER },
  ];
}
