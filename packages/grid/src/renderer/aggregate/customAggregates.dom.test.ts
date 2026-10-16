// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createGrid } from "../../createGrid";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import { aggregateIconClass } from "./wrapper";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
});

const rowData = [
  { id: 1, region: "West", rep: "Ann", units: 1 },
  { id: 2, region: "West", rep: "Bob", units: 3 },
  { id: 3, region: "East", rep: "Cid", units: 2 },
];
const joined = ({ values }: { values: unknown[] }) => values.filter(v => v != null && v !== "").join("/");

function footerButtons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>(".pte-aggregate-row .pte-aggregate-menu-button"));
}

describe("aggregate footer with ColDef.aggFunc and custom functions", () => {
  it("labels each footer cell with its function: custom by name with the generic icon, first/last with theirs", () => {
    createGrid(host, {
      rowIdKey: "id",
      aggFuncs: { joined },
      columnDefs: [
        { colId: "region", key: "region", label: "Region", aggFunc: AggregateType.LAST },
        { colId: "rep", key: "rep", label: "Rep", aggFunc: "joined" },
        { colId: "units", key: "units", label: "Units", type: ColumnType.NUMBER },
      ],
      rowData,
    });
    const labels = footerButtons().map(button => button.getAttribute("aria-label"));
    expect(labels).toContain("Change Region aggregation. Current function: Last");
    expect(labels).toContain("Change Rep aggregation. Current function: joined");
    // A column without aggFunc keeps the built-in rule.
    expect(labels).toContain("Change Units aggregation. Current function: Sum");
    const icons = footerButtons().map(button => button.querySelector(".pte-aggregate-icon")!.className);
    expect(icons.some(cls => cls.includes("icon-last"))).toBe(true);
    expect(icons.some(cls => cls.includes("icon-agg-custom"))).toBe(true);
    const contents = Array.from(host.querySelectorAll(".pte-aggregate-row .pte-aggregate-cell-content"))
      .map(el => el.textContent);
    expect(contents).toContain("Ann/Bob/Cid");
    expect(contents).toContain("East");
  });

  it("maps every aggregate kind to one icon class", () => {
    expect(aggregateIconClass(AggregateType.MIN, true)).toBe("icon-min-number");
    expect(aggregateIconClass(AggregateType.MAX, false)).toBe("icon-max-string");
    expect(aggregateIconClass(AggregateType.FIRST, true)).toBe("icon-first");
    expect(aggregateIconClass("weird name", true)).toBe("icon-agg-custom");
  });

  it("CSV stays leaf rows only (no aggregate cells), whatever the functions", () => {
    const api = createGrid(host, {
      rowIdKey: "id",
      aggFuncs: { joined },
      columnDefs: [
        { colId: "region", key: "region", label: "Region" },
        { colId: "rep", key: "rep", label: "Rep", aggFunc: "joined" },
      ],
      rowData,
    });
    api.setRowGroupColumns(["region"]);
    expect(api.getDataAsCsv()).not.toContain("Ann/Bob");
  });

  it("exports a custom function's group and footer values to Excel as static cells", async () => {
    const api = createGrid(host, {
      rowIdKey: "id",
      aggFuncs: { joined },
      groupDefaultExpanded: -1,
      columnDefs: [
        { colId: "region", key: "region", label: "Region" },
        { colId: "rep", key: "rep", label: "Rep", aggFunc: "joined" },
        { colId: "units", key: "units", label: "Units", type: ColumnType.NUMBER, aggFunc: AggregateType.SUM },
      ],
      rowData,
    });
    api.setRowGroupColumns(["region"]);
    const bytes = await api.getDataAsExcel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const values: unknown[] = [];
    wb.worksheets[0].eachRow(row => row.eachCell(cell => values.push(cell.value)));
    expect(values).toContain("Ann/Bob"); // the West group's subtotal cell
    // The footer, over the leaves in the sheet's (grouped) row order: East's before West's.
    expect(values).toContain("Cid/Ann/Bob");
    // The built-in keeps its live formula next to the static custom values.
    expect(values.some(v => typeof v === "object" && v != null && String((v as any).formula).startsWith("SUBTOTAL(9"))).toBe(true);
  });
});
