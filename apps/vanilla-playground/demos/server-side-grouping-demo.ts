import {
  createGrid,
  AggregateType,
  ColumnType,
  type ColDef,
  type IServerSideDataSource,
  type IServerSideRequest,
  type PaginationControl,
  type PaginationControlsOptions,
} from "@grid";

import { btn, checkbox, demoRoot, field, gridHost, h, select, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Server-side grouping playground: a fake server (in-memory, 250ms latency) implements the
 * grouping contract — per-parent block requests, GROUP BY rows with counts and sums, optional
 * totalRows. Toggle "Report totalRows" off to see the open-ended flow: the pager shows "N+",
 * "next" keeps probing past the frontier, and the count pins once an empty block comes back.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany", "Spain"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const CATEGORIES = ["Hardware", "Software", "Services"];

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(11);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      category: pick(CATEGORIES),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

// The "database". A module-level array so the Mutate button can simulate server-side changes that
// only become visible through refreshServerSideData.
const ALL_ROWS = buildRows(5_000);

function serveRequest(request: IServerSideRequest, reportTotals: boolean) {
  let subset = ALL_ROWS.filter(row =>
    request.groupKeys.every(k => (row as any)[k.key] === k.value));

  let rows: any[];
  if (request.groupKeys.length < request.groupBy.length) {
    // Group level: one row per bucket, ordered by the bucket's sort (or ascending), carrying the
    // leaf-descendant count and any requested sums.
    const key = request.groupBy[request.groupKeys.length];
    const buckets = new Map<string, SaleRow[]>();
    for (const row of subset) {
      const v = String((row as any)[key]);
      if (!buckets.has(v)) buckets.set(v, []);
      buckets.get(v)!.push(row);
    }
    const groupSort = request.sorts.find(s => s.key === key);
    const dir = groupSort?.dir === "desc" ? -1 : 1;
    rows = Array.from(buckets.keys())
      .sort((a, b) => a.localeCompare(b) * dir)
      .map(v => {
        const leaves = buckets.get(v)!;
        const groupRow: any = { [key]: (leaves[0] as any)[key], count: leaves.length };
        for (const agg of request.aggregates) {
          if (agg.type === AggregateType.SUM) {
            groupRow[agg.key] = leaves.reduce((s, r) => s + Number((r as any)[agg.key] ?? 0), 0);
          }
        }
        return groupRow;
      });
  } else {
    // Leaf level within the group path: honor non-grouped sorts.
    const leafSort = request.sorts.find(s => !request.groupBy.includes(s.key));
    if (leafSort) {
      const dir = leafSort.dir === "desc" ? -1 : 1;
      subset = subset.slice().sort((a, b) => {
        const av = (a as any)[leafSort.key];
        const bv = (b as any)[leafSort.key];
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
    }
    rows = subset;
  }

  const start = request.startRow ?? 0;
  const end = request.endRow ?? rows.length;
  return {
    rows: rows.slice(start, end),
    totalRows: reportTotals ? rows.length : undefined,
  };
}

const GROUPABLE: Array<{ colId: string; label: string }> = [
  { colId: "region", label: "Region" },
  { colId: "country", label: "Country" },
  { colId: "category", label: "Category" },
];

type PaginationLayout = "default" | "compact" | "reversed";
const PAGINATION_LAYOUTS: Record<PaginationLayout, PaginationControl[]> = {
  default: ["pageSize", "firstPage", "previousPage", "pageSelector", "nextPage", "lastPage"],
  compact: ["previousPage", "pageSelector", "nextPage"],
  reversed: ["lastPage", "nextPage", "pageSelector", "previousPage", "firstPage", "pageSize"],
};

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  { colId: "category", key: "category", label: "Category", width: 130 },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

export function mountServerSideGroupingDemo(container: HTMLElement): () => void {
  let groupBy = ["region", "country"];
  let reportTotals = true;
  let pagination = true;
  let pageSelection: "select" | "buttons" = "select";
  let showPageLabel = true;
  let paginationLayout: PaginationLayout = "default";
  let maxPageButtons = 7;
  let stickyGroups = true;
  let requestLog: string[] = [];

  const host = gridHost();
  const logLine = h("div", {
    style: { fontSize: "11px", color: "#9ca3af", fontFamily: "monospace", minHeight: "16px" },
  });
  const maxButtonsSelect = select([5, 7, 9], maxPageButtons, value => {
    maxPageButtons = Number(value);
    applyPaginationControls();
  }, { disabled: pageSelection === "select" });

  const dataSource: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requestLog = [
        `${request.groupKeys.length ? request.groupKeys.map(k => String(k.value)).join(" / ") : "(root)"}`
        + ` [${request.startRow}, ${request.endRow})`,
        ...requestLog,
      ].slice(0, 8);
      renderLog();
      setTimeout(() => success(serveRequest(request, reportTotals)), 250);
    },
  };

  container.appendChild(demoRoot(
    toolbarRow(
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        h("span", { text: "Group by", style: { fontSize: "13px" } }),
        ...GROUPABLE.map(({ colId, label }) => field(label, checkbox(groupBy.includes(colId), () => {
          groupBy = groupBy.includes(colId) ? groupBy.filter(c => c !== colId) : [...groupBy, colId];
          applyGrouping();
        }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } })),
      ),
      field("Report totalRows (off → open-ended \"+\", pager probes)", checkbox(reportTotals, value => {
        reportTotals = value;
      }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } }),
      field("Show Page label", checkbox(showPageLabel, value => {
        showPageLabel = value;
        applyPaginationControls();
      }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } }),
      field("Pagination", checkbox(pagination, value => {
        pagination = value;
        api.updateGridOptions({ pagination });
      }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } }),
      field("Page selection", select(["select", "buttons"], pageSelection, value => {
        pageSelection = value as typeof pageSelection;
        maxButtonsSelect.disabled = pageSelection !== "buttons";
        applyPaginationControls();
      }), { style: { fontSize: "12px" } }),
      field("Controls", select(
        [
          { value: "default", label: "default order" },
          { value: "compact", label: "compact" },
          { value: "reversed", label: "reversed" },
        ],
        paginationLayout,
        value => {
          paginationLayout = value as PaginationLayout;
          applyPaginationControls();
        },
      ), { style: { fontSize: "12px" } }),
      field("Max page buttons", maxButtonsSelect, { style: { fontSize: "12px" } }),
      field("Sticky group rows", checkbox(stickyGroups, value => {
        stickyGroups = value;
        api.updateGridOptions({ groupRowsSticky: stickyGroups });
      }), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" } }),
      btn("Mutate server + soft refresh", () => {
        mutateServer();
        void api.refreshServerSideData();
      }),
      btn("Purge-refresh EMEA subtree", () => {
        mutateServer();
        void api.refreshServerSideData({
          groupKeys: [{ key: "region", value: "EMEA" }],
          purge: true,
        });
      }),
    ),
    logLine,
    host,
  ));

  const api = createGrid(host, {
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideDataSource: dataSource,
    serverSideBlockSize: 100,
    pagination,
    paginationControls: paginationControls(),
    groupRowsSticky: stickyGroups,
    pageSize: 50,
    getGroupChildCount: (row: any) => row.count,
  });

  api.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [
      { key: colInstance("units"), type: AggregateType.SUM },
      { key: colInstance("revenue"), type: AggregateType.SUM },
    ].filter(model => model.key),
  });
  applyGrouping();
  renderLog();

  function paginationControls(): PaginationControlsOptions {
    return {
      pageSelection,
      showPageLabel,
      controls: PAGINATION_LAYOUTS[paginationLayout],
      maxPageButtons,
    };
  }

  function applyPaginationControls(): void {
    api.updateGridOptions({ paginationControls: paginationControls() });
  }

  function applyGrouping(): void {
    api.dispatch({ type: "rowGroupSet", colIds: groupBy });
  }

  function colInstance(colId: string): string {
    return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
  }

  function mutateServer(): void {
    // Simulate a server-side change: bump every EMEA revenue.
    for (const row of ALL_ROWS) {
      if (row.region === "EMEA") row.revenue += 1_000;
    }
  }

  function renderLog(): void {
    logLine.textContent = `requests: ${requestLog.join("  •  ") || "—"}`;
  }

  return () => api.destroy();
}
