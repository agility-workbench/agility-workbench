import {
  ColumnType,
  SparklineRenderer,
  createGrid,
  type ColDef,
  type SparklineParams,
  type SparklineTooltipValueFormatterParams,
} from "@grid";

import { bold, code, demoRoot, gridHost, h } from "../dom";
import { mulberry32 } from "../helpers";

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

function buildColumnDefs(): ColDef[] {
  const currencyColumns: ColDef[] = MONTHS.map(month => ({
    colId: month.key,
    key: month.key,
    label: month.label,
    width: 120,
    type: ColumnType.CURRENCY,
    formatterOptions: {
      currency: "USD",
      locale: "en-US",
    },
  }));

  return [
    {
      colId: "account",
      key: "account",
      label: "Account",
      width: 150,
      pinned: "left",
    },
    ...currencyColumns,
    {
      colId: "annualTrend",
      label: "Annual trend",
      width: 190,
      pinned: "right",
      sortable: false,
      filter: false,
      groupable: false,
      aggregatable: false,
      valueGetter: row => MONTHS.map(month => [month.label, (row.data as RevenueRow)[month.key]] as const),
      cellRenderer: SparklineRenderer,
      cellRendererParams: sparklineParams,
      headerTooltip: "A preconfigured sparkline backed by a valueGetter returning all 12 months.",
    },
  ];
}

export function mountSparklineDemo(container: HTMLElement): () => void {
  const host = gridHost();

  container.appendChild(demoRoot(
    h("div", { style: { fontSize: "13px", color: "#4b5563", lineHeight: "1.55" } },
      bold("Sparklines from currency columns."),
      " The pinned ", bold("Annual trend"), " column is preconfigured with a ",
      code("valueGetter"),
      " that returns all twelve monthly values. Hover its points to see formatted grid tooltips;"
      + " anywhere vertically aligned with a point activates it.",
      h("br"),
      "To create another sparkline, Ctrl/Cmd+click two or more monthly headers, open a selected"
      + " column's menu, then choose ", bold("Show Sparklines"), " and a chart type."),
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(60),
    columnDefs: buildColumnDefs(),
    rowIdKey: "id",
    rowNumbers: true,
    columnSelection: true,
    tooltip: { showDelay: 100, hideDelay: 50 },
  });

  return () => api.destroy();
}
