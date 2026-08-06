import { Component, OnDestroy, computed, signal } from "@angular/core";
import {
  AwbGrid,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

/**
 * Exercises every combination of `columnGroupShow` across a group's children, to pin down when
 * the group-expander control should render. The status panel reads the live column model and marks
 * any case where the expander or visible children differ from the expected behavior.
 */

type Mix = null | "open" | "closed";

type CaseDef = {
  colId: string;
  title: string;
  /** columnGroupShow per child; null = unset (effective "always"). */
  mix: Mix[];
  openByDefault?: boolean;
};

type CaseStatus = {
  def: CaseDef;
  showExpander: boolean;
  expanderOk: boolean;
  expandState: string;
  visible: string[];
  expectedVisible: string[];
  visibleOk: boolean;
};

const CASES: CaseDef[] = [
  { colId: "g1", title: "all unset", mix: [null, null] },
  { colId: "g2", title: "unset + open", mix: [null, "open"] },
  { colId: "g3", title: "unset + closed", mix: [null, "closed"] },
  { colId: "g4", title: "open + closed", mix: ["open", "closed"] },
  { colId: "g5", title: "all open", mix: ["open", "open"] },
  { colId: "g6", title: "all closed", mix: ["closed", "closed"] },
  { colId: "g7", title: "unset + open + closed", mix: [null, "open", "closed"] },
  { colId: "g8", title: "unset + open (openByDefault)", mix: [null, "open"], openByDefault: true },
];

const effective = (mix: Mix) => mix ?? "always";
const mixLabel = (mix: Mix) => mix ?? "unset";
const childLabel = (mix: Mix, index: number) => `${mixLabel(mix)} (${index + 1})`;

/** Rule 1: expander iff the children carry at least two distinct effective values. */
function expectExpander(caseDef: CaseDef): boolean {
  return new Set(caseDef.mix.map(effective)).size >= 2;
}

/**
 * Rule 2: uniform groups ignore `columnGroupShow`; mixed groups show "always" children plus those
 * matching the group's current expand state.
 */
function expectedVisible(caseDef: CaseDef, expandState: string): string[] {
  const uniform = new Set(caseDef.mix.map(effective)).size === 1;
  return caseDef.mix
    .map((mix, index) => ({ mix: effective(mix), label: childLabel(mix, index) }))
    .filter(({ mix }) => uniform || mix === "always" || mix === expandState)
    .map(({ label }) => label);
}

function buildColumnDefs(): NgColDef[] {
  return CASES.map((caseDef) => ({
    colId: caseDef.colId,
    label: `${caseDef.colId}: ${caseDef.title}`,
    openByDefault: caseDef.openByDefault,
    children: caseDef.mix.map((mix, index) => ({
      colId: `${caseDef.colId}c${index}`,
      key: `${caseDef.colId}c${index}`,
      label: childLabel(mix, index),
      width: 96,
      ...(mix ? { columnGroupShow: mix } : {}),
    })),
  }));
}

function buildRows(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, rowIndex) => {
    const row: Record<string, unknown> = { id: rowIndex + 1 };
    for (const caseDef of CASES) {
      caseDef.mix.forEach((mix, childIndex) => {
        row[`${caseDef.colId}c${childIndex}`] = `${mixLabel(mix)} r${rowIndex + 1}`;
      });
    }
    return row;
  });
}

@Component({
  selector: "column-group-expander-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="cge-grid">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        (gridReady)="onReady($event)"
      />
    </div>

    <aside class="cge-aside">
      <section class="cge-card">
        <h3>
          Case status
          <span class="cge-result" [class.cge-failed]="failures().length > 0">
            — {{ failures().length ? failures().length + " case(s) wrong" : "all cases correct" }}
          </span>
        </h3>
        <p class="cge-description">
          Rule: expander iff children mix ≥2 distinct <code>columnGroupShow</code> values; a uniform
          non-always group ignores <code>columnGroupShow</code> (children always visible). Live from
          the column model; updates as you toggle groups.
        </p>
        <table class="cge-table">
          <thead>
            <tr>
              <th>group</th>
              <th>expander exp / act</th>
              <th>state</th>
              <th class="cge-last">visible children</th>
            </tr>
          </thead>
          <tbody>
            @for (status of statuses(); track status.def.colId) {
              <tr [class.cge-wrong]="!status.expanderOk || !status.visibleOk">
                <td class="cge-group">{{ status.def.colId }}: {{ status.def.title }}</td>
                <td class="cge-nowrap">
                  {{ expectExpander(status.def) ? "yes" : "no" }} /
                  {{ status.showExpander ? "yes" : "no" }} {{ status.expanderOk ? "✓" : "✗" }}
                </td>
                <td>{{ status.expandState }}</td>
                <td class="cge-last">
                  @if (status.visible.length) {
                    {{ status.visible.join(", ") }}
                  } @else {
                    <i>none — group vanished!</i>
                  }
                  {{ status.visibleOk ? "✓" : "✗" }}
                  @if (!status.visibleOk) {
                    <div class="cge-expected">
                      expected: {{ status.expectedVisible.join(", ") || "none" }}
                    </div>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="cge-card">
        <h3>What each case demonstrates</h3>
        <ul class="cge-notes">
          <li><b>g1</b> — uniform (all unset): no toggle-controlled children, no expander. This is the intended fix.</li>
          <li>
            <b>g2 / g3</b> — the common "summary column + detail on expand" pattern. The expander
            must show; without it g2's "open" child is <b>permanently hidden</b> and g3's "closed"
            child is permanently visible.
          </li>
          <li><b>g4 / g7</b> — mixed open/closed children; the only shapes the current code still shows an expander for.</li>
          <li>
            <b>g5 / g6</b> — uniform ("open"-only / "closed"-only): no expander, and
            <code>columnGroupShow</code> should be ignored so all children stay visible. g5 currently
            <b>vanishes from the grid entirely</b> (starts closed, no visible children); g6 only
            looks right by coincidence — its "closed" children happen to match the default closed
            state.
          </li>
          <li><b>g8</b> — same mix as g2 but starts open: the detail column shows, but without an expander it can never be collapsed.</li>
        </ul>
      </section>
    </aside>
  `,
  styles: [
    `
      :host {
        display: flex;
        gap: 12px;
        height: 100%;
        min-height: 0;
      }
      .cge-grid {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
      .cge-aside {
        width: 560px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow: auto;
      }
      .cge-card {
        border: 1px solid var(--pte-frame-border-color, #ccc);
        border-radius: 8px;
        padding: 12px;
      }
      .cge-card h3 {
        font-size: 14px;
        margin: 0 0 8px;
      }
      .cge-result {
        font-weight: 400;
        color: #15803d;
      }
      .cge-result.cge-failed {
        color: #b91c1c;
      }
      .cge-description {
        font-size: 12px;
        color: #6b7280;
        margin: 0 0 8px;
      }
      .cge-table {
        font-size: 12px;
        border-collapse: collapse;
        width: 100%;
      }
      .cge-table thead tr {
        text-align: left;
        color: #6b7280;
      }
      .cge-table th {
        padding: 2px 6px 4px 0;
      }
      .cge-table td {
        padding: 3px 6px 3px 0;
        vertical-align: top;
      }
      .cge-table .cge-last {
        padding-right: 0;
      }
      .cge-group {
        font-weight: 600;
        white-space: nowrap;
      }
      .cge-nowrap {
        white-space: nowrap;
      }
      .cge-wrong {
        background: #fef2f2;
        color: #b91c1c;
      }
      .cge-expected {
        font-style: italic;
      }
      .cge-notes {
        font-size: 12px;
        color: #6b7280;
        margin: 0;
        padding-left: 18px;
        line-height: 1.6;
      }
    `,
  ],
})
export class ColumnGroupExpanderDemoComponent implements OnDestroy {
  readonly rows = buildRows(12);
  readonly columnDefs = buildColumnDefs();
  readonly statuses = signal<CaseStatus[]>([]);
  readonly failures = computed(() =>
    this.statuses().filter((status) => !status.expanderOk || !status.visibleOk),
  );
  readonly expectExpander = expectExpander;

  private api: IGridAPI | null = null;
  private unsubscribeColumnsChanged: (() => void) | null = null;

  ngOnDestroy(): void {
    this.unsubscribeColumnsChanged?.();
  }

  onReady(api: IGridAPI): void {
    this.unsubscribeColumnsChanged?.();
    this.api = api;
    this.unsubscribeColumnsChanged = api.on("columnsChanged", () => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    const api = this.api;
    if (!api) return;
    const model = api.getColumnModel();
    this.statuses.set(CASES.map((def) => {
      const group = model.getByColId(def.colId);
      const expandState = group?.groupExpandState ?? "closed";
      const visible = group?.children
        .filter((child) => child.columnGroupVisible && !child.hidden)
        .map((child) => child.label) ?? [];
      const expected = expectedVisible(def, expandState);
      const showExpander = group?.showExpander ?? false;
      return {
        def,
        showExpander,
        expanderOk: showExpander === expectExpander(def),
        expandState,
        visible,
        expectedVisible: expected,
        visibleOk: visible.join("|") === expected.join("|"),
      };
    }));
  }
}
