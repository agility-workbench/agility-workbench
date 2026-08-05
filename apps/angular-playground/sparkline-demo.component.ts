import { Component } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  SparklineRenderer,
  type NgColDef,
  type SparklineParams,
  type SparklineTooltipValueFormatterParams,
} from "@agility-workbench/angular-grid";

const MONTHS = [
  { key: "jan", label: "Jan" },
  { key: "feb", label: "Feb" },
  { key: "mar", label: "Mar" },
  { key: "apr", label: "Apr" },
  { key: "may", label: "May" },
  { key: "jun", label: "Jun" },
  { key: "jul", label: "Jul" },
  { key: "aug", label: "Aug" },
  { key: "sep", label: "Sep" },
  { key: "oct", label: "Oct" },
  { key: "nov", label: "Nov" },
  { key: "dec", label: "Dec" },
] as const;

type MonthKey = (typeof MONTHS)[number]["key"];
type RevenueRow = {
  id: number;
  account: string;
} & Record<MonthKey, number>;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): RevenueRow[] {
  const rand = mulberry32(42);
  return Array.from({ length: count }, (_, index) => {
    const values = {} as Record<MonthKey, number>;
    let revenue = 20_000 + rand() * 180_000;
    for (const month of MONTHS) {
      revenue = Math.max(2_500, revenue * (0.82 + rand() * 0.36));
      values[month.key] = Math.round(revenue);
    }
    return {
      id: index + 1,
      account: `Account ${String(index + 1).padStart(2, "0")}`,
      ...values,
    };
  });
}

const sparklineParams: SparklineParams = {
  type: "area",
  showPoints: true,
  tooltipValueFormatter: ({ xValue, yValue }: SparklineTooltipValueFormatterParams) =>
    `${String(xValue)}: ${currency.format(yValue)}`,
};

@Component({
  selector: "sparkline-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="spark-blurb">
      <strong>Sparklines from currency columns.</strong>
      The pinned <strong>Annual trend</strong> column is preconfigured with a
      <code>valueGetter</code> that returns all twelve monthly values. Hover its points to see
      formatted grid tooltips; anywhere vertically aligned with a point activates it.
      <br />
      To create another sparkline, Ctrl/Cmd+click two or more monthly headers, open a selected
      column's menu, then choose <strong>Show Sparklines</strong> and a chart type.
    </div>

    <div class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [rowNumbers]="true"
        [columnSelection]="true"
        [tooltip]="tooltipOptions"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 12px;
        min-height: 0;
      }
      .spark-blurb {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.55;
      }
    `,
  ],
})
export class SparklineDemoComponent {
  readonly rows = buildRows(60);

  readonly tooltipOptions = { showDelay: 100, hideDelay: 50 } as const;

  readonly columnDefs: NgColDef[] = [
    {
      colId: "account",
      key: "account",
      label: "Account",
      width: 150,
      pinned: "left",
    },
    ...MONTHS.map<NgColDef>((month) => ({
      colId: month.key,
      key: month.key,
      label: month.label,
      width: 120,
      type: ColumnType.CURRENCY,
      formatterOptions: {
        currency: "USD",
        locale: "en-US",
      },
    })),
    {
      colId: "annualTrend",
      label: "Annual trend",
      width: 190,
      pinned: "right",
      sortable: false,
      filter: false,
      groupable: false,
      aggregatable: false,
      valueGetter: (row) =>
        MONTHS.map((month) => [month.label, (row.data as RevenueRow)[month.key]] as const),
      cellRenderer: SparklineRenderer,
      cellRendererParams: sparklineParams,
      headerTooltip: "A preconfigured sparkline backed by a valueGetter returning all 12 months.",
    },
  ];
}
