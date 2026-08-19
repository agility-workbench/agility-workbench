import { createGrid, AggregateType, ColumnType, type ColDef, type ColumnPanelTrigger } from "@grid";

import { checkbox, code, demoRoot, field, gridHost, h, note, select, toolbarRow } from "../dom";

type OrderRow = {
  id: number;
  customer: string;
  region: string;
  units: number;
  revenue: number;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East", "West"];

function buildRows(): OrderRow[] {
  return Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
  }));
}

function buildColumnDefs(allowAggregation: boolean): ColDef[] {
  return [
    { colId: "id", key: "id", label: "Order", width: 100, type: ColumnType.NUMBER, aggregatable: false },
    { colId: "customer", key: "customer", label: "Customer", width: 180, aggregatable: false },
    { colId: "region", key: "region", label: "Region", width: 140, aggregatable: false },
    {
      colId: "units",
      key: "units",
      label: "Units",
      width: 120,
      type: ColumnType.NUMBER,
      aggregatable: allowAggregation,
    },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 160,
      type: ColumnType.CURRENCY,
      aggregatable: allowAggregation,
    },
  ];
}

export function mountFooterVisibilityDemo(container: HTMLElement): () => void {
  let pagination = false;
  let aggregateRevenue = false;
  let allowAggregation = true;

  const host = gridHost();

  const paginationBox = checkbox(pagination, value => {
    pagination = value;
    api.updateGridOptions({ pagination });
    updateReadout();
  });
  const aggregateBox = checkbox(aggregateRevenue, value => setRevenueAggregate(value));
  const allowBox = checkbox(allowAggregation, value => {
    if (!value && aggregateRevenue) setRevenueAggregate(false);
    allowAggregation = value;
    // Column-level capability lives on the column defs, so re-supply them to core exactly as a
    // framework binding would on a columnDefs prop change.
    api.updateGridOptions({ columnDefs: buildColumnDefs(allowAggregation) });
    updateReadout();
  });

  const footerReadout = h("span", { style: { fontSize: "13px", color: "#6b7280" } });
  const aggregateReadout = h("span", { style: { fontSize: "13px", color: "#6b7280" } });

  container.appendChild(demoRoot(
    toolbarRow(
      field("Pagination", paginationBox),
      field("Sum Revenue", aggregateBox),
      field("Columns aggregatable", allowBox),
      footerReadout,
      aggregateReadout,
      field("Columns trigger", select(
        [
          { value: "rail", label: "Rail" },
          { value: "header", label: "Header" },
          { value: "menu", label: "Column menu" },
          { value: "footer", label: "Footer" },
          { value: "toolbar", label: "Toolbar" },
        ],
        "rail",
        value => api.updateGridOptions({ columnPanel: { trigger: value as ColumnPanelTrigger } }),
      )),
    ),
    note(
      "With both controls off, the aggregate/pagination footer should take up no space. Enable either"
      + " pagination or the Revenue aggregate to reveal it; turn both off to hide it again. Disable ",
      code("aggregatable"),
      " for every column to remove aggregation from the column menus and omit the aggregate controls"
      + " from the shared footer.",
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(),
    columnDefs: buildColumnDefs(allowAggregation),
    rowIdKey: "id",
    pagination,
    pageSize: 8,
    pageSizes: [8, 16, 24],
    columnPanel: { trigger: "rail" },
  });

  function setRevenueAggregate(enabled: boolean): void {
    aggregateRevenue = enabled;
    aggregateBox.checked = enabled;
    const revenueColumn = api.getColumnModel().getByColId("revenue");
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: enabled && revenueColumn
        ? [{ key: revenueColumn.instanceID, type: AggregateType.SUM }]
        : [],
    });
    updateReadout();
  }

  function updateReadout(): void {
    footerReadout.replaceChildren(
      "Shared footer expected: ",
      h("strong", { text: pagination || aggregateRevenue ? "visible" : "hidden" }),
    );
    aggregateReadout.replaceChildren(
      "Aggregate controls expected: ",
      h("strong", { text: allowAggregation ? "available" : "omitted" }),
    );
  }

  updateReadout();

  return () => api.destroy();
}
