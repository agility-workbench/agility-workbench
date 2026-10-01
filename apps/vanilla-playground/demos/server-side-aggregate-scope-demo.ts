import {
  createGrid,
  AggregateType,
  ColumnType,
  type ColDef,
  type GridEventAggregateChangedParams,
  type IGridAPI,
  type IServerSideAggregationRequest,
  type IServerSideDataSource,
  type IServerSideRequest,
  type PaginationControlsOptions,
} from "@grid";

import { bold, btn, checkbox, code, demoRoot, field, gridHost, h, select, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Aggregate scope on the server-side row model — whole-dataset totals come from the server.
 *
 * "Entire dataset" needs a server aggregation source: the data source's own `getAggregates`, or the
 * `serverSideAggregationSource` option (which wins when both exist). The wiring select switches
 * between those two shapes and none at all; the panel reads the footer's real control and the
 * grid's `aggregateChanged` events, and counts the server's aggregation calls, so each path is
 * visible without dev tools.
 *
 * Without a source the scope is locked to "Current page": a requested "all" becomes "page", and
 * the footer says so — "Entire dataset" is greyed out with a tooltip (on the control and in the ⋮
 * overflow menu alike), or dropped from both, per `paginationControls.aggregateScope`. The two
 * selects beside the wiring drive exactly that option, live.
 *
 * Before the fix the data source's `getAggregates` was never read (only the option reached the
 * grid), the locked select was disabled whole with no explanation, and the ⋮ submenu offered a
 * choice that did nothing. Mirrors the React page
 * (apps/react-playground/ServerSideAggregateScopeDemo.tsx).
 */

type OrderRow = {
  id: number;
  region: string;
  category: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const CATEGORIES = ["Hardware", "Software", "Services"];

function buildRows(count: number): OrderRow[] {
  const rand = mulberry32(23);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => ({
    id: 1 + i,
    region: pick(REGIONS),
    category: pick(CATEGORIES),
    units: 1 + Math.floor(rand() * 500),
    revenue: 500 + Math.floor(rand() * 50_000),
  }));
}

// 1,200 rows over 25-row pages: "Current page" and "Entire dataset" give visibly different totals.
const ALL_ROWS = buildRows(1_200);

function serveRows(request: IServerSideRequest) {
  let rows = ALL_ROWS;
  const sort = request.sorts[0];
  if (sort) {
    const dir = sort.dir === "desc" ? -1 : 1;
    rows = rows.slice().sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }
  const start = request.startRow ?? 0;
  const end = request.endRow ?? rows.length;
  return { rows: rows.slice(start, end), totalRows: rows.length };
}

// Whole-dataset totals, the way a real server would answer: one value per requested aggregate,
// keyed by the column's field.
function serveAggregates(request: IServerSideAggregationRequest) {
  const values: Record<string, number> = {};
  for (const agg of request.aggregates) {
    const nums = ALL_ROWS.map(row => (row as any)[agg.key]).filter(v => typeof v === "number") as number[];
    switch (agg.type) {
      case AggregateType.SUM: values[agg.key] = nums.reduce((s, v) => s + v, 0); break;
      case AggregateType.AVG: values[agg.key] = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0; break;
      case AggregateType.MIN: values[agg.key] = Math.min(...nums); break;
      case AggregateType.MAX: values[agg.key] = Math.max(...nums); break;
      case AggregateType.COUNT: values[agg.key] = ALL_ROWS.length; break;
      default: break;
    }
  }
  return { values };
}

/** How the demo hands the server-side totals to the grid. */
type Wiring = "dataSource" | "option" | "none";

const WIRING_OPTIONS: ReadonlyArray<{ value: Wiring; label: string }> = [
  { value: "dataSource", label: "getAggregates on the data source" },
  { value: "option", label: "serverSideAggregationSource option" },
  { value: "none", label: "no server aggregation (Entire dataset unavailable)" },
];

type WhenUnavailable = "disabled" | "hidden";
type MessageMode = "default" | "custom" | "none";

const CUSTOM_MESSAGE = "Totals over all orders are not available in this view.";

const MESSAGE_OPTIONS: ReadonlyArray<{ value: MessageMode; label: string }> = [
  { value: "default", label: "grid default" },
  { value: "custom", label: `custom: "${CUSTOM_MESSAGE}"` },
  { value: "none", label: "none (empty string)" },
];

function footerOptions(whenUnavailable: WhenUnavailable, messageMode: MessageMode): PaginationControlsOptions {
  return {
    aggregateScope: {
      whenUnavailable,
      ...(messageMode === "default" ? {} : { unavailableMessage: messageMode === "custom" ? CUSTOM_MESSAGE : "" }),
    },
  };
}

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "Order", width: 90, type: ColumnType.NUMBER },
  { colId: "region", key: "region", label: "Region", width: 120 },
  { colId: "category", key: "category", label: "Category", width: 120 },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

const MUTED = "#9ca3af";
const AMBER = "#b45309";

export function mountServerSideAggregateScopeDemo(container: HTMLElement): () => void {
  let wiring: Wiring = "dataSource";
  let whenUnavailable: WhenUnavailable = "disabled";
  let messageMode: MessageMode = "default";
  let narrow = false;
  let aggregateEvent: GridEventAggregateChangedParams | null = null;
  let aggregateCalls: string[] = [];
  let rowRequests = 0;
  let unsubscribe: Array<() => void> = [];

  const host = gridHost();
  const hostFrame = h("div", { style: { flex: "1", minWidth: "0", minHeight: "0", display: "flex" } }, host);

  // Status panel — plain nodes that renderPanel() rewrites.
  const footerBlock = h("div");
  const eventBlock = h("div");
  const callsHeading = h("div", { style: { fontWeight: "600", marginBottom: "4px" } });
  const callsList = h("div");
  const requestsLine = h("div", { style: { marginTop: "8px", color: MUTED } });
  const panel = h(
    "div",
    {
      style: {
        fontSize: "11px", fontFamily: "monospace", display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: "12px", padding: "8px", borderRadius: "4px",
      },
    },
    h(
      "div",
      null,
      h("div", { text: "footer Aggregate select (what the user sees)", style: { fontWeight: "600", marginBottom: "4px" } }),
      footerBlock,
      h("div", { text: "last aggregateChanged event", style: { fontWeight: "600", marginTop: "8px", marginBottom: "4px" } }),
      eventBlock,
    ),
    h("div", null, callsHeading, callsList, requestsLine),
  );

  const getAggregates: NonNullable<IServerSideDataSource["getAggregates"]> = ({ request, success }) => {
    aggregateCalls = [
      `scope=${request.aggregateScope} aggregates=[${request.aggregates.map(a => `${a.key}:${a.type}`).join(", ")}]`,
      ...aggregateCalls,
    ].slice(0, 4);
    renderPanel();
    setTimeout(() => success(serveAggregates(request)), 250);
  };

  function makeDataSource(): IServerSideDataSource {
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        rowRequests++;
        renderPanel();
        setTimeout(() => success(serveRows(request)), 250);
      },
    };
    // The documented shape: getAggregates on the data source itself.
    if (wiring === "dataSource") source.getAggregates = getAggregates;
    return source;
  }

  const smallLabel = { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" };
  const wiringSelect = select(WIRING_OPTIONS, wiring, value => changeWiring(value as Wiring));
  const whenUnavailableSelect = select(
    [{ value: "disabled", label: "disabled (greyed out + tooltip)" }, { value: "hidden", label: "hidden" }],
    whenUnavailable,
    value => {
      whenUnavailable = value as WhenUnavailable;
      applyFooterOptions();
    },
  );
  const messageSelect = select(MESSAGE_OPTIONS, messageMode, value => {
    messageMode = value as MessageMode;
    applyFooterOptions();
  });
  const narrowBox = checkbox(narrow, value => {
    narrow = value;
    hostFrame.style.maxWidth = narrow ? "340px" : "";
    readFooterSoon();
  });

  container.appendChild(demoRoot(
    h(
      "div",
      { style: { fontSize: "12px", lineHeight: "1.5", maxWidth: "1100px" } },
      bold("Whole-dataset totals: "), "on the server-side row model, ", h("em", { text: "Entire dataset" }),
      " needs a server aggregation source: the data source's own ", code("getAggregates"), ", or the ",
      code("serverSideAggregationSource"), " option (which wins when both exist). Pick a wiring and switch ",
      "the footer's Aggregate control to ", h("em", { text: "Entire dataset" }), ": the panel shows the server ",
      "being asked and the totals jumping from the page's 25 rows to all 1,200. With no source the scope is ",
      "locked to ", h("em", { text: "Current page" }), ", and the footer says so: the choice is greyed out with ",
      "a tooltip (hover the control; with ", h("em", { text: "Narrow footer" }), " on, open ⋮ → Aggregate), or ",
      "hidden, as the two options beside the wiring say.",
    ),
    toolbarRow(
      field("Aggregation wiring", wiringSelect, { style: smallLabel }),
      field("Entire dataset when unavailable", whenUnavailableSelect, { style: smallLabel }),
      field("Tooltip", messageSelect, { style: smallLabel }),
      field("Narrow footer (aggregate control moves into the ⋮ overflow menu)", narrowBox, { style: smallLabel }),
      btn("Remount grid", () => changeWiring(wiring)),
    ),
    panel,
    hostFrame,
  ));

  let api = create();
  renderPanel();

  function create(): IGridAPI {
    const grid = createGrid(host, {
      columnDefs: COLUMNS,
      rowIdKey: "id",
      rowModelType: "serverSide",
      serverSideDataSource: makeDataSource(),
      // The wiring is a creation-time decision here, so a change rebuilds the grid; the footer
      // options are live (see applyFooterOptions).
      serverSideAggregationSource: wiring === "option" ? getAggregates : undefined,
      serverSideBlockSize: 100,
      pagination: true,
      pageSize: 25,
      paginationControls: footerOptions(whenUnavailable, messageMode),
    });
    for (const off of unsubscribe) off();
    unsubscribe = [
      grid.on("aggregateChanged", ev => {
        aggregateEvent = ev;
        renderPanel();
        readFooterSoon();
      }),
      grid.on("rowsChanged", readFooterSoon),
      grid.on("paginationChanged", readFooterSoon),
    ];
    // Footer totals for the two numeric columns; the footer shows up with them at page scope.
    grid.setAggregates([
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
    ]);
    readFooterSoon();
    return grid;
  }

  function applyFooterOptions(): void {
    api.updateGridOptions({ paginationControls: footerOptions(whenUnavailable, messageMode) });
    readFooterSoon();
  }

  function changeWiring(next: Wiring): void {
    wiring = next;
    wiringSelect.value = next;
    aggregateEvent = null;
    aggregateCalls = [];
    rowRequests = 0;
    for (const off of unsubscribe) off();
    unsubscribe = [];
    api.destroy();
    host.replaceChildren();
    api = create();
    renderPanel();
  }

  // What the user sees: the footer's own Aggregate select, read from the grid's DOM.
  function readFooterSoon(): void {
    requestAnimationFrame(() => requestAnimationFrame(renderPanel));
  }

  function renderPanel(): void {
    const footerSelect = host.querySelector<HTMLSelectElement>("select.pte-aggregate-scope");
    const allOption = footerSelect?.querySelector<HTMLOptionElement>('option[value="all"]');
    const allState = !footerSelect ? null : !allOption ? "absent" : allOption.disabled ? "disabled" : "enabled";
    const locked = footerSelect != null && allState !== "enabled";
    panel.style.border = `1px solid ${locked ? "#f59e0b" : "#d1d5db"}`;
    panel.style.background = locked ? "rgba(245, 158, 11, 0.08)" : "rgba(156, 163, 175, 0.08)";

    footerBlock.replaceChildren(...(footerSelect
      ? [
        h("div", null, "value: ", bold(footerSelect.value), ` · control disabled: `, bold(String(footerSelect.disabled))),
        h("div", null, '"Entire dataset" option: ',
          h("strong", { text: allState!, style: { color: allState === "enabled" ? "inherit" : AMBER } })),
        h("div", null, "tooltip (title): ", bold(footerSelect.title ? `"${footerSelect.title}"` : "none")),
      ]
      : [h("div", { text: "not in the footer (overflowed into ⋮, or hidden)", style: { color: MUTED } })]));

    eventBlock.replaceChildren(aggregateEvent
      ? h("div", null, "scope: ", bold(aggregateEvent.scope),
        ` · reason: ${aggregateEvent.reason} · valuesAvailable: ${String(aggregateEvent.valuesAvailable)}`)
      : h("div", { text: "—", style: { color: MUTED } }));

    callsHeading.textContent = `server getAggregates calls (${aggregateCalls.length}${aggregateCalls.length >= 4 ? "+" : ""})`;
    callsList.replaceChildren(...(aggregateCalls.length === 0
      ? [h("div", { text: "none — the grid has not asked the server for totals", style: { color: MUTED } })]
      : aggregateCalls.map(line => h("div", { text: line }))));

    requestsLine.textContent = `row block requests: ${rowRequests} · wiring: ${WIRING_OPTIONS.find(o => o.value === wiring)?.label}`;
  }

  return () => {
    for (const off of unsubscribe) off();
    api.destroy();
  };
}
